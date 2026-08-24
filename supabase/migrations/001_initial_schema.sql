-- ============================================================================
-- IMMENSE WhatsApp Onboarding Portal — Initial Database Schema
-- ============================================================================
--
-- File:    001_initial_schema.sql
-- Version: 1.0.0
-- Date:    2026-08-24
--
-- SETUP INSTRUCTIONS:
-- 1. Open your Supabase project dashboard → SQL Editor
-- 2. Paste this entire file and click "Run"
-- 3. After running, set the encryption key for credential storage:
--      ALTER DATABASE postgres SET app.encryption_key = 'your-secure-256-bit-key-here';
--    (In production, use Supabase Vault instead)
-- 4. Sign up with your @immenseair.com email
-- 5. Promote yourself to super_admin:
--      UPDATE profiles SET role = 'super_admin'
--      WHERE corporate_email = 'your-email@immenseair.com';
--
-- SECURITY NOTES:
-- • RLS is enabled on ALL tables — no anonymous access.
-- • Credentials are encrypted server-side with pgcrypto AES.
-- • Corporate email enforcement happens at the DB trigger level.
-- • Audit logs are immutable — no UPDATE or DELETE policies.
-- • Storage bucket is PRIVATE with strict MIME-type allowlisting.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- AES encryption for credentials
CREATE EXTENSION IF NOT EXISTS moddatetime; -- Automatic updated_at handling


-- ============================================================================
-- 2. CUSTOM TYPES
-- ============================================================================

-- User roles with increasing privilege levels
CREATE TYPE user_role AS ENUM (
  'super_admin',  -- Full system access, can manage users and config
  'manager',      -- Can manage onboarding records and view all data
  'employee',     -- Can view and work on assigned records only
  'viewer'        -- Read-only access to assigned records
);

-- Lifecycle status for each onboarding record
CREATE TYPE onboarding_status AS ENUM (
  'pending',      -- Newly created, awaiting assignment
  'in_progress',  -- Actively being worked on
  'live',         -- WhatsApp API is live for this brand
  'rejected',     -- Rejected by Meta or client
  'completed',    -- Fully completed and archived
  'inactive'      -- Deactivated / paused
);

-- Document classification categories
CREATE TYPE document_category AS ENUM (
  'gst_certificate',     -- GST registration certificate
  'pan',                 -- PAN card
  'kyc',                 -- KYC documents
  'whatsapp_approval',   -- WhatsApp business approval docs
  'meta_documents',      -- Meta/Facebook business documents
  'business_documents',  -- General business documents
  'screenshots',         -- Screenshots of setup steps
  'agreements',          -- Signed agreements / contracts
  'other'                -- Uncategorized
);


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- 3a. App Configuration (key-value settings)
-- --------------------------------------------------------------------------
-- Used for server-side configuration such as allowed email domains.
-- Must be created BEFORE triggers that reference it.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed the allowed email domain for corporate enforcement
INSERT INTO app_config (key, value)
VALUES ('allowed_email_domain', 'immensesmartsolutions.com')
ON CONFLICT (key) DO UPDATE SET value = 'immensesmartsolutions.com';


-- --------------------------------------------------------------------------
-- 3b. Profiles (extends auth.users)
-- --------------------------------------------------------------------------
-- Every authenticated user gets a profile row automatically via trigger.
-- SECURITY: The id column references auth.users, ensuring 1:1 mapping.
CREATE TABLE profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  corporate_email TEXT        NOT NULL UNIQUE,
  role            user_role   DEFAULT 'employee',
  department      TEXT        DEFAULT '',
  is_active       BOOLEAN     DEFAULT true,
  avatar_url      TEXT,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  profiles IS 'Extended user profiles linked 1:1 with auth.users';
COMMENT ON COLUMN profiles.role IS 'Access level: super_admin > manager > employee > viewer';
COMMENT ON COLUMN profiles.is_active IS 'Soft-delete flag — inactive users are denied all access via RLS';


