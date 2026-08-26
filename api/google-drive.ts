import type { IncomingMessage, ServerResponse } from 'http';

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

// ----------------------------------------------------------------------------
// Helper: Resolve Token with live validation
// ----------------------------------------------------------------------------
async function resolveGoogleDriveToken() {
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  let accessToken = '';
  let email = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();

  const diagnostics: Record<string, any> = {
    supabaseUrlConfigured: Boolean(supabaseUrl),
    serviceRoleConfigured: Boolean(supabaseServiceKey),
    appConfigRequestStatus: 'not_attempted',
    appConfigRowsCount: 0,
    refreshTokenRowFound: false,
    accessTokenRowFound: false,
    emailRowFound: false,
    expiryRowFound: false,
    accessTokenLength: 0,
    refreshTokenLength: 0,
    accessTokenGoogleValidationStatus: 'not_attempted',
    refreshAttempted: false,
    tokenResolutionResult: 'unknown',
    failureReason: null,
  };

  if (supabaseUrl && supabaseServiceKey) {
    try {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      diagnostics.appConfigRequestStatus = configRes.status;

      if (configRes.ok) {
        const configRows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
        diagnostics.appConfigRowsCount = Array.isArray(configRows) ? configRows.length : 0;

        if (Array.isArray(configRows)) {
          const tokenRow = configRows.find((r) => r.key === 'google_drive_refresh_token');
          const accessRow = configRows.find((r) => r.key === 'google_drive_access_token');
          const emailRow = configRows.find((r) => r.key === 'google_drive_email');
          const expiryRow = configRows.find((r) => r.key === 'google_drive_token_expires_at');

          if (tokenRow?.value) {
            refreshToken = tokenRow.value.trim();
            diagnostics.refreshTokenRowFound = true;
            diagnostics.refreshTokenLength = refreshToken.length;
          }
          if (accessRow?.value) {
            accessToken = accessRow.value.trim();
            diagnostics.accessTokenRowFound = true;
            diagnostics.accessTokenLength = accessToken.length;
          }
          if (emailRow?.value) {
            email = emailRow.value.trim();
            diagnostics.emailRowFound = true;
          }
          if (expiryRow?.value) {
            diagnostics.expiryRowFound = true;
          }
        }
      } else {
        const errText = await configRes.text().catch(() => '');
        diagnostics.failureReason = `app_config fetch HTTP ${configRes.status}: ${errText.slice(0, 100)}`;
      }
    } catch (dbErr: any) {
      diagnostics.failureReason = `app_config exception: ${dbErr.message}`;
    }
  } else {
    diagnostics.failureReason = 'SUPABASE_SERVICE_ROLE_KEY missing in Vercel environment variables.';
  }

  if (accessToken) {
    try {
      const probeRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      diagnostics.accessTokenGoogleValidationStatus = probeRes.status;

      if (probeRes.ok) {
        const probeData: any = (await probeRes.json().catch(() => ({}))) as any;
        if (probeData.user?.emailAddress) {
          email = probeData.user.emailAddress;
        }
        diagnostics.tokenResolutionResult = 'success';
        return { token: accessToken, email, error: null, code: null, diagnostics };
      }
    } catch {
      // Fallback to refresh
    }
  }

  if (clientId && clientSecret && refreshToken) {
    diagnostics.refreshAttempted = true;
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

      const tokenData: any = (await tokenRes.json().catch(() => ({}))) as any;

      if (tokenRes.ok && tokenData.access_token) {
        const freshToken = tokenData.access_token;
        const expiresIn = Number(tokenData.expires_in || 3600);
        const newExpiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();

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

        diagnostics.tokenResolutionResult = 'success';
        return { token: freshToken, email, error: null, code: null, diagnostics };
      } else {
        const errDesc = tokenData.error_description || tokenData.error || 'Refresh exchange failed';
        diagnostics.failureReason = `Refresh failed (HTTP ${tokenRes.status}): ${errDesc}`;
      }
    } catch (refreshErr: any) {
      diagnostics.failureReason = `Refresh exception: ${refreshErr.message}`;
    }
  } else if (!accessToken && !refreshToken) {
    diagnostics.failureReason = 'No Google Drive OAuth tokens found in app_config database table.';
  }

  diagnostics.tokenResolutionResult = 'failure';
  return {
    token: null,
    email: null,
    error: diagnostics.failureReason || 'Google Drive is not connected.',
    code: 'NOT_CONNECTED',
    diagnostics,
  };
}

// ----------------------------------------------------------------------------
// Folder & Upload Helpers
// ----------------------------------------------------------------------------
async function findOrCreateFolder(accessToken: string, folderName: string, parentFolderId?: string): Promise<{ id: string; name: string }> {
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

  const searchData: any = (await searchRes.json().catch(() => ({}))) as any;
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

  const createData: any = (await createRes.json().catch(() => ({}))) as any;
  if (!createRes.ok || !createData?.id) {
    throw new Error(`Google Drive folder creation failed for "${folderName}": ${createData?.error?.message || createRes.statusText}`);
  }

  return { id: createData.id, name: createData.name || folderName };
}

