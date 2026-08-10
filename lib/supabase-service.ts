import { createBrowserClient } from "@/utils/supabase/client";
import {
  DomainSubscriptionRow,
  StripePaymentRow,
} from "@/types/supabase";
import { PaymentMethodItem } from "@/lib/utils";

const supabase = createBrowserClient();

/**
 * Record a completed Stripe Payment in Supabase (`domain.stripe_payments`)
 * and update the corresponding domain subscription (`domain.domain_subscriptions`).
 */
export async function recordStripePayment(params: {
  paymentIntentId: string;
  stripeCustomerId?: string | null;
  userEmail: string;
  domainId: string;
  domainName: string;
  amountUsd: number;
  periodYears: number;
  paymentMethodId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  couponCode?: string | null;
  discountCents?: number;
  autoPayEnabled?: boolean;
  renewalPrice?: number;
  sslPrice?: number;
  domainProtectionEnabled?: boolean;
  domainProtectionPrice?: number;
}) {
  try {
    const paidAt = new Date().toISOString();
    const nextPaymentDateObj = new Date();
    nextPaymentDateObj.setFullYear(nextPaymentDateObj.getFullYear() + params.periodYears);
    const nextPaymentDate = nextPaymentDateObj.toISOString().split("T")[0];

    const amountCents = Math.round(params.amountUsd * 100);

    // 1. Fetch matching payment_method UUID from domain.payment_methods if available
    let autoPayMethodUuid: string | null = null;
    let cardLast4 = params.cardLast4 || "4242";

    if (params.paymentMethodId || params.userEmail) {
      let pmQuery = supabase
        .schema("domain")
        .from("payment_methods")
        .select("id, stripe_payment_method_id, last4, is_primary")
        .eq("user_email", params.userEmail);

      if (params.paymentMethodId) {
        pmQuery = pmQuery.or(
          `id.eq.${params.paymentMethodId},stripe_payment_method_id.eq.${params.paymentMethodId}`
        );
      } else {
        pmQuery = pmQuery.eq("is_primary", true);
      }

      const { data: pmRecord } = await pmQuery.maybeSingle();

      if (pmRecord) {
        autoPayMethodUuid = pmRecord.id;
        cardLast4 = pmRecord.last4 || cardLast4;
      }
    }

    // 2. Insert transaction log into `domain.stripe_payments`
    const paymentPayload: StripePaymentRow = {
      payment_intent_id: params.paymentIntentId,
      stripe_customer_id: params.stripeCustomerId || "cus_hostingate",
      user_email: params.userEmail,
      domain_id: params.domainId,
      domain_name: params.domainName,
      amount_cents: amountCents,
      amount_usd: params.amountUsd,
      currency: "usd",
      coupon_code: params.couponCode || null,
      discount_cents: params.discountCents || 0,
      period_years: params.periodYears,
      payment_method_id: params.paymentMethodId || null,
      card_brand: params.cardBrand || "visa",
      card_last4: cardLast4,
      status: "succeeded",
      is_auto_pay: params.autoPayEnabled ?? false,
      paid_at: paidAt,
      next_payment_date: nextPaymentDate,
      metadata: {
        domain_id: params.domainId,
        domain_name: params.domainName,
        period_years: params.periodYears,
        user_email: params.userEmail,
        renewal_price: params.renewalPrice,
        ssl_price: params.sslPrice,
        domain_protection_enabled: params.domainProtectionEnabled,
        domain_protection_price: params.domainProtectionPrice,
      },
    };

    const { data: paymentRecord, error: paymentErr } = await supabase
      .schema("domain")
      .from("stripe_payments")
      .upsert(paymentPayload as any, { onConflict: "payment_intent_id, domain_id" })
      .select("*")
      .single();

    if (paymentErr) {
      console.warn("Supabase domain.stripe_payments upsert warning:", paymentErr.message);
    }

    // 3. Upsert domain subscription with next_payment_date, status = 'already_paid', auto_pay_enabled, and auto_pay_method_id
    const subscriptionPayload: Partial<DomainSubscriptionRow> = {
      domain_id: params.domainId,
      full_domain_name: params.domainName,
      user_email: params.userEmail,
      status: "already_paid",
      period_years: params.periodYears,
      last_payment_date: paidAt.split("T")[0],
      next_payment_date: nextPaymentDate,
      auto_pay_enabled: params.autoPayEnabled ?? true,
      auto_pay_method: cardLast4 ? `•••• ${cardLast4}` : undefined,
      auto_pay_method_id: autoPayMethodUuid,
    };

    if (params.renewalPrice !== undefined) subscriptionPayload.renewal_price = params.renewalPrice;
    if (params.sslPrice !== undefined) subscriptionPayload.ssl_price = params.sslPrice;
    if (params.domainProtectionEnabled !== undefined) subscriptionPayload.domain_protection_enabled = params.domainProtectionEnabled;
    if (params.domainProtectionPrice !== undefined) subscriptionPayload.domain_protection_price = params.domainProtectionPrice;

    const { data: subRecord, error: subErr } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .upsert(subscriptionPayload as any, { onConflict: "full_domain_name" })
      .select("*")
      .single();

    if (subErr) {
      console.warn("Supabase domain.domain_subscriptions upsert warning:", subErr.message);
    }

    return {
      success: true,
      paymentRecord,
      subRecord,
      nextPaymentDate,
    };
  } catch (error) {
    console.error("Error recording Stripe payment in Supabase domain schema:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Toggle or update Auto-Pay enabled status for a domain in Supabase `domain` schema.
 */
export async function updateDomainAutoPayInDb(params: {
  domainId: string;
  fullDomainName: string;
  autoPayEnabled: boolean;
  autoPayMethod?: string;
  paymentMethodId?: string;
  userEmail?: string;
}) {
  try {
    const userEmail = params.userEmail || "domain@hostingate.com";
    let autoPayMethodUuid: string | null = null;
    let autoPayMethodText: string | null = params.autoPayMethod || null;

    if (params.autoPayEnabled) {
      // Find primary or specified card in domain.payment_methods
      let pmQuery = supabase
        .schema("domain")
        .from("payment_methods")
        .select("id, last4")
        .eq("user_email", userEmail);

      if (params.paymentMethodId) {
        pmQuery = pmQuery.or(
          `id.eq.${params.paymentMethodId},stripe_payment_method_id.eq.${params.paymentMethodId}`
        );
      } else {
        pmQuery = pmQuery.eq("is_primary", true);
      }

      const { data: pmRecord } = await pmQuery.maybeSingle();
      if (pmRecord) {
        autoPayMethodUuid = pmRecord.id;
        autoPayMethodText = `•••• ${pmRecord.last4}`;
      }
    }

    const { data, error } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .update({
        auto_pay_enabled: params.autoPayEnabled,
        auto_pay_method: params.autoPayEnabled ? autoPayMethodText || "•••• 4242" : null,
        auto_pay_method_id: params.autoPayEnabled ? autoPayMethodUuid : null,
      } as any)
      .or(`domain_id.eq.${params.domainId},full_domain_name.eq.${params.fullDomainName}`)
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("Supabase auto-pay update warning:", error.message);
    }
    return data;
  } catch (err) {
    console.error("Error updating domain auto-pay in Supabase:", err);
    return null;
  }
}

/**
 * Fetch all saved payment methods for a Stripe customer from Stripe API & Supabase `domain` schema.
 */
export async function fetchUserPaymentMethods(userEmail: string): Promise<PaymentMethodItem[]> {
  try {
    const res = await fetch(`/api/stripe/payment-methods?email=${encodeURIComponent(userEmail)}`);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.paymentMethods)) {
      return data.paymentMethods;
    }
  } catch (error) {
    console.warn("Falling back to direct Supabase fetch for payment methods:", error);
  }

  // Fallback to direct Supabase query if API call fails
  try {
    const { data, error } = await supabase
      .schema("domain")
      .from("payment_methods")
      .select("*")
      .eq("user_email", userEmail)
      .order("is_primary", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row: any) => ({
      id: row.stripe_payment_method_id || row.id,
      brand: row.brand as any,
      last4: row.last4,
      expMonth: row.exp_month,
      expYear: row.exp_year,
      isPrimary: row.is_primary,
      holderName: row.holder_name || "Cardholder",
    }));
  } catch (err) {
    console.error("Error fetching payment methods:", err);
    return [];
  }
}

