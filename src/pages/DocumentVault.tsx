import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ExternalLink,
  Plus
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { formatCategoryLabel } from '@/types/database';
import type { OnboardingDocument, OnboardingRecord } from '@/types/database';
import { INITIAL_DEMO_ONBOARDINGS, INITIAL_DEMO_DOCUMENTS } from '@/lib/demoData';
import { format } from 'date-fns';

export function DocumentVault() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ doc: OnboardingDocument; recordId: string } | null>(null);

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
        const { data: dbRecords, error } = await supabase
          .from('onboarding_records')
          .select('*')
          .order('brand_name');

        if (!error && dbRecords && dbRecords.length > 0) {
          dbRecords.forEach((d) => {
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
        const { data: dData } = await supabase
          .from('onboarding_documents')
          .select('*')
          .order('created_at', { ascending: false });
        if (dData) dbDocs = dData;
      } catch {
        // Ignore
      }

      let globalVaultDocs: any[] = [];
      try {
        globalVaultDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
      } catch {
        // Ignore
      }

      // 3. Map documents to each brand
      const grouped = allRecords.map((rec) => {
        let recLocalDocs: any[] = [];
        try {
          recLocalDocs = JSON.parse(localStorage.getItem(`immense_docs_${rec.id}`) || '[]');
        } catch {
          // Ignore
        }

        const recDbDocs = dbDocs.filter((d) => d.onboarding_id === rec.id);
        const recGlobalDocs = globalVaultDocs.filter((d) => d.onboarding_id === rec.id);
        const demoDocs = INITIAL_DEMO_DOCUMENTS.filter((d) => d.onboarding_id === rec.id);

        const mergedDocs: any[] = [...recLocalDocs];

        recGlobalDocs.forEach((d) => {
          if (!mergedDocs.some((m) => m.id === d.id || m.file_name === d.file_name)) {
            mergedDocs.push(d);
          }
        });

        recDbDocs.forEach((d) => {
          if (!mergedDocs.some((m) => m.id === d.id || m.file_name === d.file_name)) {
            mergedDocs.push(d);
          }
        });

        if (mergedDocs.length === 0 && demoDocs.length > 0) {
          mergedDocs.push(...demoDocs);
        }

        return {
          ...rec,
          documents: mergedDocs,
        };
      });

      return grouped as (OnboardingRecord & { documents: OnboardingDocument[] })[];
    },
  });

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

  const handleDownload = async (doc: OnboardingDocument, recordId: string) => {
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

      await logAudit('document_downloaded', 'document', recordId, {
        file_name: doc.file_name,
      });

      if (downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = doc.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Download Initialized', `${doc.file_name} transferred.`);
      } else {
        toast.info('Document Vaulted', `${doc.file_name} is securely stored.`);
      }
    } catch (err: any) {
      toast.error('Download Failed', err.message || 'Could not download document.');
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
        await supabase.from('onboarding_documents').delete().eq('id', doc.id);
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
              Organized compliance folders grouped by brand and enterprise client account
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

                  <button
                    onClick={() => navigate(`/onboarding/${item.id}`)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#1677FF] bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    Open Brand Vault <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Documents inside this brand */}
                {item.documents.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic">
                    No documents uploaded to this client vault yet. Upload GST, PAN, or KYC in the brand folder.
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
                            className="p-1 text-gray-400 hover:text-[#1677FF] rounded cursor-pointer"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc, item.id)}
                            className="p-1 text-gray-400 hover:text-emerald-600 rounded cursor-pointer"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteDocTarget({ doc, recordId: item.id })}
                            className="p-1 text-gray-400 hover:text-red-600 rounded cursor-pointer"
                            title="Delete Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
