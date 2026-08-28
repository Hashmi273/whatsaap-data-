-- ============================================================================
-- Migration 006: Storage Verification Metadata
-- ============================================================================

ALTER TABLE onboarding_documents
ADD COLUMN IF NOT EXISTS storage_verified BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS storage_verified_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_documents_storage_verified ON onboarding_documents(storage_verified);
