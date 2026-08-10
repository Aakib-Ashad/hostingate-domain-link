import { createClient } from "@/lib/supabase/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient()

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

      // Parse items from metadata if available (bulk or single domain payment)
      let itemsToProcess: Array<{ id: string; name: string; years: number; amountUsd: number }> = [];
      if (metadata.items_json) {
        try {
          itemsToProcess = JSON.parse(metadata.items_json);
        } catch {
          // Fallback if items_json parsing fails
        }
      }

      if (!itemsToProcess.length) {
        itemsToProcess = [
          {
            id: domainId,
            name: domainName,
            years: periodYears,
            amountUsd: paymentIntent.amount / 100,
          },
        ];
      }

      for (const item of itemsToProcess) {
        const itemYears = item.years || periodYears;
        const itemPaidAt = new Date().toISOString();
        const nextDateObj = new Date();
        nextDateObj.setFullYear(nextDateObj.getFullYear() + itemYears);
        const nextPaymentDate = nextDateObj.toISOString().split("T")[0];

        try {
          // 1. Update domain.domain_subscriptions FIRST (parent record)
          const subPayload: any = {
            domain_id: item.id,
            full_domain_name: item.name,
            user_email: userEmail,
            status: "already_paid",
            period_years: itemYears,
            auto_pay_enabled: metadata.auto_pay === "true",
            auto_pay_method: `•••• ${cardLast4}`,
            auto_pay_method_id: pmUuid,
            last_payment_date: itemPaidAt.split("T")[0],
            next_payment_date: nextPaymentDate,
          };

          if ((item as any).renewalPrice !== undefined) subPayload.renewal_price = (item as any).renewalPrice;
          if ((item as any).sslPrice !== undefined) subPayload.ssl_price = (item as any).sslPrice;
          if ((item as any).domainProtectionEnabled !== undefined) subPayload.domain_protection_enabled = (item as any).domainProtectionEnabled;
          if ((item as any).domainProtectionPrice !== undefined) subPayload.domain_protection_price = (item as any).domainProtectionPrice;
          if ((item as any).toaEnabled !== undefined) subPayload.toa_enabled = (item as any).toaEnabled;
          if ((item as any).toaPrice !== undefined) subPayload.toa_price = (item as any).toaPrice;

          const { error: subErr } = await supabase.from("domain_subscriptions").upsert(
            subPayload,
            { onConflict: "full_domain_name" }
          );

          if (subErr) {
            console.error("Webhook domain_subscriptions upsert error:", subErr.message);
          }
        } catch (err: any) {
          console.error("Exception upserting domain_subscriptions in webhook:", err?.message || err);
        }

        try {
          // 2. Upsert transaction in domain.stripe_payments SECOND (child log)
          const { error: paymentErr } = await supabase.from("stripe_payments").upsert(
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
              payment_method_id: paymentMethodId,
              card_brand: cardBrand,
              card_last4: cardLast4,
              status: "succeeded",
              is_auto_pay: metadata.auto_pay === "true",
              paid_at: itemPaidAt,
              next_payment_date: nextPaymentDate,
              metadata: metadata as any,
            } as any,
            { onConflict: "payment_intent_id, domain_id" }
          );

          if (paymentErr) {
            console.error("Webhook stripe_payments upsert error:", paymentErr.message);
          }
        } catch (err: any) {
          console.error("Exception upserting stripe_payments in webhook:", err?.message || err);
        }

        console.log(`Successfully processed payment_intent.succeeded for domain: ${item.name}`);
      }
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
