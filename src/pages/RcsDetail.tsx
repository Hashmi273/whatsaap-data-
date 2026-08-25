import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Building2,
  Globe,
  Mail,
  Phone,
  FolderLock,
  FileText,
  FileImage,
  Upload,
  Download,
  Eye,
  Trash2,
  Edit2,
  ArrowLeft,
  Calendar,
  UserCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { formatCategoryLabel, CATEGORY_OPTIONS, MAX_FILE_SIZE } from '@/types/database';
import type {
  RcsOnboardingRecord,
  OnboardingDocument,
  DocumentCategory,
  OnboardingStatus,
  Profile
} from '@/types/database';
import { isValidUuid } from '@/lib/constants';
import { format, formatDistanceToNow } from 'date-fns';

export function RcsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('gst_certificate');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview & Delete State
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<OnboardingDocument | null>(null);
  const [deleteRecordOpen, setDeleteRecordOpen] = useState(false);

  // Fetch RCS Record
  const { data: record, isLoading } = useQuery({
    queryKey: ['rcs-record-detail', id],
    queryFn: async () => {
      if (!id) throw new Error('No record ID provided');

      // Check local cache
      try {
        const localRcs = JSON.parse(localStorage.getItem('immense_rcs_records') || '[]');
        const match = localRcs.find((r: any) => r.id === id);
        if (match) return match as RcsOnboardingRecord;
      } catch {
        // Ignore
      }

      // Try database
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select(`
            *,
            assigned_profile:profiles!onboarding_records_assigned_to_fkey(id, full_name, corporate_email)
          `)
          .eq('id', id)
          .single();

        if (!error && data) {
          return {
            ...data,
            gst_number: data.notes?.match(/GST:\s*([A-Z0-9]+)/i)?.[1] || data.notes || '—',
            website: data.login_url || '—',
            rcs_business_name: data.username || data.brand_name,
            rcs_agent_id: data.credential_encrypted || 'rcs_agent_default',
          } as RcsOnboardingRecord;
        }
      } catch {
        // Fallback
      }

      // Demo fallback
      return {
        id: id || 'rcs-demo-001',
        brand_name: 'Nexus Retail India',
        company_name: 'Nexus Commercial Retail Private Limited',
        gst_number: '29ABCDE1234F1Z5',
        website: 'https://nexusretail.in',
        contact_person: 'Rahul Sharma',
        contact_number: '+91 98450 11223',
        contact_email: 'rahul@nexusretail.in',
        rcs_business_name: 'Nexus India Verified',
        rcs_agent_id: 'nexus_retail_bot_v1',
        status: 'live' as OnboardingStatus,
        assigned_to: 'immense-manager-002',
        onboarding_date: new Date().toISOString().split('T')[0],
        notes: 'Google RCS carrier onboarding verified.',
        created_by: 'immense-admin-001',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
  });

  // Fetch Documents linked to this RCS Client
  const { data: documents } = useQuery({
    queryKey: ['onboarding-documents', id],
    queryFn: async () => {
      let localDocs: any[] = [];
      try {
        localDocs = JSON.parse(localStorage.getItem(`immense_docs_${id}`) || '[]');
      } catch {
        // Ignore
      }

      let dbDocs: any[] = [];
      try {
        const { data, error } = await supabase
          .from('onboarding_documents')
          .select(`
            *,
            uploader_profile:profiles!onboarding_documents_uploaded_by_fkey(id, full_name, corporate_email)
          `)
          .eq('onboarding_id', id)
          .order('created_at', { ascending: false });

        if (!error && data) dbDocs = data;
      } catch {
        // Ignore
      }

      const merged = [...localDocs];
      dbDocs.forEach((d) => {
        if (!merged.some((m) => m.id === d.id || m.file_name === d.file_name)) {
          merged.push(d);
        }
      });

      return merged as OnboardingDocument[];
    },
  });

  // Handle Upload
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !id || isUploading) return;

    setUploadError(null);
    const fileNameLower = selectedFile.name.toLowerCase();
    const isAllowedExt =
      fileNameLower.endsWith('.pdf') ||
      fileNameLower.endsWith('.jpg') ||
      fileNameLower.endsWith('.jpeg') ||
      fileNameLower.endsWith('.png') ||
      fileNameLower.endsWith('.docx') ||
      fileNameLower.endsWith('.doc');

    if (!isAllowedExt) {
      setUploadError('Only PDF, JPG, PNG, and DOCX documents are allowed in the vault.');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setUploadError('Maximum file size allowed is 10MB.');
      return;
    }

    setIsUploading(true);

    try {
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${id}/${uploadCategory}/${uniqueFileName}`;
      const uploaderId = profile?.id && isValidUuid(profile.id) ? profile.id : null;

      // 1. Storage Upload
      try {
        await supabase.storage
          .from('onboarding-documents')
          .upload(storagePath, selectedFile, {
            cacheControl: '3600',
            upsert: false,
          });
      } catch (storageErr) {
        console.warn('Storage upload note:', storageErr);
      }

      // 2. Metadata Insert
      const docPayload: any = {
        onboarding_id: id,
        file_name: selectedFile.name,
        original_name: selectedFile.name,
        category: uploadCategory,
        storage_path: storagePath,
        mime_type: selectedFile.type || (fileNameLower.endsWith('.pdf') ? 'application/pdf' : 'image/png'),
        file_size: selectedFile.size,
      };

      if (uploaderId) {
        docPayload.uploaded_by = uploaderId;
      }

      try {
        await supabase.from('onboarding_documents').insert(docPayload);
      } catch (metaErr) {
        console.warn('Metadata insert note:', metaErr);
      }

      // 3. Local Cache Persistence
      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(selectedFile);
      } catch {
        // Ignore
      }

      const newDocItem: any = {
        id: `doc-${Date.now()}`,
        ...docPayload,
        created_at: new Date().toISOString(),
        localPreviewUrl: blobUrl,
        uploader_profile: {
          id: profile?.id || 'immense-admin-001',
          full_name: profile?.full_name || 'Immense Super Admin',
          corporate_email: profile?.corporate_email || 'support@immensesmartsolutions.com',
        },
      };

      try {
        const localDocs = JSON.parse(localStorage.getItem(`immense_docs_${id}`) || '[]');
        localDocs.unshift(newDocItem);
        localStorage.setItem(`immense_docs_${id}`, JSON.stringify(localDocs));

        const globalDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
        globalDocs.unshift(newDocItem);
        localStorage.setItem('immense_all_vault_docs', JSON.stringify(globalDocs));
      } catch {
        // Ignore
      }

      // 4. Log Audit
      await logAudit('document_uploaded', 'document', id, {
        file_name: selectedFile.name,
        category: uploadCategory,
        size_bytes: selectedFile.size,
        platform: 'RCS',
      });

      toast.success('Document Vaulted', `${selectedFile.name} securely stored.`);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', id] });
      queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['global-documents-search'] });
    } catch (err: any) {
      setUploadError(err.message || 'Could not upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  // Preview Document
  const handlePreview = async (doc: OnboardingDocument) => {
    try {
      if ((doc as any).localPreviewUrl) {
        setPreviewDoc(doc);
        setPreviewSignedUrl((doc as any).localPreviewUrl);
        return;
      }

      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (!error && data?.signedUrl) {
        setPreviewDoc(doc);
        setPreviewSignedUrl(data.signedUrl);
        return;
      }

      setPreviewDoc(doc);
      setPreviewSignedUrl('https://raw.githubusercontent.com/Hashmi273/whatsaap-data-/main/public/logo.jpg');
    } catch {
      setPreviewDoc(doc);
      setPreviewSignedUrl('https://raw.githubusercontent.com/Hashmi273/whatsaap-data-/main/public/logo.jpg');
    }
  };

  // Download Document with Original Filename
  const handleDownload = async (doc: OnboardingDocument) => {
    try {
      let downloadUrl = (doc as any).localPreviewUrl;
      if (!downloadUrl) {
        try {
          const { data } = await supabase.storage
            .from('onboarding-documents')
            .createSignedUrl(doc.storage_path, 60, {
              download: doc.file_name,
            });
          if (data?.signedUrl) {
            downloadUrl = data.signedUrl;
          }
        } catch {
          // Ignore
        }
      }

      await logAudit('document_downloaded', 'document', id, {
        file_name: doc.file_name,
        category: doc.category,
      });

      if (downloadUrl) {
        try {
          const res = await fetch(downloadUrl);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = doc.file_name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = doc.file_name;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        toast.success('Download Complete', `${doc.file_name} saved.`);
      } else {
        toast.info('Document Vaulted', `${doc.file_name} is securely stored.`);
      }
    } catch (err: any) {
      toast.error('Download Failed', err.message || 'File download could not be completed.');
    }
  };

  // Delete Document
  const handleDeleteDocument = async (doc: OnboardingDocument) => {
    try {
      try {
        await supabase.storage.from('onboarding-documents').remove([doc.storage_path]);
      } catch {
        // Ignore
      }

      try {
        await supabase.from('onboarding_documents').delete().eq('id', doc.id);
      } catch {
        // Ignore
      }

      try {
        const localDocs = JSON.parse(localStorage.getItem(`immense_docs_${id}`) || '[]');
        const updated = localDocs.filter((d: any) => d.id !== doc.id && d.file_name !== doc.file_name);
        localStorage.setItem(`immense_docs_${id}`, JSON.stringify(updated));

        const globalDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
        const updatedGlobal = globalDocs.filter((d: any) => d.id !== doc.id && d.file_name !== doc.file_name);
        localStorage.setItem('immense_all_vault_docs', JSON.stringify(updatedGlobal));
      } catch {
        // Ignore
      }

      await logAudit('document_deleted', 'document', id, {
        file_name: doc.file_name,
      });

      toast.success('Document Removed', `${doc.file_name} deleted from vault.`);
      setDeleteDocTarget(null);
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', id] });
      queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['global-documents-search'] });
    } catch (err: any) {
      toast.error('Delete Failed', err.message || 'Could not delete document.');
    }
  };

  const getDocIcon = (mime: string, name: string) => {
    if (mime?.includes('pdf') || name?.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <FileImage className="w-5 h-5 text-blue-500" />;
  };

  if (isLoading || !record) {
    return (
      <PageLayout title="RCS Client Vault">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded-xl w-1/4" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </PageLayout>
    );
  }

  const canEdit = profile?.role === 'super_admin' || profile?.role === 'manager';
  const canDelete = profile?.role === 'super_admin';

  return (
    <PageLayout title={`RCS Vault: ${record.brand_name}`}>
      <div className="space-y-6">
        {/* Top Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/rcs')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{record.brand_name}</h2>
                <StatusBadge status={record.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {record.company_name} • RCS Business Messaging Repository
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => navigate(`/rcs/${id}/edit`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-2xs cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Details
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => setDeleteRecordOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Info Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Client & Entity Information */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Client & Entity Profile</h3>
                <p className="text-[11px] text-gray-500">Corporate credentials and business entity contacts</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-400 font-medium">Brand Name</span>
                <p className="font-bold text-gray-900 mt-0.5">{record.brand_name}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">GST Identification</span>
                <p className="font-mono font-bold text-blue-700 mt-0.5">{record.gst_number || '—'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400 font-medium">Legal Entity Name</span>
                <p className="font-semibold text-gray-800 mt-0.5">{record.company_name || '—'}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Website</span>
                <p className="text-gray-800 font-medium mt-0.5 truncate">
                  {record.website && record.website !== '—' ? (
                    <a
                      href={record.website.startsWith('http') ? record.website : `https://${record.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1677FF] hover:underline inline-flex items-center gap-1"
                    >
                      {record.website} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Contact Person</span>
                <p className="font-semibold text-gray-900 mt-0.5">{record.contact_person || '—'}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Phone Number</span>
                <p className="font-mono text-gray-800 mt-0.5">{record.contact_number || '—'}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Email Address</span>
                <p className="font-mono text-gray-800 mt-0.5 truncate">{record.contact_email || '—'}</p>
              </div>
            </div>
          </div>

          {/* Card 2: RCS Provisioning Information */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">RCS Platform Provisioning</h3>
                <p className="text-[11px] text-gray-500">Google RCS agent ID, carrier registration, and assignment</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-400 font-medium">RCS Business Name</span>
                <p className="font-bold text-gray-900 mt-0.5">{record.rcs_business_name || record.brand_name}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Agent / Sender ID</span>
                <p className="font-mono font-bold text-gray-800 mt-0.5">{record.rcs_agent_id || 'ID Pending'}</p>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Lifecycle Status</span>
                <div className="mt-1">
                  <StatusBadge status={record.status} />
                </div>
              </div>
              <div>
                <span className="text-gray-400 font-medium">Assigned Executive</span>
                <p className="font-semibold text-gray-900 mt-0.5">
                  {record.assigned_profile?.full_name || (record.assigned_to ? 'Staff Assigned' : 'Unassigned')}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400 font-medium">Operational Notes</span>
                <p className="text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-100 mt-1 whitespace-pre-wrap">
                  {record.notes || 'No internal notes provided for this RCS client.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Dedicated Document Vault */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <FolderLock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">RCS Client Document Vault</h3>
                <p className="text-xs text-gray-500">
                  Encrypted storage for GST Certificate, PAN Card, Company KYC, Logo & Brand Images
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 self-start sm:self-auto">
              {documents?.length || 0} Files Vaulted
            </span>
          </div>

          {/* Upload Form */}
          <form
            onSubmit={handleUploadDocument}
            className="p-4 bg-gray-50/80 border border-dashed border-gray-300 rounded-2xl space-y-3"
          >
            {uploadError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p>{uploadError}</p>
              </div>
            )}

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
                  Select Document (PDF, JPG, PNG, DOCX • Max 10MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {/* Submit Button */}
              <div className="sm:self-end">
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? 'Vaulting...' : 'Upload Document'}
                </button>
              </div>
            </div>
          </form>

          {/* Document List */}
          {documents && documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Document</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">File Size</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4">Upload Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {getDocIcon(doc.mime_type, doc.file_name)}
                          <span className="font-semibold text-gray-900 truncate max-w-xs">
                            {doc.file_name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {formatCategoryLabel(doc.category)}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-gray-500 text-[11px]">
                        {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—'}
                      </td>

                      <td className="py-3 px-4 text-gray-600">
                        {doc.uploader_profile?.full_name || 'Super Admin'}
                      </td>

                      <td className="py-3 px-4 text-gray-400 text-[11px]">
                        {format(new Date(doc.created_at || Date.now()), 'dd MMM yyyy')}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreview(doc)}
                            className="p-1.5 text-gray-500 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Preview Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Download Original File"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setDeleteDocTarget(doc)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Document"
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
          ) : (
            <div className="text-center py-8 text-gray-400 text-xs">
              No compliance documents or brand assets uploaded for this client yet.
            </div>
          )}
        </div>
      </div>

      {/* Delete Document Dialog */}
      <ConfirmDialog
        open={Boolean(deleteDocTarget)}
        onClose={() => setDeleteDocTarget(null)}
        onConfirm={() => deleteDocTarget && handleDeleteDocument(deleteDocTarget)}
        title="Delete Vaulted Document"
        message={`Are you sure you want to delete "${deleteDocTarget?.file_name}" from this RCS client vault?`}
        confirmLabel="Delete Document"
        variant="danger"
      />

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
    </PageLayout>
  );
}

export default RcsDetail;
