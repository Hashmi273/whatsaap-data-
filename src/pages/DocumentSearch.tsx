import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  FolderLock,
  Download,
  Eye,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCheck2,
  Building2,
  Calendar,
  User,
  ShieldCheck,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { CATEGORY_OPTIONS, formatCategoryLabel } from '@/types/database';
import type {
  DocumentCategory,
  OnboardingDocument,
  OnboardingRecord,
  Profile,
} from '@/types/database';
import { format } from 'date-fns';
import { downloadDocument } from '@/lib/download';

type DocumentWithRelations = OnboardingDocument & {
  onboarding: OnboardingRecord | null;
  uploader_profile: Profile | null;
};

import { INITIAL_DEMO_DOCUMENTS } from '@/lib/demoData';

export function DocumentSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const navigate = useNavigate();
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);

  // Fetch all documents with joined brand & uploader
  const { data: documents, isLoading } = useQuery({
    queryKey: ['global-documents-search'],
    queryFn: async () => {
      let localDocs: any[] = [];
      try {
        localDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
      } catch {
        // Ignore
      }

      let dbDocs: DocumentWithRelations[] = [];
      try {
        const { data, error } = await supabase
          .from('onboarding_documents')
          .select(`
            *,
            onboarding:onboarding_records(id, brand_name, company_name, whatsapp_number, status),
            uploader_profile:profiles!onboarding_documents_uploaded_by_fkey(id, full_name, corporate_email)
          `)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          dbDocs = data as DocumentWithRelations[];
        }
      } catch {
        // Fallback
      }

      const merged = [...localDocs];
      dbDocs.forEach((d) => {
        if (!merged.some((m) => m.id === d.id || m.file_name === d.file_name)) {
          merged.push(d);
        }
      });

      if (merged.length === 0) {
        return INITIAL_DEMO_DOCUMENTS as unknown as DocumentWithRelations[];
      }

      return merged as DocumentWithRelations[];
    },
  });

  // Filter documents client side with debounced/multi-match logic
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    return documents.filter((doc) => {
      const searchLower = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !searchLower ||
        doc.file_name.toLowerCase().includes(searchLower) ||
        (doc.original_name && doc.original_name.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.brand_name &&
          doc.onboarding.brand_name.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.company_name &&
          doc.onboarding.company_name.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.contact_email &&
          doc.onboarding.contact_email.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.contact_person &&
          doc.onboarding.contact_person.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.login_url &&
          doc.onboarding.login_url.toLowerCase().includes(searchLower)) ||
        (doc.onboarding?.notes &&
          doc.onboarding.notes.toLowerCase().includes(searchLower)) ||
        (doc.uploader_profile?.full_name &&
          doc.uploader_profile.full_name.toLowerCase().includes(searchLower)) ||
        (doc.uploader_profile?.corporate_email &&
          doc.uploader_profile.corporate_email.toLowerCase().includes(searchLower)) ||
        formatCategoryLabel(doc.category).toLowerCase().includes(searchLower);

      const matchesCategory =
        selectedCategory === 'all' || doc.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [documents, searchTerm, selectedCategory]);

  const handlePreview = async (doc: OnboardingDocument) => {
    try {
      if (doc.storage_path) {
        const { data, error } = await supabase.storage
          .from('onboarding-documents')
          .createSignedUrl(doc.storage_path, 3600);

        if (!error && data?.signedUrl) {
          setPreviewDoc(doc);
          setPreviewSignedUrl(data.signedUrl);
          return;
        }
      }

      if ((doc as any).localPreviewUrl && typeof (doc as any).localPreviewUrl === 'string' && (doc as any).localPreviewUrl.startsWith('data:')) {
        setPreviewDoc(doc);
        setPreviewSignedUrl((doc as any).localPreviewUrl);
        return;
      }

      setPreviewDoc(doc);
      setPreviewSignedUrl('/logo.jpg');
    } catch {
      setPreviewDoc(doc);
      setPreviewSignedUrl('/logo.jpg');
    }
  };

  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const handleDownload = async (doc: DocumentWithRelations) => {
    setDownloadingDocId(doc.id);
    try {
      await downloadDocument(doc, {
        recordId: doc.onboarding_id,
        toast,
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const getDocIcon = (mime: string, name: string) => {
    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <FileImage className="w-5 h-5 text-blue-500" />;
  };

  return (
    <PageLayout title="Global Document Search">
      <div className="space-y-6">
        {/* Search Hero Header */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[#1677FF] text-xs font-semibold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Private Storage Compliance Search
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
              Enterprise Document & GST Certificate Search
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Instantly find client GST certificates, PAN cards, WhatsApp authorization letters, and legal files across all records.
            </p>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSearchParams(e.target.value ? { q: e.target.value } : {});
              }}
              placeholder="Search by brand name (e.g. 'Prestige'), document type, GST, staff name..."
              className="w-full pl-12 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all shadow-2xs font-medium"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#071A3D] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Categories
            </button>

            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-[#1677FF] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            Displaying <span className="font-bold text-gray-900">{filteredDocuments.length}</span> compliance documents
          </span>
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSearchParams({});
              }}
              className="text-[#1677FF] hover:underline"
            >
              Reset search
            </button>
          )}
        </div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-40 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <EmptyState
            icon={FolderLock}
            title="No Matching Documents Found"
            description={
              searchTerm
                ? `No documents found matching "${searchTerm}". Check the spelling or category filters.`
                : 'No documents have been uploaded to any onboarding vault yet.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Category Badge & Size */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                      {formatCategoryLabel(doc.category)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {(doc.file_size / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Document Name */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-xl bg-gray-50 flex-shrink-0 group-hover:scale-105 transition-transform">
                      {getDocIcon(doc.mime_type, doc.file_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="font-bold text-gray-900 text-sm truncate"
                        title={doc.file_name}
                      >
                        {doc.file_name}
                      </h4>
                      {doc.onboarding && (
                        <div
                          onClick={() => navigate(`/onboarding/${doc.onboarding?.id}`)}
                          className="flex items-center gap-1 text-xs text-[#1677FF] hover:underline font-semibold mt-0.5 cursor-pointer"
                        >
                          <Building2 className="w-3 h-3" />
                          <span>{doc.onboarding.brand_name}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-1 text-[11px] text-gray-500">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Uploaded By:</span>
                      <span className="font-medium text-gray-700">
                        {doc.uploader_profile?.full_name || 'Staff'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date Vaulted:</span>
                      <span className="font-medium text-gray-700">
                        {format(new Date(doc.created_at), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handlePreview(doc)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-lg transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
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
        onDownload={() => previewDoc && handleDownload(previewDoc as any)}
      />
    </PageLayout>
  );
}

export default DocumentSearch;
