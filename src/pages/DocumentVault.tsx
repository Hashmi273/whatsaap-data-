import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FolderLock,
  Building2,
  Search,
  Download,
  Eye,
  FileText,
  FileImage,
  ChevronRight,
  Trash2,
  UploadCloud,
  Plus,
  X,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { getDocumentPreviewUrl } from '@/lib/download';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { formatCategoryLabel, CATEGORY_OPTIONS, MAX_FILE_SIZE } from '@/types/database';
import type { OnboardingDocument, OnboardingRecord, DocumentCategory } from '@/types/database';
import { INITIAL_DEMO_ONBOARDINGS, INITIAL_DEMO_DOCUMENTS } from '@/lib/demoData';
import { isValidUuid, generateUuid } from '@/lib/constants';
import { format } from 'date-fns';
import { downloadDocument } from '@/lib/download';
import { uploadDocumentToStorage, saveDocumentMetadata, fetchDocumentMetadata } from '@/lib/storage';

export function DocumentVault() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ doc: OnboardingDocument; recordId: string } | null>(null);

  // Upload Modal State
  const [uploadTargetRecord, setUploadTargetRecord] = useState<OnboardingRecord | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('gst_certificate');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch Onboarding Records and their associated vaulted documents
  const { data: recordsWithDocs, isLoading } = useQuery({
    queryKey: ['vault-records-grouped'],
    queryFn: async () => {
      // 1. Gather all onboarding records
      let localRecords: any[] = [];
      try {
        localRecords = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
      } catch {
        // Ignore
      }

      let allRecords: any[] = [...localRecords];

      try {
        const res = await fetchDocumentMetadata('onboarding_records', '*', { order: { column: 'brand_name', ascending: true } });
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          res.data.forEach((d) => {
            if (!allRecords.some((r) => r.id === d.id)) {
              allRecords.push(d);
            }
          });
        }
      } catch {
        // Fallback
      }

      if (allRecords.length === 0) {
        allRecords = [...INITIAL_DEMO_ONBOARDINGS];
      }

      // 2. Gather all database documents
      let dbDocs: any[] = [];
      try {
        const dRes = await fetchDocumentMetadata('onboarding_documents', '*', { order: { column: 'created_at', ascending: false } });
        if (dRes.success && Array.isArray(dRes.data)) {
          dbDocs = dRes.data;
        }
      } catch {
        // Ignore
      }

      // 3. Map documents to each brand
      const grouped = allRecords.map((rec) => {
        const recDbDocs = dbDocs.filter((d) => d.onboarding_id === rec.id);
        return {
          ...rec,
          documents: recDbDocs,
        };
      });

      return grouped as (OnboardingRecord & { documents: OnboardingDocument[] })[];
    },
  });

  const handlePreview = async (doc: OnboardingDocument) => {
    setPreviewDoc(doc);
    if (!doc.storage_path) {
      setPreviewSignedUrl(null);
      return;
    }
    const previewUrl = await getDocumentPreviewUrl(doc);
    setPreviewSignedUrl(previewUrl);
  };

  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const handleDownload = async (doc: OnboardingDocument, recordId: string) => {
    setDownloadingDocId(doc.id);
    try {
      await downloadDocument(doc, {
        recordId,
        toast,
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  // Upload document directly to client vault
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTargetRecord || isUploading) return;

    setUploadError(null);
    const fileNameLower = uploadFile.name.toLowerCase();
    const isAllowedExt =
      fileNameLower.endsWith('.pdf') ||
      fileNameLower.endsWith('.jpg') ||
      fileNameLower.endsWith('.jpeg') ||
      fileNameLower.endsWith('.png') ||
      fileNameLower.endsWith('.docx') ||
      fileNameLower.endsWith('.doc');

    if (!isAllowedExt) {
      setUploadError('Only PDF, JPG, PNG, and DOCX files are allowed.');
      return;
    }

    if (uploadFile.size > MAX_FILE_SIZE) {
      setUploadError('File size exceeds 10MB limit.');
      return;
    }

    setIsUploading(true);
    const recordId = uploadTargetRecord.id;

    try {
      const sanitizedName = uploadFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${recordId}/${uploadCategory}/${uniqueFileName}`;
      const uploaderId = profile?.id && isValidUuid(profile.id) ? profile.id : null;

      // 1. Storage Upload (Client + Serverless fallback)
      const uploadRes = await uploadDocumentToStorage(storagePath, uploadFile, 'onboarding-documents');
      if (!uploadRes.success) {
        setUploadError(uploadRes.error || 'Physical document could not be uploaded to private storage.');
        setIsUploading(false);
        return;
      }

      // 2. Metadata Insert ONLY after storage upload succeeds
      const docId = crypto.randomUUID();
      const docPayload: any = {
        id: docId,
        onboarding_id: recordId,
        file_name: uploadFile.name,
        original_name: uploadFile.name,
        category: uploadCategory,
        storage_path: storagePath,
        mime_type: uploadFile.type || (fileNameLower.endsWith('.pdf') ? 'application/pdf' : 'image/png'),
        file_size: uploadFile.size,
      };

      if (uploaderId) {
        docPayload.uploaded_by = uploaderId;
      }

      const saveRes = await saveDocumentMetadata('onboarding_documents', docPayload, 'upsert');
      if (!saveRes.success) {
        setUploadError(saveRes.error || 'Failed to save document metadata.');
        setIsUploading(false);
        return;
      }

      // 3. Persist into local vault caches
      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(uploadFile);
      } catch {
        // Ignore
      }

      const newDocItem: any = {
        id: generateUuid(),
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
        const localDocs = JSON.parse(localStorage.getItem(`immense_docs_${recordId}`) || '[]');
        localDocs.unshift(newDocItem);
        localStorage.setItem(`immense_docs_${recordId}`, JSON.stringify(localDocs));

        const globalDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
        globalDocs.unshift(newDocItem);
        localStorage.setItem('immense_all_vault_docs', JSON.stringify(globalDocs));
      } catch {
        // Ignore
      }

      // 4. Log Audit
      await logAudit('document_uploaded', 'document', recordId, {
        file_name: uploadFile.name,
        category: uploadCategory,
        size_bytes: uploadFile.size,
      });

      toast.success('Document Vaulted', `${uploadFile.name} successfully added to ${uploadTargetRecord.brand_name}.`);
      setUploadTargetRecord(null);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', recordId] });
      queryClient.invalidateQueries({ queryKey: ['global-documents-search'] });
    } catch (err: any) {
      setUploadError(err.message || 'Could not upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const confirmDeleteDocument = async () => {
    if (!deleteDocTarget) return;
    const { doc, recordId } = deleteDocTarget;

    try {
      try {
        await supabase.storage.from('onboarding-documents').remove([doc.storage_path]);
      } catch {
        // Ignore
      }

      try {
        await saveDocumentMetadata('onboarding_documents', null, 'delete', { id: doc.id });
      } catch {
        // Ignore
      }

      // Update local storage caches
      try {
        const localDocs = JSON.parse(localStorage.getItem(`immense_docs_${recordId}`) || '[]');
        const updatedLocal = localDocs.filter((d: any) => d.id !== doc.id && d.file_name !== doc.file_name);
        localStorage.setItem(`immense_docs_${recordId}`, JSON.stringify(updatedLocal));

        const globalDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
        const updatedGlobal = globalDocs.filter((d: any) => d.id !== doc.id && d.file_name !== doc.file_name);
        localStorage.setItem('immense_all_vault_docs', JSON.stringify(updatedGlobal));
      } catch {
        // Ignore
      }

      await logAudit('document_deleted', 'document', recordId, {
        file_name: doc.file_name,
      });

      toast.success('Document Deleted', `${doc.file_name} removed from vault.`);
      setDeleteDocTarget(null);
      queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-documents', recordId] });
      queryClient.invalidateQueries({ queryKey: ['global-documents-search'] });
    } catch (err: any) {
      toast.error('Delete Failed', err.message || 'Could not delete document.');
    }
  };

  const getDocIcon = (mime: string, name: string) => {
    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    return <FileImage className="w-4 h-4 text-blue-500" />;
  };

  const filteredRecords = (recordsWithDocs || []).filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchesBrand = r.brand_name.toLowerCase().includes(term);
    const matchesCompany = r.company_name?.toLowerCase().includes(term);
    const matchesDoc = r.documents.some((d) => d.file_name.toLowerCase().includes(term));
    return matchesBrand || matchesCompany || matchesDoc;
  });

  return (
    <PageLayout title="Document Vault">
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Enterprise Client Document Vaults
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Secure client compliance repositories: Logo, Banner, GST, PAN, KYC, Meta Verification & Documents
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by brand, company or document..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] shadow-2xs"
            />
          </div>
        </div>

        {/* Vault Brand Folders */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={FolderLock}
            title="No Vault Folders Found"
            description="No client records match your search query."
          />
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((item) => (
              <div
                key={item.id}
                className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4"
              >
                {/* Brand Folder Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{item.brand_name}</h3>
                      <p className="text-xs text-gray-500">
                        {item.whatsapp_number} {item.company_name ? `• ${item.company_name}` : ''} •{' '}
                        <span className="font-semibold text-blue-700">{item.documents.length} files securely stored</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={() => {
                        setUploadTargetRecord(item);
                        setUploadFile(null);
                        setUploadError(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Upload File
                    </button>
                    <button
                      onClick={() => navigate(`/onboarding/${item.id}`)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#1677FF] bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Open Brand <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Documents inside this brand */}
                {item.documents.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic">
                    No documents uploaded to this client vault yet. Click "+ Upload File" above to add GST, PAN, or KYC documents.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {item.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 bg-gray-50/70 border border-gray-100 rounded-xl flex items-center justify-between hover:bg-blue-50/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          {getDocIcon(doc.mime_type, doc.file_name)}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">
                              {doc.file_name}
                            </p>
                            <span className="text-[10px] text-gray-500 font-medium">
                              {formatCategoryLabel(doc.category)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handlePreview(doc)}
                            className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                            title="Preview Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc, item.id)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                            title="Download Original File"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteDocTarget({ doc, recordId: item.id })}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Vault Upload Modal */}
      {uploadTargetRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Upload to {uploadTargetRecord.brand_name}</h3>
                  <p className="text-[11px] text-gray-500">Secure AES-256 encrypted private vault storage</p>
                </div>
              </div>
              <button
                onClick={() => setUploadTargetRecord(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p>{uploadError}</p>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Document Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Select Document (PDF, JPG, PNG, DOCX • Max 10MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setUploadTargetRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || isUploading}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  {isUploading ? 'Vaulting...' : 'Upload & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Document Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteDocTarget)}
        onClose={() => setDeleteDocTarget(null)}
        onConfirm={confirmDeleteDocument}
        title="Delete Vaulted Document"
        message={`Are you sure you want to permanently delete "${deleteDocTarget?.doc.file_name}" from the client vault? This action cannot be undone.`}
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
        onDownload={() => previewDoc && handleDownload(previewDoc, previewDoc.onboarding_id)}
      />
    </PageLayout>
  );
}

export default DocumentVault;
