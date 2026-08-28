-- ============================================================================
-- IMMENSE WhatsApp & RCS Business Portal — Migration 004
-- Client Account Management (Meta Business Portfolio, WABA, Phone Numbers)
-- ============================================================================
--
-- File:    supabase/migrations/004_client_account_management.sql
-- Target:  Supabase PostgreSQL Database
-- Safe:    100% Non-destructive, idempotent, preserves all existing tables and data
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Function: update_updated_at (if not already present)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Extend Existing onboarding_records Table (Non-destructive)
-- ----------------------------------------------------------------------------
ALTER TABLE onboarding_records 
ADD COLUMN IF NOT EXISTS client_type TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';

-- ----------------------------------------------------------------------------
-- 3. Create meta_business_portfolios Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_business_portfolios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
    portfolio_name      TEXT NOT NULL,
    portfolio_id        TEXT DEFAULT '',
    portfolio_owner     TEXT DEFAULT '',
    meta_login_email    TEXT DEFAULT '',
    verification_status TEXT DEFAULT 'not_started' CHECK (verification_status IN ('not_started', 'pending', 'verified', 'rejected')),
    verification_date   DATE,
    admin_access        TEXT DEFAULT '',
    recovery_email      TEXT DEFAULT '',
    recovery_phone      TEXT DEFAULT '',
    notes               TEXT DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Create waba_accounts Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waba_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
    meta_portfolio_id   UUID REFERENCES meta_business_portfolios(id) ON DELETE SET NULL,
    waba_name           TEXT NOT NULL,
    waba_id             TEXT DEFAULT '',
    waba_status         TEXT DEFAULT 'pending' CHECK (waba_status IN ('active', 'pending', 'suspended', 'banned')),
    business_name       TEXT DEFAULT '',
    messaging_limit     TEXT DEFAULT '',
    quality_rating      TEXT DEFAULT 'N/A',
    account_status      TEXT DEFAULT '',
    assigned_to         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes               TEXT DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. Create phone_numbers Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phone_numbers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waba_id             UUID REFERENCES waba_accounts(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
    display_name        TEXT DEFAULT '',
    phone_number        TEXT NOT NULL,
    phone_number_id     TEXT DEFAULT '',
    status              TEXT DEFAULT 'pending' CHECK (status IN ('connected', 'pending', 'disconnected', 'banned')),
    quality_rating      TEXT DEFAULT 'N/A',
    messaging_limit     TEXT DEFAULT '',
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('verified', 'pending', 'not_verified')),
    connected_date      DATE,
    notes               TEXT DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meta_portfolios_client_id ON meta_business_portfolios(client_id);
CREATE INDEX IF NOT EXISTS idx_waba_accounts_client_id ON waba_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_waba_accounts_meta_portfolio_id ON waba_accounts(meta_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_waba_id ON phone_numbers(waba_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON phone_numbers(status);

-- ----------------------------------------------------------------------------
-- 7. Enable Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE meta_business_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE waba_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 8. RLS Policies for meta_business_portfolios
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can bypass RLS for meta_business_portfolios" ON meta_business_portfolios;
CREATE POLICY "Service role can bypass RLS for meta_business_portfolios" ON meta_business_portfolios
    USING ( (auth.jwt() ->> 'role') = 'service_role' )
    WITH CHECK ( (auth.jwt() ->> 'role') = 'service_role' );

DROP POLICY IF EXISTS "Authenticated users can view meta_business_portfolios" ON meta_business_portfolios;
CREATE POLICY "Authenticated users can view meta_business_portfolios" ON meta_business_portfolios 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert meta_business_portfolios" ON meta_business_portfolios;
CREATE POLICY "Authenticated users can insert meta_business_portfolios" ON meta_business_portfolios 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update meta_business_portfolios" ON meta_business_portfolios;
CREATE POLICY "Authenticated users can update meta_business_portfolios" ON meta_business_portfolios 
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete meta_business_portfolios" ON meta_business_portfolios;
CREATE POLICY "Authenticated users can delete meta_business_portfolios" ON meta_business_portfolios 
    FOR DELETE USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 9. RLS Policies for waba_accounts
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can bypass RLS for waba_accounts" ON waba_accounts;
CREATE POLICY "Service role can bypass RLS for waba_accounts" ON waba_accounts
    USING ( (auth.jwt() ->> 'role') = 'service_role' )
    WITH CHECK ( (auth.jwt() ->> 'role') = 'service_role' );

DROP POLICY IF EXISTS "Authenticated users can view waba_accounts" ON waba_accounts;
CREATE POLICY "Authenticated users can view waba_accounts" ON waba_accounts 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert waba_accounts" ON waba_accounts;
CREATE POLICY "Authenticated users can insert waba_accounts" ON waba_accounts 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update waba_accounts" ON waba_accounts;
CREATE POLICY "Authenticated users can update waba_accounts" ON waba_accounts 
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete waba_accounts" ON waba_accounts;
CREATE POLICY "Authenticated users can delete waba_accounts" ON waba_accounts 
    FOR DELETE USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 10. RLS Policies for phone_numbers
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can bypass RLS for phone_numbers" ON phone_numbers;
CREATE POLICY "Service role can bypass RLS for phone_numbers" ON phone_numbers
    USING ( (auth.jwt() ->> 'role') = 'service_role' )
    WITH CHECK ( (auth.jwt() ->> 'role') = 'service_role' );

DROP POLICY IF EXISTS "Authenticated users can view phone_numbers" ON phone_numbers;
CREATE POLICY "Authenticated users can view phone_numbers" ON phone_numbers 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert phone_numbers" ON phone_numbers;
CREATE POLICY "Authenticated users can insert phone_numbers" ON phone_numbers 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update phone_numbers" ON phone_numbers;
CREATE POLICY "Authenticated users can update phone_numbers" ON phone_numbers 
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete phone_numbers" ON phone_numbers;
CREATE POLICY "Authenticated users can delete phone_numbers" ON phone_numbers 
    FOR DELETE USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 11. Automated updated_at Triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_meta_business_portfolios_updated_at ON meta_business_portfolios;
CREATE TRIGGER update_meta_business_portfolios_updated_at
    BEFORE UPDATE ON meta_business_portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_waba_accounts_updated_at ON waba_accounts;
CREATE TRIGGER update_waba_accounts_updated_at
    BEFORE UPDATE ON waba_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_phone_numbers_updated_at ON phone_numbers;
CREATE TRIGGER update_phone_numbers_updated_at
    BEFORE UPDATE ON phone_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
