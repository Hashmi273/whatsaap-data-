import { useState, useRef } from 'react';
import { 
  FolderLock, UploadCloud, FileText, Download, Trash2, Edit,
  FileCheck2, FileSpreadsheet, FileImage, CheckCircle2, AlertCircle, RotateCw, ExternalLink
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { uploadDocumentToStorage, saveDocumentMetadata } from '@/lib/storage';
import { downloadDocument, getDocumentPreviewUrl } from '@/lib/download';
import { supabase } from '@/lib/supabase';
import { isValidUuid } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { formatCategoryLabel, CATEGORY_OPTIONS, MAX_FILE_SIZE } from '@/types/database';
import type { OnboardingRecord, OnboardingDocument, DocumentCategory } from '@/types/database';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { format } from 'date-fns';

interface DocumentsTabProps {
  recordId: string;
  record: OnboardingRecord;
  documents: OnboardingDocument[];
  onRefresh: () => void;
}

export function DocumentsTab({ recordId, record, documents, onRefresh }: DocumentsTabProps) {
  const { profile } = useAuth();
  const toast = useToast();
  
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('gst_certificate');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<OnboardingDocument | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<OnboardingDocument | null>(null);
  const [replaceTargetDoc, setReplaceTargetDoc] = useState<OnboardingDocument | null>(null);
  const replaceDocInputRef = useRef<HTMLInputElement>(null);

  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [backingUpDocId, setBackingUpDocId] = useState<string | null>(null);
  const [restoringDocId, setRestoringDocId] = useState<string | null>(null);

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !recordId || isUploading) return;

    const fileNameLower = selectedFile.name.toLowerCase();
    const isAllowedExt = fileNameLower.match(/\.(pdf|jpg|jpeg|png|docx|doc)$/);
    if (!isAllowedExt) {
      toast.error('Unsupported Type', 'Only PDF, JPG, PNG, and DOCX are allowed.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File Too Large', 'Maximum file size allowed is 10MB.');
      return;
    }

    setIsUploading(true);
    try {
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${recordId}/${uploadCategory}/${uniqueFileName}`;
      const uploaderId = profile?.id && isValidUuid(profile.id) ? profile.id : null;
      const docId = crypto.randomUUID();

      const uploadResult = await uploadDocumentToStorage(storagePath, selectedFile, 'onboarding-documents');
      if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload to storage vault failed');

      const docPayload: any = {
        id: docId,
        onboarding_id: recordId,
        file_name: selectedFile.name,
        original_name: selectedFile.name,
        category: uploadCategory,
        storage_path: storagePath,
        mime_type: selectedFile.type || (fileNameLower.endsWith('.pdf') ? 'application/pdf' : 'image/png'),
        file_size: selectedFile.size,
        drive_backup_status: 'pending',
      };
      if (uploaderId) docPayload.uploaded_by = uploaderId;

      const saveRes = await saveDocumentMetadata('onboarding_documents', docPayload, 'upsert');
      if (!saveRes.success) throw new Error(saveRes.error);

      await logAudit('document_uploaded', 'document', recordId, {
        file_name: selectedFile.name,
        category: uploadCategory,
        size_bytes: selectedFile.size,
      });

      toast.success('Document Vaulted', `${selectedFile.name} successfully encrypted & stored.`);
      setSelectedFile(null);
      onRefresh();

      // Trigger asynchronous Google Drive Disaster Recovery Backup in background
      fetch('/api/google-drive-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, storagePath, mode: 'single' }),
      }).then(() => onRefresh()).catch(() => {});
    } catch (err: any) {
      toast.error('Upload Failed', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackupSingle = async (doc: OnboardingDocument) => {
    setBackingUpDocId(doc.id);
    toast.info('Google Drive Backup', `Backing up "${doc.file_name}" to Google Drive...`);
    try {
      const res = await fetch('/api/google-drive-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, mode: 'single' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('DR Backup Complete', `${doc.file_name} successfully backed up to Google Drive.`);
        onRefresh();
      } else {
        toast.error('DR Backup Failed', data.error || 'Could not complete Google Drive backup.');
      }
    } catch (err: any) {
      toast.error('Backup Error', err.message);
    } finally {
      setBackingUpDocId(null);
    }
  };

  const handleRestoreSingle = async (doc: OnboardingDocument) => {
    if (!doc.drive_file_id) {
      toast.error('No Backup Found', 'This file has not yet been backed up to Google Drive.');
      return;
    }
    setRestoringDocId(doc.id);
    toast.info('DR Restore Started', `Restoring "${doc.file_name}" from Google Drive...`);
    try {
      const res = await fetch('/api/google-drive-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Restored Successfully', `${doc.file_name} restored into Supabase Vault.`);
        onRefresh();
      } else {
        toast.error('Restore Failed', data.error || 'Could not restore file from Google Drive.');
      }
    } catch (err: any) {
      toast.error('Restore Error', err.message);
    } finally {
      setRestoringDocId(null);
    }
  };

  const handlePreview = async (doc: OnboardingDocument) => {
    setPreviewDoc(doc);
    if (!doc.storage_path) {
      setPreviewSignedUrl(null);
      return;
    }
    const previewUrl = await getDocumentPreviewUrl(doc);
    setPreviewSignedUrl(previewUrl);
  };

  const handleDownload = async (doc: OnboardingDocument) => {
    setDownloadingDocId(doc.id);
    try {
      await downloadDocument(doc, { recordId, toast });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleDeleteDocument = async (doc: OnboardingDocument) => {
    try {
      if (doc.storage_path) {
        await supabase.storage.from('onboarding-documents').remove([doc.storage_path]).catch(() => {});
      }
      if (doc.id) {
        await saveDocumentMetadata('onboarding_documents', null, 'delete', { id: doc.id });
        await supabase.from('onboarding_documents').delete().eq('id', doc.id);
      }
      await logAudit('document_deleted', 'document', recordId, { file_name: doc.file_name, storage_path: doc.storage_path });
      toast.success('Document Removed', `${doc.file_name} deleted from vault.`);
      setDeleteDoc(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Delete Failed', err.message);
    }
  };

  const handleReplaceFile = async (file: File, docToReplace: OnboardingDocument) => {
    if (!recordId) return;
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${recordId}/${docToReplace.category}/${uniqueFileName}`;
      const docId = crypto.randomUUID();
      
      const uploadResult = await uploadDocumentToStorage(storagePath, file, 'onboarding-documents');
      if (!uploadResult.success) throw new Error(uploadResult.error);

      const docPayload: any = {
        id: docId,
        onboarding_id: recordId,
        file_name: file.name,
        original_name: file.name,
        category: docToReplace.category,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        drive_backup_status: 'pending',
      };

      const saveRes = await saveDocumentMetadata('onboarding_documents', docPayload, 'insert');
      if (!saveRes.success) throw new Error(saveRes.error);

      if (docToReplace.id && isValidUuid(docToReplace.id)) {
        await saveDocumentMetadata('onboarding_documents', null, 'delete', { id: docToReplace.id });
      }

      await logAudit('document_uploaded', 'document', recordId, {
        file_name: file.name, category: docToReplace.category, is_replacement: true
      });

      toast.success('Document Replaced', `${file.name} successfully updated.`);
      setReplaceTargetDoc(null);
      onRefresh();

      // Background backup to Google Drive
      fetch('/api/google-drive-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, storagePath, mode: 'single' }),
      }).then(() => onRefresh()).catch(() => {});
    } catch (err: any) {
      toast.error('Replace Failed', err.message);
    }
  };

  const getDocIcon = (mime: string, name: string) => {
    if (mime.includes('pdf') || name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (mime.includes('spreadsheet') || name.endsWith('.xlsx')) return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    return <FileImage className="w-5 h-5 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><FolderLock className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Encrypted Document Vault</h3>
              <p className="text-xs text-gray-500 mt-0.5">Primary AES-256 Vault + Secondary Google Drive DR Archive</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-xs">
          <form onSubmit={handleUploadDocument} className="flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1 w-full space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase">Document Category</label>
              <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)} className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#1677FF] bg-white">
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 w-full space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase">Select File</label>
              <div className="relative">
                <input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.jpg,.jpeg,.png,.docx,.doc" />
                <div className="w-full text-sm border border-gray-300 border-dashed rounded-lg p-2.5 bg-white text-gray-500 hover:bg-blue-50 hover:border-[#1677FF] transition-colors flex items-center justify-between">
                  <span className="truncate pr-2">{selectedFile ? selectedFile.name : 'Choose a file...'}</span>
                  <UploadCloud className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={!selectedFile || isUploading} className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all shadow-sm ${!selectedFile || isUploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#1677FF] hover:bg-blue-600 hover:shadow-md'}`}>
              {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {isUploading ? 'Vaulting...' : 'Upload & Encrypt'}
            </button>
          </form>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-10 px-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            <FileCheck2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-900">Vault is empty</p>
            <p className="text-xs text-gray-500 mt-1">Upload verified business documents securely above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-bold">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 hidden md:table-cell">DR Backup</th>
                  <th className="px-4 py-3 hidden md:table-cell">Size</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {getDocIcon(doc.mime_type, doc.file_name)}
                        <div>
                          <p className="font-bold text-gray-900 line-clamp-1" title={doc.file_name}>{doc.file_name}</p>
                          <p className="text-[10px] font-mono text-gray-400">ID: {doc.id?.slice(0,8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                        {formatCategoryLabel(doc.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {doc.drive_backup_status === 'backed_up' ? (
                        <a
                          href={doc.drive_web_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          title={`Google Drive Backup Verified • ${doc.drive_file_id || ''}`}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Backed Up</span>
                          {doc.drive_web_url && <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />}
                        </a>
                      ) : doc.drive_backup_status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => handleBackupSingle(doc)}
                          disabled={backingUpDocId === doc.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                          title={doc.drive_backup_error || 'Retry Backup to Google Drive'}
                        >
                          {backingUpDocId === doc.id ? (
                            <RotateCw className="w-3 h-3 animate-spin text-red-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-red-600" />
                          )}
                          <span>Retry Backup</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBackupSingle(doc)}
                          disabled={backingUpDocId === doc.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Backup to Google Drive"
                        >
                          {backingUpDocId === doc.id ? (
                            <RotateCw className="w-3 h-3 animate-spin text-amber-600" />
                          ) : (
                            <UploadCloud className="w-3 h-3 text-amber-600" />
                          )}
                          <span>Backup Pending</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell font-mono">
                      {doc.file_size ? (doc.file_size / 1024).toFixed(1) + ' KB' : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                      {format(new Date(doc.created_at), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {doc.drive_file_id && (
                          <button
                            onClick={() => handleRestoreSingle(doc)}
                            disabled={restoringDocId === doc.id}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Restore binary from Google Drive DR"
                          >
                            {restoringDocId === doc.id ? (
                              <RotateCw className="w-4 h-4 animate-spin text-blue-600" />
                            ) : (
                              <RotateCw className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <input type="file" className="hidden" ref={replaceDocInputRef} onChange={(e) => {
                          if (e.target.files?.[0] && replaceTargetDoc) {
                            handleReplaceFile(e.target.files[0], replaceTargetDoc);
                          }
                          if (replaceDocInputRef.current) replaceDocInputRef.current.value = '';
                        }} />
                        <button onClick={() => { setReplaceTargetDoc(doc); replaceDocInputRef.current?.click(); }} className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded" title="Replace File">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handlePreview(doc)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Preview">
                          <FileText className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDownload(doc)} disabled={downloadingDocId === doc.id} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Download">
                          {downloadingDocId === doc.id ? <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDeleteDoc(doc)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DocumentPreviewModal
        document={previewDoc}
        signedUrl={previewSignedUrl}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewSignedUrl(null);
        }}
        onDownload={() => previewDoc && handleDownload(previewDoc)}
      />
      <ConfirmDialog
        open={!!deleteDoc}
        title="Delete Document"
        message={`Are you sure you want to permanently delete "${deleteDoc?.file_name}"?`}
        confirmLabel="Delete Document"
        onConfirm={() => deleteDoc && handleDeleteDocument(deleteDoc)}
        onClose={() => setDeleteDoc(null)}
        variant="danger"
      />
    </div>
  );
}

export default DocumentsTab;
