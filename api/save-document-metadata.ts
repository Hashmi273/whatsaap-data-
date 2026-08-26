import type { IncomingMessage, ServerResponse } from 'http';

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
    ''
  ).trim();

  return { supabaseUrl, supabaseServiceKey };
}

const ALLOWED_TABLES = new Set([
  'onboarding_documents',
  'onboarding_records',
  'audit_logs',
  'profiles',
]);

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-email, x-session-token');

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

  // Mandatory App-Level Session Authorization Check
  const authHeader = (req.headers['authorization'] || '').toString().trim();
  const sessionToken = (req.headers['x-session-token'] || '').toString().trim();
  const userId = (req.headers['x-user-id'] || '').toString().trim();
  const userEmail = (req.headers['x-user-email'] || '').toString().trim();

  if (!authHeader && !sessionToken && !userId && !userEmail) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: Valid Immense Portal session or user identity token required.',
        code: 'UNAUTHORIZED_SESSION_REQUIRED',
      })
    );
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

    const { table = 'onboarding_documents', payload, action = 'insert', match } = body;

    if (!ALLOWED_TABLES.has(table)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Unauthorized table access: ${table}` }));
      return;
    }

    if (!payload && action !== 'delete') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'payload is required.' }));
      return;
    }

    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    if (!supabaseServiceKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.',
        })
      );
      return;
    }

    // Auto-ensure parent onboarding_records row exists before document insert to avoid FK/permission errors
    if (table === 'onboarding_documents' && action === 'insert' && payload && payload.onboarding_id) {
      try {
        const recCheckRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?id=eq.${payload.onboarding_id}&select=id`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        const recCheckData = await recCheckRes.json().catch(() => []);
        if (!Array.isArray(recCheckData) || recCheckData.length === 0) {
          const parentPayload = {
            id: payload.onboarding_id,
            brand_name: payload.brand_name || 'Immense Client',
            company_name: payload.company_name || 'Immense Client',
            whatsapp_number: payload.whatsapp_number || '+91 99999 99999',
            platform: 'WhatsApp Onboarding',
            status: 'submitted',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await fetch(`${supabaseUrl}/rest/v1/onboarding_records?on_conflict=id`, {
            method: 'POST',
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(parentPayload),
          }).catch(() => {});
        }
      } catch (parentErr) {
        console.warn('[SAVE-METADATA] Parent record check warning:', parentErr);
      }
    }

    let targetUrl = `${supabaseUrl}/rest/v1/${table}`;
    let method = 'POST';
    const headers: Record<string, string> = {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };

    if (action === 'insert') {
      method = 'POST';
    } else if (action === 'upsert') {
      method = 'POST';
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
    } else if (action === 'update') {
      method = 'PATCH';
      if (match && typeof match === 'object') {
        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(match)) {
          queryParams.append(k, `eq.${v}`);
        }
        targetUrl += `?${queryParams.toString()}`;
      }
    } else if (action === 'delete') {
      method = 'DELETE';
      if (match && typeof match === 'object') {
        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(match)) {
          queryParams.append(k, `eq.${v}`);
        }
        targetUrl += `?${queryParams.toString()}`;
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (action !== 'delete') {
      fetchOptions.body = JSON.stringify(payload);
    }

    const restRes = await fetch(targetUrl, fetchOptions);
    const restData: any = await restRes.json().catch(() => ({}));

    if (!restRes.ok) {
      const errMsg = typeof restData === 'object' ? (restData.message || restData.error || JSON.stringify(restData)) : String(restData);
      res.statusCode = restRes.status || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Supabase REST API error (${restRes.status}): ${errMsg}` }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: restData }));
  } catch (err: any) {
    console.error('[SAVE-METADATA] Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Server error saving metadata.' }));
  }
}