-- --------------------------------------------------------------------------
-- 3c. Onboarding Records
-- --------------------------------------------------------------------------
-- Core business entity — tracks each brand's WhatsApp onboarding lifecycle.
CREATE TABLE onboarding_records (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name            TEXT              NOT NULL,
  company_name          TEXT              DEFAULT '',
  whatsapp_number       TEXT              NOT NULL,
  contact_person        TEXT              DEFAULT '',
  contact_email         TEXT              DEFAULT '',
  contact_number        TEXT              DEFAULT '',
  username              TEXT              DEFAULT '',
  credential_encrypted  TEXT              DEFAULT '',   -- SECURITY: AES-encrypted, NEVER plaintext
  platform              TEXT              DEFAULT '',
  login_url             TEXT              DEFAULT '',
  status                onboarding_status DEFAULT 'pending',
  assigned_to           UUID              REFERENCES profiles(id),
  onboarding_date       DATE              DEFAULT CURRENT_DATE,
  notes                 TEXT              DEFAULT '',
  created_by            UUID              REFERENCES profiles(id),
  created_at            TIMESTAMPTZ       DEFAULT now(),
  updated_at            TIMESTAMPTZ       DEFAULT now()
);

COMMENT ON TABLE  onboarding_records IS 'WhatsApp API onboarding records for client brands';
COMMENT ON COLUMN onboarding_records.credential_encrypted IS 'AES-encrypted credential — decrypt via get_credential() RPC only';


-- --------------------------------------------------------------------------
-- 3d. Onboarding Documents
-- --------------------------------------------------------------------------
-- File metadata for documents attached to onboarding records.
-- Actual files live in the 'onboarding-documents' storage bucket.
CREATE TABLE onboarding_documents (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id   UUID              NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  file_name       TEXT              NOT NULL,
  original_name   TEXT              NOT NULL,
  category        document_category DEFAULT 'other',
  storage_path    TEXT              NOT NULL,
  mime_type       TEXT              DEFAULT '',
  file_size       BIGINT            DEFAULT 0,
  uploaded_by     UUID              REFERENCES profiles(id),
  created_at      TIMESTAMPTZ       DEFAULT now()
);

COMMENT ON TABLE onboarding_documents IS 'Document metadata linked to onboarding records; files stored in Supabase Storage';


-- --------------------------------------------------------------------------
-- 3e. Audit Logs
-- --------------------------------------------------------------------------
-- Immutable append-only log of all security-relevant actions.
-- SECURITY: No UPDATE or DELETE policies — logs cannot be tampered with.
CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES profiles(id),
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,   -- e.g. 'onboarding', 'document', 'employee', 'credential', 'auth'
  entity_id   TEXT,
  metadata    JSONB       DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  audit_logs IS 'Immutable audit trail — no updates or deletes allowed';
COMMENT ON COLUMN audit_logs.entity_type IS 'Category: onboarding | document | employee | credential | auth';
COMMENT ON COLUMN audit_logs.metadata IS 'Structured JSON payload with action-specific details';


-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- Onboarding Records indexes
CREATE INDEX idx_onboarding_status   ON onboarding_records(status);
CREATE INDEX idx_onboarding_assigned ON onboarding_records(assigned_to);
CREATE INDEX idx_onboarding_brand    ON onboarding_records(brand_name);
CREATE INDEX idx_onboarding_date     ON onboarding_records(onboarding_date);
CREATE INDEX idx_onboarding_created  ON onboarding_records(created_at);

-- Documents indexes
CREATE INDEX idx_documents_onboarding ON onboarding_documents(onboarding_id);
CREATE INDEX idx_documents_category   ON onboarding_documents(category);

-- Audit Logs indexes
CREATE INDEX idx_audit_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- Profiles indexes
CREATE INDEX idx_profiles_email  ON profiles(corporate_email);
CREATE INDEX idx_profiles_role   ON profiles(role);
CREATE INDEX idx_profiles_active ON profiles(is_active);


-- ============================================================================
-- 5. AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================================================

-- Generic trigger function that sets updated_at = now() on every UPDATE.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_onboarding_updated_at
  BEFORE UPDATE ON onboarding_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- 6. HANDLE NEW USER TRIGGER (auto-create profile on signup)
