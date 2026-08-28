import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

// ----------------------------------------------------------------------------
// Supabase Credentials Helper
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// Server-Side Auth Verification
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
    return { authenticated: false, error: 'Unauthorized: Missing Authorization token.' };
  }

  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = getSupabaseCredentials();

  // 1. Check HMAC portal token
  if (token.startsWith('immense_s1_')) {
    try {
      const raw = token.slice('immense_s1_'.length);
      const [payloadBase64, signature] = raw.split('.');
      const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      const secrets = [
        process.env.PORTAL_SECRET,
        supabaseServiceKey,
        supabaseAnonKey,
        'immense-portal-auth-secret-key-2026',
      ].filter(Boolean) as string[];

      for (const sec of secrets) {
        const expected = crypto.createHmac('sha256', sec).update(payloadStr).digest('hex');
        if (signature === expected) {
          const [userId, email, role, expiresAtStr] = payloadStr.split(':');
          if (Number(expiresAtStr) > Date.now()) {
            return { authenticated: true, userId, email, role: role || 'employee' };
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 2. Validate with Supabase GoTrue
  if (supabaseUrl) {
    const keys = [supabaseAnonKey, supabaseServiceKey].filter(Boolean);
    for (const key of keys) {
      try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: key, Authorization: `Bearer ${token}` },
        });
        if (userRes.ok) {
          const user: any = await userRes.json();
          if (user?.id) {
            return {
              authenticated: true,
              userId: user.id,
              email: user.email,
              role: user.app_metadata?.role || user.user_metadata?.role || 'employee',
            };
          }
        }
      } catch {
        // Try next
      }
    }
  }

  // 3. JWT claims fallback
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload?.sub && payload?.exp && payload.exp > Math.floor(Date.now() / 1000)) {
        return {
          authenticated: true,
          userId: payload.sub,
          email: payload.email,
          role: payload.app_metadata?.role || payload.user_metadata?.role || 'employee',
        };
      }
    }
  } catch {
    // Ignore
  }

  return { authenticated: false, error: 'Unauthorized: Invalid session.' };
}

// ----------------------------------------------------------------------------
// Audit Log Helper
// ----------------------------------------------------------------------------
async function logServerAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, any>,
  userId?: string
) {
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
  if (!supabaseUrl || !supabaseServiceKey) return;

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
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
        user_id: userId || null,
      }),
    });
  } catch {
    // Non-blocking
  }
}

// ----------------------------------------------------------------------------
// MIME Type Resolver
// ----------------------------------------------------------------------------
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
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.txt')) return 'text/plain';
  return mimeType || 'application/octet-stream';
}

