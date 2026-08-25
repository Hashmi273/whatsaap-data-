import { supabase } from './supabase';

/**
 * Uploads a document to Supabase Storage private bucket 'onboarding-documents'.
 * Attempts client upload first, then serverless API fallback with Service Role key.
 */
export async function uploadDocumentToStorage(
  storagePath: string,
  file: File,
  bucket: string = 'onboarding-documents'
): Promise<boolean> {
  const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;

  // 1. Attempt upload via Supabase JS client
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(cleanPath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    if (!error && data?.path) {
      return true;
    }
  } catch (clientErr) {
    console.warn('Client-side storage upload note:', clientErr);
  }

  // 2. Fallback to Serverless upload endpoint with Service Role Key
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(file);
    const fileBase64 = await base64Promise;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/upload-document', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: cleanPath,
        bucket,
        fileBase64,
        contentType: file.type || 'application/octet-stream',
      }),
    });

    if (res.ok) {
      return true;
    } else {
      const errJson = await res.json().catch(() => ({}));
      console.error('Serverless upload returned error:', errJson);
    }
  } catch (serverErr) {
    console.error('Serverless storage upload fallback error:', serverErr);
  }

  return false;
}
