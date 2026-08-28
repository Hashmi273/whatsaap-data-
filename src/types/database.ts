// ============================================================
// Supabase Database Types
// These types mirror the database schema defined in the SQL migration.
// ============================================================

export type UserRole = 'super_admin' | 'manager' | 'employee' | 'viewer';

export type OnboardingStatus = 'draft' | 'submitted' | 'pending' | 'in_progress' | 'live' | 'rejected' | 'completed' | 'inactive';

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
  // Added fields
  client_type?: string;
  website?: string;
  // Joined fields (optional)
  assigned_profile?: Profile;
  creator_profile?: Profile;
}

export interface RcsOnboardingRecord {
  id: string;
  brand_name: string;
  company_name: string;
  gst_number: string;
  website: string;
  contact_person: string;
  contact_number: string;
  contact_email: string;
  rcs_business_name: string;
  rcs_agent_id: string;
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
  // Google Drive Disaster Recovery Backup fields
  drive_file_id?: string | null;
  drive_backup_status?: 'backed_up' | 'pending' | 'failed' | null;
  drive_backup_at?: string | null;
  drive_backup_error?: string | null;
  drive_folder_id?: string | null;
  drive_web_url?: string | null;
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

export type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'rejected';
export type WabaStatus = 'active' | 'pending' | 'suspended' | 'banned';
export type PhoneNumberStatus = 'connected' | 'pending' | 'disconnected' | 'banned';
export type PhoneVerificationStatus = 'verified' | 'pending' | 'not_verified';
export type ClientType = 'enterprise' | 'smb' | 'startup' | 'agency' | '';

export interface MetaBusinessPortfolio {
  id: string;
  client_id: string;
  portfolio_name: string;
  portfolio_id: string;
  portfolio_owner: string;
  meta_login_email: string;
  verification_status: VerificationStatus;
  verification_date: string | null;
  admin_access: string;
  recovery_email: string;
  recovery_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WabaAccount {
  id: string;
  client_id: string;
  meta_portfolio_id: string | null;
  waba_name: string;
  waba_id: string;
  waba_status: WabaStatus;
  business_name: string;
  messaging_limit: string;
  quality_rating: string;
  account_status: string;
  assigned_to: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined
  assigned_profile?: Profile;
  meta_portfolio?: MetaBusinessPortfolio;
}

export interface PhoneNumber {
  id: string;
  waba_id: string | null;
  client_id: string;
  display_name: string;
  phone_number: string;
  phone_number_id: string;
  status: PhoneNumberStatus;
  quality_rating: string;
  messaging_limit: string;
  verification_status: PhoneVerificationStatus;
  connected_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined
  waba_account?: WabaAccount;
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
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
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

export const VERIFICATION_STATUS_OPTIONS: SelectOption[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

export const WABA_STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

export const PHONE_STATUS_OPTIONS: SelectOption[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'pending', label: 'Pending' },
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'banned', label: 'Banned' },
];

export const CLIENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'smb', label: 'SMB' },
  { value: 'startup', label: 'Startup' },
  { value: 'agency', label: 'Agency' },
];

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, { bg: string; text: string; dot: string }> = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  verified: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export const WABA_STATUS_COLORS: Record<WabaStatus, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  suspended: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  banned: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export const PHONE_STATUS_COLORS: Record<PhoneNumberStatus, { bg: string; text: string; dot: string }> = {
  connected: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  disconnected: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  banned: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export const STATUS_COLORS: Record<OnboardingStatus, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  submitted: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
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

// Allowed file types for document uploads (Strictly PDF, JPG, JPEG, PNG, WebP, DOCX)
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc'];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
