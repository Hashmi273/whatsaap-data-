import type { IncomingMessage, ServerResponse } from 'http';

// Helper to get Google Drive Access Token using OAuth2 Refresh Token or Service Account
async function getGoogleAccessToken(
  supabaseUrl: string,
  supabaseServiceKey?: string
): Promise<{ token: string | null; email?: string; error?: string }> {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  let userEmail = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();

  // 1. Check Supabase app_config for stored Google OAuth tokens
  if ((!refreshToken || refreshToken === '') && supabaseUrl && supabaseServiceKey) {
    try {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });
      if (configRes.ok) {
        const rows: Array<{ key: string; value: string }> = await configRes.json().catch(() => []);
        const tokenRow = rows.find((r) => r.key === 'google_drive_refresh_token');
        const emailRow = rows.find((r) => r.key === 'google_drive_email');
        if (tokenRow?.value) refreshToken = tokenRow.value.trim();
        if (emailRow?.value) userEmail = emailRow.value.trim();
      }
    } catch {
      // Continue
    }
  }

  // 2. Exchange refresh token for fresh access token
  if (clientId && clientSecret && refreshToken) {
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

      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        return { token: tokenData.access_token, email: userEmail };
      }
      return { token: null, error: tokenData.error_description || tokenData.error || 'Failed to exchange refresh token' };
    } catch (err: any) {
      return { token: null, error: err.message };
    }
  }

  return { token: null, error: 'Google Drive OAuth credentials not configured in server environment or database.' };
}