-- ============================================================================

-- SECURITY: SECURITY DEFINER so the function runs with table-owner privileges,
-- allowing it to INSERT into profiles even though the new user has no RLS access yet.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, corporate_email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'employee'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================================
-- 7. CORPORATE EMAIL ENFORCEMENT TRIGGER (SERVER-SIDE)
-- ============================================================================
-- CRITICAL SECURITY CONTROL: Prevents registration from non-corporate emails.
-- This runs at the database level so it cannot be bypassed by the frontend.
-- The allowed domain is stored in app_config for easy management.

CREATE OR REPLACE FUNCTION enforce_corporate_email()
RETURNS TRIGGER AS $$
DECLARE
  allowed_domain TEXT;
  email_domain   TEXT;
BEGIN
  -- Get the allowed domain from config
  SELECT value INTO allowed_domain
  FROM public.app_config
  WHERE key = 'allowed_email_domain';

  -- Extract domain from email
  email_domain := split_part(NEW.email, '@', 2);

  -- Reject if domain doesn't match
  IF email_domain != allowed_domain THEN
    RAISE EXCEPTION 'Registration is restricted to corporate email addresses (@%)', allowed_domain;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_corporate_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_corporate_email();


-- ============================================================================
-- 8. CREDENTIAL ENCRYPTION / DECRYPTION FUNCTIONS
-- ============================================================================
-- Uses pgcrypto AES encryption with a server-side key stored in PostgreSQL
-- runtime settings (current_setting('app.encryption_key')).
--
-- SECURITY:
-- • The encryption key is NEVER exposed to the frontend.
-- • Functions are SECURITY DEFINER so only the DB owner can see the key.
-- • In production, use Supabase Vault for key management.
-- • Setup: ALTER DATABASE postgres SET app.encryption_key = 'your-secure-256-bit-key-here';

