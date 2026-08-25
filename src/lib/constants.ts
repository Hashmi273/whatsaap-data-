// ============================================================
// Application Constants
// ============================================================

export const APP_NAME = 'IMMENSE';
export const APP_SUBTITLE = 'Smart Business Communication Solutions';
export const APP_FULL_NAME = 'Immense WhatsApp Onboarding Portal';

// Corporate email domain — also enforced server-side via DB trigger
export const ALLOWED_EMAIL_DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'immensesmartsolutions.com';

// UUID validation helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(str?: string | null): boolean {
  if (!str) return false;
  return UUID_REGEX.test(str);
}

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 50;

// File upload
export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Signed URL expiry (seconds)
export const SIGNED_URL_EXPIRY = 3600; // 1 hour

// Debounce delay for search (ms)
export const SEARCH_DEBOUNCE_MS = 300;

// Date/time format
export const DATE_FORMAT = 'dd MMM yyyy';
export const DATETIME_FORMAT = 'dd MMM yyyy, HH:mm';
export const TIME_FORMAT = 'HH:mm';
