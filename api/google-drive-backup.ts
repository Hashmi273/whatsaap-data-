import type { IncomingMessage, ServerResponse } from 'http';
import { resolveGoogleDriveToken, getSupabaseCredentials } from './_lib/google-drive-auth';

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

  const createData: any = (await createRes.json()) as any;
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
        body = JSON.parse(rawBody || '{}');
      }
    } else {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      body.recordId = urlObj.searchParams.get('recordId') || '';
      body.companyName = urlObj.searchParams.get('companyName') || '';
      body.platform = urlObj.searchParams.get('platform') || 'WhatsApp';
    }

    const { recordId } = body;

    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    // 1. Authenticate with Google Drive OAuth via shared resolver
    const { token: accessToken, email: connectedEmail, error: authError, diagnostics } = await resolveGoogleDriveToken();

    console.log(`[GDRIVE-BACKUP]
app_config loaded=${diagnostics.appConfigLoaded}
hasAccessToken=${diagnostics.hasAccessToken}
hasRefreshToken=${diagnostics.hasRefreshToken}
hasEmail=${diagnostics.hasEmail}
tokenExpiry=${diagnostics.tokenExpiry}
accessTokenValidationStatus=${diagnostics.accessTokenValidationStatus}
refreshAttempted=${diagnostics.refreshAttempted}
refreshResponseStatus=${diagnostics.refreshResponseStatus}
finalAuthenticationStatus=${diagnostics.finalAuthenticationStatus}`);

    if (!accessToken || diagnostics.finalAuthenticationStatus !== 'success') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: authError || 'Google Drive is not connected. Please click "Connect Google Drive" in Settings first.',
          diagnostics: {
            appConfigLoaded: diagnostics.appConfigLoaded,
            hasAccessToken: diagnostics.hasAccessToken,
            hasRefreshToken: diagnostics.hasRefreshToken,
            validationStatus: diagnostics.accessTokenValidationStatus,
            refreshAttempted: diagnostics.refreshAttempted,
            refreshStatus: diagnostics.refreshResponseStatus,
          },
        })
      );
      return;
    }

    // 2. Fetch Companies / Records to back up from Supabase
    let recordsToProcess: any[] = [];
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

    // 3. Build Google Drive Root Hierarchy: My Drive / IMMENSE Portal / All Companies Archive /
    const rootFolder = await findOrCreateFolder(accessToken, 'IMMENSE Portal');
    const archiveFolder = await findOrCreateFolder(accessToken, 'All Companies Archive', rootFolder.id);

    const verifiedFiles: Array<{
      fileId: string;
      fileName: string;
      fileSize: number;
      company: string;
      category: string;
      driveUrl: string;
    }> = [];
    const failedFiles: Array<{ fileName: string; company: string; error: string }> = [];

    // 4. Process each company record
    for (const rec of recordsToProcess) {
      const companyDisplayName = (rec.company_name || rec.brand_name || 'Unnamed Company').trim();
      const companyFolder = await findOrCreateFolder(accessToken, companyDisplayName, archiveFolder.id);

      // Create Category Subfolders
      const gstFolder = await findOrCreateFolder(accessToken, 'GST', companyFolder.id);
      const panFolder = await findOrCreateFolder(accessToken, 'PAN', companyFolder.id);
      const logoFolder = await findOrCreateFolder(accessToken, 'Logo', companyFolder.id);
      const bannerFolder = await findOrCreateFolder(accessToken, 'Banner', companyFolder.id);
      const otherFolder = await findOrCreateFolder(accessToken, 'Other Documents', companyFolder.id);

      const subFolderMap: Record<string, { id: string; name: string }> = {
        gst: gstFolder,
        pan: panFolder,
        logo: logoFolder,
        banner: bannerFolder,
        other: otherFolder,
      };

      // Fetch documents for this company
      const docsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?onboarding_id=eq.${rec.id}&select=id,file_name,original_name,category,storage_path,mime_type,file_size`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      const docs: any[] = (await docsRes.json().catch(() => [])) as any[];

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
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: 'Document missing storage_path in database.' });
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
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: `Supabase Storage read failed (HTTP ${storageRes.status})` });
            continue;
          }

          const fileBuffer = Buffer.from(await storageRes.arrayBuffer());
          if (fileBuffer.length === 0) {
            failedFiles.push({ fileName: originalName, company: companyDisplayName, error: 'Downloaded file binary is empty (0 bytes).' });
            continue;
          }

          // Upload authentic binary directly to Google Drive and verify
          const uploadedFile = await uploadFileToDrive(accessToken, originalName, mimeType, fileBuffer, targetFolder.id);

          console.log(`[GDRIVE-BACKUP] Verified upload: ${uploadedFile.name} (ID: ${uploadedFile.id}, Size: ${uploadedFile.size} bytes) in ${companyDisplayName}/${targetFolder.name}`);

          verifiedFiles.push({
            fileId: uploadedFile.id,
            fileName: uploadedFile.name,
            fileSize: uploadedFile.size,
            company: companyDisplayName,
            category: targetFolder.name,
            driveUrl: uploadedFile.url,
          });
        } catch (fileErr: any) {
          console.error(`[GDRIVE-BACKUP] Error backing up ${originalName}:`, fileErr.message);
          failedFiles.push({ fileName: originalName, company: companyDisplayName, error: fileErr.message });
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
      } catch (dbErr: any) {
        console.warn('Audit log write error:', dbErr.message);
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
        error: err.message || 'Failed to complete Google Drive secondary backup.',
      })
    );
  }
}