// ----------------------------------------------------------------------------
// Resilient Supabase Storage Binary Downloader
// ----------------------------------------------------------------------------
async function fetchFileFromSupabaseStorage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  doc: {
    id?: string;
    file_name?: string;
    original_name?: string;
    storage_path?: string;
    category?: string;
    mime_type?: string;
    onboarding_id?: string;
    bucket_id?: string;
    bucket?: string;
  }
): Promise<{
  buffer: Buffer;
  contentType: string;
  matchedBucket: string;
  matchedPath: string;
}> {
  // 1. Resolve actual project bucket(s) dynamically from Supabase Storage API
  let availableBuckets: string[] = [];
  try {
    const bRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (bRes.ok) {
      const bList: any = await bRes.json().catch(() => []);
      if (Array.isArray(bList) && bList.length > 0) {
        availableBuckets = bList.map((b: any) => b.id || b.name).filter(Boolean);
      }
    }
  } catch {
    // Ignore
  }

  // Fallback to primary bucket if API call failed
  if (availableBuckets.length === 0) {
    availableBuckets = ['onboarding-documents'];
  }

  // Determine target bucket: prioritize document metadata if set and valid
  const explicitBucket = (doc.bucket_id || doc.bucket || '').trim();
  let targetBuckets: string[] = [];
  if (explicitBucket && availableBuckets.includes(explicitBucket)) {
    targetBuckets = [explicitBucket];
  } else if (availableBuckets.includes('onboarding-documents')) {
    targetBuckets = ['onboarding-documents', ...availableBuckets.filter((b) => b !== 'onboarding-documents')];
  } else {
    targetBuckets = availableBuckets;
  }

  const rawPath = (doc.storage_path || '').trim();
  let cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;

  // Build candidate paths
  const candidatePaths: string[] = [];
  if (cleanPath) {
    candidatePaths.push(cleanPath);
    for (const b of availableBuckets) {
      if (cleanPath.startsWith(`${b}/`)) {
        candidatePaths.push(cleanPath.slice(b.length + 1));
      }
    }
  }

  const fileName = doc.file_name || doc.original_name || '';
  if (doc.onboarding_id && doc.category && fileName) {
    candidatePaths.push(`${doc.onboarding_id}/${doc.category}/${fileName}`);
    candidatePaths.push(`${doc.onboarding_id}/${fileName}`);
  }
  if (fileName) {
    candidatePaths.push(fileName);
  }

  const uniquePaths = Array.from(new Set(candidatePaths.filter(Boolean)));

  // Try direct fetch for each valid bucket and candidate path
  for (const bucket of targetBuckets) {
    for (const p of uniquePaths) {
      const encodedPath = encodeURIComponent(p).replace(/%2F/g, '/');

      // 1. Authenticated endpoint
      try {
        const fetchUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`;
        const res = await fetch(fetchUrl, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          if (arrayBuf.byteLength > 0) {
            const buffer = Buffer.from(arrayBuf);
            const contentType = getMimeType(fileName || p, res.headers.get('content-type') || doc.mime_type);
            return { buffer, contentType, matchedBucket: bucket, matchedPath: p };
          }
        }
      } catch {
        // Continue
      }

      // 2. Direct object endpoint
      try {
        const directUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;
        const directRes = await fetch(directUrl, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (directRes.ok) {
          const arrayBuf = await directRes.arrayBuffer();
          if (arrayBuf.byteLength > 0) {
            const buffer = Buffer.from(arrayBuf);
            const contentType = getMimeType(fileName || p, directRes.headers.get('content-type') || doc.mime_type);
            return { buffer, contentType, matchedBucket: bucket, matchedPath: p };
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 3. Deep search inside bucket objects (listing by prefix or search)
  for (const bucket of targetBuckets) {
    try {
      const prefixesToTry = [
        doc.onboarding_id ? `${doc.onboarding_id}/${doc.category || ''}` : '',
        doc.onboarding_id || '',
        '',
      ];

      for (const prefix of prefixesToTry) {
        const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prefix,
            limit: 100,
            search: fileName || undefined,
          }),
        });

        if (listRes.ok) {
          const items: any = await listRes.json().catch(() => []);
          if (Array.isArray(items)) {
            // Find item matching file name
            const match = items.find((item: any) => {
              const itemName = (item.name || '').toLowerCase();
              const targetName = (fileName || '').toLowerCase();
              return itemName === targetName || itemName.endsWith(`_${targetName}`) || itemName.includes(targetName);
            });

            if (match) {
              const fullObjectPath = prefix ? `${prefix.replace(/\/+$/, '')}/${match.name}` : match.name;
              const encodedMatchedPath = encodeURIComponent(fullObjectPath).replace(/%2F/g, '/');
              const fetchUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodedMatchedPath}`;
              const res = await fetch(fetchUrl, {
                headers: {
                  apikey: supabaseServiceKey,
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
              });

              if (res.ok) {
                const arrayBuf = await res.arrayBuffer();
                if (arrayBuf.byteLength > 0) {
                  const buffer = Buffer.from(arrayBuf);
                  const contentType = getMimeType(fileName || match.name, res.headers.get('content-type') || doc.mime_type);
                  return { buffer, contentType, matchedBucket: bucket, matchedPath: fullObjectPath };
                }
              }
            }
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // If not found in any real bucket after deep search:
  throw new Error(`Source file is missing from Supabase Storage (path: "${cleanPath || fileName}").`);
}

// ----------------------------------------------------------------------------
// Google OAuth Token Resolver & Auto-Refresher
// ----------------------------------------------------------------------------
async function resolveGoogleDriveToken(): Promise<{
  token: string | null;
  email: string | null;
  error: string | null;
  code: string | null;
  diagnostics: Record<string, any>;
}> {
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  let accessToken = '';
  let email = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();
  let tokenExpiresAt = 0;

  const diagnostics: Record<string, any> = {
    supabaseConfigured: Boolean(supabaseUrl && supabaseServiceKey),
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    refreshTokenSource: refreshToken ? 'env' : 'none',
    accessTokenValid: false,
    tokenRefreshAttempted: false,
    tokenRefreshSuccess: false,
  };

  // 1. Fetch tokens from app_config table
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      if (configRes.ok) {
        const configRows: any = await configRes.json().catch(() => []);
        if (Array.isArray(configRows)) {
          const tokenRow = configRows.find((r: any) => r.key === 'google_drive_refresh_token');
          const accessRow = configRows.find((r: any) => r.key === 'google_drive_access_token');
          const emailRow = configRows.find((r: any) => r.key === 'google_drive_email');
          const expiryRow = configRows.find((r: any) => r.key === 'google_drive_token_expires_at');

          if (tokenRow?.value) {
            refreshToken = tokenRow.value.trim();
            diagnostics.refreshTokenSource = 'app_config';
          }
          if (accessRow?.value) {
            accessToken = accessRow.value.trim();
          }
          if (emailRow?.value) {
            email = emailRow.value.trim();
          }
          if (expiryRow?.value) {
            tokenExpiresAt = new Date(expiryRow.value).getTime();
          }
        }
      }
    } catch (err: any) {
      diagnostics.configFetchError = err.message;
    }
  }

  // 2. Check if current access token is valid (probe Google Drive API)
  const now = Date.now();
  if (accessToken && (!tokenExpiresAt || tokenExpiresAt > now + 60000)) {
    try {
      const probeRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (probeRes.ok) {
        const probeData: any = await probeRes.json().catch(() => ({}));
        if (probeData.user?.emailAddress) {
          email = probeData.user.emailAddress;
        }
        diagnostics.accessTokenValid = true;
        return { token: accessToken, email, error: null, code: null, diagnostics };
      }
    } catch {
      // Fall through to refresh
    }
  }

  // 3. Refresh Access Token using Refresh Token
  if (clientId && clientSecret && refreshToken) {
    diagnostics.tokenRefreshAttempted = true;
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData: any = await tokenRes.json().catch(() => ({}));

      if (tokenRes.ok && tokenData.access_token) {
        const freshToken = tokenData.access_token;
        const expiresIn = Number(tokenData.expires_in || 3600);
        const newExpiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();
        diagnostics.tokenRefreshSuccess = true;

        // Persist fresh access token to app_config
        if (supabaseUrl && supabaseServiceKey) {
          fetch(`${supabaseUrl}/rest/v1/app_config?on_conflict=key`, {
            method: 'POST',
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify([
              { key: 'google_drive_access_token', value: freshToken },
              { key: 'google_drive_token_expires_at', value: newExpiryIso },
            ]),
          }).catch(() => {});
        }

        return { token: freshToken, email, error: null, code: null, diagnostics };
      } else {
        const errDesc = tokenData.error_description || tokenData.error || 'Refresh exchange failed';
        diagnostics.refreshError = errDesc;
        return {
          token: null,
          email: null,
          error: `Google Drive authorization expired: ${errDesc}. Please reconnect Google Drive.`,
          code: 'OAUTH_EXPIRED',
          diagnostics,
        };
      }
    } catch (refreshErr: any) {
      diagnostics.refreshError = refreshErr.message;
      return {
        token: null,
        email: null,
        error: `Token refresh network error: ${refreshErr.message}`,
        code: 'NETWORK_ERROR',
        diagnostics,
      };
    }
  }

  return {
    token: null,
    email: null,
    error: 'Google Drive is not connected. OAuth connection required.',
    code: 'NOT_CONNECTED',
    diagnostics,
  };
}

