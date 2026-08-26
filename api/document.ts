import type { IncomingMessage, ServerResponse } from 'http';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return UUID_REGEX.test(str.trim());
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSupabaseCredentials() {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ztrskyefkugevypzfecl.supabase.co'
  ).replace(/\/+$/, '');

  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  let serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    ''
  ).trim();

  const isUsingAnonKey = Boolean(serviceKey && anonKey && serviceKey === anonKey);

  return { supabaseUrl, supabaseServiceKey: serviceKey, isUsingAnonKey };
}

const ALLOWED_TABLES = new Set([
  'onboarding_documents',
  'onboarding_records',
  'audit_logs',
  'profiles',
]);

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-email, x-session-token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname.toLowerCase();
  let action = urlObj.searchParams.get('action') || '';

  if (!action) {
    if (pathname.includes('upload-document') || pathname.endsWith('/upload')) action = 'upload';
    else if (pathname.includes('download-document') || pathname.endsWith('/download')) action = 'download';
    else if (pathname.includes('save-document-metadata') || pathname.endsWith('/save-metadata')) action = 'save-metadata';
    else action = 'upload';
  }

  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  // --- 1. ACTION: UPLOAD ---
  if (action === 'upload') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
      return;
    }

    try {
      let body: any = {};
      if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      } else if (typeof req.body === 'string' && req.body.trim()) {
        try { body = JSON.parse(req.body); } catch { body = {}; }
      } else {
        const rawBody = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk) => (data += chunk));
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        try { body = JSON.parse(rawBody || '{}'); } catch { body = {}; }
      }

      const { path: storagePath, bucket = 'onboarding-documents', fileBase64, contentType = 'application/octet-stream' } = body;
      if (!storagePath || !fileBase64) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'storagePath and fileBase64 are required.' }));
        return;
      }

      const cleanPath = (storagePath.startsWith('/') ? storagePath.slice(1) : storagePath).trim();
      const fileBuffer = Buffer.from(fileBase64, 'base64');

      if (!supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing in Vercel.' }));
        return;
      }

      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'x-upsert': 'true',
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        res.statusCode = uploadRes.status || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: `Storage upload error: ${errText}` }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, path: cleanPath, size: fileBuffer.length }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- 2. ACTION: DOWNLOAD ---
  if (action === 'download') {
    const storagePath = urlObj.searchParams.get('path') || '';
    const bucket = urlObj.searchParams.get('bucket') || 'onboarding-documents';

    if (!storagePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'storagePath parameter is required.' }));
      return;
    }

    const cleanPath = (storagePath.startsWith('/') ? storagePath.slice(1) : storagePath).trim();

    try {
      if (!supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
        return;
      }

      const fetchUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
      const downloadRes = await fetch(fetchUrl, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      if (!downloadRes.ok) {
        res.statusCode = downloadRes.status || 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Document object not found.' }));
        return;
      }

      const arrayBuf = await downloadRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const fileName = cleanPath.split('/').pop() || 'downloaded_document';

      res.statusCode = 200;
      res.setHeader('Content-Type', downloadRes.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.end(buffer);
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- 3. ACTION: SAVE-METADATA ---
  if (action === 'save-metadata') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
      return;
    }

    const authHeader = (req.headers['authorization'] || '').toString().trim();
    const sessionToken = (req.headers['x-session-token'] || '').toString().trim();
    const userId = (req.headers['x-user-id'] || '').toString().trim();
    const userEmail = (req.headers['x-user-email'] || '').toString().trim();

    if (!authHeader && !sessionToken && !userId && !userEmail) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Unauthorized: Session authentication required.', code: 'UNAUTHORIZED_SESSION_REQUIRED' }));
      return;
    }

    try {
      let body: any = {};
      if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      } else if (typeof req.body === 'string' && req.body.trim()) {
        try { body = JSON.parse(req.body); } catch { body = {}; }
      } else {
        const rawBody = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk) => (data += chunk));
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        try { body = JSON.parse(rawBody || '{}'); } catch { body = {}; }
      }

      let { table = 'onboarding_documents', payload, action: dbAction = 'insert', match } = body;

      if (!ALLOWED_TABLES.has(table)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: `Unauthorized table access: ${table}` }));
        return;
      }

      if (!supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
        return;
      }

      // --- Strict UUID Sanitization for Postgres Compliance ---
      if (payload && typeof payload === 'object') {
        payload = { ...payload };

        if (payload.id && !isValidUuid(payload.id)) {
          payload.id = generateUuid();
        }

        if (payload.onboarding_id && !isValidUuid(payload.onboarding_id)) {
          payload.onboarding_id = generateUuid();
        }

        if (payload.uploaded_by && !isValidUuid(payload.uploaded_by)) {
          delete payload.uploaded_by;
        }

        if (payload.assigned_to && !isValidUuid(payload.assigned_to)) {
          delete payload.assigned_to;
        }

        if (payload.created_by && !isValidUuid(payload.created_by)) {
          delete payload.created_by;
        }
      }

      if (match && typeof match === 'object') {
        match = { ...match };
        if (match.id && !isValidUuid(match.id)) {
          // If trying to match non-UUID ID that never existed in DB, respond success gracefully
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, data: [] }));
          return;
        }
      }

      // Auto-ensure parent onboarding_records row exists before document insert
      if (table === 'onboarding_documents' && dbAction === 'insert' && payload && payload.onboarding_id) {
        try {
          const recCheckRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?id=eq.${payload.onboarding_id}&select=id`, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          });
          const recCheckData = await recCheckRes.json().catch(() => []);
          if (!Array.isArray(recCheckData) || recCheckData.length === 0) {
            const parentPayload = {
              id: payload.onboarding_id,
              brand_name: payload.brand_name || 'Immense Client',
              company_name: payload.company_name || 'Immense Client',
              whatsapp_number: payload.whatsapp_number || '+91 99999 99999',
              platform: 'WhatsApp Onboarding',
              status: 'submitted',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            await fetch(`${supabaseUrl}/rest/v1/onboarding_records?on_conflict=id`, {
              method: 'POST',
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(parentPayload),
            }).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }

      let targetUrl = `${supabaseUrl}/rest/v1/${table}`;
      let method = 'POST';
      const headers: Record<string, string> = {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      if (dbAction === 'insert') {
        method = 'POST';
      } else if (dbAction === 'upsert') {
        method = 'POST';
        headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
      } else if (dbAction === 'update') {
        method = 'PATCH';
        if (match && typeof match === 'object') {
          const queryParams = new URLSearchParams();
          for (const [k, v] of Object.entries(match)) { queryParams.append(k, `eq.${v}`); }
          targetUrl += `?${queryParams.toString()}`;
        }
      } else if (dbAction === 'delete') {
        method = 'DELETE';
        if (match && typeof match === 'object') {
          const queryParams = new URLSearchParams();
          for (const [k, v] of Object.entries(match)) { queryParams.append(k, `eq.${v}`); }
          targetUrl += `?${queryParams.toString()}`;
        }
      }

      const fetchOptions: RequestInit = { method, headers };
      if (dbAction !== 'delete') fetchOptions.body = JSON.stringify(payload);

      const restRes = await fetch(targetUrl, fetchOptions);
      const restData: any = await restRes.json().catch(() => ({}));

      if (!restRes.ok) {
        const errMsg = typeof restData === 'object' ? (restData.message || restData.error || JSON.stringify(restData)) : String(restData);
        res.statusCode = restRes.status || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: `Supabase REST error (${restRes.status}): ${errMsg}` }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: restData }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: false, error: `Unknown document action: ${action}` }));
}
