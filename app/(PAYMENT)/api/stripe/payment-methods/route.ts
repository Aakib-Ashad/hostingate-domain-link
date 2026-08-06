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
 * Helper to get or create a Stripe Customer by email
 */
async function getOrCreateStripeCustomer(email: string) {
  const customers = await stripe.customers.list({
    email: email,
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  const customer = await stripe.customers.create({
    email: email,
    name: "Hostingate Customer",
    metadata: {
      portal: "domain-payment-portal",
    },
  });

  return customer;
}

/**
 * GET /api/stripe/payment-methods?email=domain@hostingate.com
 * Fetches all saved payment methods from Stripe Customer and syncs with Supabase
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email") || "domain@hostingate.com";

    // 1. Get or create Stripe Customer
    const customer = await getOrCreateStripeCustomer(email);

    // 2. Fetch payment methods attached to customer from Stripe
    const stripeMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
    });

    const defaultPaymentMethodId =
      typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;

    // 3. Format cards for frontend & sync into Supabase
    const formattedCards = [];

    for (let i = 0; i < stripeMethods.data.length; i++) {
      const pm = stripeMethods.data[i];
      const isPrimary = defaultPaymentMethodId
        ? pm.id === defaultPaymentMethodId
        : i === 0;

      const cardItem = {
        id: pm.id,
        user_email: email,
        stripe_customer_id: customer.id,
        stripe_payment_method_id: pm.id,
        brand: pm.card?.brand || "visa",
        last4: pm.card?.last4 || "4242",
        exp_month: pm.card?.exp_month || 12,
        exp_year: pm.card?.exp_year || 2028,
        holder_name: pm.billing_details?.name || "Cardholder",
        is_primary: isPrimary,
      };

      formattedCards.push(cardItem);

      // Upsert into Supabase domain.payment_methods
      await supabase
        .from("payment_methods")
        .upsert(cardItem as any, { onConflict: "stripe_payment_method_id" });
    }

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      paymentMethods: formattedCards.map((c) => ({
        id: c.id,
        brand: c.brand,
        last4: c.last4,
        expMonth: c.exp_month,
        expYear: c.exp_year,
        holderName: c.holder_name,
        isPrimary: c.is_primary,
      })),
    });
  } catch (error) {
    console.error("Error fetching payment methods from Stripe:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cards" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stripe/payment-methods
 * Attaches a new payment card to Stripe Customer and saves in Supabase
 */
export async function POST(req: Request) {
  try {
    const { email, paymentMethodId, brand, last4, expMonth, expYear, holderName, setAsPrimary } =
      await req.json();

    const userEmail = email || "domain@hostingate.com";

    // 1. Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer(userEmail);

    let targetPmId = paymentMethodId;

    if (!targetPmId || targetPmId.startsWith("pm-")) {
      // Create a test card payment method in Stripe for demonstration if token not provided
      const pm = await stripe.paymentMethods.create({
        type: "card",
        card: {
          token: "tok_visa", // Stripe test token
        },
        billing_details: {
          email: userEmail,
          name: holderName || "Hostingate Customer",
        },
      });
      targetPmId = pm.id;
    }

    // 2. Attach payment method to customer in Stripe
    try {
      await stripe.paymentMethods.attach(targetPmId, {
        customer: customer.id,
      });
    } catch (err: any) {
      // If already attached, ignore error
      if (!err.message?.includes("already attached")) {
        throw err;
      }
    }

    // 3. If primary, update customer's default payment method in Stripe
    if (setAsPrimary) {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: targetPmId,
        },
      });

      // Reset existing primary cards in Supabase for user
      await supabase
        .from("payment_methods")
        .update({ is_primary: false } as any)
        .eq("user_email", userEmail);
    }

    // 4. Fetch details of attached card from Stripe
    const pmDetails = await stripe.paymentMethods.retrieve(targetPmId);

    const cardPayload = {
      user_email: userEmail,
      stripe_customer_id: customer.id,
      stripe_payment_method_id: targetPmId,
      brand: pmDetails.card?.brand || brand || "visa",
      last4: pmDetails.card?.last4 || last4 || "4242",
      exp_month: pmDetails.card?.exp_month || expMonth || 12,
      exp_year: pmDetails.card?.exp_year || expYear || 2028,
      holder_name: pmDetails.billing_details?.name || holderName || "Cardholder",
      is_primary: setAsPrimary || false,
    };

    // 5. Save/upsert card into Supabase
    const { error: dbErr } = await supabase
      .from("payment_methods")
      .upsert(cardPayload as any, { onConflict: "stripe_payment_method_id" })
      .select("*")
      .single();

    if (dbErr) {
      console.warn("Supabase payment_methods insert warning:", dbErr.message);
    }

    return NextResponse.json({
      success: true,
      paymentMethod: {
        id: targetPmId,
        brand: cardPayload.brand,
        last4: cardPayload.last4,
        expMonth: cardPayload.exp_month,
        expYear: cardPayload.exp_year,
        holderName: cardPayload.holder_name,
        isPrimary: cardPayload.is_primary,
      },
    });
  } catch (error) {
    console.error("Error adding card to Stripe customer:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add payment card" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stripe/payment-methods
 * Detaches card from Stripe customer and removes from Supabase
 */
export async function DELETE(req: Request) {
  try {
    const { paymentMethodId, email } = await req.json();
    const userEmail = email || "domain@hostingate.com";

    // 1. Detach payment method from Stripe if it's a real Stripe ID
    if (paymentMethodId && paymentMethodId.startsWith("pm_")) {
      try {
        await stripe.paymentMethods.detach(paymentMethodId);
      } catch (err: any) {
        console.warn("Stripe detach warning:", err.message);
      }
    }

    // 2. Delete card from Supabase
    await supabase
      .from("payment_methods")
      .delete()
      .or(`id.eq.${paymentMethodId},stripe_payment_method_id.eq.${paymentMethodId}`)
      .eq("user_email", userEmail);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error detaching payment method:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete card" },
      { status: 500 }
    );
  }
}
