import Stripe from "stripe";
import { createClient } from "./supabase/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient()

/**
 * Robust, single-source-of-truth helper to get or create a Stripe Customer by email.
 * Prevents duplicate customer creation by checking Supabase DB first, then Stripe API.
 */
export async function getOrCreateStripeCustomer(email: string): Promise<Stripe.Customer> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check Supabase `domain.customers` first
  try {
    const { data: dbCustomer } = await supabase
      .schema("domain")
      .from("customers")
      .select("stripe_customer_id")
      .eq("user_email", cleanEmail)
      .maybeSingle();

    if (dbCustomer?.stripe_customer_id) {
      const existing = await stripe.customers.retrieve(dbCustomer.stripe_customer_id);
      if (existing && !existing.deleted) {
        return existing as Stripe.Customer;
      }
    }
  } catch (e) {
    console.warn("Supabase customer lookup notice:", e);
  }

  // 2. Check Stripe API by email search
  const customers = await stripe.customers.list({
    email: cleanEmail,
    limit: 1,
  });

  let customer: Stripe.Customer;

  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    // 3. Create single new Stripe customer if none exists
    customer = await stripe.customers.create({
      email: cleanEmail,
      name: "Hostingate Customer",
      metadata: {
        portal: "domain-payment-portal",
      },
    });
  }

  // 4. Cache and persist in Supabase `domain.customers` table
  try {
    await supabase
      .schema("domain")
      .from("customers")
      .upsert(
        { user_email: cleanEmail, stripe_customer_id: customer.id } as any,
        { onConflict: "user_email" }
      );
  } catch (dbErr) {
    console.warn("Supabase customer upsert warning:", dbErr);
  }

  return customer;
}
