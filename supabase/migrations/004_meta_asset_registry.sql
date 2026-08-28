-- ============================================================================
-- IMMENSE Portal — Meta & WhatsApp Asset Registry
-- Keeps business continuity data independent of any employee/vendor.
-- Sensitive passwords/tokens are intentionally NOT stored here.
-- Use the existing credential vault for secrets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta_business_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL UNIQUE REFERENCES onboarding_records(id) ON DELETE CASCADE,
  portfolio_name TEXT DEFAULT '',
  portfolio_id TEXT DEFAULT '',
  portfolio_owner TEXT DEFAULT '',
  meta_login_email TEXT DEFAULT '',
  verification_status TEXT DEFAULT 'unknown' CHECK (verification_status IN ('verified','pending','not_verified','restricted','unknown')),
  verification_checked_at TIMESTAMPTZ,
  waba_name TEXT DEFAULT '',
  waba_id TEXT DEFAULT '',
  waba_status TEXT DEFAULT 'unknown' CHECK (waba_status IN ('active','pending','restricted','disabled','unknown')),
  messaging_limit TEXT DEFAULT '',
  admin_access_status TEXT DEFAULT 'unknown' CHECK (admin_access_status IN ('available','limited','missing','unknown')),
  admin_notes TEXT DEFAULT '',
  recovery_email TEXT DEFAULT '',
  recovery_phone TEXT DEFAULT '',
  login_url TEXT DEFAULT 'https://business.facebook.com',
  credential_vault_reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_asset_id UUID NOT NULL REFERENCES meta_business_assets(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_number_id TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  quality_rating TEXT DEFAULT 'unknown',
  status TEXT DEFAULT 'unknown' CHECK (status IN ('active','pending','restricted','disabled','unknown')),
  mapped_waba_id TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_assets_onboarding ON meta_business_assets(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_meta_assets_portfolio ON meta_business_assets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_meta_assets_waba ON meta_business_assets(waba_id);
CREATE INDEX IF NOT EXISTS idx_meta_phone_asset ON meta_phone_numbers(meta_asset_id);
CREATE INDEX IF NOT EXISTS idx_meta_phone_number ON meta_phone_numbers(phone_number);

DROP TRIGGER IF EXISTS update_meta_assets_updated_at ON meta_business_assets;
CREATE TRIGGER update_meta_assets_updated_at
  BEFORE UPDATE ON meta_business_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_meta_phone_updated_at ON meta_phone_numbers;
CREATE TRIGGER update_meta_phone_updated_at
  BEFORE UPDATE ON meta_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE meta_business_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_assets_select ON meta_business_assets;
CREATE POLICY meta_assets_select ON meta_business_assets
  FOR SELECT USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin','manager')
      OR EXISTS (
        SELECT 1 FROM onboarding_records r
        WHERE r.id = meta_business_assets.onboarding_id
        AND r.assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS meta_assets_insert ON meta_business_assets;
CREATE POLICY meta_assets_insert ON meta_business_assets
  FOR INSERT WITH CHECK (
    is_active_user() AND get_user_role() IN ('super_admin','manager','employee')
  );

DROP POLICY IF EXISTS meta_assets_update ON meta_business_assets;
CREATE POLICY meta_assets_update ON meta_business_assets
  FOR UPDATE USING (
    is_active_user() AND get_user_role() IN ('super_admin','manager','employee')
  );

DROP POLICY IF EXISTS meta_assets_delete ON meta_business_assets;
CREATE POLICY meta_assets_delete ON meta_business_assets
  FOR DELETE USING (is_active_user() AND get_user_role() IN ('super_admin','manager'));

DROP POLICY IF EXISTS meta_phone_select ON meta_phone_numbers;
CREATE POLICY meta_phone_select ON meta_phone_numbers
  FOR SELECT USING (
    is_active_user() AND EXISTS (
      SELECT 1 FROM meta_business_assets a
      JOIN onboarding_records r ON r.id = a.onboarding_id
      WHERE a.id = meta_phone_numbers.meta_asset_id
      AND (get_user_role() IN ('super_admin','manager') OR r.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS meta_phone_insert ON meta_phone_numbers;
CREATE POLICY meta_phone_insert ON meta_phone_numbers
  FOR INSERT WITH CHECK (is_active_user() AND get_user_role() IN ('super_admin','manager','employee'));

DROP POLICY IF EXISTS meta_phone_update ON meta_phone_numbers;
CREATE POLICY meta_phone_update ON meta_phone_numbers
  FOR UPDATE USING (is_active_user() AND get_user_role() IN ('super_admin','manager','employee'));

DROP POLICY IF EXISTS meta_phone_delete ON meta_phone_numbers;
CREATE POLICY meta_phone_delete ON meta_phone_numbers
  FOR DELETE USING (is_active_user() AND get_user_role() IN ('super_admin','manager','employee'));

COMMENT ON TABLE meta_business_assets IS 'Operational Meta Business Portfolio, WABA and continuity metadata. Never store passwords or access tokens here.';
COMMENT ON TABLE meta_phone_numbers IS 'Phone numbers mapped to a Meta/WABA asset.';
