import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentIntentId = searchParams.get("payment_intent_id");

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "Missing payment_intent_id parameter" },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return NextResponse.json({
      customerId: paymentIntent.customer || null,
    });
  } catch (error) {
    console.error("Retrieve PaymentIntent error:", error);
    const message = error instanceof Error ? error.message : "Failed to retrieve payment details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
