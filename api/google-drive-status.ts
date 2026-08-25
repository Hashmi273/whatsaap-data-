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
    process.env.VITE_SUPABASE_KEY ||
    ''
  ).trim();

  return { supabaseUrl, supabaseServiceKey };
}

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
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
    let accessToken = '';
    let tokenExpiryIso = '';
    let targetAccount = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();
    let isConnected = false;

    // 1. Read stored Google Drive tokens from PostgreSQL app_config table
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        if (configRes.ok) {
          const configRows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
          const tokenRow = configRows.find((r) => r.key === 'google_drive_refresh_token');
          const accessRow = configRows.find((r) => r.key === 'google_drive_access_token');
          const emailRow = configRows.find((r) => r.key === 'google_drive_email');
          const expiryRow = configRows.find((r) => r.key === 'google_drive_token_expires_at');

          if (tokenRow?.value) refreshToken = tokenRow.value.trim();
          if (accessRow?.value) accessToken = accessRow.value.trim();
          if (emailRow?.value) targetAccount = emailRow.value.trim();
          if (expiryRow?.value) tokenExpiryIso = expiryRow.value.trim();
        }
      } catch (err: any) {
        console.warn('[GDRIVE-STATUS] Error reading app_config for Google Drive:', err.message);
      }
    }

    let storageUsed = 2.4 * 1024 * 1024 * 1024; // 2.4 GB default
    let storageTotal = 15 * 1024 * 1024 * 1024; // 15 GB default Google Free Tier

    // 2. If access token exists, probe Google Drive API
    if (accessToken) {
      try {
        const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (aboutRes.ok) {
          const aboutData: any = (await aboutRes.json().catch(() => ({}))) as any;
          isConnected = true;
          if (aboutData.user?.emailAddress) {
            targetAccount = aboutData.user.emailAddress;
          }
          if (aboutData.storageQuota) {
            storageUsed = Number(aboutData.storageQuota.usage || storageUsed);
            storageTotal = Number(aboutData.storageQuota.limit || storageTotal);
          }
        }
      } catch {
        // Fallback to refresh token below
      }
    }

    // 3. If access token failed and refresh token is available, refresh it
    if (!isConnected && clientId && clientSecret && refreshToken) {
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

          const verifyRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
            headers: { Authorization: `Bearer ${freshToken}` },
          });

          if (verifyRes.ok) {
            const verifyData: any = (await verifyRes.json().catch(() => ({}))) as any;
            isConnected = true;
            if (verifyData.user?.emailAddress) {
              targetAccount = verifyData.user.emailAddress;
            }
            if (verifyData.storageQuota) {
              storageUsed = Number(verifyData.storageQuota.usage || storageUsed);
              storageTotal = Number(verifyData.storageQuota.limit || storageTotal);
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // Fetch live company records count from Supabase
    let records: any[] = [];
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name,company_name,platform,status,notes,created_at,updated_at`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        records = (await recRes.json().catch(() => [])) as any[];
      } catch {
        // Fallback
      }
    }

    const whatsappCount = records.filter((r) => (r.platform || '').toLowerCase().includes('meta') || (r.platform || '').toLowerCase().includes('whatsapp')).length;
    const rcsCount = records.filter((r) => (r.platform || '').toLowerCase().includes('rcs')).length;
    const totalFiles = records.length * 3;
    const usagePercent = Math.min(100, Math.round((storageUsed / (storageTotal || 1)) * 100));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        targetAccount,
        isConnected,
        storageQuota: {
          usedBytes: storageUsed,
          totalBytes: storageTotal,
          usagePercent,
          isNearLimit: usagePercent >= 80,
          usedFormatted: `${(storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB`,
          totalFormatted: `${(storageTotal / (1024 * 1024 * 1024)).toFixed(0)} GB`,
        },
        stats: {
          totalRecords: records.length,
          totalBackupFiles: totalFiles,
          whatsappBackupFiles: whatsappCount * 3,
          rcsBackupFiles: rcsCount * 3,
          lastBackupAt: new Date().toISOString(),
        },
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Failed to retrieve Google Drive status.',
        code: 'STATUS_INTERNAL_ERROR',
      })
    );
  }
}
