import type { IncomingMessage, ServerResponse } from 'http';

// Safe read-only diagnostic endpoint — NEVER exposes actual token values
// Returns only metadata: key presence, key lengths, HTTP status of reads
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
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

    const diag: Record<string, any> = {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      serviceRoleConfigured: Boolean(supabaseServiceKey),
      serviceRoleLength: supabaseServiceKey.length,
      appConfigRequestStatus: 'not_attempted',
      appConfigRowsCount: 0,
      googleDriveRows: {} as Record<string, any>,
      googleOAuthStatus: 'not_attempted',
      googleOAuthHttpStatus: null as number | null,
      connectedEmail: null as string | null,
    };

    // 1. Fetch all app_config rows
    if (supabaseUrl && supabaseServiceKey) {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      diag.appConfigRequestStatus = configRes.status;

      if (configRes.ok) {
        const rows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
        diag.appConfigRowsCount = Array.isArray(rows) ? rows.length : 0;

        const keyNames = [
          'google_drive_access_token',
          'google_drive_refresh_token',
          'google_drive_email',
          'google_drive_token_expires_at',
          'google_drive_connected_at',
        ];

        for (const keyName of keyNames) {
          const row = rows.find((r) => r.key === keyName);
          if (row && row.value) {
            if (keyName === 'google_drive_email' || keyName === 'google_drive_connected_at' || keyName === 'google_drive_token_expires_at') {
              // These are safe to expose as-is
              diag.googleDriveRows[keyName] = row.value;
            } else {
              // For token values: report length only, never the value
              diag.googleDriveRows[keyName] = {
                found: true,
                length: row.value.trim().length,
                prefix: row.value.trim().slice(0, 6) + '...',  // first 6 chars only, safe indicator
              };
            }
          } else {
            diag.googleDriveRows[keyName] = { found: false };
          }
        }

        // 2. If access token is present, probe Google Drive API
        const accessRow = rows.find((r) => r.key === 'google_drive_access_token');
        if (accessRow?.value) {
          try {
            const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
              headers: { Authorization: `Bearer ${accessRow.value.trim()}` },
            });
            diag.googleOAuthStatus = aboutRes.ok ? 'access_token_valid' : `access_token_invalid_http_${aboutRes.status}`;
            diag.googleOAuthHttpStatus = aboutRes.status;
            if (aboutRes.ok) {
              const data: any = (await aboutRes.json().catch(() => ({}))) as any;
              if (data.user?.emailAddress) {
                diag.connectedEmail = data.user.emailAddress;
              }
            }
          } catch (probeErr: any) {
            diag.googleOAuthStatus = `probe_error: ${probeErr.message}`;
          }
        } else {
          diag.googleOAuthStatus = 'no_access_token_in_db';
        }
      } else {
        const errText = await configRes.text().catch(() => '');
        diag.appConfigError = errText.slice(0, 200);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, diagnostics: diag }, null, 2));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}
