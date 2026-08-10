import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

/**
 * POST /api/stripe/set-primary
 * Sets the primary default card on Stripe Customer directly in Stripe API
 */
export async function POST(req: Request) {
  try {
    const { paymentMethodId } = await req.json();

    // 1. Get or create Stripe customer for email
    const customer = await getOrCreateStripeCustomer();

    // 2. Update customer invoice_settings default_payment_method in Stripe
    if (paymentMethodId && paymentMethodId.startsWith("pm_")) {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return NextResponse.json({ success: true, customerId: customer.id });
  } catch (error) {
    console.error("Error setting primary payment method in Stripe:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set primary card" },
      { status: 500 }
    );
  }
}
