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

/**
 * POST /api/stripe/set-primary
 * Sets the primary default card on Stripe Customer and updates Supabase
 */
export async function POST(req: Request) {
  try {
    const { paymentMethodId, email } = await req.json();
    const userEmail = email || "domain@hostingate.com";

    // 1. Get Stripe customer for email
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (customers.data.length > 0) {
      const customer = customers.data[0];

      // Update customer invoice_settings default_payment_method in Stripe
      if (paymentMethodId && paymentMethodId.startsWith("pm_")) {
        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }
    }

    // 2. Reset all cards for user to is_primary = false in Supabase
    await supabase
      .from("payment_methods")
      .update({ is_primary: false } as any)
      .eq("user_email", userEmail);

    // 3. Set target card to is_primary = true in Supabase
    await supabase
      .from("payment_methods")
      .update({ is_primary: true } as any)
      .or(`id.eq.${paymentMethodId},stripe_payment_method_id.eq.${paymentMethodId}`)
      .eq("user_email", userEmail);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting primary payment method in Stripe:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set primary card" },
      { status: 500 }
    );
  }
}
