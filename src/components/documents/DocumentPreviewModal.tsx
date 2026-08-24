import { X, Download, FileText, ExternalLink, ShieldCheck } from 'lucide-react';
import type { OnboardingDocument } from '@/types/database';
import { formatCategoryLabel } from '@/types/database';

interface DocumentPreviewModalProps {
  document: OnboardingDocument | null;
  signedUrl: string | null;
  onClose: () => void;
  onDownload: () => void;
}

export function DocumentPreviewModal({
  document,
  signedUrl,
  onClose,
  onDownload,
}: DocumentPreviewModalProps) {
  if (!document || !signedUrl) return null;

  const isPdf = document.mime_type.includes('pdf') || document.file_name.toLowerCase().endsWith('.pdf');
  const isImage = document.mime_type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(document.file_name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF] flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {document.file_name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {formatCategoryLabel(document.category)}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Private Supabase Vault • Signed Token Valid
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 p-4 bg-gray-100 overflow-y-auto flex items-center justify-center min-h-[400px]">
          {isImage && (
            <img
              src={signedUrl}
              alt={document.file_name}
              className="max-h-[70vh] max-w-full rounded-lg shadow-md object-contain"
            />
          )}

          {isPdf && (
            <iframe
              src={`${signedUrl}#toolbar=0`}
              title={document.file_name}
              className="w-full h-[70vh] rounded-lg border border-gray-300 bg-white"
            />
          )}

          {!isPdf && !isImage && (
            <div className="text-center p-8 bg-white rounded-xl shadow-xs border border-gray-200 max-w-md">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <h4 className="font-semibold text-gray-900">{document.file_name}</h4>
              <p className="text-sm text-gray-500 mt-1">
                Preview is not available directly for this file format ({document.mime_type || 'Document'}).
              </p>
              <button
                onClick={onDownload}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#1677FF] text-white rounded-lg font-medium text-sm hover:bg-[#0B5FE0]"
              >
                <Download className="w-4 h-4" />
                Download to View
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentPreviewModal;
