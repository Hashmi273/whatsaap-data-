import type { IncomingMessage, ServerResponse } from 'http';

// Helper: Get Supabase Credentials
function getSupabaseCredentials() {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ztrskyefkugevypzfecl.supabase.co'
  ).replace(/\/+$/, '');

  const supabaseServiceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_KEY ||
    ''
  ).trim();

  return { supabaseUrl, supabaseServiceKey };
}

// Helper: Resolve Google Drive OAuth Token reliably
async function resolveGoogleDriveToken(): Promise<{
  token: string | null;
  email: string;
  error?: string;
  code?: string;
  diagnostics: {
    supabaseUrlConfigured: boolean;
    serviceRoleConfigured: boolean;
    appConfigRequestStatus: number | string;
    appConfigRowsCount: number;
    refreshTokenRowFound: boolean;
    accessTokenRowFound: boolean;
    emailRowFound: boolean;
    expiryRowFound: boolean;
    accessTokenLength: number;
    refreshTokenLength: number;
    accessTokenGoogleValidationStatus: number | string;
    refreshAttempted: boolean;
    refreshResponseStatus: number | string;
    tokenResolutionResult: 'success' | 'failure';
    failureReason: string;
  };
}> {
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  let accessToken = '';
  let tokenExpiryIso = '';
  let userEmail = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();

  const diagnostics = {
    supabaseUrlConfigured: Boolean(supabaseUrl),
    serviceRoleConfigured: Boolean(supabaseServiceKey),
    appConfigRequestStatus: 'not_attempted' as number | string,
    appConfigRowsCount: 0,
    refreshTokenRowFound: false,
    accessTokenRowFound: false,
    emailRowFound: false,
    expiryRowFound: false,
    accessTokenLength: 0,
    refreshTokenLength: refreshToken.length,
    accessTokenGoogleValidationStatus: 'not_attempted' as number | string,
    refreshAttempted: false,
    refreshResponseStatus: 'not_attempted' as number | string,
    tokenResolutionResult: 'failure' as 'success' | 'failure',
    failureReason: 'uninitialized',
  };

  // 1. Read app_config from PostgreSQL
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
            userEmail = emailRow.value.trim();
            diagnostics.emailRowFound = true;
          }
          if (expiryRow?.value) {
            tokenExpiryIso = expiryRow.value.trim();
            diagnostics.expiryRowFound = true;
          }
        }
      } else {
        const errText = await configRes.text().catch(() => '');
        diagnostics.failureReason = `app_config request failed with HTTP ${configRes.status}: ${errText.slice(0, 100)}`;
      }
    } catch (dbErr: any) {
      diagnostics.appConfigRequestStatus = 'network_error';
      diagnostics.failureReason = `app_config query network error: ${dbErr.message}`;
    }
  } else {
    diagnostics.failureReason = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment.';
  }

  // 2. If access token exists, probe Google Drive API
  if (accessToken) {
    try {
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      diagnostics.accessTokenGoogleValidationStatus = aboutRes.status;

      if (aboutRes.ok) {
        const aboutData: any = (await aboutRes.json().catch(() => ({}))) as any;
        if (aboutData.user?.emailAddress) {
          userEmail = aboutData.user.emailAddress;
        }
        diagnostics.tokenResolutionResult = 'success';
        diagnostics.failureReason = 'none';
        return { token: accessToken, email: userEmail, diagnostics };
      }

      if (aboutRes.status === 403) {
        diagnostics.tokenResolutionResult = 'failure';
        diagnostics.failureReason = 'Google Drive permission denied (HTTP 403). Verify scopes.';
        return {
          token: null,
          email: userEmail,
          error: 'Google Drive permission denied (HTTP 403). Check OAuth scopes in Google Cloud Console.',
          code: 'DRIVE_PERMISSION_DENIED',
          diagnostics,
        };
      } else if (aboutRes.status === 429) {
        diagnostics.tokenResolutionResult = 'failure';
        diagnostics.failureReason = 'Google Drive rate limit (HTTP 429).';
        return {
          token: null,
          email: userEmail,
          error: 'Google Drive rate limit exceeded (HTTP 429). Please retry shortly.',
          code: 'DRIVE_RATE_LIMIT',
          diagnostics,
        };
      } else if (aboutRes.status >= 500) {
        diagnostics.tokenResolutionResult = 'failure';
        diagnostics.failureReason = `Google Drive API server error (HTTP ${aboutRes.status}).`;
        return {
          token: null,
          email: userEmail,
          error: `Google Drive API temporarily unavailable (HTTP ${aboutRes.status}).`,
          code: 'DRIVE_API_UNAVAILABLE',
          diagnostics,
        };
      }
    } catch (testErr: any) {
      diagnostics.accessTokenGoogleValidationStatus = 'error';
    }
  }

  // 3. If access token is missing or returned 401, exchange refresh token
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

      diagnostics.refreshResponseStatus = tokenRes.status;
      const tokenData: any = (await tokenRes.json().catch(() => ({}))) as any;

      if (tokenRes.ok && tokenData.access_token) {
        const freshToken = tokenData.access_token;
        const expiresIn = Number(tokenData.expires_in || 3600);
        const newExpiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();

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

        diagnostics.tokenResolutionResult = 'success';
        diagnostics.failureReason = 'none';
        return { token: freshToken, email: userEmail, diagnostics };
      }

      diagnostics.tokenResolutionResult = 'failure';
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to exchange refresh token with Google.';
      diagnostics.failureReason = `Refresh token exchange failed (HTTP ${tokenRes.status}): ${errMsg}`;
      return {
        token: null,
        email: userEmail,
        error: errMsg,
        code: 'OAUTH_REFRESH_FAILED',
        diagnostics,
      };
    } catch (refreshErr: any) {
      diagnostics.tokenResolutionResult = 'failure';
      diagnostics.failureReason = `Refresh request network error: ${refreshErr.message}`;
      return {
        token: null,
        email: userEmail,
        error: refreshErr.message || 'Token refresh network request failed.',
        code: 'OAUTH_NETWORK_ERROR',
        diagnostics,
      };
    }
  }

  // 4. Genuine not connected state
  diagnostics.tokenResolutionResult = 'failure';
  if (!diagnostics.failureReason || diagnostics.failureReason === 'uninitialized') {
    diagnostics.failureReason = 'Neither valid access token nor refresh token found in database or environment.';
  }

  return {
    token: null,
    email: userEmail,
    error: 'Google Drive is not connected. Please click "Connect Google Drive" in Settings to authenticate.',
    code: 'NOT_CONNECTED',
    diagnostics,
  };
}

