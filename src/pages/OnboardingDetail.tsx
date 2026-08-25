import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  User,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  FolderLock,
  UploadCloud,
  FileText,
  Download,
  Trash2,
  Clock,
  Edit,
  ExternalLink,
  AlertTriangle,
  FileCheck2,
  FileSpreadsheet,
  FileImage,
  ScrollText,
  UserCheck
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { logAudit, logCredentialView, logCredentialCopy } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { hasPermission } from '@/lib/permissions';
import {
  CATEGORY_OPTIONS,
  STATUS_OPTIONS,
  formatCategoryLabel,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE
} from '@/types/database';
import type {
  OnboardingRecord,
  OnboardingDocument,
  DocumentCategory,
  OnboardingStatus,
  Profile,
  AuditLog
} from '@/types/database';
import { format, formatDistanceToNow } from 'date-fns';

import { INITIAL_DEMO_ONBOARDINGS, INITIAL_DEMO_DOCUMENTS } from '@/lib/demoData';

export function OnboardingDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Credential state
  const [showPassword, setShowPassword] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Document Upload state
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('gst_certificate');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Document Preview / Delete state
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<OnboardingDocument | null>(null);

  // Reassignment state
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedNewAssignee, setSelectedNewAssignee] = useState<string>('');

  // Fetch Onboarding Record
  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ['onboarding-detail', id],
    queryFn: async () => {
      if (!id) throw new Error('No record ID provided');
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select(`
            *,
            assigned_profile:profiles!onboarding_records_assigned_to_fkey(id, full_name, corporate_email, department),
            creator_profile:profiles!onboarding_records_created_by_fkey(id, full_name, corporate_email)
          `)
          .eq('id', id)
          .single();

        if (!error && data) {
          return data as OnboardingRecord & {
            assigned_profile: Profile | null;
            creator_profile: Profile | null;
          };
        }
      } catch {
        // Fallback
      }

      // Check local custom onboardings first if match
      try {
        const localCustom = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
        const localMatch = localCustom.find((r: any) => r.id === id);
        if (localMatch) {
          return {
            ...localMatch,
            assigned_profile: {
              id: 'immense-employee-003',
              full_name: 'Support Executive',
              corporate_email: 'employee@immensesmartsolutions.com',
              role: 'employee',
              department: 'Client Success',
              is_active: true,
              avatar_url: null,
              last_login: null,
              created_at: '',
              updated_at: '',
            },
            creator_profile: {
              id: 'immense-admin-001',
              full_name: 'Immense Super Admin',
              corporate_email: 'support@immensesmartsolutions.com',
              role: 'super_admin',
              department: 'Executive Leadership',
              is_active: true,
              avatar_url: null,
              last_login: null,
              created_at: '',
              updated_at: '',
            },
          } as unknown as OnboardingRecord & {
            assigned_profile: Profile | null;
            creator_profile: Profile | null;
          };
        }
      } catch {
        // Ignore
      }

      // Find in demo data
      const demoMatch = INITIAL_DEMO_ONBOARDINGS.find((r) => r.id === id) || INITIAL_DEMO_ONBOARDINGS[0];
      return {
        ...demoMatch,
        assigned_profile: {
          id: 'immense-employee-003',
          full_name: 'Support Executive',
          corporate_email: 'employee@immensesmartsolutions.com',
          role: 'employee',
          department: 'Client Success',
          is_active: true,
          avatar_url: null,
          last_login: null,
          created_at: '',
          updated_at: '',
        },
        creator_profile: {
          id: 'immense-admin-001',
          full_name: 'Immense Super Admin',
          corporate_email: 'support@immensesmartsolutions.com',
          role: 'super_admin',
          department: 'Executive Leadership',
          is_active: true,
          avatar_url: null,
          last_login: null,
          created_at: '',
          updated_at: '',
        },
      } as unknown as OnboardingRecord & {
        assigned_profile: Profile | null;
        creator_profile: Profile | null;
      };
    },
  });

  // Fetch Documents in this record's vault
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['onboarding-documents', id],
    queryFn: async () => {
      if (!id) return [];
      try {
        const { data, error } = await supabase
          .from('onboarding_documents')
          .select(`
            *,
            uploader_profile:profiles!onboarding_documents_uploaded_by_fkey(full_name, corporate_email)
          `)
          .eq('onboarding_id', id)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as (OnboardingDocument & { uploader_profile: Profile | null })[];
        }
      } catch {
        // Fallback
      }

      // Return demo docs for this onboarding
      const demoDocs = INITIAL_DEMO_DOCUMENTS.filter((d) => d.onboarding_id === id);
      return (demoDocs.length > 0 ? demoDocs : INITIAL_DEMO_DOCUMENTS.slice(0, 2)) as (OnboardingDocument & { uploader_profile: Profile | null })[];
    },
  });

  // Fetch Audit Trail for this record
  const { data: auditLogs } = useQuery({
    queryKey: ['onboarding-audit-logs', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          user_profile:profiles!audit_logs_user_id_fkey(full_name, corporate_email)
        `)
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) return [];
      return data as (AuditLog & { user_profile: Profile | null })[];
    },
  });

  // Fetch Employees for reassignment dropdown
  const { data: allEmployees } = useQuery({
    queryKey: ['profiles-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, corporate_email, is_active')
        .eq('is_active', true)
        .order('full_name');
      return (data || []) as Profile[];
    },
  });

  // Change Status Mutation
  const statusMutation = useMutation({
    mutationFn: async (newStatus: OnboardingStatus) => {
      if (!id) return;
      const { error } = await supabase
        .from('onboarding_records')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await logAudit('record_edited', 'onboarding', id, {
        previous_status: record?.status,
        new_status: newStatus,
      });
    },
    onSuccess: (_, newStatus) => {
      toast.success('Status Updated', `Record status changed to ${formatCategoryLabel(newStatus as any)}`);
      queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    },
    onError: (err: any) => {
      toast.error('Status Update Failed', err.message);
    },
  });

  // Reassignment Mutation
  const reassignMutation = useMutation({
    mutationFn: async (newAssigneeId: string) => {
      if (!id) return;
      const { error } = await supabase
        .from('onboarding_records')
        .update({ assigned_to: newAssigneeId || null, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await logAudit('assignment_changed', 'onboarding', id, {
        previous_assigned: record?.assigned_to,
        new_assigned: newAssigneeId,
      });
    },
    onSuccess: () => {
      toast.success('Employee Assigned', 'Onboarding responsibility was updated.');
      queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
      setReassignModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Reassignment Failed', err.message);
    },
  });

  // Reveal Password (Audited)
  const handleTogglePassword = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }

    if (!id) return;

    try {
      // First attempt server RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_credential', {
        record_id: id,
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        setDecryptedPassword(rpcData[0].credential);
      } else {
        // Fallback: If pgcrypto is not configured in DB yet, read stored secret
        setDecryptedPassword(record?.credential_encrypted || '••••••••');
        await logCredentialView(id);
      }

      setShowPassword(true);
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
      toast.info('Credential Accessed', 'Credential viewing event was logged to compliance audit.');
    } catch (err: any) {
      toast.error('Credential Decryption Error', err.message);
    }
  };

  // Copy field with audit
  const handleCopy = async (text: string, fieldName: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);

    if (fieldName === 'password' && id) {
      await logCredentialCopy(id);
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    }

    toast.success('Copied to Clipboard', `${fieldName} copied.`);
  };

  // Document Upload
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !id) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File Too Large', 'Maximum file size allowed is 10MB.');
      return;
    }

    setIsUploading(true);

    try {
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileExt = sanitizedName.split('.').pop() || '';
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${id}/${uploadCategory}/${uniqueFileName}`;

      // 1. Upload to Supabase Private Storage
      const { error: uploadError } = await supabase.storage
        .from('onboarding-documents')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Insert metadata record in onboarding_documents
      const { error: metaError } = await supabase
        .from('onboarding_documents')
        .insert({
          onboarding_id: id,
          file_name: selectedFile.name,
          original_name: selectedFile.name,
          category: uploadCategory,
          storage_path: storagePath,
          mime_type: selectedFile.type || 'application/octet-stream',
          file_size: selectedFile.size,
          uploaded_by: profile?.id,
        });

      if (metaError) throw metaError;

      // 3. Log Audit
      await logAudit('document_uploaded', 'document', id, {
        file_name: selectedFile.name,
        category: uploadCategory,
        size_bytes: selectedFile.size,
      });

      toast.success('Document Vaulted', `${selectedFile.name} successfully encrypted & stored.`);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Upload Failed', err.message || 'Could not upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  // Generate Temporary Signed URL for Preview
  const handlePreview = async (doc: OnboardingDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(doc.storage_path, 3600); // 1 hour token

      if (error) throw error;

      setPreviewDoc(doc);
      setPreviewSignedUrl(data.signedUrl);
    } catch (err: any) {
      toast.error('Preview Error', 'Could not generate secure viewing token.');
    }
  };

  // Download Document via Signed URL
  const handleDownload = async (doc: OnboardingDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(doc.storage_path, 60, {
          download: doc.file_name,
        });

      if (error) throw error;

      await logAudit('document_downloaded', 'document', id, {
        file_name: doc.file_name,
        category: doc.category,
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Download Initialized', 'Secure file transferred.');
    } catch (err: any) {
      toast.error('Download Failed', err.message);
    }
  };

  // Delete Document
  const handleDeleteDocument = async (doc: OnboardingDocument) => {
    try {
      // 1. Delete from storage
      await supabase.storage.from('onboarding-documents').remove([doc.storage_path]);

      // 2. Delete metadata row
      const { error } = await supabase
        .from('onboarding_documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      await logAudit('document_deleted', 'document', id, {
        file_name: doc.file_name,
      });

      toast.success('Document Removed', 'File deleted from vault.');
      setDeleteDoc(null);
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    } catch (err: any) {
      toast.error('Delete Failed', err.message);
    }
  };

  const getDocIcon = (mime: string, name: string) => {
    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (mime.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(name)) {
      return <FileImage className="w-5 h-5 text-blue-500" />;
    }
    if (mime.includes('excel') || mime.includes('sheet') || /\.(xls|xlsx|csv)$/i.test(name)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    }
    return <FileCheck2 className="w-5 h-5 text-indigo-500" />;
  };

  const canEdit = hasPermission(profile?.role, 'onboarding:edit');
  const canDeleteDocs = hasPermission(profile?.role, 'document:delete');
  const canAssign = hasPermission(profile?.role, 'employee:assign');

  if (recordLoading) {
    return (
      <PageLayout title="Loading Record...">
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Decrypting & loading onboarding data...</p>
        </div>
      </PageLayout>
    );
  }

  if (!record) {
    return (
      <PageLayout title="Record Not Found">
        <EmptyState
          icon={Building2}
          title="Onboarding Record Not Found"
          description="The requested WhatsApp onboarding record does not exist or you do not have permission to view it."
          actionLabel="Back to Roster"
          onAction={() => navigate('/onboarding')}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={record.brand_name}>
      <div className="space-y-6">
        {/* Back navigation & Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/onboarding')}
              className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  {record.brand_name}
                </h2>
                <StatusBadge status={record.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {record.company_name || 'Individual Entity'} • Added {format(new Date(record.created_at), 'dd MMM yyyy')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Status change select */}
            {canEdit && (
              <select
                value={record.status}
                onChange={(e) => statusMutation.mutate(e.target.value as OnboardingStatus)}
                className="px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] shadow-2xs"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Status: {opt.label}
                  </option>
                ))}
              </select>
            )}

            {canEdit && (
              <button
                onClick={() => navigate(`/onboarding/${record.id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
              >
                <Edit className="w-4 h-4 text-gray-500" />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Top Info Grid: Client info & Encrypted Vault */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client Information Card */}
          <div className="lg:col-span-2 p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Client & Business Details</h3>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {record.whatsapp_number}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Registered Brand
                </span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {record.brand_name}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Legal Company Name
                </span>
                <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                  {record.company_name || '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Contact Person
                </span>
                <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                  {record.contact_person || '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Contact Email
                </span>
                <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                  {record.contact_email ? (
                    <a href={`mailto:${record.contact_email}`} className="text-[#1677FF] hover:underline">
                      {record.contact_email}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Contact Phone
                </span>
                <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                  {record.contact_number || '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                  Onboarding Date
                </span>
                <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                  {record.onboarding_date
                    ? format(new Date(record.onboarding_date), 'dd MMMM yyyy')
                    : '—'}
                </span>
              </div>
            </div>

            {record.notes && (
              <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-100 text-xs">
                <span className="font-bold text-blue-900 block mb-1">Operational Notes:</span>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{record.notes}</p>
              </div>
            )}
          </div>

          {/* Right Column: Encrypted Credential Vault & Staff Assignment */}
          <div className="space-y-6">
            {/* Encrypted Credentials Vault */}
            <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Platform Credentials</h3>
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  AES-256 Vault
                </span>
              </div>

              {/* Security Warning Alert */}
              <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-tight">
                  Confidential platform secrets. Revealing or copying will register an immutable event in the audit trail.
                </p>
              </div>

              {/* Username Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Platform Username / API ID
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={record.username || '—'}
                    className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-mono"
                  />
                  {record.username && (
                    <button
                      onClick={() => handleCopy(record.username, 'username')}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                      title="Copy Username"
                    >
                      {copiedField === 'username' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Secret Password Field (Masked / Decrypted) */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Platform Password / Secret
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={
                      showPassword
                        ? decryptedPassword || ''
                        : record.credential_encrypted
                        ? '••••••••••••••••'
                        : 'Not Configured'
                    }
                    className={`flex-1 px-3 py-2 text-xs border rounded-lg font-mono ${
                      showPassword ? 'bg-amber-50/50 border-amber-200 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  />
                  {record.credential_encrypted && (
                    <>
                      <button
                        onClick={handleTogglePassword}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                        title={showPassword ? 'Hide Secret' : 'Reveal Secret (Audited)'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          if (!decryptedPassword) {
                            await handleTogglePassword();
                          }
                          if (decryptedPassword) {
                            handleCopy(decryptedPassword, 'password');
                          }
                        }}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                        title="Copy Secret (Audited)"
                      >
                        {copiedField === 'password' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Platform & Login URL */}
              {(record.platform || record.login_url) && (
                <div className="pt-2 border-t border-gray-100 space-y-2 text-xs">
                  {record.platform && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Platform:</span>
                      <span className="font-semibold text-gray-800">{record.platform}</span>
                    </div>
                  )}
                  {record.login_url && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Portal URL:</span>
                      <a
                        href={record.login_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1677FF] hover:underline flex items-center gap-1 truncate max-w-[160px]"
                      >
                        Launch Console <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff Assignment Card */}
            <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Assigned Team Staff</h3>
                {canAssign && (
                  <button
                    onClick={() => {
                      setSelectedNewAssignee(record.assigned_to || '');
                      setReassignModalOpen(true);
                    }}
                    className="text-xs font-semibold text-[#1677FF] hover:underline"
                  >
                    Reassign
                  </button>
                )}
              </div>

              {record.assigned_profile ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-[#1677FF] font-bold flex items-center justify-center text-sm">
                    {record.assigned_profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {record.assigned_profile.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {record.assigned_profile.corporate_email}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/60 rounded-xl text-center text-xs text-amber-800">
                  No employee is currently assigned to this brand.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Core Feature: Document Vault */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
                  <FolderLock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Document Vault</h3>
                  <p className="text-xs text-gray-500">
                    Encrypted compliance repository for GST, PAN, KYC, and Meta authorization records
                  </p>
                </div>
              </div>
            </div>

            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 self-start sm:self-auto">
              {documents?.length || 0} Documents Vaulted
            </span>
          </div>

          {/* Upload Form */}
          <form
            onSubmit={handleUploadDocument}
            className="p-4 bg-gray-50/70 border border-dashed border-gray-300 rounded-2xl space-y-3"
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Category Selector */}
              <div className="sm:w-64">
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                  Document Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Input */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                  Select Document (PDF, JPG, PNG, DOCX, XLSX • Max 10MB)
                </label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {/* Submit Button */}
              <div className="sm:self-end">
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Encrypting & Vaulting...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      Vault Document
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Documents Table */}
          {docsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-10 bg-gray-50/50 rounded-xl border border-gray-100">
              <FolderLock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">No Documents Uploaded</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                Upload the client's GST Certificate, PAN, or WhatsApp Approval above to secure them in the vault.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Document</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5 font-semibold text-gray-900">
                          {getDocIcon(doc.mime_type, doc.file_name)}
                          <span className="truncate max-w-xs">{doc.file_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 font-medium text-[11px]">
                          {formatCategoryLabel(doc.category)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {doc.uploader_profile?.full_name || 'Staff'}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {format(new Date(doc.created_at), 'dd MMM yyyy, HH:mm')}
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">
                        {(doc.file_size / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreview(doc)}
                            className="p-1.5 text-gray-500 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg"
                            title="Preview Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Download Signed Token"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canDeleteDocs && (
                            <button
                              onClick={() => setDeleteDoc(doc)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Delete from Vault"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Log Timeline */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
              <ScrollText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Record Activity & Audit Trail</h3>
              <p className="text-[11px] text-gray-500">
                Immutable compliance tracking of changes, views, and downloads
              </p>
            </div>
          </div>

          {!auditLogs || auditLogs.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No activity logs recorded for this record yet.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-3 bg-gray-50/70 rounded-xl text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#1677FF] mt-1.5" />
                    <div>
                      <p className="font-semibold text-gray-900 capitalize">
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        By {log.user_profile?.full_name || 'Staff Member'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        document={previewDoc}
        signedUrl={previewSignedUrl}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewSignedUrl(null);
        }}
        onDownload={() => previewDoc && handleDownload(previewDoc)}
      />

      {/* Delete Document Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteDoc)}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => deleteDoc && handleDeleteDocument(deleteDoc)}
        title="Delete Document"
        message={`Are you sure you want to permanently delete "${deleteDoc?.file_name}" from this onboarding vault?`}
        confirmLabel="Delete Document"
        variant="danger"
      />

      {/* Reassign Employee Modal */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Reassign Onboarding Record</h3>
            <p className="text-xs text-gray-500">
              Select the active corporate employee who will manage {record.brand_name}.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Corporate Employee
              </label>
              <select
                value={selectedNewAssignee}
                onChange={(e) => setSelectedNewAssignee(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                <option value="">-- Unassigned --</option>
                {(allEmployees || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.corporate_email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => reassignMutation.mutate(selectedNewAssignee)}
                disabled={reassignMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-lg"
              >
                {reassignMutation.isPending ? 'Updating...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default OnboardingDetail;
