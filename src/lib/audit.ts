// ============================================================
// Audit Logging Utility
// Logs user actions to the audit_logs table for compliance tracking.
// SECURITY: Credential views/copies are always logged.
// Passwords, tokens, or OTPs are NEVER logged.
// ============================================================

import { supabase } from './supabase';
import { saveDocumentMetadata } from './storage';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'user_created'
  | 'role_changed'
  | 'record_created'
  | 'record_edited'
  | 'record_deleted'
  | 'credential_viewed'
  | 'credential_copied'
  | 'document_uploaded'
  | 'document_downloaded'
  | 'document_deleted'
  | 'employee_activated'
  | 'employee_deactivated'
  | 'assignment_changed'
  | 'excel_imported'
  | 'data_exported'
  | 'password_reset_requested'
  | 'password_reset_initiated'
  | 'password_reset_completed'
  | 'password_changed_own'
  | 'profile_updated'
  | 'meta_asset_updated'
  | 'meta_asset_created'
  | 'meta_asset_deleted';

export type EntityType = 'onboarding' | 'document' | 'employee' | 'credential' | 'auth' | 'system' | 'meta_asset';

/**
 * Log an audit event.
 * SECURITY: Writes to the audit_logs table. Never logs credentials or secrets.
 */
export async function logAudit(
  action: AuditAction,
  entityType: EntityType,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const userAgent = navigator.userAgent || 'unknown';

    await saveDocumentMetadata('audit_logs', {
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: {
        ...metadata,
        // SECURITY: Never log passwords, tokens, or OTPs
        timestamp: new Date().toISOString(),
      },
      user_agent: userAgent,
    }, 'insert');
  } catch (error) {
    console.error('Audit log notice (non-blocking):', error);
  }
}

/**
 * Log a credential view event via server-side RPC.
 */
export async function logCredentialView(recordId: string): Promise<void> {
  await logAudit('credential_viewed', 'credential', recordId);
}

/**
 * Log a credential copy event.
 */
export async function logCredentialCopy(recordId: string): Promise<void> {
  try {
    await supabase.rpc('log_credential_copy', { record_id: recordId });
  } catch {
    await logAudit('credential_copied', 'credential', recordId);
  }
}
