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

  // Safe diagnostic state — all written to logs and included in response for debugging
  const diag: Record<string, any> = {
    supabaseUrlConfigured: false,
    serviceRoleConfigured: false,
    serviceRoleLength: 0,
    appConfigRequestStatus: 'not_attempted',
    appConfigRowsCount: 0,
    accessTokenRowFound: false,
    refreshTokenRowFound: false,
    emailRowFound: false,
    accessTokenLength: 0,
    refreshTokenLength: 0,
    googleProbeStatus: 'not_attempted',
    refreshAttempted: false,
    refreshStatus: 'not_attempted',
    connectionDetermination: 'unknown',
  };

  try {
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    diag.supabaseUrlConfigured = Boolean(supabaseUrl);
    diag.serviceRoleConfigured = Boolean(supabaseServiceKey);
    diag.serviceRoleLength = supabaseServiceKey.length;

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    let refreshToken = '';
    let accessToken = '';
    let targetAccount = '';
    let isConnected = false;

    // 1. Read stored Google Drive tokens from PostgreSQL app_config table
    if (supabaseUrl && supabaseServiceKey) {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      diag.appConfigRequestStatus = configRes.status;

      if (configRes.ok) {
        const configRows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
        diag.appConfigRowsCount = Array.isArray(configRows) ? configRows.length : 0;

        if (Array.isArray(configRows)) {
          const tokenRow = configRows.find((r) => r.key === 'google_drive_refresh_token');
          const accessRow = configRows.find((r) => r.key === 'google_drive_access_token');
          const emailRow = configRows.find((r) => r.key === 'google_drive_email');

          if (tokenRow?.value) {
            refreshToken = tokenRow.value.trim();
            diag.refreshTokenRowFound = true;
            diag.refreshTokenLength = refreshToken.length;
          }
          if (accessRow?.value) {
            accessToken = accessRow.value.trim();
            diag.accessTokenRowFound = true;
            diag.accessTokenLength = accessToken.length;
          }
          if (emailRow?.value) {
            targetAccount = emailRow.value.trim();
            diag.emailRowFound = true;
          }
        }
      } else {
        const errBody = await configRes.text().catch(() => '');
        diag.appConfigError = errBody.slice(0, 200);
        console.error('[GDRIVE-STATUS] app_config read failed:', configRes.status, errBody.slice(0, 200));
      }
    }

    let storageUsedBytes = 0;
    let storageTotalBytes = 0;

    // 2. Probe Google Drive API with access token
    if (accessToken) {
      try {
        const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        diag.googleProbeStatus = aboutRes.status;

        if (aboutRes.ok) {
          const aboutData: any = (await aboutRes.json().catch(() => ({}))) as any;
          isConnected = true;
          diag.connectionDetermination = 'access_token_valid_google_200';

          if (aboutData.user?.emailAddress) {
            targetAccount = aboutData.user.emailAddress;
          }
          if (aboutData.storageQuota) {
            storageUsedBytes = Number(aboutData.storageQuota.usage || 0);
            // Free Google accounts return null for limit — use 15 GB as documented default
            storageTotalBytes = Number(aboutData.storageQuota.limit || 15 * 1024 * 1024 * 1024);
          }
        } else {
          const probErrText = await aboutRes.text().catch(() => '');
          diag.googleProbeError = probErrText.slice(0, 200);
          console.warn('[GDRIVE-STATUS] Google Drive probe returned non-200:', aboutRes.status, probErrText.slice(0, 100));
        }
      } catch (probeErr: any) {
        diag.googleProbeStatus = `exception: ${probeErr.message}`;
        console.error('[GDRIVE-STATUS] Google Drive probe threw exception:', probeErr.message);
      }
    }

    // 3. If access token probe failed, try refreshing with refresh token
    if (!isConnected && clientId && clientSecret && refreshToken) {
      diag.refreshAttempted = true;
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

        diag.refreshStatus = tokenRes.status;
        const tokenData: any = (await tokenRes.json().catch(() => ({}))) as any;

        if (tokenRes.ok && tokenData.access_token) {
          const freshToken = tokenData.access_token;
          const expiresIn = Number(tokenData.expires_in || 3600);
          const newExpiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();

          // Persist fresh access token to app_config (fire and forget)
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

          try {
            const verifyRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
              headers: { Authorization: `Bearer ${freshToken}` },
            });

            diag.refreshProbeStatus = verifyRes.status;

            if (verifyRes.ok) {
              const verifyData: any = (await verifyRes.json().catch(() => ({}))) as any;
              isConnected = true;
              diag.connectionDetermination = 'refresh_token_exchanged_and_valid';
              if (verifyData.user?.emailAddress) {
                targetAccount = verifyData.user.emailAddress;
              }
              if (verifyData.storageQuota) {
                storageUsedBytes = Number(verifyData.storageQuota.usage || 0);
                storageTotalBytes = Number(verifyData.storageQuota.limit || 15 * 1024 * 1024 * 1024);
              }
            } else {
              diag.connectionDetermination = `refresh_probe_failed_${verifyRes.status}`;
              console.warn('[GDRIVE-STATUS] Verify after refresh failed:', verifyRes.status);
            }
          } catch (verifyErr: any) {
            diag.connectionDetermination = `refresh_verify_exception: ${verifyErr.message}`;
          }
        } else {
          const refreshErrMsg = tokenData.error_description || tokenData.error || 'unknown';
          diag.connectionDetermination = `refresh_exchange_failed: ${refreshErrMsg}`;
          console.warn('[GDRIVE-STATUS] Refresh token exchange failed:', tokenData.error, tokenData.error_description);
        }
      } catch (refreshErr: any) {
        diag.connectionDetermination = `refresh_exception: ${refreshErr.message}`;
        console.error('[GDRIVE-STATUS] Refresh threw exception:', refreshErr.message);
      }
    } else if (!isConnected) {
      if (!accessToken && !refreshToken) {
        diag.connectionDetermination = 'no_tokens_in_db';
      } else if (!accessToken) {
        diag.connectionDetermination = 'no_access_token_skipped_refresh_check_client_creds';
      }
    }

    console.log(`[GDRIVE-STATUS-DIAGNOSTIC]
supabaseUrlConfigured=${diag.supabaseUrlConfigured}
serviceRoleConfigured=${diag.serviceRoleConfigured}
appConfigRequestStatus=${diag.appConfigRequestStatus}
appConfigRowsCount=${diag.appConfigRowsCount}
accessTokenRowFound=${diag.accessTokenRowFound}
accessTokenLength=${diag.accessTokenLength}
refreshTokenRowFound=${diag.refreshTokenRowFound}
refreshTokenLength=${diag.refreshTokenLength}
googleProbeStatus=${diag.googleProbeStatus}
refreshAttempted=${diag.refreshAttempted}
isConnected=${isConnected}
connectionDetermination=${diag.connectionDetermination}`);

    // Fetch live company records count from Supabase (non-fatal)
    let records: any[] = [];
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const recRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name,company_name,platform,status,created_at`, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });
        const recBody = await recRes.json().catch(() => []);
        records = Array.isArray(recBody) ? recBody : [];
      } catch {
        // Non-fatal: records count is for display only
      }
    }

    const whatsappCount = records.filter((r) => (r.platform || '').toLowerCase().includes('meta') || (r.platform || '').toLowerCase().includes('whatsapp')).length;
    const rcsCount = records.filter((r) => (r.platform || '').toLowerCase().includes('rcs')).length;
    const totalFiles = records.length * 3;
    const usagePercent = storageTotalBytes > 0
      ? Math.min(100, Math.round((storageUsedBytes / storageTotalBytes) * 100))
      : 0;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        targetAccount: targetAccount || null,
        isConnected,
        connectionDetermination: diag.connectionDetermination,
        storageQuota: {
          usedBytes: storageUsedBytes,
          totalBytes: storageTotalBytes,
          usagePercent,
          isNearLimit: usagePercent >= 80,
          usedFormatted: storageUsedBytes > 0 ? `${(storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB` : '—',
          totalFormatted: storageTotalBytes > 0 ? `${(storageTotalBytes / (1024 * 1024 * 1024)).toFixed(0)} GB` : '—',
        },
        stats: {
          totalRecords: records.length,
          totalBackupFiles: totalFiles,
          whatsappBackupFiles: whatsappCount * 3,
          rcsBackupFiles: rcsCount * 3,
          lastBackupAt: new Date().toISOString(),
        },
        diagnostics: {
          supabaseUrlConfigured: diag.supabaseUrlConfigured,
          serviceRoleConfigured: diag.serviceRoleConfigured,
          appConfigRequestStatus: diag.appConfigRequestStatus,
          appConfigRowsCount: diag.appConfigRowsCount,
          accessTokenRowFound: diag.accessTokenRowFound,
          accessTokenLength: diag.accessTokenLength,
          refreshTokenRowFound: diag.refreshTokenRowFound,
          googleProbeStatus: diag.googleProbeStatus,
          refreshAttempted: diag.refreshAttempted,
          refreshStatus: diag.refreshStatus,
          ...(diag.googleProbeError ? { googleProbeError: diag.googleProbeError } : {}),
          ...(diag.appConfigError ? { appConfigError: diag.appConfigError } : {}),
        },
      })
    );
  } catch (err: any) {
    console.error('[GDRIVE-STATUS] Fatal error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Failed to retrieve Google Drive status.',
        code: 'STATUS_INTERNAL_ERROR',
        diagnostics: diag,
      })
    );
  }
}
