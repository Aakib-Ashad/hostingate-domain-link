import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

/**
 * GET /api/stripe/payment-methods?email=domain@hostingate.com
 * Fetches all saved payment methods attached to Stripe Customer directly from Stripe API
 */
export async function GET(req: Request) {
  if(!req){
    console.log("no Request");
  }
  
  try {
    // 1. Get or create Stripe Customer
    const customer = await getOrCreateStripeCustomer();

    // 2. Fetch payment methods attached to customer from Stripe
    const stripeMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
    });

    const defaultPaymentMethodId =
      typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;

    // 3. Format cards directly from Stripe API
    const formattedCards = stripeMethods.data.map((pm, i) => {
      const isPrimary = defaultPaymentMethodId
        ? pm.id === defaultPaymentMethodId
        : i === 0;

      return {
        id: pm.id,
        brand: pm.card?.brand || "visa",
        last4: pm.card?.last4 || "4242",
        expMonth: pm.card?.exp_month || 12,
        expYear: pm.card?.exp_year || 2028,
        holderName: pm.billing_details?.name || "Cardholder",
        isPrimary,
      };
    });

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      paymentMethods: formattedCards,
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
 * Attaches a new payment card directly to Stripe Customer
 */
export async function POST(req: Request) {
  try {
    const { paymentMethodId, brand, last4, expMonth, expYear, holderName, setAsPrimary } =
      await req.json();

    const userEmail = "domain@hostingate.com";

    // 1. Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer();

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
    }

    // 4. Fetch details of attached card from Stripe
    const pmDetails = await stripe.paymentMethods.retrieve(targetPmId);

    return NextResponse.json({
      success: true,
      paymentMethod: {
        id: targetPmId,
        brand: pmDetails.card?.brand || brand || "visa",
        last4: pmDetails.card?.last4 || last4 || "4242",
        expMonth: pmDetails.card?.exp_month || expMonth || 12,
        expYear: pmDetails.card?.exp_year || expYear || 2028,
        holderName: pmDetails.billing_details?.name || holderName || "Cardholder",
        isPrimary: setAsPrimary || false,
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
 * Detaches card directly from Stripe customer
 */
export async function DELETE(req: Request) {
  try {
    const { paymentMethodId } = await req.json();

    // Detach payment method from Stripe if it's a real Stripe ID
    if (paymentMethodId && paymentMethodId.startsWith("pm_")) {
      try {
        await stripe.paymentMethods.detach(paymentMethodId);
      } catch (err: any) {
        console.warn("Stripe detach warning:", err.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error detaching payment method:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete card" },
      { status: 500 }
    );
  }
}
