// app/api/payment/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "domain" } }
);

export async function POST(req: Request) {
  try {
    const {
      amount,
      coupon,
      email,
      domainId,
      domainName,
      periodYears,
      paymentMethodId,
      autoPayEnabled,
      items, // optional array of domains for bulk payment
    } = await req.json();

    const userEmail = email || "domain@hostingate.com";

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

    // 1. Get or create Stripe Customer
    let customerId: string;
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        name: "Hostingate Customer",
        metadata: {
          source: "hostingate-domain-portal",
        },
      });
      customerId = customer.id;
    }

    // Persist customer in domain.customers
    await supabase.from("customers").upsert(
      { user_email: userEmail, stripe_customer_id: customerId } as any,
      { onConflict: "user_email" }
    );

    // 2. Resolve Payment Method ID in Stripe
    let targetPmId = paymentMethodId;

    if (!targetPmId || !targetPmId.startsWith("pm_")) {
      // Find existing primary payment method for customer in Supabase or Stripe
      const { data: primaryPm } = await supabase
        .from("payment_methods")
        .select("stripe_payment_method_id")
        .eq("user_email", userEmail)
        .eq("is_primary", true)
        .maybeSingle();

      if (primaryPm?.stripe_payment_method_id) {
        targetPmId = primaryPm.stripe_payment_method_id;
      } else {
        // Create test card payment method attached to customer for sandbox testing
        const pm = await stripe.paymentMethods.create({
          type: "card",
          card: { token: "tok_visa" },
          billing_details: { email: userEmail, name: "Hostingate Customer" },
        });
        await stripe.paymentMethods.attach(pm.id, { customer: customerId });
        targetPmId = pm.id;
      }
    } else {
      // Attach target payment method to customer if not attached
      try {
        await stripe.paymentMethods.attach(targetPmId, { customer: customerId });
      } catch (e: any) {
        if (!e.message?.includes("already attached")) {
          console.warn("Payment method attach warning:", e.message);
        }
      }
    }

    // Retrieve card details from Stripe API
    let brand = "visa";
    let last4 = "4242";
    let expMonth = 12;
    let expYear = 2028;

    try {
      const pmDetails = await stripe.paymentMethods.retrieve(targetPmId);
      if (pmDetails.card) {
        brand = pmDetails.card.brand || "visa";
        last4 = pmDetails.card.last4 || "4242";
        expMonth = pmDetails.card.exp_month || 12;
        expYear = pmDetails.card.exp_year || 2028;
      }
    } catch (e) {
      console.warn("Retrieve PM details warning:", e);
    }

    // 3. Upsert into domain.payment_methods & get Supabase UUID `id`
    const cardPayload = {
      user_email: userEmail,
      stripe_customer_id: customerId,
      stripe_payment_method_id: targetPmId,
      brand,
      last4,
      exp_month: expMonth,
      exp_year: expYear,
      holder_name: "Hostingate Customer",
      is_primary: true,
    };

    const { data: dbCardRecord } = await supabase
      .from("payment_methods")
      .upsert(cardPayload as any, { onConflict: "stripe_payment_method_id" })
      .select("id")
      .single();

    const pmUuid = dbCardRecord?.id || null;

    // 4. Create & Confirm Stripe PaymentIntent
    const paymentIntentOptions: Stripe.PaymentIntentCreateParams = {
      amount: finalCents,
      currency: "usd",
      customer: customerId,
      payment_method: targetPmId,
      confirm: true,
      off_session: true,
      metadata: {
        domain_id: domainId || "domain-payment",
        domain_name: domainName || "domain-renewal",
        user_email: userEmail,
      },
      description: `Domain Payment: ${domainName || "Renewal"}`,
    };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentOptions);

    // 5. Build domain items list to update
    const domainListToProcess: Array<{
      id: string;
      name: string;
      years: number;
      amountUsd: number;
    }> = Array.isArray(items) && items.length > 0
      ? items.map((i: any) => ({
          id: i.domainId || i.id,
          name: i.domainName || i.fullDomainName,
          years: i.periodYears || periodYears || 1,
          amountUsd: i.amountUsd || i.renewalPrice || finalCents / 100 / items.length,
        }))
      : [
          {
            id: domainId || "dom-1",
            name: domainName || "sckali.com",
            years: periodYears || 1,
            amountUsd: finalCents / 100,
          },
        ];

    const paidAt = new Date().toISOString();
    const isAutoPay = autoPayEnabled ?? true;

    // 6. Record transactions in `domain.stripe_payments` & update `domain.domain_subscriptions`
    for (const item of domainListToProcess) {
      const nextDateObj = new Date();
      nextDateObj.setFullYear(nextDateObj.getFullYear() + item.years);
      const nextPaymentDate = nextDateObj.toISOString().split("T")[0];

      const itemCents = Math.round(item.amountUsd * 100);

      // Insert transaction in domain.stripe_payments with exact Stripe payment_intent_id
      await supabase.from("stripe_payments").insert({
        payment_intent_id: paymentIntent.id, // REAL Stripe PI ID pi_...
        stripe_customer_id: customerId,
        user_email: userEmail,
        domain_id: item.id,
        domain_name: item.name,
        amount_cents: itemCents,
        amount_usd: item.amountUsd,
        currency: "usd",
        coupon_code: coupon || null,
        discount_cents: 0,
        period_years: item.years,
        payment_method_id: targetPmId, // REAL Stripe PM ID pm_...
        card_brand: brand,
        card_last4: last4,
        status: "succeeded",
        is_auto_pay: isAutoPay,
        paid_at: paidAt,
        next_payment_date: nextPaymentDate,
        metadata: {
          domain_id: item.id,
          domain_name: item.name,
          period_years: item.years,
          user_email: userEmail,
          payment_intent_id: paymentIntent.id,
        },
      } as any);

      // Update domain.domain_subscriptions with auto_pay_method_id (UUID)
      await supabase.from("domain_subscriptions").upsert(
        {
          domain_id: item.id,
          full_domain_name: item.name,
          user_email: userEmail,
          status: "already_paid",
          period_years: item.years,
          auto_pay_enabled: isAutoPay,
          auto_pay_method: `•••• ${last4}`,
          auto_pay_method_id: isAutoPay ? pmUuid : null,
          last_payment_date: paidAt.split("T")[0],
          next_payment_date: nextPaymentDate,
        } as any,
        { onConflict: "full_domain_name" }
      );
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentMethodId: targetPmId,
      autoPayMethodId: pmUuid,
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

