// app/api/payment/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { createClient } from "@/lib/supabase/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient();

export async function POST(req: Request) {
  try {
    const {
      amount,
      coupon,
      domainId,
      domainName,
      periodYears,
      paymentMethodId,
      autoPayEnabled,
      items, // optional array of domains for bulk payment
    } = await req.json();

    const userEmail = "domain@hostingate.com";

    const amountInCents = Math.round(amount * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    let finalCents = amountInCents;

    if (coupon) {
      const promos = await stripe.promotionCodes.list({
        code: coupon,
        active: true,
        limit: 1,
      });
      if (promos.data.length) {
        const promo = promos.data[0];
        const couponObj = promo.coupon;
        if (couponObj) {
          if (couponObj.amount_off) {
            finalCents = Math.max(0, amountInCents - couponObj.amount_off);
          } else if (couponObj.percent_off) {
            finalCents = Math.round(
              amountInCents * (1 - couponObj.percent_off / 100)
            );
          }
        }
      }
    }

    // 1. Get or create Stripe Customer using single source of truth
    const customer = await getOrCreateStripeCustomer();
    let customerId = customer.id;

    // 2. Resolve Payment Method ID in Stripe
    let targetPmId = paymentMethodId;

    if (!targetPmId || !targetPmId.startsWith("pm_")) {
      // Find default payment method or first card for customer from Stripe API
      try {
        const stripeCust = await stripe.customers.retrieve(customerId);
        const defaultPmId =
          !stripeCust.deleted && typeof stripeCust.invoice_settings?.default_payment_method === "string"
            ? stripeCust.invoice_settings.default_payment_method
            : null;

        if (defaultPmId) {
          targetPmId = defaultPmId;
        } else {
          const pmList = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
          if (pmList.data.length > 0) {
            targetPmId = pmList.data[0].id;
          }
        }
      } catch (custErr) {
        console.warn("Could not retrieve customer payment methods from Stripe:", custErr);
      }

      if (!targetPmId || !targetPmId.startsWith("pm_")) {
        return NextResponse.json(
          {
            success: false,
            error: "No payment card specified. Please add a valid payment card to complete your payment.",
          },
          { status: 400 }
        );
      }
    }

    // Retrieve card details & owner customer from Stripe API
    let brand = "visa";
    let last4 = "4242";

    try {
      const pmDetails = await stripe.paymentMethods.retrieve(targetPmId);
      if (typeof pmDetails.customer === "string" && pmDetails.customer) {
        customerId = pmDetails.customer;
      } else {
        // Unattached payment method: attach to customer
        try {
          await stripe.paymentMethods.attach(targetPmId, { customer: customerId });
        } catch (attachErr: any) {
          if (!attachErr.message?.includes("already attached")) {
            console.warn("Payment method attach notice:", attachErr.message);
          }
        }
      }

      if (pmDetails.card) {
        brand = pmDetails.card.brand || "visa";
        last4 = pmDetails.card.last4 || "4242";
      }
    } catch (e) {
      console.warn("Retrieve PM details warning:", e);
    }

    // 4. Build domain items list
    const domainListToProcess: Array<{
      id: string;
      name: string;
      years: number;
      amountUsd: number;
      renewalPrice?: number;
      sslPrice?: number;
      domainProtectionEnabled?: boolean;
      domainProtectionPrice?: number;
      toaEnabled?: boolean;
      toaPrice?: number;
    }> = Array.isArray(items) && items.length > 0
        ? items.map((i: any) => ({
          id: i.domainId || i.id,
          name: i.domainName || i.fullDomainName,
          years: i.periodYears || periodYears || 1,
          amountUsd: i.amountUsd || i.renewalPrice || finalCents / 100 / items.length,
          renewalPrice: i.renewalPrice,
          sslPrice: i.sslPrice,
          domainProtectionEnabled: i.domainProtectionEnabled,
          domainProtectionPrice: i.domainProtectionPrice,
          toaEnabled: i.toaEnabled,
          toaPrice: i.toaPrice,
        }))
        : [
          {
            id: domainId || "dom-1",
            name: domainName || "sckali.com",
            years: periodYears || 1,
            amountUsd: finalCents / 100,
          },
        ];

    const isAutoPay = autoPayEnabled ?? true;

    // 6. Create Stripe PaymentIntent with detailed metadata (webhook handles DB persistence asynchronously)
    const paymentIntentOptions: Stripe.PaymentIntentCreateParams = {
      amount: finalCents,
      currency: "usd",
      customer: customerId,
      payment_method: targetPmId,
      confirm: true,
      setup_future_usage: "off_session",
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        domain_id: domainId || domainListToProcess[0]?.id || "domain-payment",
        domain_name: domainName || domainListToProcess[0]?.name || "domain-renewal",
        period_years: String(periodYears || 1),
        user_email: userEmail,
        auto_pay: String(isAutoPay),
        items_json: JSON.stringify(domainListToProcess),
      },
      description: `Domain Payment: ${domainName || "Renewal"}`,
    };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentOptions);

    // 7. Synchronously persist transaction and update domain subscriptions in DB if payment succeeded
    if (paymentIntent.status === "succeeded") {
      const paidAt = new Date().toISOString();
      for (const item of domainListToProcess) {
        const itemYears = item.years || 1;
        const nextDateObj = new Date();
        nextDateObj.setFullYear(nextDateObj.getFullYear() + itemYears);
        const nextPaymentDate = nextDateObj.toISOString().split("T")[0];

        try {
          // 1. Upsert domain_subscriptions FIRST (parent record)
          const subPayload: any = {
            domain_id: item.id,
            full_domain_name: item.name,
            user_email: userEmail,
            status: "already_paid",
            period_years: itemYears,
            auto_pay_enabled: isAutoPay,
            auto_pay_method: `•••• ${last4}`,
            auto_pay_method_id: targetPmId,
            last_payment_date: paidAt.split("T")[0],
            next_payment_date: nextPaymentDate,
          };

          if (item.renewalPrice !== undefined) subPayload.renewal_price = item.renewalPrice;
          if (item.sslPrice !== undefined) subPayload.ssl_price = item.sslPrice;
          if (item.domainProtectionEnabled !== undefined) subPayload.domain_protection_enabled = item.domainProtectionEnabled;
          if (item.domainProtectionPrice !== undefined) subPayload.domain_protection_price = item.domainProtectionPrice;
          if (item.toaEnabled !== undefined) subPayload.toa_enabled = item.toaEnabled;
          if (item.toaPrice !== undefined) subPayload.toa_price = item.toaPrice;

          const { error: subErr } = await supabase.from("domain_subscriptions").upsert(
            subPayload,
            { onConflict: "full_domain_name" }
          );

          if (subErr) {
            console.warn("Supabase domain_subscriptions upsert error in api/payment:", subErr.message);
            if (subErr.message.includes("uuid") || subErr.message.includes("auto_pay_method_id") || subErr.message.includes("invalid input syntax")) {
              const fallbackPayload = { ...subPayload };
              delete fallbackPayload.auto_pay_method_id;
              const { error: retryErr } = await supabase.from("domain_subscriptions").upsert(
                fallbackPayload,
                { onConflict: "full_domain_name" }
              );
              if (retryErr) {
                console.error("Fallback domain_subscriptions upsert also failed:", retryErr.message);
              }
            }
          }

          // 2. Upsert stripe_payments SECOND (child log referencing domain_subscriptions.domain_id)
          const { error: stripeErr } = await supabase.from("stripe_payments").upsert(
            {
              payment_intent_id: paymentIntent.id,
              stripe_customer_id: customerId,
              user_email: userEmail,
              domain_id: item.id,
              domain_name: item.name,
              amount_cents: Math.round(item.amountUsd * 100),
              amount_usd: item.amountUsd,
              currency: paymentIntent.currency || "usd",
              period_years: itemYears,
              payment_method_id: targetPmId,
              card_brand: brand,
              card_last4: last4,
              status: "succeeded",
              is_auto_pay: isAutoPay,
              paid_at: paidAt,
              next_payment_date: nextPaymentDate,
              metadata: {
                domain_id: item.id,
                domain_name: item.name,
                period_years: itemYears,
                user_email: userEmail,
                renewal_price: item.renewalPrice,
                ssl_price: item.sslPrice,
                domain_protection_enabled: item.domainProtectionEnabled,
                domain_protection_price: item.domainProtectionPrice,
                toa_enabled: item.toaEnabled,
                toa_price: item.toaPrice,
              },
            } as any,
            { onConflict: "payment_intent_id, domain_id" }
          );

          if (stripeErr) {
            console.warn("Supabase stripe_payments upsert error in api/payment:", stripeErr.message);
          }
        } catch (dbErr) {
          console.error("DB persistence error in api/payment route:", dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentMethodId: targetPmId,
      autoPayMethodId: targetPmId,
      customerId: customerId,
      status: paymentIntent.status,
      finalAmountCents: finalCents,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("PaymentIntent execution error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to execute payment" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}

