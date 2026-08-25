-- ============================================================================
-- IMMENSE PORTAL - SECURE AUTHENTICATED STORAGE POLICIES
-- Maintains strict privacy while ensuring reliable authenticated uploads/downloads
-- ============================================================================

-- 1. Ensure private bucket with 20MB max file size
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-documents',
  'onboarding-documents',
  false,       -- Strict Private Bucket
  20971520,    -- 20MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520;

-- 2. Secure Authenticated SELECT Policy (Private / Role-gated)
DROP POLICY IF EXISTS storage_select ON storage.objects;
DROP POLICY IF EXISTS storage_select_onboarding ON storage.objects;
CREATE POLICY storage_select_onboarding ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      -- Super Admin and Managers have full read access
      get_user_role() IN ('super_admin', 'manager')
      -- Assigned Employee can access documents for their records
      OR EXISTS (
        SELECT 1 FROM public.onboarding_records
        WHERE id::TEXT = (string_to_array(name, '/'))[1]
        AND assigned_to = auth.uid()
      )
      -- Service role
      OR auth.role() = 'service_role'
    )
  );

-- 3. Secure Authenticated INSERT Policy (Upload / Create)
DROP POLICY IF EXISTS storage_insert ON storage.objects;
DROP POLICY IF EXISTS storage_insert_onboarding ON storage.objects;
CREATE POLICY storage_insert_onboarding ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'onboarding-documents'
    AND (
      -- Corporate team members with valid active roles can upload
      get_user_role() IN ('super_admin', 'manager', 'employee')
      -- Service role
      OR auth.role() = 'service_role'
    )
  );

-- 4. Secure Authenticated UPDATE Policy (Upsert / Replace)
DROP POLICY IF EXISTS storage_update ON storage.objects;
DROP POLICY IF EXISTS storage_update_onboarding ON storage.objects;
CREATE POLICY storage_update_onboarding ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      get_user_role() IN ('super_admin', 'manager')
      OR auth.role() = 'service_role'
    )
  );

-- 5. Secure Authenticated DELETE Policy (Remove)
DROP POLICY IF EXISTS storage_delete ON storage.objects;
DROP POLICY IF EXISTS storage_delete_onboarding ON storage.objects;
CREATE POLICY storage_delete_onboarding ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      get_user_role() IN ('super_admin', 'manager')
      OR auth.role() = 'service_role'
    )
  );
