// ============================================================
// Role-Based Permission System
// SECURITY: Centralized UI-level permission checks for showing/hiding UI & guarding routes.
// Actual data access is enforced by Supabase Service Role and RLS policies.
// ============================================================

import type { UserRole } from '@/types/database';

export type Permission =
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
    'onboarding:create', 'onboarding:edit', 'onboarding:delete', 'onboarding:view_all', 'onboarding:view_assigned',
    'credential:view', 'credential:copy',
    'document:upload', 'document:download', 'document:delete',
    'employee:manage', 'employee:view_all', 'employee:assign', 'employee:deactivate',
    'audit:view_all', 'audit:view_own',
    'settings:manage',
    'import:excel', 'export:data',
  ],
  manager: [
    'onboarding:create', 'onboarding:edit', 'onboarding:view_all', 'onboarding:view_assigned',
    'credential:view', 'credential:copy',
    'document:upload', 'document:download', 'document:delete',
    'employee:view_all', 'employee:assign',
    'audit:view_all', 'audit:view_own',
    'import:excel', 'export:data',
  ],
  employee: [
    'onboarding:create', 'onboarding:edit', 'onboarding:view_all', 'onboarding:view_assigned',
    'credential:view', 'credential:copy',
    'document:upload', 'document:download',
    'audit:view_own',
  ],
  viewer: [
    'onboarding:view_all', 'onboarding:view_assigned',
    'document:download',
    'audit:view_own',
  ],
};

/**
 * Check if a role has a specific permission.
 * Defaults to 'employee' if role is not yet loaded from memory, preventing UI flickering.
 */
export function hasPermission(role: UserRole | undefined | null, permission: Permission): boolean {
  const activeRole: UserRole = role || 'employee';
  return ROLE_PERMISSIONS[activeRole]?.includes(permission) ?? false;
}

/**
 * Check if a role has ANY of the given permissions.
 */
export function hasAnyPermission(role: UserRole | undefined | null, permissions: Permission[]): boolean {
  const activeRole: UserRole = role || 'employee';
  return permissions.some((p) => ROLE_PERMISSIONS[activeRole]?.includes(p));
}

/**
 * Check if a role is admin-level (super_admin or manager).
 */
export function isAdminOrManager(role: UserRole | undefined | null): boolean {
  return role === 'super_admin' || role === 'manager';
}

/**
 * Check if a role is super admin.
 */
export function isSuperAdmin(role: UserRole | undefined | null): boolean {
  return role === 'super_admin';
}

/**
 * Get navigation items visible to a role.
 */
export function getVisibleNavItems(role: UserRole | undefined | null) {
  const items = [
    { path: '/dashboard', label: 'Dashboard', permission: null },
    { path: '/onboarding', label: 'WhatsApp Onboarding', permission: null },
    { path: '/rcs', label: 'RCS Onboarding', permission: null },
    { path: '/documents', label: 'Document Vault', permission: null },
    { path: '/documents/search', label: 'Document Search', permission: null },
    { path: '/team', label: 'Team & Access', permission: 'employee:manage' as Permission },
    { path: '/activity', label: 'Activity Logs', permission: 'audit:view_all' as Permission },
    { path: '/settings', label: 'Settings', permission: 'settings:manage' as Permission },
  ];

  return items.filter((item) => item.permission === null || hasPermission(role, item.permission));
}
