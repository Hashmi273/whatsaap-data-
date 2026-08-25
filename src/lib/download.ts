import { supabase } from './supabase';
import { logAudit } from './audit';

interface DownloadOptions {
  recordId?: string;
  toast?: {
    success: (title: string, msg?: string) => void;
    error: (title: string, msg?: string) => void;
    info: (title: string, msg?: string) => void;
  };
}

let activeDownloads = new Set<string>();

/**
 * Downloads a document from the Document Vault with authentic signed tokens or binary streams,
 * preserving original filename, extensions, and content.
 */
export async function downloadDocument(
  doc: {
    file_name: string;
    storage_path: string;
    onboarding_id?: string;
    localPreviewUrl?: string;
  },
  options?: DownloadOptions
): Promise<boolean> {
  const downloadKey = `${doc.storage_path}_${doc.file_name}`;
  if (activeDownloads.has(downloadKey)) {
    return false; // Prevent duplicate concurrent download clicks
  }

  activeDownloads.add(downloadKey);

  try {
    if (options?.toast) {
      options.toast.info('Download Started', `Download started — ${doc.file_name}`);
    }

    let blob: Blob | null = null;

    // 1. Direct download via Supabase client session
    try {
      const { data, error } = await supabase.storage
        .from('onboarding-documents')
        .download(doc.storage_path);

      if (!error && data && data.size > 0) {
        blob = data;
      }
    } catch {
      // Fallback
    }

    // 2. Fallback to serverless endpoint
    if (!blob) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const endpoint = `/api/download-document?path=${encodeURIComponent(doc.storage_path)}&name=${encodeURIComponent(doc.file_name)}&disposition=attachment`;
      const res = await fetch(endpoint, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Document unavailable — storage object not found.');
      }
      blob = await res.blob();
    }

    if (!blob || blob.size === 0) {
      throw new Error('Document unavailable — storage object not found.');
    }

    // 3. Trigger Real Browser Download with Original Filename
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = doc.file_name || 'document';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up blob URL after trigger
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

    // 4. Log Immutable Audit Record
    try {
      const entityId = options?.recordId || doc.onboarding_id || doc.storage_path;
      await logAudit('document_downloaded', 'document', entityId, {
        file_name: doc.file_name,
        storage_path: doc.storage_path,
        file_size: blob.size,
      });
    } catch {
      // Audit log note
    }

    if (options?.toast) {
      options.toast.success('Download Complete', `${doc.file_name} (${(blob.size / 1024).toFixed(1)} KB) saved successfully.`);
    }

    return true;
  } catch (err: any) {
    if (options?.toast) {
      options.toast.error('Download Failed', err.message || 'Document unavailable — storage object not found.');
    }
    return false;
  } finally {
    activeDownloads.delete(downloadKey);
  }
}
