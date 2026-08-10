import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { isCardExpired } from "@/lib/utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "domain" } }
);

export async function GET(req: Request) {
  return POST(req);
}

/**
 * Helper to resolve customer ID and valid payment cards (ordered by Primary first, then newest)
 */
async function getCustomerAndCardsForUser(userEmail: string) {
  let customerId: string | undefined;

  const { data: customerRecord } = await supabase
    .from("customers")
    .select("stripe_customer_id")
    .eq("user_email", userEmail)
    .maybeSingle();

  if (customerRecord?.stripe_customer_id) {
    customerId = customerRecord.stripe_customer_id;
  } else {
    const { data: cardRecord } = await supabase
      .from("payment_methods")
      .select("stripe_customer_id")
      .eq("user_email", userEmail)
      .limit(1)
      .maybeSingle();

    if (cardRecord?.stripe_customer_id) {
      customerId = cardRecord.stripe_customer_id;
    } else {
      try {
        const stripeCustomers = await stripe.customers.list({ email: userEmail, limit: 1 });
        if (stripeCustomers.data.length > 0) {
          customerId = stripeCustomers.data[0].id;
        }
      } catch (e) {
        console.warn("Could not query Stripe API for customer fallback:", e);
      }
    }

    if (customerId) {
      await supabase.from("customers").upsert(
        {
          user_email: userEmail,
          stripe_customer_id: customerId,
        } as any,
        { onConflict: "user_email" }
      );
    }
  }

  if (!customerId) return null;

  // Fetch all saved payment cards ordered by primary first
  const { data: allCards } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("user_email", userEmail)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (!allCards || allCards.length === 0) return null;

  // Filter out expired cards
  const validCards = allCards.filter((card) => !isCardExpired(card.exp_month, card.exp_year));

  if (validCards.length === 0) return null;

  return { customerId, cards: validCards };
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
      const userAuth = await getCustomerAndCardsForUser(domain.user_email);
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
      const totalAmountUsd = (domain.renewal_price + domain.ssl_price + (domain.domain_protection_enabled ? domain.domain_protection_price : 0)) * years;
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
            payment_method: card.stripe_payment_method_id,
            off_session: true,
            confirm: true,
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
            payment_method_id: successfulCard.stripe_payment_method_id,
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
        const { error: subErr } = await supabase
          .from("domain_subscriptions")
          .update({
            status: "already_paid",
            last_payment_date: paidAt.split("T")[0],
            next_payment_date: nextPaymentDate,
            auto_pay_method: `•••• ${successfulCard.last4}`,
            auto_pay_method_id: successfulCard.id,
          } as any)
          .eq("id", domain.id);

        if (subErr) {
          console.error("Auto-pay domain_subscriptions update error:", subErr.message);
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