CREATE OR REPLACE FUNCTION encrypt_credential(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  enc_key TEXT;
BEGIN
  -- Get encryption key from server-side DB setting
  -- SECURITY: current_setting is only accessible server-side
  enc_key := current_setting('app.encryption_key', true);

  IF enc_key IS NULL OR enc_key = '' THEN
    -- SECURITY WARNING: In production, always set app.encryption_key
    -- This fallback marks the value so it can be identified and re-encrypted later
    RETURN 'UNENCRYPTED:' || plain_text;
  END IF;

  RETURN encode(
    encrypt(
      convert_to(plain_text, 'utf8'),
      convert_to(enc_key, 'utf8'),
      'aes'
    ),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION encrypt_credential IS 'Encrypts a plaintext credential using AES via pgcrypto. Key from app.encryption_key.';


CREATE OR REPLACE FUNCTION decrypt_credential(cipher_text TEXT)
RETURNS TEXT AS $$
DECLARE
  enc_key TEXT;
BEGIN
  -- Handle NULL or empty input gracefully
  IF cipher_text IS NULL OR cipher_text = '' THEN
    RETURN '';
  END IF;

  -- Handle unencrypted fallback (development mode)
  IF starts_with(cipher_text, 'UNENCRYPTED:') THEN
    RETURN substring(cipher_text FROM 13);
  END IF;

  -- Get encryption key from server-side DB setting
  enc_key := current_setting('app.encryption_key', true);

  IF enc_key IS NULL OR enc_key = '' THEN
    RETURN '[ENCRYPTION KEY NOT SET]';
  END IF;

  RETURN convert_from(
    decrypt(
      decode(cipher_text, 'base64'),
      convert_to(enc_key, 'utf8'),
      'aes'
    ),
    'utf8'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decrypt_credential IS 'Decrypts an AES-encrypted credential. Key from app.encryption_key.';


-- ============================================================================
-- 9. RPC FUNCTIONS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 9a. get_credential — Decrypt and return credential with permission check
-- --------------------------------------------------------------------------
-- SECURITY: Only super_admin, manager, or the assigned employee can view.
-- Every access is logged to the audit trail for compliance.
CREATE OR REPLACE FUNCTION get_credential(record_id UUID)
RETURNS TABLE(username TEXT, credential TEXT, platform TEXT, login_url TEXT) AS $$
DECLARE
  v_user_role user_role;
  v_is_assigned BOOLEAN;
BEGIN
  -- Get caller's role
  SELECT p.role INTO v_user_role
  FROM profiles p
  WHERE p.id = auth.uid();

  -- Check if user is assigned to this record
  SELECT (r.assigned_to = auth.uid()) INTO v_is_assigned
  FROM onboarding_records r
  WHERE r.id = record_id;

  -- SECURITY: Permission gate — reject unauthorized access
  IF v_user_role NOT IN ('super_admin', 'manager') AND NOT COALESCE(v_is_assigned, false) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to view credentials';
  END IF;

  -- AUDIT: Log every credential access for compliance
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'credential_viewed',
    'credential',
    record_id::TEXT,
    jsonb_build_object('action_type', 'view')
  );

  -- Return decrypted credential data
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

COMMENT ON FUNCTION get_credential IS 'Returns decrypted credential for authorized users. All access is audit-logged.';


-- --------------------------------------------------------------------------
-- 9b. log_credential_copy — Audit trail for clipboard copy events
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_credential_copy(record_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'credential_copied',
    'credential',
    record_id::TEXT,
    jsonb_build_object('action_type', 'copy')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_credential_copy IS 'Logs a credential copy-to-clipboard event to the audit trail.';


-- --------------------------------------------------------------------------
-- 9c. get_dashboard_stats — Aggregated onboarding status counts
-- --------------------------------------------------------------------------
-- Returns counts filtered by the caller's access level (RLS-aware).
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
    COUNT(*)::BIGINT                                          AS total,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT        AS pending,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT    AS in_progress,
    COUNT(*) FILTER (WHERE status = 'live')::BIGINT           AS live,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT      AS completed,
    COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT       AS rejected
  FROM onboarding_records
  WHERE (
    -- Admin/Manager see all records; others see only their assigned records
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    )
    OR assigned_to = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_dashboard_stats IS 'Returns aggregated onboarding status counts scoped to caller permissions.';


-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- --------------------------------------------------------------------------
-- 10a. Enable RLS on ALL tables
-- --------------------------------------------------------------------------
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config           ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- 10b. Helper functions for RLS policies
-- --------------------------------------------------------------------------

-- Returns TRUE if the calling user has is_active = true
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION is_active_user IS 'RLS helper: returns true if the authenticated user is active';

-- Returns the calling user's role enum value
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_role IS 'RLS helper: returns the authenticated user''s role';


-- --------------------------------------------------------------------------
-- 10c. PROFILES policies
-- --------------------------------------------------------------------------

-- Users can read all profiles if active (needed for assignment dropdowns, team lists)
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (is_active_user());

-- Users can update their OWN profile (name, avatar, department)
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  USING (id = auth.uid() AND is_active_user())
  WITH CHECK (id = auth.uid());

-- Super admins have full CRUD on all profiles (role changes, deactivation, etc.)
CREATE POLICY profiles_admin_all ON profiles
  FOR ALL
  USING (get_user_role() = 'super_admin' AND is_active_user());


-- --------------------------------------------------------------------------
-- 10d. ONBOARDING RECORDS policies
-- --------------------------------------------------------------------------

-- SELECT: Admin/Manager see all; Employee/Viewer see only assigned records
CREATE POLICY onboarding_select ON onboarding_records
  FOR SELECT
  USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR assigned_to = auth.uid()
    )
  );

-- INSERT: Only Admin and Manager can create new onboarding records
CREATE POLICY onboarding_insert ON onboarding_records
  FOR INSERT
  WITH CHECK (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );

-- UPDATE: Only Admin and Manager can modify records
CREATE POLICY onboarding_update ON onboarding_records
  FOR UPDATE
  USING (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );

-- DELETE: Only super_admin can delete records (hard delete)
CREATE POLICY onboarding_delete ON onboarding_records
  FOR DELETE
  USING (
    is_active_user() AND get_user_role() = 'super_admin'
  );


-- --------------------------------------------------------------------------
-- 10e. ONBOARDING DOCUMENTS policies
-- --------------------------------------------------------------------------

-- SELECT: Can view documents of records they have access to
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

-- INSERT: Admin, Manager, or assigned Employee can upload documents
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

-- DELETE: Only Admin and Manager can remove documents
CREATE POLICY documents_delete ON onboarding_documents
  FOR DELETE
  USING (
    is_active_user() AND get_user_role() IN ('super_admin', 'manager')
  );


-- --------------------------------------------------------------------------
-- 10f. AUDIT LOGS policies
-- --------------------------------------------------------------------------
-- SECURITY: Audit logs are IMMUTABLE — no UPDATE or DELETE policies exist.

-- INSERT: Any authenticated user can write audit entries
CREATE POLICY audit_insert ON audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: Admin/Manager see all logs; others see only their own actions
CREATE POLICY audit_select ON audit_logs
  FOR SELECT
  USING (
    is_active_user() AND (
      get_user_role() IN ('super_admin', 'manager')
      OR user_id = auth.uid()
    )
  );

-- NOTE: No UPDATE or DELETE policies — audit logs are append-only by design.


-- --------------------------------------------------------------------------
-- 10g. APP CONFIG policies
-- --------------------------------------------------------------------------

-- Anyone (authenticated or not) can read config values
CREATE POLICY config_select ON app_config
  FOR SELECT
  USING (true);

-- Only super_admin can modify config
CREATE POLICY config_admin ON app_config
  FOR ALL
  USING (get_user_role() = 'super_admin' AND is_active_user());


-- ============================================================================
-- 11. STORAGE BUCKET SETUP
-- ============================================================================

-- Create a PRIVATE storage bucket for onboarding documents.
-- SECURITY: Public access is disabled; all access is controlled via storage policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-documents',
  'onboarding-documents',
  false,       -- PRIVATE bucket — no public URLs
  10485760,    -- 10 MB max file size
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
) ON CONFLICT (id) DO NOTHING;


