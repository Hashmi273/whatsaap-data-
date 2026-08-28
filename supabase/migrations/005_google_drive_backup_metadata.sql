-- ============================================================================
-- IMMENSE PORTAL - MIGRATION 005: GOOGLE DRIVE BACKUP & DISASTER RECOVERY
-- ============================================================================
-- Non-destructive addition of Google Drive backup metadata columns and indexes.
-- ============================================================================

ALTER TABLE onboarding_documents
ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
ADD COLUMN IF NOT EXISTS drive_backup_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS drive_backup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS drive_backup_error TEXT,
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
ADD COLUMN IF NOT EXISTS drive_web_url TEXT;

-- Index for efficient disaster recovery status querying
CREATE INDEX IF NOT EXISTS idx_documents_drive_status ON onboarding_documents(drive_backup_status);
CREATE INDEX IF NOT EXISTS idx_documents_drive_file ON onboarding_documents(drive_file_id);

-- Add default audit action types for Google Drive DR
COMMENT ON COLUMN onboarding_documents.drive_backup_status IS 'Disaster recovery status: backed_up, pending, failed';