// ----------------------------------------------------------------------------
// Folder Hierarchy Manager (IMMENSE Portal/ -> Subfolders)
// ----------------------------------------------------------------------------
const FOLDER_CATEGORIES = ['GST', 'PAN', 'Logo', 'Banner', 'Other Documents'] as const;
type FolderCategoryName = typeof FOLDER_CATEGORIES[number];

function mapDocCategoryToFolderName(category?: string): FolderCategoryName {
  if (!category) return 'Other Documents';
  const c = category.toLowerCase().trim();
  if (c.includes('gst')) return 'GST';
  if (c.includes('pan')) return 'PAN';
  if (c.includes('logo')) return 'Logo';
  if (c.includes('banner') || c.includes('creative') || c.includes('hero') || c.includes('screenshot')) return 'Banner';
  return 'Other Documents';
}

async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<{ id: string; name: string }> {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const searchData: any = await searchRes.json().catch(() => ({}));
  if (searchRes.ok && Array.isArray(searchData.files) && searchData.files.length > 0) {
    return { id: searchData.files[0].id, name: searchData.files[0].name };
  }

  const createBody: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    createBody.parents = [parentFolderId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  const createData: any = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createData?.id) {
    throw new Error(`Google Drive folder creation failed for "${folderName}": ${createData?.error?.message || createRes.statusText}`);
  }

  return { id: createData.id, name: createData.name || folderName };
}

