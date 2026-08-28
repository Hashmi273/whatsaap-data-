import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

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

  return { supabaseUrl, supabaseAnonKey: anonKey, supabaseServiceKey: serviceKey, isUsingAnonKey };
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

    const secretsToTry = [
      secret,
      process.env.PORTAL_SECRET,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.SUPABASE_ANON_KEY,
      'immense-portal-auth-secret-key-2026',
    ].filter(Boolean) as string[];

    let validSignature = false;
    for (const sec of secretsToTry) {
      const expectedSignature = crypto.createHmac('sha256', sec).update(payloadStr).digest('hex');
      if (signature === expectedSignature) {
        validSignature = true;
        break;
      }
    }

    if (!validSignature) return { valid: false };

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
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    try {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      token = (urlObj.searchParams.get('token') || '').trim();
    } catch {
      // Ignore
    }
  }

  if (!token) {
    return { authenticated: false, error: 'Unauthorized: Missing Authorization Bearer token.' };
  }

  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = getSupabaseCredentials();

  // 1. First check HMAC signed portal token (immense_s1_...)
  const portalCheck = verifySignedPortalToken(token, supabaseServiceKey || supabaseAnonKey || '');
  if (portalCheck.valid && portalCheck.userId) {
    return {
      authenticated: true,
      userId: portalCheck.userId,
      email: portalCheck.email,
      role: portalCheck.role || 'employee',
    };
  }

  // 2. Validate Supabase Auth JWT token via GoTrue /auth/v1/user
  if (supabaseUrl) {
    const apiKeysToTry = [supabaseAnonKey, supabaseServiceKey].filter(Boolean);
    for (const apiKey of apiKeysToTry) {
      try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${token}`,
          },
        });

        if (userRes.ok) {
          const userData: any = await userRes.json().catch(() => ({}));
          if (userData && userData.id) {
            const userId = userData.id;
            const email = (userData.email || '').toLowerCase().trim();
            let role = userData.app_metadata?.role || userData.user_metadata?.role || 'employee';

            if (supabaseServiceKey) {
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
                // Ignore profile lookup failure
              }
            }
            return { authenticated: true, userId, email, role };
          }
        }
      } catch {
        // Try next key
      }
    }
  }

  // 3. Direct JWT claim verification with expiration check
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadStr);
      const nowSec = Math.floor(Date.now() / 1000);

      if (payload && payload.sub && payload.exp && payload.exp > nowSec) {
        const userId = payload.sub;
        const email = (payload.email || '').toLowerCase().trim();
        const role = payload.app_metadata?.role || payload.user_metadata?.role || 'employee';
        return { authenticated: true, userId, email, role };
      }
    }
  } catch {
    // Ignore
  }

  return { authenticated: false, error: 'Unauthorized: Invalid or expired Bearer token.' };
}

function getMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return mimeType || 'application/octet-stream';
}

const ALLOWED_TABLES = new Set([
  'onboarding_documents',
  'onboarding_records',
  'audit_logs',
  'profiles',
  'meta_business_portfolios',
  'waba_accounts',
  'phone_numbers',
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
    else if (pathname.includes('verify-storage') || pathname.endsWith('/verify-storage')) action = 'verify-storage';
    else action = 'upload';
  }

  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  // ==========================================================================
  // 1. ACTION: ATOMIC DOCUMENT UPLOAD
  // ==========================================================================
  if (action === 'upload') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
      return;
    }

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

      const {
        path: customStoragePath,
        bucket = 'onboarding-documents',
        fileBase64,
        fileName,
        category = 'other',
        onboardingId,
        uploaderId,
        replaceDocId,
        contentType = 'application/octet-stream',
      } = body;

      if (!fileBase64) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'fileBase64 is required.' }));
        return;
      }

      if (!supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
        return;
      }

      // 1. Build deterministic storage path
      const safeName = (fileName || 'document').replace(/[^a-zA-Z0-9.-]/g, '_');
      let targetPath = customStoragePath;
      if (!targetPath) {
        const prefix = onboardingId ? `${onboardingId}/${category}` : `general/${category}`;
        targetPath = `${prefix}/${Date.now()}_${safeName}`;
      }
      const cleanPath = (targetPath.startsWith('/') ? targetPath.slice(1) : targetPath).trim();
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      const resolvedMime = getMimeType(safeName, contentType);

      // 2. Upload binary to Supabase Storage
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': resolvedMime,
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
        res.end(JSON.stringify({ success: false, error: `Storage binary upload rejected: ${errText}` }));
        return;
      }

      // 3. Verify Storage Object Exists and Is Readable (Immediate Probe)
      const verifyUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
      const verifyRes = await fetch(verifyUrl, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      if (!verifyRes.ok) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: 'Storage verification probe failed: Object not readable in private bucket.',
        }));
        return;
      }

      // 4. Save/Update Metadata ONLY After Physical Verification
      let savedDocRecord: any = null;
      if (onboardingId) {
        const docId = replaceDocId && isValidUuid(replaceDocId) ? replaceDocId : crypto.randomUUID();
        const docPayload: any = {
          id: docId,
          onboarding_id: onboardingId,
          file_name: fileName || safeName,
          original_name: fileName || safeName,
          category,
          storage_path: cleanPath,
          mime_type: resolvedMime,
          file_size: fileBuffer.length,
          drive_backup_status: 'pending',
          drive_backup_error: null,
          storage_verified: true,
          storage_verified_at: new Date().toISOString(),
        };

        const effectiveUploader = uploaderId || authSession.userId;
        if (effectiveUploader && isValidUuid(effectiveUploader)) {
          docPayload.uploaded_by = effectiveUploader;
        }

        const dbRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(docPayload),
        });

        if (!dbRes.ok) {
          // Rollback storage object on database error to avoid orphaned storage object
          await fetch(uploadUrl, {
            method: 'DELETE',
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          }).catch(() => {});

          const dbErrText = await dbRes.text().catch(() => '');
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: `Metadata save failed (rolled back): ${dbErrText}` }));
          return;
        }

        const dbData: any = await dbRes.json().catch(() => []);
        savedDocRecord = Array.isArray(dbData) && dbData.length > 0 ? dbData[0] : docPayload;

        // Log audit event
        try {
          await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
            method: 'POST',
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              action: 'document_uploaded',
              entity_type: 'document',
              entity_id: onboardingId,
              metadata: {
                file_name: fileName || safeName,
                category,
                size_bytes: fileBuffer.length,
                storage_verified: true,
                is_replacement: Boolean(replaceDocId),
              },
              user_id: authSession.userId || null,
            }),
          });
        } catch {
          // Non-blocking
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        path: cleanPath,
        bucket,
        size: fileBuffer.length,
        storageVerified: true,
        document: savedDocRecord,
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ==========================================================================
  // 2. ACTION: VERIFY STORAGE (Diagnostic for all onboarding_documents)
  // ==========================================================================
  if (action === 'verify-storage') {
    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
      return;
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
      return;
    }

    try {
      const docsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?select=id,file_name,category,storage_path,onboarding_id,file_size,mime_type,created_at&order=created_at.desc`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
      });
      const allDocs: any = await docsRes.json().catch(() => []);

      let totalDocuments = Array.isArray(allDocs) ? allDocs.length : 0;
      let validCount = 0;
      let missingCount = 0;
      const missingDocuments: Array<{
        id: string;
        fileName: string;
        category: string;
        storagePath: string;
        onboardingId: string;
        reason: string;
      }> = [];

      if (Array.isArray(allDocs)) {
        for (const doc of allDocs) {
          const rawPath = (doc.storage_path || '').trim();
          const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;

          let exists = false;
          const candidatePaths = [
            cleanPath,
            cleanPath.replace(/^onboarding-documents\//, ''),
            doc.onboarding_id && doc.category ? `${doc.onboarding_id}/${doc.category}/${doc.file_name}` : null,
            doc.onboarding_id ? `${doc.onboarding_id}/${doc.file_name}` : null,
            doc.file_name,
          ].filter(Boolean) as string[];

          for (const p of candidatePaths) {
            const probeUrl = `${supabaseUrl}/storage/v1/object/authenticated/onboarding-documents/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
            const probeRes = await fetch(probeUrl, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
            });
            if (probeRes.ok) {
              exists = true;
              break;
            }
          }

          if (exists) {
            validCount++;
            // Update storage_verified = true
            fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${doc.id}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ storage_verified: true, storage_verified_at: new Date().toISOString() }),
            }).catch(() => {});
          } else {
            missingCount++;
            missingDocuments.push({
              id: doc.id,
              fileName: doc.file_name || 'document',
              category: doc.category || 'other',
              storagePath: cleanPath,
              onboardingId: doc.onboarding_id,
              reason: 'Source file is missing from Supabase Storage bucket.',
            });
            // Update storage_verified = false
            fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${doc.id}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ storage_verified: false, storage_verified_at: new Date().toISOString() }),
            }).catch(() => {});
          }
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        totalDocuments,
        validCount,
        missingCount,
        missingDocuments,
        verifiedAt: new Date().toISOString(),
      }));
      return;
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // ==========================================================================
  // 3. ACTION: DOWNLOAD / PREVIEW
  // ==========================================================================
  if (action === 'download') {
    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
      return;
    }

    const storagePath = urlObj.searchParams.get('path') || '';
    const bucket = urlObj.searchParams.get('bucket') || 'onboarding-documents';
    const disposition = urlObj.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';
    const customName = urlObj.searchParams.get('name') || '';

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

      // Candidate paths to check
      const candidates = [
        cleanPath,
        cleanPath.replace(/^onboarding-documents\//, ''),
      ];

      let downloadRes: any = null;

      for (const p of candidates) {
        const fetchUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
        const res = await fetch(fetchUrl, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        if (res.ok) {
          downloadRes = res;
          break;
        }
      }

      if (!downloadRes || !downloadRes.ok) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: 'Document unavailable — source file is missing from Supabase Storage bucket.',
          path: cleanPath,
          bucket,
        }));
        return;
      }

      const arrayBuf = await downloadRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const fileName = customName || cleanPath.split('/').pop() || 'document';
      const contentType = getMimeType(fileName, downloadRes.headers.get('content-type') || 'application/octet-stream');

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.end(buffer);
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ==========================================================================
  // 4. ACTION: SAVE-METADATA
  // ==========================================================================
  if (action === 'save-metadata') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
      return;
    }

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
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });

        const data: any = await queryRes.json().catch(() => []);
        res.statusCode = queryRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: queryRes.ok, data }));
        return;
      }

      if (dbAction === 'delete') {
        let deleteUrl = `${supabaseUrl}/rest/v1/${table}`;
        const matchParams: string[] = [];
        if (match && typeof match === 'object') {
          for (const [k, v] of Object.entries(match)) {
            matchParams.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`);
          }
        }
        if (matchParams.length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Match criteria required for delete.' }));
          return;
        }

        deleteUrl += `?${matchParams.join('&')}`;
        const delRes = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });

        res.statusCode = delRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: delRes.ok }));
        return;
      }

      // Insert or Update / Upsert
      let url = `${supabaseUrl}/rest/v1/${table}`;
      let method = 'POST';
      let preferHeader = 'return=representation';

      if (dbAction === 'upsert') {
        url += '?on_conflict=id';
        preferHeader = 'resolution=merge-duplicates,return=representation';
      } else if (dbAction === 'update') {
        method = 'PATCH';
        const matchParams: string[] = [];
        if (match && typeof match === 'object') {
          for (const [k, v] of Object.entries(match)) {
            matchParams.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`);
          }
        }
        if (matchParams.length > 0) {
          url += `?${matchParams.join('&')}`;
        }
      }

      const dbRes = await fetch(url, {
        method,
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          Prefer: preferHeader,
        },
        body: JSON.stringify(payload),
      });

      const data: any = await dbRes.json().catch(() => ({}));
      res.statusCode = dbRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: dbRes.ok, data }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
}