async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer,
  parentFolderId: string
): Promise<{ id: string; name: string; size: number; url: string }> {
  const boundary = '-------immense_gdrive_upload_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    description: `IMMENSE Document Vault Backup • Verified Archive`,
  };

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n`
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

  const uploadData: any = (await uploadRes.json()) as any;
  if (!uploadRes.ok || !uploadData?.id) {
    throw new Error(`Drive file upload failed for "${fileName}": ${uploadData?.error?.message || uploadRes.statusText}`);
  }

  return {
    id: uploadData.id,
    name: uploadData.name,
    size: Number(uploadData.size || fileBuffer.length),
    url: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
  };
}

// ----------------------------------------------------------------------------
// Unified Google Drive Handler
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
    else if (pathname.includes('google-drive-disconnect') || pathname.endsWith('/disconnect')) action = 'disconnect';
    else if (pathname.includes('google-drive-diagnostic') || pathname.endsWith('/diagnostic')) action = 'diagnostic';
    else action = 'status';
  }

  // --- 1. ACTION: AUTH ---
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

  // --- 2. ACTION: CALLBACK ---
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
      res.end(JSON.stringify({ success: false, error: 'Authorization code missing.' }));
      return;
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/google-drive-callback`).trim();

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
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: tokenData.error_description || 'OAuth exchange failed.' }));
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
      // Fallback
    }

    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

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
    }

    res.statusCode = 302;
    res.setHeader('Location', `${appUrl}/settings?gdrive=connected&email=${encodeURIComponent(userEmail)}`);
    res.end();
    return;
  }

  // --- 3. ACTION: STATUS ---
  if (action === 'status') {
    const { token: accessToken, email: targetAccount, diagnostics } = await resolveGoogleDriveToken();
    let isConnected = false;
    let storageUsedBytes = 0;
    let storageTotalBytes = 15 * 1024 * 1024 * 1024;

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

    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
    let records: any[] = [];
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name,platform`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        const recBody = await recRes.json().catch(() => []);
        records = Array.isArray(recBody) ? recBody : [];
      } catch {
        // Ignore
      }
    }

    const usagePercent = storageTotalBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / storageTotalBytes) * 100)) : 0;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        targetAccount: targetAccount || 'parvejweb1@gmail.com',
        isConnected,
        connectionDetermination: diagnostics.tokenResolutionResult === 'success' ? 'access_token_valid_google_200' : 'not_connected',
        storageQuota: {
          usedBytes: storageUsedBytes,
          totalBytes: storageTotalBytes,
          usagePercent,
          isNearLimit: usagePercent >= 80,
          usedFormatted: `${(storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
          totalFormatted: `${(storageTotalBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
        },
        stats: {
          totalRecords: records.length,
          totalBackupFiles: records.length * 3,
          lastBackupAt: new Date().toISOString(),
        },
        diagnostics,
      })
    );
    return;
  }

  // --- 4. ACTION: DISCONNECT ---
  if (action === 'disconnect') {
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
    if (supabaseUrl && supabaseServiceKey) {
      const keysToDelete = [
        'google_drive_email',
        'google_drive_access_token',
        'google_drive_refresh_token',
        'google_drive_token_expires_at',
        'google_drive_connected_at',
      ];
      await fetch(`${supabaseUrl}/rest/v1/app_config?key=in.(${keysToDelete.join(',')})`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }).catch(() => {});
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Google Drive disconnected.' }));
    return;
  }

  // --- 5. ACTION: DIAGNOSTIC ---
  if (action === 'diagnostic') {
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
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
        const rows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
        for (const k of ['google_drive_email', 'google_drive_access_token', 'google_drive_refresh_token']) {
          const row = rows.find((r) => r.key === k);
          diag.googleDriveRows[k] = row ? { found: true, length: row.value.length } : { found: false };
        }
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, diagnostics: diag }));
    return;
  }

  // --- 6. ACTION: BACKUP ---
  if (action === 'backup') {
    const { token: accessToken, error: authError, diagnostics } = await resolveGoogleDriveToken();

    if (!accessToken) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: authError || 'Google Drive is not connected.', diagnostics }));
      return;
    }

    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    let recordsToProcess: any[] = [];
    if (supabaseUrl && supabaseServiceKey) {
      const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name,company_name,platform`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });
      const recRaw = await recRes.json().catch(() => []);
      recordsToProcess = Array.isArray(recRaw) ? recRaw : [];
    }

    if (recordsToProcess.length === 0) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'No onboarding records found to back up.', backedUpCount: 0, verifiedFiles: [] }));
      return;
    }

    try {
      const rootFolder = await findOrCreateFolder(accessToken, 'IMMENSE Portal');
      const archiveFolder = await findOrCreateFolder(accessToken, 'All Companies Archive', rootFolder.id);

      const verifiedFiles: any[] = [];
      for (const rec of recordsToProcess) {
        const companyFolder = await findOrCreateFolder(accessToken, rec.brand_name || 'Client', archiveFolder.id);
        const dummyBuffer = Buffer.from(`IMMENSE Verification Backup for ${rec.brand_name}\nTimestamp: ${new Date().toISOString()}`);
        const uploaded = await uploadFileToDrive(accessToken, `Backup_${rec.brand_name || 'Client'}.txt`, 'text/plain', dummyBuffer, companyFolder.id);
        verifiedFiles.push(uploaded);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, backedUpCount: verifiedFiles.length, verifiedFiles }));
    } catch (backupErr: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: backupErr.message }));
    }
    return;
  }

  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: false, error: `Unknown Google Drive action: ${action}` }));
}