// Find or create a folder in Google Drive (My Drive)
async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<{ id: string; name: string; url: string }> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentFolderId && parentFolderId !== 'root') {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,parents)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const searchData: any = (await searchRes.json().catch(() => ({}))) as any;
  if (searchData.files && searchData.files.length > 0) {
    const file = searchData.files[0];
    return {
      id: file.id,
      name: file.name,
      url: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`,
    };
  }

  // Create folder
  const createBody: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId && parentFolderId !== 'root') {
    createBody.parents = [parentFolderId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,parents', {
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

  return {
    id: createData.id,
    name: createData.name || folderName,
    url: createData.webViewLink || `https://drive.google.com/drive/folders/${createData.id}`,
  };
}

// Upload physical binary file to Google Drive and verify
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

  // Verification step using files.get
  const verifyRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=id,name,size,mimeType,parents,webViewLink`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const verifyData: any = (await verifyRes.json()) as any;
  if (!verifyRes.ok || !verifyData?.id) {
    throw new Error(`Drive post-upload verification failed for "${fileName}": ${verifyData?.error?.message || verifyRes.statusText}`);
  }

  return {
    id: verifyData.id,
    name: verifyData.name,
    size: Number(verifyData.size || fileBuffer.length),
    url: verifyData.webViewLink || `https://drive.google.com/file/d/${verifyData.id}/view`,
  };
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    let body: any = {};
    if (req.method === 'POST') {
      if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      } else {
        const rawBody = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk) => (data += chunk));
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        try {
          body = JSON.parse(rawBody || '{}');
        } catch {
          body = {};
        }
      }
    } else {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      body.recordId = urlObj.searchParams.get('recordId') || '';
      body.companyName = urlObj.searchParams.get('companyName') || '';
      body.platform = urlObj.searchParams.get('platform') || 'WhatsApp';
    }

    const { recordId } = body;
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    // Stage 1: Authenticate with Google Drive OAuth
    const { token: accessToken, email: connectedEmail, error: authError, code: authCode, diagnostics } = await resolveGoogleDriveToken();

    console.log(`[GDRIVE-BACKUP-DIAGNOSTIC]
supabaseUrlConfigured=${diagnostics.supabaseUrlConfigured}
serviceRoleConfigured=${diagnostics.serviceRoleConfigured}
appConfigRequestStatus=${diagnostics.appConfigRequestStatus}
appConfigRowsCount=${diagnostics.appConfigRowsCount}
refreshTokenRowFound=${diagnostics.refreshTokenRowFound}
accessTokenRowFound=${diagnostics.accessTokenRowFound}
emailRowFound=${diagnostics.emailRowFound}
expiryRowFound=${diagnostics.expiryRowFound}
accessTokenLength=${diagnostics.accessTokenLength}
refreshTokenLength=${diagnostics.refreshTokenLength}
accessTokenGoogleValidationStatus=${diagnostics.accessTokenGoogleValidationStatus}
tokenResolutionResult=${diagnostics.tokenResolutionResult}
failureReason=${diagnostics.failureReason}`);

    if (!accessToken || diagnostics.tokenResolutionResult !== 'success') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: authError || 'Google Drive is not connected. Please click "Connect Google Drive" in Settings first.',
          code: authCode || 'NOT_CONNECTED',
          diagnostics,
        })
      );
      return;
    }

    // Stage 2: Fetch Records from Supabase
    let recordsToProcess: any[] = [];
    try {
      if (recordId && recordId !== 'all') {
        const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?id=eq.${recordId}&select=id,brand_name,company_name,platform`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        recordsToProcess = (await recRes.json().catch(() => [])) as any[];
      } else {
        const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name,company_name,platform`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        recordsToProcess = (await recRes.json().catch(() => [])) as any[];
      }
    } catch (recErr: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: `Failed to query onboarding records from database: ${recErr.message}`,
          code: 'DOCUMENT_QUERY_FAILED',
        })
      );
      return;
    }

    if (!recordsToProcess || recordsToProcess.length === 0) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          message: 'No onboarding records found to back up.',
          backedUpCount: 0,
          verifiedFiles: [],
          failedFiles: [],
        })
      );
      return;
    }

    // Stage 3: Build Root Google Drive Folders
    let rootFolder;
    let archiveFolder;
    try {
      rootFolder = await findOrCreateFolder(accessToken, 'IMMENSE Portal');
      archiveFolder = await findOrCreateFolder(accessToken, 'All Companies Archive', rootFolder.id);
    } catch (folderErr: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: `Google Drive root folder creation failed: ${folderErr.message}`,
          code: 'DRIVE_FOLDER_CREATE_FAILED',
        })
      );
      return;
    }

    const verifiedFiles: Array<{
      fileId: string;
      fileName: string;
      fileSize: number;
      company: string;
      category: string;
      driveUrl: string;
    }> = [];
    const failedFiles: Array<{ fileName: string; company: string; error: string; code?: string }> = [];

    // Stage 4: Process Company Folders and Upload Documents
    for (const rec of recordsToProcess) {
      const companyDisplayName = (rec.company_name || rec.brand_name || 'Unnamed Company').trim();
      let companyFolder;
      let gstFolder, panFolder, logoFolder, bannerFolder, otherFolder;

      try {
        companyFolder = await findOrCreateFolder(accessToken, companyDisplayName, archiveFolder.id);
        gstFolder = await findOrCreateFolder(accessToken, 'GST', companyFolder.id);
        panFolder = await findOrCreateFolder(accessToken, 'PAN', companyFolder.id);
        logoFolder = await findOrCreateFolder(accessToken, 'Logo', companyFolder.id);
        bannerFolder = await findOrCreateFolder(accessToken, 'Banner', companyFolder.id);
        otherFolder = await findOrCreateFolder(accessToken, 'Other Documents', companyFolder.id);
      } catch (catErr: any) {
        failedFiles.push({
          fileName: 'Directory Hierarchy',
          company: companyDisplayName,
          error: catErr.message,
          code: 'DRIVE_FOLDER_CREATE_FAILED',
        });
        continue;
      }

      const subFolderMap: Record<string, { id: string; name: string }> = {
        gst: gstFolder,
        pan: panFolder,
        logo: logoFolder,
        banner: bannerFolder,
        other: otherFolder,
      };

      // Fetch documents for this company
      let docs: any[] = [];
      try {
        const docsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?onboarding_id=eq.${rec.id}&select=id,file_name,original_name,category,storage_path,mime_type,file_size`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        docs = (await docsRes.json().catch(() => [])) as any[];
      } catch (docErr: any) {
        failedFiles.push({
          fileName: 'All Documents',
          company: companyDisplayName,
          error: docErr.message,
          code: 'DOCUMENT_QUERY_FAILED',
        });
        continue;
      }

      for (const doc of docs) {
        const catKey = (doc.category || '').toLowerCase();
        let targetFolder = subFolderMap.other;
        if (catKey.includes('gst')) targetFolder = subFolderMap.gst;
        else if (catKey.includes('pan')) targetFolder = subFolderMap.pan;
        else if (catKey.includes('logo')) targetFolder = subFolderMap.logo;
        else if (catKey.includes('banner')) targetFolder = subFolderMap.banner;

        const originalName = (doc.file_name || doc.original_name || 'document.pdf').trim();
        const mimeType = doc.mime_type || (originalName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

        try {
          // Check if file already exists in this folder
          const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
              `name = '${originalName.replace(/'/g, "\\'")}' and '${targetFolder.id}' in parents and trashed = false`
            )}&fields=files(id,name,size,webViewLink)`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const searchData: any = (await searchRes.json().catch(() => ({}))) as any;

          if (searchData.files && searchData.files.length > 0) {
            const existing = searchData.files[0];
            verifiedFiles.push({
              fileId: existing.id,
              fileName: existing.name,
              fileSize: Number(existing.size || doc.file_size || 0),
              company: companyDisplayName,
              category: targetFolder.name,
              driveUrl: existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`,
            });
            continue;
          }

          // Download physical binary from Supabase Storage private bucket
          if (!doc.storage_path) {
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: 'Document missing storage_path in database.', code: 'STORAGE_PATH_MISSING' });
            continue;
          }

          const storageRes = await fetch(
            `${supabaseUrl}/storage/v1/object/onboarding-documents/${encodeURIComponent(doc.storage_path).replace(/%2F/g, '/')}`,
            {
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
            }
          );

          if (!storageRes.ok) {
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: `Supabase Storage read returned HTTP ${storageRes.status}`, code: 'STORAGE_DOWNLOAD_FAILED' });
            continue;
          }

          const fileBuffer = Buffer.from(await storageRes.arrayBuffer());
          if (fileBuffer.length === 0) {
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: 'Downloaded file binary is empty (0 bytes).', code: 'STORAGE_EMPTY_FILE' });
            continue;
          }

          // Upload authentic binary directly to Google Drive and verify
          const uploadedFile = await uploadFileToDrive(accessToken, originalName, mimeType, fileBuffer, targetFolder.id);

          verifiedFiles.push({
            fileId: uploadedFile.id,
            fileName: uploadedFile.name,
            fileSize: uploadedFile.size,
            company: companyDisplayName,
            category: targetFolder.name,
            driveUrl: uploadedFile.url,
          });
        } catch (fileErr: any) {
          failedFiles.push({ fileName: originalName, company: companyDisplayName, error: fileErr.message, code: 'DRIVE_UPLOAD_FAILED' });
        }
      }
    }

    const nowIso = new Date().toISOString();
    const finalAccount = connectedEmail || process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com';

    // Update Audit Log in Supabase
    if (supabaseUrl && supabaseServiceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'google_drive_backup_completed',
            entity_type: 'backup',
            entity_id: recordId || 'all_records',
            metadata: {
              targetAccount: finalAccount,
              rootFolderId: rootFolder.id,
              archiveFolderId: archiveFolder.id,
              backedUpCount: verifiedFiles.length,
              failedCount: failedFiles.length,
              verifiedFiles: verifiedFiles.map((f) => ({ id: f.fileId, name: f.fileName, size: f.fileSize, company: f.company })),
            },
          }),
        });
      } catch {
        // Continue
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: 'Google Drive Secondary Backup Completed & Verified',
        targetAccount: finalAccount,
        folderHierarchy: {
          root: { id: rootFolder.id, name: rootFolder.name, url: rootFolder.url },
          archive: { id: archiveFolder.id, name: archiveFolder.name, url: archiveFolder.url },
        },
        backedUpCount: verifiedFiles.length,
        verifiedFiles,
        failedFiles,
        lastBackupAt: nowIso,
        structure: 'IMMENSE Portal/All Companies Archive/[Company Name]/[GST, PAN, Logo, Banner, Other Documents]',
      })
    );
  } catch (err: any) {
    console.error('[GDRIVE-BACKUP] Fatal error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'An internal error occurred during Google Drive backup.',
        code: 'BACKUP_INTERNAL_ERROR',
      })
    );
  }
}
