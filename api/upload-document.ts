import type { IncomingMessage, ServerResponse } from 'http';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

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
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
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

    const { path: storagePath, bucket = 'onboarding-documents', fileBase64, contentType = 'application/octet-stream' } = body;

    if (!storagePath || !fileBase64) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'storagePath and fileBase64 are required.' }));
      return;
    }

    const cleanPath = (storagePath.startsWith('/') ? storagePath.slice(1) : storagePath).trim();
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const authHeader = (req.headers['authorization'] || '').toString().trim();
    const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      tokenFromHeader ||
      ''
    ).trim();

    // Server-side diagnostic log (never logs secret value, only whether key exists)
    console.log(`[STORAGE-UPLOAD] Key configured: ${Boolean(supabaseServiceKey)}, Target: ${cleanPath}, Size: ${fileBuffer.length} bytes`);

    if (!supabaseServiceKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables. Please add SUPABASE_SERVICE_ROLE_KEY in Vercel Project Settings.',
        })
      );
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-upsert': 'true',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    };

    // Upload to Supabase Storage REST endpoint
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      res.statusCode = uploadRes.status || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Supabase Storage upload error: ${errText}` }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, path: cleanPath, size: fileBuffer.length }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal server error uploading document.' }));
  }
}
