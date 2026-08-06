// app/api/payment/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

export async function POST(req: Request) {
  try {
    const { amount, coupon, email } = await req.json();
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

    let customerId: string | undefined;
    if (email) {
      const customers = await stripe.customers.list({
        email: email,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: email,
          metadata: {
            source: "hostingate-mailportal",
          },
        });
        customerId = customer.id;
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalCents,
      currency: "usd",
      customer: customerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        product_type: "scale_your_project",
      },
      description: `Scale your project`,
      statement_descriptor_suffix: "Scale Project", // max 22 chars
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId: customerId || null,
      finalAmountCents: finalCents,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("PaymentIntent error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create payment" },
        { status: 500 }
      );
    }
  }
}
