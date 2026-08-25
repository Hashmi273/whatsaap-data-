import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    let storagePath = urlObj.searchParams.get('path') || '';
    let fileName = urlObj.searchParams.get('name') || '';
    let bucket = urlObj.searchParams.get('bucket') || 'onboarding-documents';
    let mode = urlObj.searchParams.get('mode') || 'stream'; // 'stream' or 'url'
    let disposition = urlObj.searchParams.get('disposition') || 'attachment'; // 'attachment' or 'inline'

    if (req.method === 'POST') {
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
        body = JSON.parse(rawBody || '{}');
      }

      if (body.path) storagePath = body.path;
      if (body.name) fileName = body.name;
      if (body.bucket) bucket = body.bucket;
      if (body.mode) mode = body.mode;
      if (body.disposition) disposition = body.disposition;
    }

    if (!storagePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Document storage path is required.' }));
      return;
    }

    // Clean and validate filename & extension
    const safeFileName = (fileName || storagePath.split('/').pop() || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeFileName.split('.').pop()?.toLowerCase() || '';

    let defaultMime = 'application/octet-stream';
    if (ext === 'pdf') defaultMime = 'application/pdf';
    else if (['jpg', 'jpeg'].includes(ext)) defaultMime = 'image/jpeg';
    else if (ext === 'png') defaultMime = 'image/png';
    else if (ext === 'webp') defaultMime = 'image/webp';
    else if (ext === 'docx') defaultMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'xlsx') defaultMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const authHeader = (req.headers['authorization'] || '').toString().trim();
    const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_KEY ||
      tokenFromHeader ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    const cleanPath = (storagePath.startsWith('/') ? storagePath.slice(1) : storagePath).trim();
    const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/');

    // -------------------------------------------------------------
    // ATTEMPT 1: Generate Fresh Signed URL via Supabase Storage API
    // -------------------------------------------------------------
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const signEndpoint = `${supabaseUrl}/storage/v1/object/sign/${bucket}/${encodedPath}`;
        const signRes = await fetch(signEndpoint, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expiresIn: 3600 }),
        });

        if (signRes.ok) {
          const signData = await signRes.json().catch(() => ({}));
          const rawUrl = signData?.signedURL || signData?.signedUrl || '';

          if (rawUrl) {
            let fullSignedUrl = rawUrl;
            if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
              if (rawUrl.startsWith('/storage/v1')) {
                fullSignedUrl = `${supabaseUrl}${rawUrl}`;
              } else if (rawUrl.startsWith('/')) {
                fullSignedUrl = `${supabaseUrl}/storage/v1${rawUrl}`;
              } else {
                fullSignedUrl = `${supabaseUrl}/storage/v1/${rawUrl}`;
              }
            }

            // If client specifically requested mode=url, return verified signed URL
            if (mode === 'url') {
              // Verify that the signed URL is actually accessible
              const headCheck = await fetch(fullSignedUrl, { method: 'HEAD' });
              if (headCheck.ok) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, signedUrl: fullSignedUrl, fileName: safeFileName }));
                return;
              }
            }

            // Stream the real binary file to the browser
            const fileRes = await fetch(fullSignedUrl);
            if (fileRes.ok) {
              const contentType = fileRes.headers.get('content-type') || defaultMime;
              const buffer = Buffer.from(await fileRes.arrayBuffer());

              if (buffer.length > 0) {
                res.statusCode = 200;
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
                res.setHeader('Content-Length', buffer.length.toString());
                res.end(buffer);
                return;
              }
            }
          }
        }
      } catch (signErr) {
        console.warn('Signed URL retrieval attempt error:', signErr);
      }

      // -------------------------------------------------------------
      // ATTEMPT 2: Direct Authenticated Object Download
      // -------------------------------------------------------------
      try {
        const directEndpoint = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`;
        const directRes = await fetch(directEndpoint, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (directRes.ok) {
          const contentType = directRes.headers.get('content-type') || defaultMime;
          const buffer = Buffer.from(await directRes.arrayBuffer());

          if (buffer.length > 0) {
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
            res.setHeader('Content-Length', buffer.length.toString());
            res.end(buffer);
            return;
          }
        }
      } catch (directErr) {
        console.warn('Direct authenticated retrieval attempt error:', directErr);
      }

      // -------------------------------------------------------------
      // ATTEMPT 3: Standard Object Endpoint
      // -------------------------------------------------------------
      try {
        const standardEndpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;
        const standardRes = await fetch(standardEndpoint, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (standardRes.ok) {
          const contentType = standardRes.headers.get('content-type') || defaultMime;
          const buffer = Buffer.from(await standardRes.arrayBuffer());

          if (buffer.length > 0) {
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
            res.setHeader('Content-Length', buffer.length.toString());
            res.end(buffer);
            return;
          }
        }
      } catch (standardErr) {
        console.warn('Standard endpoint retrieval attempt error:', standardErr);
      }
    }

    // -------------------------------------------------------------
    // NO FAKE FALLBACK — RETURN 404 IF OBJECT IS NOT IN STORAGE
    // -------------------------------------------------------------
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'Document unavailable — storage object not found.',
        storagePath: cleanPath,
        bucket,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Internal error processing document request.',
      })
    );
  }
}