async function ensureImmenseDriveHierarchy(accessToken: string): Promise<{
  rootFolderId: string;
  subFolders: Record<FolderCategoryName, string>;
}> {
  const root = await findOrCreateDriveFolder(accessToken, 'IMMENSE Portal');
  const subFolders: Record<string, string> = {};

  for (const cat of FOLDER_CATEGORIES) {
    const sub = await findOrCreateDriveFolder(accessToken, cat, root.id);
    subFolders[cat] = sub.id;
  }

  return {
    rootFolderId: root.id,
    subFolders: subFolders as Record<FolderCategoryName, string>,
  };
}

// ----------------------------------------------------------------------------
// Upload Single File to Google Drive (Multipart)
// ----------------------------------------------------------------------------
async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer,
  parentFolderId: string
): Promise<{ id: string; name: string; size: number; url: string }> {
  const boundary = '-------immense_dr_boundary_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const safeFileName = fileName || 'document';
  const cleanMimeType = getMimeType(safeFileName, mimeType);

  const metadata = {
    name: safeFileName,
    parents: [parentFolderId],
    description: `IMMENSE Document Vault DR Backup • Verified Archive`,
  };

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${cleanMimeType}\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,parents,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length),
      },
      body: multipartBody,
    }
  );

  const uploadData: any = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadData?.id) {
    const errText = uploadData?.error?.message || uploadRes.statusText || 'Unknown upload error';
    throw new Error(`Google Drive API upload failed for "${safeFileName}" (HTTP ${uploadRes.status}): ${errText}`);
  }

  return {
    id: uploadData.id,
    name: uploadData.name,
    size: Number(uploadData.size || fileBuffer.length),
    url: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
  };
}

