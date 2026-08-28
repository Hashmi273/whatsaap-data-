import { useState, useEffect } from 'react';
import { X, Download, FileText, ExternalLink, ShieldCheck, AlertCircle, FileImage, RefreshCw } from 'lucide-react';
import type { OnboardingDocument } from '@/types/database';
import { formatCategoryLabel } from '@/types/database';
import { getDocumentPreviewUrl } from '@/lib/download';

interface DocumentPreviewModalProps {
  document: OnboardingDocument | null;
  signedUrl?: string | null;
  onClose: () => void;
  onDownload: () => void;
}

export function DocumentPreviewModal({
  document,
  signedUrl,
  onClose,
  onDownload,
}: DocumentPreviewModalProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(signedUrl || null);
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setImgError(false);
    setIframeError(false);

    if (!document) {
      setResolvedUrl(null);
      setIsLoading(false);
      return;
    }

    if (signedUrl) {
      setResolvedUrl(signedUrl);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getDocumentPreviewUrl(document)
      .then((url) => {
        if (isMounted) {
          setResolvedUrl(url);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setResolvedUrl(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [document, signedUrl]);

  if (!document) return null;

  const fileName = document.file_name || document.original_name || 'Document';
  const fileNameLower = fileName.toLowerCase();
  const mimeType = (document.mime_type || '').toLowerCase();

  const isPdf = mimeType.includes('pdf') || fileNameLower.endsWith('.pdf');
  const isImage =
    mimeType.startsWith('image/') ||
    fileNameLower.endsWith('.jpg') ||
    fileNameLower.endsWith('.jpeg') ||
    fileNameLower.endsWith('.png') ||
    fileNameLower.endsWith('.webp');

  const isDocx =
    mimeType.includes('word') ||
    mimeType.includes('officedocument') ||
    fileNameLower.endsWith('.docx') ||
    fileNameLower.endsWith('.doc');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] z-10 overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF] flex-shrink-0">
              {isImage ? <FileImage className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">
                {fileName}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {formatCategoryLabel(document.category)}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Private Vault • Authenticated Token
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {resolvedUrl && (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Pop Out
              </a>
            )}
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 p-6 bg-slate-900/5 overflow-y-auto flex items-center justify-center min-h-[420px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
              <div className="p-3 bg-blue-50 text-[#1677FF] rounded-2xl">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">Retrieving Vault Object...</h4>
                <p className="text-xs text-gray-500 mt-1">Generating secure short-lived preview session.</p>
              </div>
            </div>
          ) : isImage ? (
            !imgError && resolvedUrl ? (
              <div className="flex flex-col items-center justify-center max-h-[70vh] w-full">
                <img
                  src={resolvedUrl}
                  alt={fileName}
                  onError={() => setImgError(true)}
                  className="max-h-[65vh] max-w-full rounded-2xl shadow-lg object-contain bg-white p-2 border border-gray-200"
                />
              </div>
            ) : (
              <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-gray-200 max-w-md space-y-4">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Document unavailable — storage object not found.</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    The requested file is not found in the private storage bucket.
                  </p>
                </div>
                <button
                  onClick={onDownload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1677FF] text-white rounded-xl font-semibold text-xs hover:bg-[#0B5FE0] shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Try Download
                </button>
              </div>
            )
          ) : isPdf ? (
            !iframeError && resolvedUrl ? (
              <div className="w-full h-[70vh] bg-white rounded-2xl shadow-sm border border-gray-300 overflow-hidden">
                <iframe
                  src={`${resolvedUrl}#toolbar=0`}
                  title={fileName}
                  onError={() => setIframeError(true)}
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-gray-200 max-w-md space-y-4">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Document unavailable — storage object not found.</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    The PDF binary is unavailable in the private storage bucket.
                  </p>
                </div>
                <button
                  onClick={onDownload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1677FF] text-white rounded-xl font-semibold text-xs hover:bg-[#0B5FE0] shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Try Download
                </button>
              </div>
            )
          ) : (
            <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-gray-200 max-w-md space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-[#1677FF] rounded-2xl flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">{fileName}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {isDocx
                    ? 'Word document (.docx) is vaulted. Download to view in MS Word or Google Docs.'
                    : `Direct preview is not supported for ${document.mime_type || 'this format'}.`}
                </p>
              </div>
              <button
                onClick={onDownload}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1677FF] text-white rounded-xl font-semibold text-xs hover:bg-[#0B5FE0] shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download Original File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentPreviewModal;
