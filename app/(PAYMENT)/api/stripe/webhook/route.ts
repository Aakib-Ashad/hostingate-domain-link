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
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // Fallback for unverified development payload
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata || {};

      const userEmail = metadata.user_email || "domain@hostingate.com";
      const domainId = metadata.domain_id || "dom-1";
      const domainName = metadata.domain_name || "sckali.com";
      const periodYears = parseInt(metadata.period_years || "1", 10);

      const customerId =
        typeof paymentIntent.customer === "string"
          ? paymentIntent.customer
          : paymentIntent.customer?.id || "cus_hostingate";

      const paymentMethodId =
        typeof paymentIntent.payment_method === "string"
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id || null;

      let cardBrand = "visa";
      let cardLast4 = "4242";

      if (paymentMethodId) {
        try {
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          if (pm.card) {
            cardBrand = pm.card.brand || "visa";
            cardLast4 = pm.card.last4 || "4242";
          }
        } catch (e) {
          console.warn("Webhook retrieve PM notice:", e);
        }
      }

      // Resolve UUID for payment method from domain.payment_methods
      let pmUuid: string | null = null;
      if (paymentMethodId) {
        const { data: pmRecord } = await supabase
          .from("payment_methods")
          .select("id")
          .eq("stripe_payment_method_id", paymentMethodId)
          .maybeSingle();

        if (pmRecord) {
          pmUuid = pmRecord.id;
        }
      }

      const paidAt = new Date().toISOString();
      const nextDateObj = new Date();
      nextDateObj.setFullYear(nextDateObj.getFullYear() + periodYears);
      const nextPaymentDate = nextDateObj.toISOString().split("T")[0];

      // Upsert transaction in domain.stripe_payments
      await supabase.from("stripe_payments").upsert(
        {
          payment_intent_id: paymentIntent.id,
          stripe_customer_id: customerId,
          user_email: userEmail,
          domain_id: domainId,
          domain_name: domainName,
          amount_cents: paymentIntent.amount,
          amount_usd: paymentIntent.amount / 100,
          currency: paymentIntent.currency || "usd",
          period_years: periodYears,
          payment_method_id: paymentMethodId,
          card_brand: cardBrand,
          card_last4: cardLast4,
          status: "succeeded",
          is_auto_pay: metadata.auto_pay === "true",
          paid_at: paidAt,
          next_payment_date: nextPaymentDate,
          metadata: metadata as any,
        } as any,
        { onConflict: "payment_intent_id" }
      );

      // Update domain.domain_subscriptions
      await supabase.from("domain_subscriptions").upsert(
        {
          domain_id: domainId,
          full_domain_name: domainName,
          user_email: userEmail,
          status: "already_paid",
          period_years: periodYears,
          auto_pay_enabled: metadata.auto_pay === "true",
          auto_pay_method: `•••• ${cardLast4}`,
          auto_pay_method_id: pmUuid,
          last_payment_date: paidAt.split("T")[0],
          next_payment_date: nextPaymentDate,
        } as any,
        { onConflict: "full_domain_name" }
      );

      console.log(`Successfully processed payment_intent.succeeded for domain: ${domainName}`);
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.warn(`PaymentIntent failed: ${paymentIntent.id}, reason: ${paymentIntent.last_payment_error?.message}`);
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
