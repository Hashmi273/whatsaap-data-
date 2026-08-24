import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderLock,
  Building2,
  Search,
  Download,
  Eye,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCheck2,
  ChevronRight,
  ExternalLink,
  Plus
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { formatCategoryLabel } from '@/types/database';
import type { OnboardingDocument, OnboardingRecord } from '@/types/database';
import { format } from 'date-fns';

export function DocumentVault() {
  const navigate = useNavigate();
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);

  // Fetch Onboarding Records that have documents
  const { data: recordsWithDocs, isLoading } = useQuery({
    queryKey: ['vault-records-grouped'],
    queryFn: async () => {
      const { data: records, error: recError } = await supabase
        .from('onboarding_records')
        .select(`
          id, brand_name, company_name, whatsapp_number, status,
          documents:onboarding_documents(*)
        `)
        .order('brand_name');

      if (recError) throw recError;
      return records as (OnboardingRecord & { documents: OnboardingDocument[] })[];
    },
  });

  const handlePreview = async (doc: OnboardingDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (error) throw error;
      setPreviewDoc(doc);
      setPreviewSignedUrl(data.signedUrl);
    } catch (err: any) {
      toast.error('Preview Error', 'Could not create secure token.');
    }
  };

  const handleDownload = async (doc: OnboardingDocument, recordId: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(doc.storage_path, 60, {
          download: doc.file_name,
        });

      if (error) throw error;

      await logAudit('document_downloaded', 'document', recordId, {
        file_name: doc.file_name,
      });

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

  const getDocIcon = (mime: string, name: string) => {
    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    if (mime.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(name)) {
      return <FileImage className="w-4 h-4 text-blue-500" />;
    }
    if (mime.includes('excel') || mime.includes('sheet') || /\.(xls|xlsx|csv)$/i.test(name)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    }
    return <FileCheck2 className="w-4 h-4 text-indigo-500" />;
  };

  const filteredRecords = (recordsWithDocs || []).filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchesBrand = r.brand_name.toLowerCase().includes(term);
    const matchesDoc = r.documents.some((d) => d.file_name.toLowerCase().includes(term));
    return matchesBrand || matchesDoc;
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
              Organized compliance folders grouped by brand and enterprise account
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by brand or document..."
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
                        {item.whatsapp_number} • {item.documents.length} files securely stored
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/onboarding/${item.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1677FF] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors self-start sm:self-auto"
                  >
                    Open Onboarding Folder <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Documents inside this brand */}
                {item.documents.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic">
                    No documents uploaded to this client vault yet.
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
                            className="p-1 text-gray-400 hover:text-[#1677FF] rounded"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc, item.id)}
                            className="p-1 text-gray-400 hover:text-emerald-600 rounded"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
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
