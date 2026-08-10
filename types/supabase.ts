export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface CustomerRow {
  id: string;
  user_email: string;
  stripe_customer_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethodRow {
  id: string;
  user_email: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  holder_name?: string | null;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DomainSubscriptionRow {
  id: string;
  domain_id: string;
  full_domain_name: string;
  user_email: string;
  status: "due" | "closer_to_due" | "already_paid";
  renewal_price: number;
  ssl_price: number;
  domain_protection_enabled: boolean;
  domain_protection_price: number;
  toa_enabled?: boolean;
  toa_price?: number;
  period_years: number;
  auto_pay_enabled: boolean;
  auto_pay_method?: string | null;
  auto_pay_method_id?: string | null;
  last_payment_date?: string | null;
  next_payment_date: string; // Renewal due date stored in Supabase
  days_remaining?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StripePaymentRow {
  id?: string;
  payment_intent_id: string;
  stripe_customer_id: string;
  user_email: string;
  domain_id: string;
  domain_name: string;
  amount_cents: number;
  amount_usd: number;
  currency?: string;
  coupon_code?: string | null;
  discount_cents?: number;
  period_years: number;
  payment_method_id?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  status: "succeeded" | "pending" | "failed";
  is_auto_pay?: boolean;
  paid_at?: string;
  next_payment_date: string;
  metadata?: Json | null;
  created_at?: string;
}

export interface Database {
  domain: {
    Tables: {
      customers: {
        Row: CustomerRow;
        Insert: Omit<CustomerRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<CustomerRow>;
      };
      payment_methods: {
        Row: PaymentMethodRow;
        Insert: Omit<PaymentMethodRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<PaymentMethodRow>;
      };
      domain_subscriptions: {
        Row: DomainSubscriptionRow;
        Insert: Omit<DomainSubscriptionRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<DomainSubscriptionRow>;
      };
      stripe_payments: {
        Row: StripePaymentRow;
        Insert: Omit<StripePaymentRow, "id" | "created_at"> & {
          id?: string;
        };
        Update: Partial<StripePaymentRow>;
      };
    };
  };
}
