// ============================================================
// Role-Based Permission System
// SECURITY: These are UI-level permission checks for showing/hiding UI.
// Actual data access is always enforced by Supabase RLS policies.
// Never rely solely on these checks for security.
// ============================================================

import type { UserRole } from '@/types/database';

type Permission =
  | 'onboarding:create'
  | 'onboarding:edit'
  | 'onboarding:delete'
  | 'onboarding:view_all'
  | 'onboarding:view_assigned'
  | 'credential:view'
  | 'credential:copy'
  | 'document:upload'
  | 'document:download'
  | 'document:delete'
  | 'employee:manage'
  | 'employee:view_all'
  | 'employee:assign'
  | 'employee:deactivate'
  | 'audit:view_all'
  | 'audit:view_own'
  | 'settings:manage'
  | 'import:excel'
  | 'export:data';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'onboarding:create', 'onboarding:edit', 'onboarding:delete', 'onboarding:view_all',
    'credential:view', 'credential:copy',
    'document:upload', 'document:download', 'document:delete',
    'employee:manage', 'employee:view_all', 'employee:assign', 'employee:deactivate',
    'audit:view_all', 'audit:view_own',
    'settings:manage',
    'import:excel', 'export:data',
  ],
  manager: [
    'onboarding:create', 'onboarding:edit', 'onboarding:view_all',
    'credential:view', 'credential:copy',
    'document:upload', 'document:download',
    'employee:view_all', 'employee:assign',
    'audit:view_all', 'audit:view_own',
    'import:excel', 'export:data',
  ],
  employee: [
    'onboarding:create',
    'onboarding:view_assigned',
    'credential:view',
    'document:upload', 'document:download',
    'audit:view_own',
  ],
  viewer: [
    'onboarding:view_assigned',
    'document:download',
    'audit:view_own',
  ],
};

/**
 * Check if a role has a specific permission.
 * SECURITY NOTE: This is for UI display only. RLS enforces actual access.
 */
export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if a role has ANY of the given permissions.
 */
export function hasAnyPermission(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.some(p => ROLE_PERMISSIONS[role]?.includes(p));
}

/**
 * Check if a role is admin-level (super_admin or manager).
 */
export function isAdminOrManager(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'manager';
}

/**
 * Check if a role is super admin.
 */
export function isSuperAdmin(role: UserRole | undefined): boolean {
  return role === 'super_admin';
}

/**
 * Get navigation items visible to a role.
 */
export function getVisibleNavItems(role: UserRole | undefined) {
  const items = [
    { path: '/dashboard', label: 'Dashboard', permission: null },
    { path: '/onboarding', label: 'WhatsApp Onboarding', permission: null },
    { path: '/documents', label: 'Document Vault', permission: null },
    { path: '/documents/search', label: 'Document Search', permission: null },
    { path: '/team', label: 'Team & Access', permission: 'employee:manage' as Permission },
    { path: '/activity', label: 'Activity Logs', permission: 'audit:view_all' as Permission },
    { path: '/settings', label: 'Settings', permission: 'settings:manage' as Permission },
  ];

  return items.filter(item =>
    item.permission === null || hasPermission(role, item.permission)
  );
}
