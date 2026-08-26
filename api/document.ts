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

import crypto from 'crypto';

export function createSignedPortalToken(userId: string, email: string, role: string, secret: string): string {
  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const payloadStr = `${userId}:${email}:${role}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  const payloadBase64 = Buffer.from(payloadStr).toString('base64url');
  return `immense_s1_${payloadBase64}.${signature}`;
}

export function verifySignedPortalToken(token: string, secret: string): { valid: boolean; userId?: string; email?: string; role?: string } {
  if (!token || !token.startsWith('immense_s1_')) {
    return { valid: false };
  }

  try {
    const raw = token.slice('immense_s1_'.length);
    const parts = raw.split('.');
    if (parts.length !== 2) return { valid: false };

    const [payloadBase64, signature] = parts;
    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const [userId, email, role, expiresAtStr] = payloadStr.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false };
    }

    return { valid: true, userId, email, role };
  } catch {
    return { valid: false };
  }
}

// ----------------------------------------------------------------------------
// SERVER-SIDE CRYPTOGRAPHIC AUTHENTICATION & AUTHORIZATION VERIFIER
// ----------------------------------------------------------------------------
async function verifyServerSession(req: IncomingMessage): Promise<{
  authenticated: boolean;
  userId?: string;
  email?: string;
  role?: string;
  error?: string;
}> {
  const authHeader = (req.headers['authorization'] || '').toString().trim();
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { authenticated: false, error: 'Unauthorized: Missing Authorization Bearer token.' };
  }

  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
  if (!supabaseUrl || !supabaseServiceKey) {
    return { authenticated: false, error: 'Server configuration error: Service role missing.' };
  }

  // 1. First check HMAC signed portal token
  const portalCheck = verifySignedPortalToken(token, supabaseServiceKey);
  if (portalCheck.valid && portalCheck.userId) {
    return {
      authenticated: true,
      userId: portalCheck.userId,
      email: portalCheck.email,
      role: portalCheck.role || 'employee',
    };
  }

  // 2. Fallback to Supabase Auth REST user endpoint
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (userRes.ok) {
      const userData: any = await userRes.json().catch(() => ({}));
      if (userData && userData.id) {
        const userId = userData.id;
        const email = (userData.email || '').toLowerCase().trim();
        let role = 'employee';
        try {
          const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=role,is_active`, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          });
          if (profileRes.ok) {
            const profiles: any[] = (await profileRes.json().catch(() => [])) as any[];
            if (Array.isArray(profiles) && profiles.length > 0) {
              if (profiles[0].is_active === false) {
                return { authenticated: false, error: 'Unauthorized: Account deactivated.' };
              }
              if (profiles[0].role) role = profiles[0].role;
            }
          }
        } catch {
          // Ignore
        }
        return { authenticated: true, userId, email, role };
      }
    }
  } catch {
    // Ignore
  }

  return { authenticated: false, error: 'Unauthorized: Invalid or expired Bearer token.' };
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    // MANDATORY CRYPTOGRAPHIC AUTHENTICATION VERIFICATION
    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
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
    // MANDATORY CRYPTOGRAPHIC AUTHENTICATION VERIFICATION
    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
      return;
    }

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

    // MANDATORY CRYPTOGRAPHIC AUTHENTICATION VERIFICATION
    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
      return;
    }

    const { userId: verifiedUserId, role: userRole } = authSession;

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

      // 1. Table Access Guard
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

      // --- Query / Select Action Handling ---
      if (dbAction === 'query' || dbAction === 'select') {
        let queryUrl = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(body.select || '*')}`;
        if (match && typeof match === 'object') {
          for (const [k, v] of Object.entries(match)) {
            if (v !== undefined && v !== null) {
              queryUrl += `&${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`;
            }
          }
        }
        if (body.order && typeof body.order === 'object' && body.order.column) {
          const dir = body.order.ascending === false ? 'desc' : 'asc';
          queryUrl += `&order=${encodeURIComponent(body.order.column)}.${dir}`;
        }
        if (body.limit && typeof body.limit === 'number') {
          queryUrl += `&limit=${body.limit}`;
        }

        const queryRes = await fetch(queryUrl, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        const queryData: any = (await queryRes.json().catch(() => [])) as any[];
        if (!queryRes.ok) {
          res.statusCode = queryRes.status || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: `Database query error (${queryRes.status}): ${JSON.stringify(queryData)}` }));
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: queryData }));
        return;
      }

      // 2. SERVER-SIDE ROLE-BASED AUTHORIZATION ENGINE
      if (userRole === 'viewer' && dbAction !== 'delete') {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Forbidden: Viewers are not allowed to modify data.' }));
        return;
      }

      if (dbAction === 'delete' && userRole !== 'super_admin' && userRole !== 'manager') {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Forbidden: Deletion requires Manager or Super Admin role.' }));
        return;
      }

      if (!supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
        return;
      }

      // 3. Bind Authenticated Identity (Prevent Ownership / Identity Forgery)
      if (payload && typeof payload === 'object') {
        payload = { ...payload };

        if (table === 'onboarding_documents') {
          payload.uploaded_by = verifiedUserId;
        } else if (table === 'onboarding_records' && dbAction === 'insert') {
          payload.created_by = verifiedUserId;
        }

        if (payload.id && !isValidUuid(payload.id)) {
          payload.id = generateUuid();
        }

        if (payload.onboarding_id && !isValidUuid(payload.onboarding_id)) {
          payload.onboarding_id = generateUuid();
        }

        if (payload.assigned_to && !isValidUuid(payload.assigned_to)) {
          delete payload.assigned_to;
        }
      }

      if (match && typeof match === 'object') {
        match = { ...match };
        if (match.id && !isValidUuid(match.id)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, data: [] }));
          return;
        }
      }

      // Auto-ensure parent onboarding_records row exists before document insert
      if (table === 'onboarding_documents' && (dbAction === 'insert' || dbAction === 'upsert') && payload && payload.onboarding_id) {
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
              status: 'pending',
              created_by: verifiedUserId,
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
        targetUrl += '?on_conflict=id';
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
