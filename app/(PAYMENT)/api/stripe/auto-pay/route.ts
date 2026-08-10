import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isCardExpired } from "@/lib/utils";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { createClient } from "@/lib/supabase/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient();

export async function GET(req: Request) {
  return POST(req);
}

/**
 * Helper to resolve customer ID and valid payment cards from Stripe API (Primary first, then secondary)
 */
async function getCustomerAndCardsForUser() {
  let customerId: string | undefined;

  try {
    const customer = await getOrCreateStripeCustomer();
    customerId = customer.id;
  } catch (e) {
    console.warn("Failed to get/create customer in auto-pay:", e);
  }

  if (!customerId) return null;

  try {
    const customerObj = await stripe.customers.retrieve(customerId);
    const defaultPmId =
      !customerObj.deleted && typeof customerObj.invoice_settings?.default_payment_method === "string"
        ? customerObj.invoice_settings.default_payment_method
        : null;

    const pmList = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (!pmList.data || pmList.data.length === 0) return null;

    const validCards = pmList.data
      .map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || "visa",
        last4: pm.card?.last4 || "4242",
        exp_month: pm.card?.exp_month || 12,
        exp_year: pm.card?.exp_year || 2028,
        is_primary: defaultPmId ? pm.id === defaultPmId : false,
      }))
      .filter((card) => !isCardExpired(card.exp_month, card.exp_year))
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));

    if (validCards.length === 0) return null;

    return { customerId, cards: validCards };
  } catch (err) {
    console.error("Error retrieving payment methods from Stripe in auto-pay:", err);
    return null;
  }
}

/**
 * POST /api/stripe/auto-pay
 * Executes automated renewal payments off-session using Customer ID & Saved Cards (Primary with Secondary Fallback)
 */