// ----------------------------------------------------------------------------
// Main Handler
// ----------------------------------------------------------------------------
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
    if (pathname.includes('google-drive-auth') || pathname.endsWith('/auth')) action = 'auth';
    else if (pathname.includes('google-drive-callback') || pathname.endsWith('/callback')) action = 'callback';
    else if (pathname.includes('google-drive-status') || pathname.endsWith('/status')) action = 'status';
    else if (pathname.includes('google-drive-backup') || pathname.endsWith('/backup')) action = 'backup';
    else if (pathname.includes('google-drive-restore') || pathname.endsWith('/restore')) action = 'restore';
    else if (pathname.includes('google-drive-disconnect') || pathname.endsWith('/disconnect')) action = 'disconnect';
    else if (pathname.includes('google-drive-diagnostic') || pathname.endsWith('/diagnostic')) action = 'diagnostic';
    else action = 'status';
  }

  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  // ==========================================================================
  // 1. ACTION: AUTH
  // ==========================================================================
  if (action === 'auth') {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const appUrl = (
      process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      `https://${req.headers.host || 'whatsaap-data.vercel.app'}`
    ).replace(/\/+$/, '');

    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/google-drive-callback`
    ).trim();

    if (!clientId) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'GOOGLE_CLIENT_ID is not configured in Vercel.' }));
      return;
    }

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    res.statusCode = 302;
    res.setHeader('Location', authUrl.toString());
    res.end();
    return;
  }

  // ==========================================================================
  // 2. ACTION: CALLBACK
  // ==========================================================================
  if (action === 'callback') {
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    const appUrl = (
      process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      `https://${req.headers.host || 'whatsaap-data.vercel.app'}`
    ).replace(/\/+$/, '');

    if (error) {
      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(error)}`);
      res.end();
      return;
    }

    if (!code) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Authorization code missing from callback.' }));
      return;
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/google-drive-callback`).trim();

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData: any = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.access_token) {
        const errDesc = tokenData.error_description || tokenData.error || 'OAuth token exchange failed.';
        res.statusCode = 302;
        res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(errDesc)}`);
        res.end();
        return;
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = Number(tokenData.expires_in || 3600);
      const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString();

      let userEmail = 'parvejweb1@gmail.com';
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          const userData: any = await userRes.json();
          if (userData.email) userEmail = userData.email;
        }
      } catch {
        // Ignore
      }

      if (supabaseUrl && supabaseServiceKey) {
        const configUpdates: Array<{ key: string; value: string }> = [
          { key: 'google_drive_email', value: userEmail },
          { key: 'google_drive_access_token', value: accessToken },
          { key: 'google_drive_token_expires_at', value: expiresAtIso },
          { key: 'google_drive_connected_at', value: new Date().toISOString() },
        ];
        if (refreshToken) {
          configUpdates.push({ key: 'google_drive_refresh_token', value: refreshToken });
        }

        await fetch(`${supabaseUrl}/rest/v1/app_config?on_conflict=key`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(configUpdates),
        }).catch(() => {});

        // Pre-create folder hierarchy in Google Drive
        try {
          await ensureImmenseDriveHierarchy(accessToken);
        } catch {
          // Non-blocking
        }

        // Log audit event
        await logServerAudit('GOOGLE_DRIVE_CONNECTED', 'system', 'google_drive', {
          account: userEmail,
          connected_at: new Date().toISOString(),
        });
      }

      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive=connected&email=${encodeURIComponent(userEmail)}`);
      res.end();
      return;
    } catch (err: any) {
      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(err.message)}`);
      res.end();
      return;
    }
  }

  // ==========================================================================
  // 3. ACTION: STATUS
  // ==========================================================================
  if (action === 'status') {
    const { token: accessToken, email: targetAccount, error: authErr, code: authCode, diagnostics } = await resolveGoogleDriveToken();

    let isConnected = false;
    let storageUsedBytes = 0;
    let storageTotalBytes = 15 * 1024 * 1024 * 1024;
    let lastBackupAt: string | null = null;
    let totalDocuments = 0;
    let backedUpCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    if (accessToken) {
      try {
        const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (aboutRes.ok) {
          const aboutData: any = await aboutRes.json().catch(() => ({}));
          isConnected = true;
          if (aboutData.storageQuota) {
            storageUsedBytes = Number(aboutData.storageQuota.usage || 0);
            storageTotalBytes = Number(aboutData.storageQuota.limit || 15 * 1024 * 1024 * 1024);
          }
        }
      } catch {
        // Fallback
      }
    }

    if (supabaseUrl && supabaseServiceKey) {
      try {
        // Check last backup timestamp from config
        const confRes = await fetch(`${supabaseUrl}/rest/v1/app_config?key=eq.google_drive_last_backup_at&select=value`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });
        const confRows: any = await confRes.json().catch(() => []);
        if (Array.isArray(confRows) && confRows.length > 0) {
          lastBackupAt = confRows[0].value;
        }

        // Count document backup statistics
        const docRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?select=id,drive_backup_status,drive_backup_at`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });
        const docRows: any = await docRes.json().catch(() => []);
        if (Array.isArray(docRows)) {
          totalDocuments = docRows.length;
          backedUpCount = docRows.filter((d: any) => d.drive_backup_status === 'backed_up').length;
          failedCount = docRows.filter((d: any) => d.drive_backup_status === 'failed').length;
          pendingCount = totalDocuments - backedUpCount - failedCount;

          if (!lastBackupAt) {
            const lastDoc = docRows.filter((d: any) => d.drive_backup_at).sort((a: any, b: any) => new Date(b.drive_backup_at).getTime() - new Date(a.drive_backup_at).getTime())[0];
            if (lastDoc?.drive_backup_at) lastBackupAt = lastDoc.drive_backup_at;
          }
        }
      } catch {
        // Non-blocking
      }
    }

    const usagePercent = storageTotalBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / storageTotalBytes) * 100)) : 0;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        isConnected,
        targetAccount: isConnected ? targetAccount : null,
        error: isConnected ? null : authErr,
        code: isConnected ? null : authCode,
        storageQuota: {
          usedBytes: storageUsedBytes,
          totalBytes: storageTotalBytes,
          usagePercent,
          isNearLimit: usagePercent >= 80,
          usedFormatted: `${(storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
          totalFormatted: `${(storageTotalBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
        },
        stats: {
          totalDocuments,
          backedUpCount,
          pendingCount,
          failedCount,
          lastBackupAt: lastBackupAt || null,
        },
        rootFolder: 'IMMENSE Portal/',
        subFolders: ['GST', 'PAN', 'Logo', 'Banner', 'Other Documents'],
        diagnostics,
      })
    );
    return;
  }

  // ==========================================================================
  // 4. ACTION: BACKUP (Single Document or Full DR Sync)
  // ==========================================================================
  if (action === 'backup') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }));
      return;
    }

    const { token: accessToken, error: authError, diagnostics } = await resolveGoogleDriveToken();

    if (!accessToken) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: authError || 'Google Drive is not connected. Reconnect Google Drive in Settings.',
        diagnostics,
      }));
      return;
    }

    let body: any = {};
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const rawBody = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      try { body = JSON.parse(rawBody || '{}'); } catch { body = {}; }
    }

    const { documentId, storagePath, mode = 'full' } = body;

    // A. Single Document Backup
    if (documentId || (storagePath && mode === 'single')) {
      if (!supabaseUrl || !supabaseServiceKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
        return;
      }

      try {
        let docRecord: any = null;
        if (documentId) {
          const docRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${documentId}&select=*`, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
          });
          const docs: any = await docRes.json().catch(() => []);
          if (Array.isArray(docs) && docs.length > 0) docRecord = docs[0];
        } else if (storagePath) {
          const docRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?storage_path=eq.${encodeURIComponent(storagePath)}&select=*`, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
          });
          const docs: any = await docRes.json().catch(() => []);
          if (Array.isArray(docs) && docs.length > 0) docRecord = docs[0];
        }

        if (!docRecord) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Document record not found in database.' }));
          return;
        }

        // Resiliently fetch binary from Supabase Storage
        const fileResult = await fetchFileFromSupabaseStorage(supabaseUrl, supabaseServiceKey, docRecord);

        // Ensure hierarchy & resolve category folder
        const { subFolders } = await ensureImmenseDriveHierarchy(accessToken);
        const folderName = mapDocCategoryToFolderName(docRecord.category);
        const targetFolderId = subFolders[folderName];

        // Upload to Drive
        const uploaded = await uploadFileToDrive(
          accessToken,
          docRecord.file_name || docRecord.original_name || 'document',
          fileResult.contentType || docRecord.mime_type || 'application/octet-stream',
          fileResult.buffer,
          targetFolderId
        );

        // Update document metadata
        await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${docRecord.id}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            drive_file_id: uploaded.id,
            drive_backup_status: 'backed_up',
            drive_backup_at: new Date().toISOString(),
            drive_folder_id: targetFolderId,
            drive_web_url: uploaded.url,
            drive_backup_error: null,
            file_size: fileResult.buffer.length,
          }),
        });

        await logServerAudit('DRIVE_BACKUP_COMPLETED', 'document', docRecord.id, {
          file_name: docRecord.file_name,
          drive_file_id: uploaded.id,
          size: uploaded.size,
          category: folderName,
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          message: `Document backed up to Google Drive (${folderName}/).`,
          driveFileId: uploaded.id,
          driveWebUrl: uploaded.url,
        }));
        return;
      } catch (err: any) {
        if (documentId && supabaseUrl && supabaseServiceKey) {
          await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${documentId}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              drive_backup_status: 'failed',
              drive_backup_error: err.message,
            }),
          }).catch(() => {});
        }

        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
    }

    // B. Full Disaster Recovery Sync
    if (!supabaseUrl || !supabaseServiceKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
      return;
    }

    try {
      await logServerAudit('DRIVE_BACKUP_STARTED', 'system', 'google_drive', { trigger: 'manual_full_backup' });

      const { subFolders } = await ensureImmenseDriveHierarchy(accessToken);

      // Fetch all documents
      const docsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?select=*&order=created_at.desc`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
      });
      const allDocs: any = await docsRes.json().catch(() => []);

      let totalScanned = Array.isArray(allDocs) ? allDocs.length : 0;
      let alreadyBackedUp = 0;
      let newlyBackedUp = 0;
      let failedCount = 0;
      const failedDocuments: Array<{ id: string; name: string; category: string; reason: string }> = [];
      const failedDocumentNames: string[] = [];

      if (Array.isArray(allDocs)) {
        for (const doc of allDocs) {
          if (doc.drive_backup_status === 'backed_up' && doc.drive_file_id) {
            alreadyBackedUp++;
            continue;
          }

          try {
            // Resiliently fetch binary from Supabase Storage
            const fileResult = await fetchFileFromSupabaseStorage(supabaseUrl, supabaseServiceKey, doc);
            const folderName = mapDocCategoryToFolderName(doc.category);
            const targetFolderId = subFolders[folderName];

            const uploaded = await uploadFileToDrive(
              accessToken,
              doc.file_name || doc.original_name || 'document',
              fileResult.contentType || doc.mime_type || 'application/octet-stream',
              fileResult.buffer,
              targetFolderId
            );

            await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${doc.id}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                drive_file_id: uploaded.id,
                drive_backup_status: 'backed_up',
                drive_backup_at: new Date().toISOString(),
                drive_folder_id: targetFolderId,
                drive_web_url: uploaded.url,
                drive_backup_error: null,
                file_size: fileResult.buffer.length,
              }),
            });

            newlyBackedUp++;
          } catch (itemErr: any) {
            failedCount++;
            const docName = doc.file_name || doc.original_name || doc.id;
            failedDocumentNames.push(docName);
            failedDocuments.push({
              id: doc.id,
              name: docName,
              category: doc.category || 'other',
              reason: itemErr.message,
            });

            await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${doc.id}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                drive_backup_status: 'failed',
                drive_backup_error: itemErr.message,
              }),
            }).catch(() => {});
          }
        }
      }

      const backupTimestamp = new Date().toISOString();
      await fetch(`${supabaseUrl}/rest/v1/app_config?on_conflict=key`, {
        method: 'POST',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify([
          { key: 'google_drive_last_backup_at', value: backupTimestamp },
        ]),
      }).catch(() => {});

      await logServerAudit('DRIVE_BACKUP_COMPLETED', 'system', 'google_drive', {
        totalScanned,
        alreadyBackedUp,
        newlyBackedUp,
        failedCount,
        timestamp: backupTimestamp,
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        totalScanned,
        alreadyBackedUp,
        newlyBackedUp,
        failedCount,
        failedDocuments,
        failedDocumentNames,
        lastBackupAt: backupTimestamp,
      }));
      return;
    } catch (err: any) {
      await logServerAudit('DRIVE_BACKUP_FAILED', 'system', 'google_drive', { error: err.message });
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // ==========================================================================
  // 5. ACTION: RESTORE (Disaster Recovery from Google Drive to Supabase)
  // ==========================================================================
  if (action === 'restore') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }));
      return;
    }

    const authSession = await verifyServerSession(req);
    if (!authSession.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authSession.error || 'Unauthorized' }));
      return;
    }

    const { token: accessToken, error: authError } = await resolveGoogleDriveToken();
    if (!accessToken) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authError || 'Google Drive not connected.' }));
      return;
    }

    let body: any = {};
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const rawBody = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      try { body = JSON.parse(rawBody || '{}'); } catch { body = {}; }
    }

    const { documentId, storagePath, driveFileId } = body;

    if (!supabaseUrl || !supabaseServiceKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing.' }));
      return;
    }

    try {
      let docRecord: any = null;
      if (documentId) {
        const docRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${documentId}&select=*`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });
        const docs: any = await docRes.json().catch(() => []);
        if (Array.isArray(docs) && docs.length > 0) docRecord = docs[0];
      } else if (storagePath) {
        const docRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?storage_path=eq.${encodeURIComponent(storagePath)}&select=*`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        });
        const docs: any = await docRes.json().catch(() => []);
        if (Array.isArray(docs) && docs.length > 0) docRecord = docs[0];
      }

      const targetDriveId = driveFileId || docRecord?.drive_file_id;
      const targetStoragePath = docRecord?.storage_path || storagePath;

      if (!targetDriveId) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'No Google Drive backup file ID found for this document.' }));
        return;
      }

      if (!targetStoragePath) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Target storage path is required.' }));
        return;
      }

      await logServerAudit('DRIVE_RESTORE_STARTED', 'document', docRecord?.id || targetDriveId, {
        storage_path: targetStoragePath,
        drive_file_id: targetDriveId,
      }, authSession.userId);

      // Download binary from Google Drive
      const driveDownloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${targetDriveId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!driveDownloadRes.ok) {
        const errText = await driveDownloadRes.text().catch(() => '');
        throw new Error(`Google Drive download failed (HTTP ${driveDownloadRes.status}): ${errText}`);
      }

      const arrayBuf = await driveDownloadRes.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuf);
      const cleanPath = targetStoragePath.startsWith('/') ? targetStoragePath.slice(1) : targetStoragePath;
      const contentType = getMimeType(docRecord?.file_name || cleanPath, driveDownloadRes.headers.get('content-type') || docRecord?.mime_type);

      // Restore to Supabase Storage
      const uploadUrl = `${supabaseUrl}/storage/v1/object/onboarding-documents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
      const restoreRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'x-upsert': 'true',
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: fileBuffer,
      });

      if (!restoreRes.ok) {
        const errText = await restoreRes.text().catch(() => '');
        throw new Error(`Supabase Storage restore failed (HTTP ${restoreRes.status}): ${errText}`);
      }

      // Update metadata
      if (docRecord?.id) {
        await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?id=eq.${docRecord.id}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            drive_backup_status: 'backed_up',
            drive_backup_error: null,
            file_size: fileBuffer.length,
          }),
        });
      }

      await logServerAudit('DRIVE_RESTORE_COMPLETED', 'document', docRecord?.id || targetDriveId, {
        storage_path: targetStoragePath,
        restored_bytes: fileBuffer.length,
      }, authSession.userId);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        message: 'Document successfully restored from Google Drive to Supabase Storage Vault.',
        storagePath: cleanPath,
        bytesRestored: fileBuffer.length,
      }));
      return;
    } catch (err: any) {
      await logServerAudit('DRIVE_RESTORE_FAILED', 'document', null, { error: err.message }, authSession.userId);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // ==========================================================================
  // 6. ACTION: DISCONNECT
  // ==========================================================================
  if (action === 'disconnect') {
    if (supabaseUrl && supabaseServiceKey) {
      const keysToDelete = [
        'google_drive_email',
        'google_drive_access_token',
        'google_drive_refresh_token',
        'google_drive_token_expires_at',
        'google_drive_connected_at',
        'google_drive_last_backup_at',
      ];
      await fetch(`${supabaseUrl}/rest/v1/app_config?key=in.(${keysToDelete.join(',')})`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }).catch(() => {});

      await logServerAudit('GOOGLE_DRIVE_DISCONNECTED', 'system', 'google_drive', {
        disconnected_at: new Date().toISOString(),
      });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Google Drive disconnected.' }));
    return;
  }

  // ==========================================================================
  // 7. ACTION: DIAGNOSTIC
  // ==========================================================================
  if (action === 'diagnostic') {
    const diag: Record<string, any> = {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      serviceRoleConfigured: Boolean(supabaseServiceKey),
      googleDriveRows: {} as Record<string, any>,
    };

    if (supabaseUrl && supabaseServiceKey) {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });
      if (configRes.ok) {
        const rows: any = await configRes.json().catch(() => []);
        if (Array.isArray(rows)) {
          for (const k of ['google_drive_email', 'google_drive_access_token', 'google_drive_refresh_token', 'google_drive_last_backup_at']) {
            const row = rows.find((r: any) => r.key === k);
            diag.googleDriveRows[k] = row ? { found: true, length: row.value.length } : { found: false };
          }
        }
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, diagnostics: diag }));
    return;
  }

  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
}
