-- ============================================================================
-- SUPABASE DATABASE SCHEMA FOR STRIPE PAYMENTS & DOMAIN SUBSCRIPTIONS
-- Schema Name: domain
-- Hostingate Domain Payment Portal
-- ============================================================================

-- Create the custom 'domain' schema if it does not exist
CREATE SCHEMA IF NOT EXISTS domain;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. TABLE: domain.customers
-- Stores Stripe Customer IDs mapped to user emails
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL UNIQUE,
    stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_user_email ON domain.customers(user_email);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id ON domain.customers(stripe_customer_id);

-- ----------------------------------------------------------------------------
-- 2. TABLE: domain.domain_subscriptions
-- Stores active domains, renewal pricing, auto-pay preferences, and due dates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain.domain_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id VARCHAR(100) NOT NULL UNIQUE,
    full_domain_name VARCHAR(255) NOT NULL UNIQUE,
    user_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'due', -- 'due', 'closer_to_due', 'already_paid'
    renewal_price NUMERIC(10, 2) NOT NULL DEFAULT 19.99,
    ssl_price NUMERIC(10, 2) NOT NULL DEFAULT 29.00,
    domain_protection_enabled BOOLEAN DEFAULT TRUE,
    domain_protection_price NUMERIC(10, 2) DEFAULT 49.00,
    period_years INT DEFAULT 1,
    auto_pay_enabled BOOLEAN DEFAULT FALSE, -- Default OFF
    auto_pay_method VARCHAR(100), -- e.g. '•••• 4242'
    auto_pay_method_id VARCHAR(255), -- Stripe PaymentMethod ID string (e.g. 'pm_1U2m...')
    last_payment_date DATE,
    next_payment_date DATE NOT NULL, -- Calculated due date in Supabase
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast domain queries
CREATE INDEX IF NOT EXISTS idx_domain_subscriptions_user_email ON domain.domain_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_domain_subscriptions_status ON domain.domain_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_domain_subscriptions_next_payment_date ON domain.domain_subscriptions(next_payment_date);

-- ----------------------------------------------------------------------------
-- 4. TABLE: domain.stripe_payments
-- Log of every Stripe payment transaction for domain renewals & purchases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain.stripe_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id VARCHAR(255) NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    domain_id VARCHAR(100) NOT NULL,
    domain_name VARCHAR(255) NOT NULL,
    amount_cents INT NOT NULL,
    amount_usd NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'usd',
    coupon_code VARCHAR(100),
    discount_cents INT DEFAULT 0,
    period_years INT DEFAULT 1,
    payment_method_id VARCHAR(255),
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    status VARCHAR(50) NOT NULL DEFAULT 'succeeded', -- 'succeeded', 'pending', 'failed'
    is_auto_pay BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    next_payment_date DATE NOT NULL, -- Date when next payment is due after this transaction
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT stripe_payments_pi_domain_key UNIQUE (payment_intent_id, domain_id)
);

-- Migration statement for existing databases to support bulk payments:
ALTER TABLE domain.stripe_payments DROP CONSTRAINT IF EXISTS stripe_payments_payment_intent_id_key;
ALTER TABLE domain.stripe_payments DROP CONSTRAINT IF EXISTS stripe_payments_pi_domain_key;
ALTER TABLE domain.stripe_payments ADD CONSTRAINT stripe_payments_pi_domain_key UNIQUE (payment_intent_id, domain_id);

-- Indexes for transaction history lookup
CREATE INDEX IF NOT EXISTS idx_stripe_payments_user_email ON domain.stripe_payments(user_email);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_domain_name ON domain.stripe_payments(domain_name);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_stripe_customer ON domain.stripe_payments(stripe_customer_id);

-- ----------------------------------------------------------------------------
-- AUTOMATIC TRIGGER FOR updated_at IN 'domain' SCHEMA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION domain.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON domain.customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON domain.customers
    FOR EACH ROW EXECUTE FUNCTION domain.update_updated_at_column();

DROP TRIGGER IF EXISTS update_domain_subscriptions_updated_at ON domain.domain_subscriptions;
CREATE TRIGGER update_domain_subscriptions_updated_at
    BEFORE UPDATE ON domain.domain_subscriptions
    FOR EACH ROW EXECUTE FUNCTION domain.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES IN 'domain' SCHEMA
-- ----------------------------------------------------------------------------
ALTER TABLE domain.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain.domain_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain.stripe_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read/write access to domain.customers"
    ON domain.customers FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow read/write access to domain.domain_subscriptions"
    ON domain.domain_subscriptions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow read/write access to domain.stripe_payments"
    ON domain.stripe_payments FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- SCHEMA PERMISSIONS FOR SUPABASE ROLES
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA domain TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA domain TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA domain TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA domain TO postgres, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- AUTOMATIC DOMAIN SUBSCRIPTION STATUS UPDATER FUNCTION & PG_CRON SCHEDULE
-- Recalculates status based on next_payment_date:
--   'due'            -> next_payment_date <= CURRENT_DATE
--   'closer_to_due'  -> next_payment_date > CURRENT_DATE AND next_payment_date <= CURRENT_DATE + INTERVAL '30 days'
--   'already_paid'   -> next_payment_date > CURRENT_DATE + INTERVAL '30 days'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION domain.update_domain_subscription_statuses()
RETURNS VOID AS $$
BEGIN
    -- 1. Mark domains due today or overdue as 'due'
    UPDATE domain.domain_subscriptions
    SET status = 'due'
    WHERE next_payment_date <= CURRENT_DATE
      AND status != 'due';

    -- 2. Mark domains expiring within 30 days as 'closer_to_due'
    UPDATE domain.domain_subscriptions
    SET status = 'closer_to_due'
    WHERE next_payment_date > CURRENT_DATE
      AND next_payment_date <= (CURRENT_DATE + INTERVAL '30 days')
      AND status != 'closer_to_due';

    -- 3. Mark domains with > 30 days remaining as 'already_paid'
    UPDATE domain.domain_subscriptions
    SET status = 'already_paid'
    WHERE next_payment_date > (CURRENT_DATE + INTERVAL '30 days')
      AND status != 'already_paid';
END;
$$ LANGUAGE plpgsql;

-- Enable pg_cron extension in Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule status recalculation job to run daily at midnight (00:00 UTC)
SELECT cron.schedule(
    'update-domain-subscription-statuses-daily',
    '0 0 * * *',
    $$ SELECT domain.update_domain_subscription_statuses(); $$
);

