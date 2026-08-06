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

export async function GET(req: Request) {
  return POST(req);
}

/**
 * POST /api/stripe/auto-pay
 * Executes automated renewal payments off-session using Customer ID & Primary Card
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
    const userEmail = email || "domain@hostingate.com";

    // 1. Fetch user's Stripe customer ID from Supabase
    const { data: customerRecord } = await supabase
      .from("customers")
      .select("stripe_customer_id")
      .eq("user_email", userEmail)
      .maybeSingle();

    if (!customerRecord?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found for user. Please add a payment card first." },
        { status: 400 }
      );
    }

    const customerId = customerRecord.stripe_customer_id;

    // 2. Fetch primary card for the customer
    const { data: primaryCard } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("user_email", userEmail)
      .eq("is_primary", true)
      .maybeSingle();

    if (!primaryCard?.stripe_payment_method_id) {
      return NextResponse.json(
        { error: "No primary card set for customer. Auto-Pay requires a primary card." },
        { status: 400 }
      );
    }

    // 3. Fetch domain subscription from Supabase
    let domainQuery = supabase
      .from("domain_subscriptions")
      .select("*")
      .eq("user_email", userEmail)
      .eq("auto_pay_enabled", true);

    if (domainId) {
      domainQuery = domainQuery.eq("domain_id", domainId);
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
      const years = domain.period_years || 1;
      const totalAmountUsd = (domain.renewal_price + domain.ssl_price + (domain.domain_protection_enabled ? domain.domain_protection_price : 0)) * years;
      const totalCents = Math.round(totalAmountUsd * 100);

      // Create off-session PaymentIntent with Stripe Customer & Payment Method
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.create({
          amount: totalCents,
          currency: "usd",
          customer: customerId,
          payment_method: primaryCard.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            domain_id: domain.domain_id,
            domain_name: domain.full_domain_name,
            auto_pay: "true",
          },
          description: `Auto-Pay Domain Renewal: ${domain.full_domain_name}`,
        });
      } catch (stripeErr: any) {
        console.error(`Stripe Auto-Pay failed for ${domain.full_domain_name}:`, stripeErr.message);
        processedResults.push({
          domainName: domain.full_domain_name,
          success: false,
          error: stripeErr.message,
        });
        continue;
      }

      // Calculate next renewal date stored in Supabase
      const nextDateObj = new Date();
      nextDateObj.setFullYear(nextDateObj.getFullYear() + years);
      const nextPaymentDate = nextDateObj.toISOString().split("T")[0];
      const paidAt = new Date().toISOString();

      // Record transaction in Supabase domain.stripe_payments
      await supabase.from("stripe_payments").insert({
        payment_intent_id: paymentIntent.id,
        stripe_customer_id: customerId,
        user_email: userEmail,
        domain_id: domain.domain_id,
        domain_name: domain.full_domain_name,
        amount_cents: totalCents,
        amount_usd: totalAmountUsd,
        currency: "usd",
        period_years: years,
        payment_method_id: primaryCard.stripe_payment_method_id,
        card_brand: primaryCard.brand,
        card_last4: primaryCard.last4,
        status: "succeeded",
        is_auto_pay: true,
        paid_at: paidAt,
        next_payment_date: nextPaymentDate,
      } as any);

      // Update next_payment_date in Supabase domain.domain_subscriptions
      await supabase
        .from("domain_subscriptions")
        .update({
          status: "already_paid",
          last_payment_date: paidAt.split("T")[0],
          next_payment_date: nextPaymentDate,
          auto_pay_method: `•••• ${primaryCard.last4}`,
          auto_pay_method_id: primaryCard.id,
        } as any)
        .eq("id", domain.id);

      processedResults.push({
        domainName: domain.full_domain_name,
        success: true,
        paymentIntentId: paymentIntent.id,
        nextPaymentDate,
        amountUsd: totalAmountUsd,
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