/**
 * Save a new payment card to Stripe Customer and Supabase `domain.payment_methods`.
 */
export async function savePaymentMethodToDb(card: PaymentMethodItem, userEmail: string): Promise<PaymentMethodItem | null> {
  try {
    const res = await fetch("/api/stripe/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        paymentMethodId: card.id,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
        holderName: card.holderName,
        setAsPrimary: card.isPrimary,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.paymentMethod) {
        return data.paymentMethod;
      }
    }
  } catch (err) {
    console.warn("Stripe API save card error, falling back to direct Supabase:", err);
  }

  return card;
}

/**
 * Set primary default payment method on Stripe Customer and in Supabase `domain` schema.
 */
export async function setPrimaryPaymentMethodInDb(cardId: string, userEmail: string) {
  try {
    await fetch("/api/stripe/set-primary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        paymentMethodId: cardId,
      }),
    });
  } catch (error) {
    console.error("Error updating primary card via Stripe API:", error);
  }

  try {
    // Also sync in Supabase directly
    await supabase
      .schema("domain")
      .from("payment_methods")
      .update({ is_primary: false } as any)
      .eq("user_email", userEmail);

    await supabase
      .schema("domain")
      .from("payment_methods")
      .update({ is_primary: true } as any)
      .or(`id.eq.${cardId},stripe_payment_method_id.eq.${cardId}`)
      .eq("user_email", userEmail);
  } catch (err) {
    console.warn("Supabase primary card sync warning:", err);
  }
}

/**
 * Detach payment card from Stripe customer and delete from Supabase `domain.payment_methods`.
 */
export async function deletePaymentMethodFromDb(cardId: string, userEmail: string) {
  try {
    await fetch("/api/stripe/payment-methods", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        paymentMethodId: cardId,
      }),
    });
    return true;
  } catch (err) {
    console.error("Error deleting card via Stripe API:", err);
    return false;
  }
}

/**
 * Fetch all domain subscriptions with their next payment dates & amounts from Supabase `domain` schema.
 */
export async function fetchDomainSubscriptions(userEmail: string) {
  try {
    const { data, error } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .select("*")
      .eq("user_email", userEmail)
      .order("next_payment_date", { ascending: true });

    if (error) throw error;
    return data as DomainSubscriptionRow[];
  } catch (error) {
    console.error("Error fetching domain subscriptions:", error);
    return [];
  }
}
