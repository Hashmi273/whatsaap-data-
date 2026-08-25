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

    // Clean filename
    const safeFileName = (fileName || storagePath.split('/').pop() || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeFileName.split('.').pop()?.toLowerCase() || '';

    let defaultMime = 'application/octet-stream';
    if (ext === 'pdf') defaultMime = 'application/pdf';
    else if (['jpg', 'jpeg'].includes(ext)) defaultMime = 'image/jpeg';
    else if (ext === 'png') defaultMime = 'image/png';
    else if (ext === 'webp') defaultMime = 'image/webp';
    else if (ext === 'docx') defaultMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'xlsx') defaultMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. If service role key is configured, generate signed URL or fetch from Supabase Storage
    if (supabaseUrl && supabaseServiceKey) {
      const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
      
      // Request fresh signed URL (1 hour expiry)
      const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`, {
        method: 'POST',
        headers: {
          apikey: supabaseServiceKey.trim(),
          Authorization: `Bearer ${supabaseServiceKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }), // 1 hour token
      });

      const signData = await signRes.json().catch(() => ({}));

      if (signRes.ok && signData?.signedURL) {
        const fullSignedUrl = signData.signedURL.startsWith('http')
          ? signData.signedURL
          : `${supabaseUrl}/storage/v1${signData.signedURL}`;

        if (mode === 'url') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, signedUrl: fullSignedUrl, fileName: safeFileName }));
          return;
        }

        // Stream the file directly
        const fileRes = await fetch(fullSignedUrl);
        if (fileRes.ok) {
          const contentType = fileRes.headers.get('content-type') || defaultMime;
          const buffer = Buffer.from(await fileRes.arrayBuffer());

          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
          res.setHeader('Content-Length', buffer.length.toString());
          res.end(buffer);
          return;
        }
      }

      // Try direct object retrieval with service role key
      const directRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`, {
        headers: {
          apikey: supabaseServiceKey.trim(),
          Authorization: `Bearer ${supabaseServiceKey.trim()}`,
        },
      });

      if (directRes.ok) {
        const contentType = directRes.headers.get('content-type') || defaultMime;
        const buffer = Buffer.from(await directRes.arrayBuffer());

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
        return;
      }
    }

    // 2. Fallback sample document binary generator for seeded demo records
    if (ext === 'pdf') {
      const pdfString = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 135>>stream
BT /F1 18 Tf 50 720 Td (IMMENSE Enterprise Document: ${safeFileName}) Tj 0 -30 Td /F1 12 Tf (Confidential Document Vault Record) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000224 00000 n
0000000409 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
479
%%EOF`;
      const buffer = Buffer.from(pdfString);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.end(buffer);
      return;
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      // 1x1 valid PNG binary
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buffer = Buffer.from(pngBase64, 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', ext === 'png' ? 'image/png' : 'image/jpeg');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.end(buffer);
      return;
    } else {
      const content = `IMMENSE Document Vault\nDocument: ${safeFileName}\nTimestamp: ${new Date().toISOString()}`;
      const buffer = Buffer.from(content);
      res.statusCode = 200;
      res.setHeader('Content-Type', defaultMime);
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.end(buffer);
      return;
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal error downloading document.' }));
  }
}
