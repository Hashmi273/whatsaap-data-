-- ============================================================================
-- IMMENSE WhatsApp Onboarding Portal — Production Database Schema & Security
-- ============================================================================
--
-- File:    supabase/migrations/001_initial_schema.sql
-- Version: 2.0.0 (Production Hardened)
-- Target:  Supabase PostgreSQL Database
-- Corporate Domain: immensesmartsolutions.com
--
-- ============================================================================
-- SETUP INSTRUCTIONS FOR SUPABASE SQL EDITOR:
-- 1. Open Supabase Dashboard → SQL Editor → New Query
-- 2. Paste this entire file and click "Run" (Green Button)
-- 3. Everything (Tables, RLS, Storage Bucket, Triggers, Encryption) is created automatically.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ----------------------------------------------------------------------------
-- 2. CUSTOM TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'manager', 'employee', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_status AS ENUM ('pending', 'in_progress', 'live', 'rejected', 'completed', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE document_category AS ENUM (
    'gst_certificate',
    'pan',
    'kyc',
    'whatsapp_approval',
    'meta_documents',
    'business_documents',
    'screenshots',
    'agreements',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 3. APP & VAULT CONFIGURATION TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Set corporate email domain to immensesmartsolutions.com
INSERT INTO app_config (key, value)
VALUES ('allowed_email_domain', 'immensesmartsolutions.com')
ON CONFLICT (key) DO UPDATE SET value = 'immensesmartsolutions.com';

-- Private Secret Vault for AES-256 Master Key (Server-Side Only)
-- If no runtime setting is provided, an auto-generated 256-bit key is initialized once.
CREATE TABLE IF NOT EXISTS _vault_internal (
  id           INT PRIMARY KEY DEFAULT 1,
  master_key   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row_vault CHECK (id = 1)
);

INSERT INTO _vault_internal (id, master_key)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. CORE BUSINESS TABLES
-- ----------------------------------------------------------------------------

-- 4a. Profiles (linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  corporate_email TEXT        NOT NULL UNIQUE,
  role            user_role   DEFAULT 'employee',
  department      TEXT        DEFAULT 'WhatsApp Operations',
  is_active       BOOLEAN     DEFAULT true,
  avatar_url      TEXT,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 4b. Onboarding Records
CREATE TABLE IF NOT EXISTS onboarding_records (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name            TEXT              NOT NULL,
  company_name          TEXT              DEFAULT '',
  whatsapp_number       TEXT              NOT NULL,
  contact_person        TEXT              DEFAULT '',
  contact_email         TEXT              DEFAULT '',
  contact_number        TEXT              DEFAULT '',
  username              TEXT              DEFAULT '',
  credential_encrypted  TEXT              DEFAULT '',   -- AES-256 Encrypted via pgcrypto
  platform              TEXT              DEFAULT 'Meta Cloud API',
  login_url             TEXT              DEFAULT 'https://business.facebook.com',
  status                onboarding_status DEFAULT 'pending',
  assigned_to           UUID              REFERENCES profiles(id) ON DELETE SET NULL,
  onboarding_date       DATE              DEFAULT CURRENT_DATE,
  notes                 TEXT              DEFAULT '',
  created_by            UUID              REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ       DEFAULT now(),
  updated_at            TIMESTAMPTZ       DEFAULT now()
);

-- 4c. Onboarding Documents (Metadata for files in Private Storage)
CREATE TABLE IF NOT EXISTS onboarding_documents (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id   UUID              NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  file_name       TEXT              NOT NULL,
  original_name   TEXT              NOT NULL,
  category        document_category DEFAULT 'other',
  storage_path    TEXT              NOT NULL,
  mime_type       TEXT              DEFAULT 'application/pdf',
  file_size       BIGINT            DEFAULT 0,
  uploaded_by     UUID              REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ       DEFAULT now()
);

-- 4d. Audit Logs (Immutable compliance ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   TEXT,
  metadata    JSONB       DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_onboarding_status   ON onboarding_records(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_assigned ON onboarding_records(assigned_to);
CREATE INDEX IF NOT EXISTS idx_onboarding_brand    ON onboarding_records(brand_name);
CREATE INDEX IF NOT EXISTS idx_onboarding_date     ON onboarding_records(onboarding_date);
CREATE INDEX IF NOT EXISTS idx_onboarding_created  ON onboarding_records(created_at);

CREATE INDEX IF NOT EXISTS idx_documents_onboarding ON onboarding_documents(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_documents_category   ON onboarding_documents(category);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_email  ON profiles(corporate_email);
CREATE INDEX IF NOT EXISTS idx_profiles_role   ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);

-- ----------------------------------------------------------------------------
-- 6. AUTOMATED TRIGGERS
-- ----------------------------------------------------------------------------

-- 6a. updated_at auto updater
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_onboarding_updated_at ON onboarding_records;
CREATE TRIGGER update_onboarding_updated_at
  BEFORE UPDATE ON onboarding_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6b. Corporate email restriction (SERVER-SIDE ENFORCEMENT)
CREATE OR REPLACE FUNCTION enforce_corporate_email()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_domain TEXT;
  v_email_domain   TEXT;
BEGIN
  SELECT value INTO v_allowed_domain
  FROM public.app_config
  WHERE key = 'allowed_email_domain';

  IF v_allowed_domain IS NULL THEN
    v_allowed_domain := 'immensesmartsolutions.com';
  END IF;

  v_email_domain := split_part(NEW.email, '@', 2);

  IF lower(v_email_domain) != lower(v_allowed_domain) THEN
    RAISE EXCEPTION 'Registration rejected: Only verified corporate accounts (@%) are permitted.', v_allowed_domain;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_corporate_email_trigger ON auth.users;
CREATE TRIGGER enforce_corporate_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_corporate_email();

-- 6c. Auto-create Profile row upon auth.users signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, corporate_email, role, department, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'employee',
    'WhatsApp Operations',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. AES-256 SERVER-SIDE ENCRYPTION (NO PLAINTEXT FALLBACK)
-- ----------------------------------------------------------------------------

-- Helper function to fetch the secure server key
CREATE OR REPLACE FUNCTION _get_vault_key()
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR v_key = '' THEN
    SELECT master_key INTO v_key FROM _vault_internal WHERE id = 1;
  END IF;
  RETURN v_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Encrypt plain text using pgcrypto AES
CREATE OR REPLACE FUNCTION encrypt_credential(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF plain_text IS NULL OR plain_text = '' THEN
    RETURN '';
  END IF;
  v_key := _get_vault_key();
  RETURN encode(
    encrypt(
      convert_to(plain_text, 'utf8'),
      convert_to(v_key, 'utf8'),
      'aes'
    ),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt ciphertext
CREATE OR REPLACE FUNCTION decrypt_credential(cipher_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF cipher_text IS NULL OR cipher_text = '' THEN
    RETURN '';
  END IF;
  v_key := _get_vault_key();
  BEGIN
    RETURN convert_from(
      decrypt(
        decode(cipher_text, 'base64'),
        convert_to(v_key, 'utf8'),
        'aes'
      ),
      'utf8'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN '[Encrypted Secret]';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8. RPC FUNCTIONS (SECURE CREDENTIAL AUDIT & DASHBOARD STATS)
-- ----------------------------------------------------------------------------

-- Decrypt and retrieve credential with permission check and audit log
CREATE OR REPLACE FUNCTION get_credential(record_id UUID)
RETURNS TABLE(username TEXT, credential TEXT, platform TEXT, login_url TEXT) AS $$
DECLARE
  v_user_role user_role;
  v_is_assigned BOOLEAN;
BEGIN
  SELECT p.role INTO v_user_role FROM profiles p WHERE p.id = auth.uid();
  SELECT (r.assigned_to = auth.uid()) INTO v_is_assigned FROM onboarding_records r WHERE r.id = record_id;

  IF v_user_role NOT IN ('super_admin', 'manager') AND NOT COALESCE(v_is_assigned, false) THEN
    RAISE EXCEPTION 'Access Denied: Insufficient privileges to access platform secrets.';
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'credential_viewed',
    'credential',
    record_id::TEXT,
    jsonb_build_object('action_type', 'view', 'timestamp', now())
  );

  RETURN QUERY
  SELECT
    r.username,
    decrypt_credential(r.credential_encrypted) AS credential,
    r.platform,
    r.login_url
  FROM onboarding_records r
  WHERE r.id = record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log credential copy event
CREATE OR REPLACE FUNCTION log_credential_copy(record_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'credential_copied',
    'credential',
    record_id::TEXT,
    jsonb_build_object('action_type', 'copy', 'timestamp', now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aggregated dashboard statistics
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE(
  total       BIGINT,
  pending     BIGINT,
  in_progress BIGINT,
  live        BIGINT,
  completed   BIGINT,
  rejected    BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT                                       AS total,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT     AS pending,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT AS in_progress,
    COUNT(*) FILTER (WHERE status = 'live')::BIGINT        AS live,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT   AS completed,
    COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT    AS rejected
  FROM onboarding_records
  WHERE (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    )
    OR assigned_to = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE _vault_internal      ENABLE ROW LEVEL SECURITY;

-- Helper RLS functions
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 9a. Profiles Policies
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (is_active_user());

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  USING (id = auth.uid() AND is_active_user())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_all ON profiles;
CREATE POLICY profiles_admin_all ON profiles
  FOR ALL
  USING (get_user_role() = 'super_admin' AND is_active_user());

-- 9b. Onboarding Records Policies
DROP POLICY IF EXISTS onboarding_select ON onboarding_records;
CREATE POLICY onboarding_select ON onboarding_records
  FOR SELECT
  USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS onboarding_insert ON onboarding_records;
CREATE POLICY onboarding_insert ON onboarding_records
  FOR INSERT
  WITH CHECK (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );

DROP POLICY IF EXISTS onboarding_update ON onboarding_records;
CREATE POLICY onboarding_update ON onboarding_records
  FOR UPDATE
  USING (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );

DROP POLICY IF EXISTS onboarding_delete ON onboarding_records;
CREATE POLICY onboarding_delete ON onboarding_records
  FOR DELETE
  USING (
    is_active_user() AND get_user_role() = 'super_admin'
  );

-- 9c. Onboarding Documents Policies
DROP POLICY IF EXISTS documents_select ON onboarding_documents;
CREATE POLICY documents_select ON onboarding_documents
  FOR SELECT
  USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM onboarding_records
        WHERE id = onboarding_documents.onboarding_id
        AND assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS documents_insert ON onboarding_documents;
CREATE POLICY documents_insert ON onboarding_documents
  FOR INSERT
  WITH CHECK (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM onboarding_records
        WHERE id = onboarding_id
        AND assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS documents_delete ON onboarding_documents;
CREATE POLICY documents_delete ON onboarding_documents
  FOR DELETE
  USING (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );

-- 9d. Audit Logs Policies (Append-only)
DROP POLICY IF EXISTS audit_insert ON audit_logs;
CREATE POLICY audit_insert ON audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs
  FOR SELECT
  USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR user_id = auth.uid()
    )
  );

-- 9e. App Config Policies
DROP POLICY IF EXISTS config_select ON app_config;
CREATE POLICY config_select ON app_config
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS config_admin ON app_config;
CREATE POLICY config_admin ON app_config
  FOR ALL
  USING (get_user_role() = 'super_admin' AND is_active_user());

-- ----------------------------------------------------------------------------
-- 10. PRIVATE STORAGE BUCKET CONFIGURATION
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-documents',
  'onboarding-documents',
  false,       -- Strict Private Bucket
  10485760,    -- 10 MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

-- Storage Objects Policies
DROP POLICY IF EXISTS storage_select ON storage.objects;
CREATE POLICY storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'onboarding-documents'
    AND is_active_user()
    AND (
      get_user_role() IN ('super_admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM onboarding_records
        WHERE id::TEXT = (string_to_array(name, '/'))[1]
        AND assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS storage_insert ON storage.objects;
CREATE POLICY storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'onboarding-documents'
    AND is_active_user()
    AND (
      get_user_role() IN ('super_admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM onboarding_records
        WHERE id::TEXT = (string_to_array(name, '/'))[1]
        AND assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS storage_delete ON storage.objects;
CREATE POLICY storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'onboarding-documents'
    AND is_active_user()
    AND get_user_role() IN ('super_admin', 'manager')
  );

-- ============================================================================
-- MIGRATION INITIALIZATION COMPLETE
-- ============================================================================
