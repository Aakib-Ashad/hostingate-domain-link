
import {
  DomainSubscriptionRow,
  StripePaymentRow,
} from "@/types/supabase";
import { PaymentMethodItem } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

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
  toaEnabled?: boolean;
  toaPrice?: number;
}) {
  try {
    const paidAt = new Date().toISOString();
    const nextPaymentDateObj = new Date();
    nextPaymentDateObj.setFullYear(nextPaymentDateObj.getFullYear() + params.periodYears);
    const nextPaymentDate = nextPaymentDateObj.toISOString().split("T")[0];

    const amountCents = Math.round(params.amountUsd * 100);

    const autoPayMethodId = params.paymentMethodId || null;
    const cardLast4 = params.cardLast4 || "4242";

    // 2. Upsert domain subscription FIRST (parent record referenced by stripe_payments foreign key)
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
      auto_pay_method_id: autoPayMethodId,
    };

    if (params.renewalPrice !== undefined) subscriptionPayload.renewal_price = params.renewalPrice;
    if (params.sslPrice !== undefined) subscriptionPayload.ssl_price = params.sslPrice;
    if (params.domainProtectionEnabled !== undefined) subscriptionPayload.domain_protection_enabled = params.domainProtectionEnabled;
    if (params.domainProtectionPrice !== undefined) subscriptionPayload.domain_protection_price = params.domainProtectionPrice;
    if (params.toaEnabled !== undefined) subscriptionPayload.toa_enabled = params.toaEnabled;
    if (params.toaPrice !== undefined) subscriptionPayload.toa_price = params.toaPrice;

    const { data: subRecord, error: subErr } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .upsert(subscriptionPayload as any, { onConflict: "full_domain_name" })
      .select("*")
      .maybeSingle();

    if (subErr) {
      console.warn("Supabase domain.domain_subscriptions upsert warning:", subErr.message);
      if (subErr.message.includes("uuid") || subErr.message.includes("auto_pay_method_id") || subErr.message.includes("invalid input syntax")) {
        const fallbackPayload = { ...subscriptionPayload };
        delete fallbackPayload.auto_pay_method_id;
        await supabase
          .schema("domain")
          .from("domain_subscriptions")
          .upsert(fallbackPayload as any, { onConflict: "full_domain_name" });
      }
    }

    // 3. Insert transaction log into `domain.stripe_payments` SECOND (child log)
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
        toa_enabled: params.toaEnabled,
        toa_price: params.toaPrice,
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
 * Toggle or update Domain Protection enabled status for a domain in Supabase `domain` schema.
 */
export async function updateDomainProtectionInDb(params: {
  domainId: string;
  fullDomainName: string;
  domainProtectionEnabled: boolean;
}) {
  try {
    const { data, error } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .update({
        domain_protection_enabled: params.domainProtectionEnabled,
      } as any)
      .or(`domain_id.eq.${params.domainId},full_domain_name.eq.${params.fullDomainName}`)
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("Supabase domain protection update warning:", error.message);
    }
    return data;
  } catch (err) {
    console.error("Error updating domain protection in Supabase:", err);
    return null;
  }
}

/**
 * Toggle or update TOA (Total Ownership Assurance) enabled status for a domain in Supabase `domain` schema.
 */
export async function updateDomainToaInDb(params: {
  domainId: string;
  fullDomainName: string;
  toaEnabled: boolean;
}) {
  try {
    const { data, error } = await supabase
      .schema("domain")
      .from("domain_subscriptions")
      .update({
        toa_enabled: params.toaEnabled,
      } as any)
      .or(`domain_id.eq.${params.domainId},full_domain_name.eq.${params.fullDomainName}`)
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("Supabase domain TOA update warning:", error.message);
    }
    return data;
  } catch (err) {
    console.error("Error updating domain TOA in Supabase:", err);
    return null;
  }
}

/**
 * Fetch all saved payment methods for a Stripe customer from Stripe API.
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
    console.error("Error fetching payment methods from Stripe API:", error);
  }
  return [];
}

/**
 * Save a new payment card to Stripe Customer.
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
    console.warn("Stripe API save card error:", err);
  }

  return card;
}

/**
 * Set primary default payment method on Stripe Customer.
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
