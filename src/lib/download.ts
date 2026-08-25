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

    // 1. Direct local preview blob download if available
    if (doc.localPreviewUrl && (doc.localPreviewUrl.startsWith('blob:') || doc.localPreviewUrl.startsWith('data:'))) {
      try {
        const res = await fetch(doc.localPreviewUrl);
        if (res.ok) {
          blob = await res.blob();
        }
      } catch {
        // Fallback to server endpoint
      }
    }

    // 2. Fetch binary stream via secure serverless endpoint
    if (!blob) {
      const endpoint = `/api/download-document?path=${encodeURIComponent(doc.storage_path)}&name=${encodeURIComponent(doc.file_name)}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error('Unable to download this document. Please try again.');
      }
      blob = await res.blob();
    }

    if (!blob || blob.size === 0) {
      throw new Error('Unable to download this document. Please try again.');
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
      options.toast.success('Download Complete', `${doc.file_name} saved successfully.`);
    }

    return true;
  } catch (err: any) {
    if (options?.toast) {
      options.toast.error('Download Failed', 'Unable to download this document. Please try again.');
    }
    return false;
  } finally {
    activeDownloads.delete(downloadKey);
  }
}
