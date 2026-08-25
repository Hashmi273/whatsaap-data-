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
    } else {
      const rawBody = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(rawBody || '{}');
    }

    const { path: storagePath, bucket = 'onboarding-documents', fileBase64, contentType = 'application/octet-stream' } = body;

    if (!storagePath || !fileBase64) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'storagePath and fileBase64 are required.' }));
      return;
    }

    const authHeader = (req.headers['authorization'] || '').toString().trim();
    const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();

    // In Supabase Kong gateway, apikey must be a valid project key (service role or anon)
    const apiKeyHeader = supabaseServiceKey || supabaseAnonKey;
    // Authorization header carries either the service role bearer or the user's active session bearer
    const authHeaderValue = supabaseServiceKey
      ? `Bearer ${supabaseServiceKey}`
      : tokenFromHeader
      ? `Bearer ${tokenFromHeader}`
      : supabaseAnonKey
      ? `Bearer ${supabaseAnonKey}`
      : '';

    const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-upsert': 'true',
    };
    if (apiKeyHeader) headers['apikey'] = apiKeyHeader;
    if (authHeaderValue) headers['Authorization'] = authHeaderValue;

    // Upload to Supabase Storage
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`, {
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
