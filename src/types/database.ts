// ============================================================
// Supabase Database Types
// These types mirror the database schema defined in the SQL migration.
// ============================================================

export type UserRole = 'super_admin' | 'manager' | 'employee' | 'viewer';

export type OnboardingStatus = 'pending' | 'in_progress' | 'live' | 'rejected' | 'completed' | 'inactive';

export type DocumentCategory =
  | 'logo'
  | 'banner_creative'
  | 'gst_certificate'
  | 'pan_card'
  | 'pan'
  | 'kyc_document'
  | 'kyc'
  | 'meta_verification'
  | 'whatsapp_approval'
  | 'meta_documents'
  | 'business_documents'
  | 'screenshots'
  | 'agreements'
  | 'other';

export interface Profile {
  id: string;
  full_name: string;
  corporate_email: string;
  role: UserRole;
  department: string;
  mobile_number?: string;
  is_active: boolean;
  avatar_url: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingRecord {
  id: string;
  brand_name: string;
  company_name: string;
  whatsapp_number: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  username: string;
  credential_encrypted: string; // Never displayed directly — use RPC
  platform: string;
  login_url: string;
  status: OnboardingStatus;
  assigned_to: string | null;
  onboarding_date: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional)
  assigned_profile?: Profile;
  creator_profile?: Profile;
}

export interface OnboardingDocument {
  id: string;
  onboarding_id: string;
  file_name: string;
  original_name: string;
  category: DocumentCategory;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  // Joined fields
  uploader_profile?: Profile;
  onboarding?: OnboardingRecord;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined
  user_profile?: Profile;
}

export interface DashboardStats {
  total: number;
  pending: number;
  in_progress: number;
  live: number;
  completed: number;
  rejected: number;
}

export interface DecryptedCredential {
  username: string;
  credential: string;
  platform: string;
  login_url: string;
}

// ============================================================
// UI Helper Types
// ============================================================

export interface SelectOption {
  value: string;
  label: string;
}

export const STATUS_OPTIONS: SelectOption[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'live', label: 'Live' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
  { value: 'inactive', label: 'Inactive' },
];

export const CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'logo', label: 'Logo' },
  { value: 'banner_creative', label: 'Banner / Creative' },
  { value: 'gst_certificate', label: 'GST Certificate' },
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'kyc_document', label: 'KYC Document' },
  { value: 'meta_verification', label: 'Meta/Facebook Verification' },
  { value: 'whatsapp_approval', label: 'WhatsApp Approval' },
  { value: 'meta_documents', label: 'Meta Documents' },
  { value: 'business_documents', label: 'Business Documents' },
  { value: 'screenshots', label: 'Screenshots' },
  { value: 'agreements', label: 'Agreements' },
  { value: 'other', label: 'Other' },
];

export const ROLE_OPTIONS: SelectOption[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'viewer', label: 'Viewer' },
];

export const STATUS_COLORS: Record<OnboardingStatus, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  live: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  completed: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

export const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  super_admin: { bg: 'bg-navy-900/10', text: 'text-navy-900' },
  manager: { bg: 'bg-blue-100', text: 'text-blue-700' },
  employee: { bg: 'bg-teal-50', text: 'text-teal-700' },
  viewer: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

export function formatCategoryLabel(category: DocumentCategory): string {
  return CATEGORY_OPTIONS.find(c => c.value === category)?.label || category;
}

export function formatStatusLabel(status: OnboardingStatus): string {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

export function formatRoleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find(r => r.value === role)?.label || role;
}

// Allowed file types for document uploads (Strictly PDF, JPG, JPEG, PNG, DOCX)
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.doc'];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
