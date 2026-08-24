// ============================================================
// Audit Logging Utility
// Logs user actions to the audit_logs table for compliance tracking.
// SECURITY: Credential views/copies are always logged.
// ============================================================

import { supabase } from './supabase';

type AuditAction =
  | 'login'
  | 'logout'
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
  | 'password_reset_requested';

type EntityType = 'onboarding' | 'document' | 'employee' | 'credential' | 'auth' | 'system';

/**
 * Log an audit event.
 * SECURITY: This writes to the audit_logs table which has no UPDATE/DELETE policies.
 * Audit logs are immutable once written.
 */
export async function logAudit(
  action: AuditAction,
  entityType: EntityType,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Collect safe device info (no sensitive data)
    const userAgent = navigator.userAgent || 'unknown';

    await supabase.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: {
        ...metadata,
        // SECURITY: Never log passwords or credential values in metadata
        timestamp: new Date().toISOString(),
      },
      user_agent: userAgent,
    });
  } catch (error) {
    // Audit logging should never break the application flow
    console.error('Audit log error (non-blocking):', error);
  }
}

/**
 * Log a credential view event via server-side RPC.
 * This is separate because credential access uses a secure DB function.
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
    // Also log client-side as fallback
    await logAudit('credential_copied', 'credential', recordId);
  }
}