export async function POST(req: Request) {
  try {
    let email: string | undefined;
    let domainId: string | undefined;

    try {
      const body = await req.json();
      email = body.email;
      domainId = body.domainId;
    } catch {
      const { searchParams } = new URL(req.url);
      email = searchParams.get("email") || undefined;
      domainId = searchParams.get("domainId") || undefined;
    }

    // 1. Sync domain statuses in Supabase before querying
    try {
      await supabase.rpc("update_domain_subscription_statuses");
    } catch {
      // Ignore if function hasn't been executed in database yet
    }

    // 2. Fetch domain subscription(s) ready for renewal
    let domainQuery = supabase
      .from("domain_subscriptions")
      .select("*")
      .eq("auto_pay_enabled", true);

    if (email) {
      domainQuery = domainQuery.eq("user_email", email);
    }

    if (domainId) {
      // Targeted manual execution for a specific domain
      domainQuery = domainQuery.eq("domain_id", domainId);
    } else {
      // Process domains that are due or approaching expiration (status 'due' or 'closer_to_due')
      domainQuery = domainQuery.neq("status", "already_paid");
    }

    const { data: domains, error: domainErr } = await domainQuery;

    if (domainErr || !domains || domains.length === 0) {
      return NextResponse.json(
        { message: "No Auto-Pay enabled domains found due for renewal." },
        { status: 200 }
      );
    }

    const processedResults = [];

    for (const domain of domains) {
      const userAuth = await getCustomerAndCardsForUser();
      if (!userAuth || !userAuth.cards.length) {
        console.error(`Auto-Pay skipped for ${domain.full_domain_name}: No valid payment cards for ${domain.user_email}`);

        processedResults.push({
          domainName: domain.full_domain_name,
          success: false,
          error: "No valid payment card found for user.",
        });
        continue;
      }

      const { customerId, cards } = userAuth;
      const years = domain.period_years || 1;
      const protectionAmt = domain.domain_protection_enabled ? (domain.domain_protection_price || 49) : 0;
      const toaAmt = (domain.toa_enabled ?? true) ? (domain.toa_price || 500) : 0;
      const totalAmountUsd = (domain.renewal_price + domain.ssl_price + protectionAmt + toaAmt) * years;
      const totalCents = Math.round(totalAmountUsd * 100);

      let paymentIntent: Stripe.PaymentIntent | null = null;
      let successfulCard = null;
      let lastErrorMessage = "";

      // MULTI-CARD FALLBACK LOOP: Attempt Primary Card first, then Secondary Cards
      for (const card of cards) {
        try {
          paymentIntent = await stripe.paymentIntents.create({
            amount: totalCents,
            currency: "usd",
            customer: customerId,
            payment_method: card.id,
            off_session: true,
            confirm: true,
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: "never",
            },
            metadata: {
              domain_id: domain.domain_id,
              domain_name: domain.full_domain_name,
              auto_pay: "true",
              period_years: String(years),
              user_email: domain.user_email,
            },
            description: `Auto-Pay Domain Renewal: ${domain.full_domain_name}`,
          });

          if (paymentIntent.status === "succeeded") {
            successfulCard = card;
            break;
          }
        } catch (stripeErr: any) {
          lastErrorMessage = stripeErr.message || "Card charge declined";
          console.warn(`Card charge failed for ${domain.full_domain_name} using card ending in ${card.last4}:`, lastErrorMessage);
          // Continue loop to attempt secondary saved card
        }
      }

      if (!paymentIntent || !successfulCard) {
        console.error(`All payment card attempts failed for ${domain.full_domain_name}: ${lastErrorMessage}`);

        processedResults.push({
          domainName: domain.full_domain_name,
          success: false,
          error: `All payment cards declined: ${lastErrorMessage}`,
        });
        continue;
      }

      // Calculate next renewal date stored in Supabase
      const nextDateObj = new Date();
      nextDateObj.setFullYear(nextDateObj.getFullYear() + years);
      const nextPaymentDate = nextDateObj.toISOString().split("T")[0];
      const paidAt = new Date().toISOString();

      try {
        // Record transaction in Supabase domain.stripe_payments
        const { error: paymentErr } = await supabase.from("stripe_payments").upsert(
          {
            payment_intent_id: paymentIntent.id,
            stripe_customer_id: customerId,
            user_email: domain.user_email,
            domain_id: domain.domain_id,
            domain_name: domain.full_domain_name,
            amount_cents: totalCents,
            amount_usd: totalAmountUsd,
            currency: "usd",
            period_years: years,
            payment_method_id: successfulCard.id,
            card_brand: successfulCard.brand,
            card_last4: successfulCard.last4,
            status: "succeeded",
            is_auto_pay: true,
            paid_at: paidAt,
            next_payment_date: nextPaymentDate,
          } as any,
          { onConflict: "payment_intent_id, domain_id" }
        );

        if (paymentErr) {
          console.error("Auto-pay stripe_payments upsert error:", paymentErr.message);
        }
      } catch (err: any) {
        console.error("Exception in auto-pay stripe_payments upsert:", err?.message || err);
      }

      try {
        // Update next_payment_date in Supabase domain.domain_subscriptions
        const subPayload: any = {
          status: "already_paid",
          last_payment_date: paidAt.split("T")[0],
          next_payment_date: nextPaymentDate,
          auto_pay_method: `•••• ${successfulCard.last4}`,
          auto_pay_method_id: successfulCard.id,
        };

        const { error: subErr } = await supabase
          .from("domain_subscriptions")
          .update(subPayload)
          .or(`id.eq.${domain.id},domain_id.eq.${domain.domain_id},full_domain_name.eq.${domain.full_domain_name}`);

        if (subErr) {
          console.error("Auto-pay domain_subscriptions update error:", subErr.message);
          if (subErr.message.includes("uuid") || subErr.message.includes("auto_pay_method_id") || subErr.message.includes("invalid input syntax")) {
            const fallbackPayload = { ...subPayload };
            delete fallbackPayload.auto_pay_method_id;
            const { error: retryErr } = await supabase
              .from("domain_subscriptions")
              .update(fallbackPayload)
              .or(`id.eq.${domain.id},domain_id.eq.${domain.domain_id},full_domain_name.eq.${domain.full_domain_name}`);
            if (retryErr) {
              console.error("Fallback auto-pay domain_subscriptions update also failed:", retryErr.message);
            }
          }
        }
      } catch (err: any) {
        console.error("Exception in auto-pay domain_subscriptions update:", err?.message || err);
      }

      processedResults.push({
        domainName: domain.full_domain_name,
        success: true,
        paymentIntentId: paymentIntent.id,
        nextPaymentDate,
        amountUsd: totalAmountUsd,
        cardUsed: `${successfulCard.brand.toUpperCase()} ending in ${successfulCard.last4}`,
      });
    }

    return NextResponse.json({
      success: true,
      processed: processedResults,
    });
  } catch (error) {
    console.error("Auto-Pay processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-Pay failed" },
      { status: 500 }
    );
  }
}
