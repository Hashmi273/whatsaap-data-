import { supabase } from './supabase';

/**
 * Uploads a document to Supabase Storage private bucket 'onboarding-documents'.
 * Attempts client upload first, then serverless API fallback with Service Role key.
 */
export async function uploadDocumentToStorage(
  storagePath: string,
  file: File,
  bucket: string = 'onboarding-documents'
): Promise<{ success: boolean; error?: string }> {
  const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;

  // 1. Attempt upload via Supabase JS client
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(cleanPath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    if (!error && data?.path) {
      return { success: true };
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

    const token = await getAuthBearerToken();
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

    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success) {
      return { success: true };
    } else {
      const errorMsg = resData.error || `Server upload rejected (HTTP ${res.status})`;
      console.error('Serverless upload returned error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (serverErr: any) {
    console.error('Serverless storage upload fallback error:', serverErr);
    return { success: false, error: serverErr.message || 'Network error during document upload.' };
  }
}

async function getAuthBearerToken(): Promise<string> {
  try {
    const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (sessionData?.session?.access_token) {
      return sessionData.session.access_token;
    }
  } catch {
    // Ignore
  }

  try {
    const saved = localStorage.getItem('immense_auth_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.access_token) return parsed.access_token;
    }
  } catch {
    // Ignore
  }

  return '';
}

/**
 * Saves metadata to PostgreSQL tables (onboarding_documents, onboarding_records, etc.)
 * using serverless API route /api/save-document-metadata backed by Service Role key.
 */
export async function saveDocumentMetadata(
  table: string,
  payload: any,
  action: 'insert' | 'upsert' | 'update' | 'delete' = 'insert',
  match?: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const token = await getAuthBearerToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/save-document-metadata', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        table,
        payload,
        action,
        match,
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success) {
      return { success: true, data: resData.data };
    } else {
      const errorMsg = resData.error || `Server metadata save failed (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error saving metadata.' };
  }
}

/**
 * Safely fetches metadata from PostgreSQL tables via authenticated serverless endpoint.
 */
export async function fetchDocumentMetadata(
  table: string,
  select: string = '*',
  options?: { match?: Record<string, any>; order?: { column: string; ascending?: boolean }; limit?: number }
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const token = await getAuthBearerToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/save-document-metadata', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        table,
        action: 'query',
        select,
        match: options?.match,
        order: options?.order,
        limit: options?.limit,
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success && Array.isArray(resData.data)) {
      return { success: true, data: resData.data };
    }
    return { success: false, error: resData.error || 'Failed to fetch data' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