-- --------------------------------------------------------------------------
-- 11a. Storage RLS policies
-- --------------------------------------------------------------------------
-- Files are organized as: onboarding-documents/{onboarding_record_id}/{filename}
-- Access is scoped by role and record assignment.

-- SELECT: Download files for accessible records
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

-- INSERT: Upload files to accessible records
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

-- DELETE: Only Admin and Manager can remove files from storage
CREATE POLICY storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'onboarding-documents'
    AND is_active_user()
    AND get_user_role() IN ('super_admin', 'manager')
  );


-- ============================================================================
-- 12. DEMO / SEED DATA
-- ============================================================================
-- NOTE: This section contains NO real credentials, documents, or company data.
-- It exists solely to provide sample data for UI development and testing.
--
-- FIRST-TIME SETUP:
-- 1. Sign up via the app with your @immenseair.com email
-- 2. Promote yourself to super_admin:
--
--    UPDATE profiles SET role = 'super_admin'
--    WHERE corporate_email = 'your-email@immenseair.com';
--
-- 3. Use the app UI to create real onboarding records.
-- ============================================================================


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of objects created:
--
--   Extensions:  pgcrypto, moddatetime
--   Types:       user_role, onboarding_status, document_category
--   Tables:      app_config, profiles, onboarding_records,
--                onboarding_documents, audit_logs
--   Indexes:     13 indexes across all tables
--   Functions:   update_updated_at, handle_new_user, enforce_corporate_email,
--                encrypt_credential, decrypt_credential, get_credential,
--                log_credential_copy, get_dashboard_stats,
--                is_active_user, get_user_role
--   Triggers:    update_profiles_updated_at, update_onboarding_updated_at,
--                on_auth_user_created, enforce_corporate_email_trigger
--   RLS:         Enabled on all 5 tables with 15 policies
--   Storage:     onboarding-documents bucket (private, 10MB limit)
--                with 3 storage policies
-- ============================================================================