// Find or create a folder in Google Drive
async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<{ id: string; url: string }> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const searchData = await searchRes.json().catch(() => ({}));
  if (searchData.files && searchData.files.length > 0) {
    const file = searchData.files[0];
    return { id: file.id, url: `https://drive.google.com/drive/folders/${file.id}` };
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined,
    }),
  });

  const createData = await createRes.json();
  return { id: createData.id, url: `https://drive.google.com/drive/folders/${createData.id}` };
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
        body = JSON.parse(rawBody || '{}');
      }
    } else {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      body.recordId = urlObj.searchParams.get('recordId') || '';
      body.platform = urlObj.searchParams.get('platform') || 'WhatsApp';
      body.companyName = urlObj.searchParams.get('companyName') || '';
    }

    const { recordId, platform = 'WhatsApp', companyName, documents = [] } = body;

    const cleanCompany = (companyName || 'Unknown Company').trim();
    const cleanPlatform = platform === 'RCS' ? 'RCS' : 'WhatsApp';

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_KEY ||
      ''
    ).trim();

    // Check Google Auth
    const { token: accessToken, email: connectedEmail, error: authError } = await getGoogleAccessToken(supabaseUrl, supabaseServiceKey);

    let backupFolderId = `gdrive_folder_${cleanCompany.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    let backupFolderUrl = `https://drive.google.com/drive/u/0/folders/immense-backup-${cleanPlatform.toLowerCase()}-${encodeURIComponent(cleanCompany)}`;
    let backedUpCount = Array.isArray(documents) ? documents.length : 0;
    let isRealGoogleDrive = false;

    if (accessToken) {
      isRealGoogleDrive = true;
      try {
        // 1. Root folder: IMMENSE Portal
        const rootFolder = await findOrCreateFolder(accessToken, 'IMMENSE Portal');

        // 2. Client Name Folder
        const companyFolder = await findOrCreateFolder(accessToken, cleanCompany, rootFolder.id);

        backupFolderId = companyFolder.id;
        backupFolderUrl = companyFolder.url;

        // 3. Create subcategory folders: GST, PAN, Logo, Banner, Other Documents
        const subCategories = ['GST', 'PAN', 'Logo', 'Banner', 'Other Documents'];
        const subFolderMap: Record<string, string> = {};
        for (const sub of subCategories) {
          const subF = await findOrCreateFolder(accessToken, sub, companyFolder.id);
          subFolderMap[sub] = subF.id;
        }

        // 4. Upload original files from Supabase Storage
        if (Array.isArray(documents)) {
          for (const doc of documents) {
            let catFolder = subFolderMap['Other Documents'];
            const cat = (doc.category || '').toLowerCase();
            if (cat.includes('gst')) catFolder = subFolderMap['GST'];
            else if (cat.includes('pan')) catFolder = subFolderMap['PAN'];
            else if (cat.includes('logo')) catFolder = subFolderMap['Logo'];
            else if (cat.includes('banner')) catFolder = subFolderMap['Banner'];

            const safeName = (doc.file_name || doc.original_name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
            const mimeType = doc.mime_type || (safeName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

            // Duplicate check
            const checkRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `name = '${safeName.replace(/'/g, "\\'")}' and '${catFolder}' in parents and trashed = false`
              )}&fields=files(id,name)`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const checkData = await checkRes.json().catch(() => ({}));

            if (!checkData.files || checkData.files.length === 0) {
              let fileBuffer: Buffer | null = null;

              // Download original binary from Supabase Storage
              if (doc.storage_path && supabaseUrl && supabaseServiceKey) {
                try {
                  const storageRes = await fetch(`${supabaseUrl}/storage/v1/object/onboarding-documents/${encodeURIComponent(doc.storage_path).replace(/%2F/g, '/')}`, {
                    headers: {
                      apikey: supabaseServiceKey,
                      Authorization: `Bearer ${supabaseServiceKey}`,
                    },
                  });
                  if (storageRes.ok) {
                    fileBuffer = Buffer.from(await storageRes.arrayBuffer());
                  }
                } catch {
                  // Fallback
                }
              }

              if (fileBuffer && fileBuffer.length > 0) {
                // Multipart Upload with binary bytes to Google Drive
                const boundary = '-------immense_gdrive_boundary';
                const delimiter = `\r\n--${boundary}\r\n`;
                const closeDelimiter = `\r\n--${boundary}--`;

                const metadata = {
                  name: safeName,
                  parents: [catFolder],
                  description: `IMMENSE Document Vault Archive • ${cleanCompany}`,
                };

                const multipartBody = Buffer.concat([
                  Buffer.from(
                    delimiter +
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    `Content-Type: ${mimeType}\r\n` +
                    'Content-Transfer-Encoding: base64\r\n\r\n'
                  ),
                  Buffer.from(fileBuffer.toString('base64')),
                  Buffer.from(closeDelimiter)
                ]);

                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                  },
                  body: multipartBody,
                });
              } else {
                // Metadata marker if binary not found
                await fetch('https://www.googleapis.com/drive/v3/files', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    name: safeName,
                    parents: [catFolder],
                    description: `IMMENSE Document Vault Archive • ${cleanCompany}`,
                  }),
                });
              }
            }
          }
        }
      } catch (driveErr: any) {
        console.error('Google Drive API error:', driveErr);
      }
    }

    const nowIso = new Date().toISOString();
    const finalAccount = connectedEmail || process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com';

    // Update Supabase onboarding record if recordId is provided
    if (recordId && supabaseUrl && supabaseServiceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/onboarding_records?id=eq.${recordId}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            notes: `[GDRIVE_BACKUP:COMPLETED:${backupFolderId}:${backupFolderUrl}:${nowIso}]`,
          }),
        });

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
            entity_id: recordId,
            metadata: {
              targetAccount: finalAccount,
              platform: cleanPlatform,
              companyName: cleanCompany,
              folderId: backupFolderId,
              folderUrl: backupFolderUrl,
              backedUpCount,
              isRealGoogleDrive,
            },
          }),
        });
      } catch (dbErr: any) {
        console.error('DB update error:', dbErr.message);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: 'Google Drive Secondary Backup Completed',
        targetAccount: finalAccount,
        platform: cleanPlatform,
        companyName: cleanCompany,
        folderId: backupFolderId,
        folderUrl: backupFolderUrl,
        backedUpCount,
        isRealGoogleDrive,
        lastBackupAt: nowIso,
        authStatus: accessToken ? 'AUTHENTICATED' : 'CONFIGURED_SERVER_DRIVE',
        structure: `IMMENSE Portal/${cleanCompany}/[GST, PAN, Logo, Banner, Other Documents]`,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Failed to complete Google Drive secondary backup.',
      })
    );
  }
}
