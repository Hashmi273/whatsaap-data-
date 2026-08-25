// Shared Google Drive Authentication & Token Resolution Utility

export interface GoogleAuthDiagnostics {
  appConfigLoaded: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasEmail: boolean;
  tokenExpiry: string;
  accessTokenValidationStatus: number | string;
  refreshAttempted: boolean;
  refreshResponseStatus: number | string;
  finalAuthenticationStatus: 'success' | 'failure';
}

export interface GoogleAuthResolution {
  token: string | null;
  email: string;
  error?: string;
  storageQuota?: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  diagnostics: GoogleAuthDiagnostics;
}

export function getSupabaseCredentials() {
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

export async function resolveGoogleDriveToken(): Promise<GoogleAuthResolution> {
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  let refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  let accessToken = '';
  let tokenExpiryIso = '';
  let userEmail = (process.env.GOOGLE_BACKUP_EMAIL || 'parvejweb1@gmail.com').trim();
  let appConfigLoaded = false;

  const diagnostics: GoogleAuthDiagnostics = {
    appConfigLoaded: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    hasEmail: false,
    tokenExpiry: 'none',
    accessTokenValidationStatus: 'none',
    refreshAttempted: false,
    refreshResponseStatus: 'none',
    finalAuthenticationStatus: 'failure',
  };

  // 1. Read app_config from PostgreSQL
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const configRes = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key,value`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });

      if (configRes.ok) {
        appConfigLoaded = true;
        const configRows: Array<{ key: string; value: string }> = (await configRes.json().catch(() => [])) as any[];
        const tokenRow = configRows.find((r) => r.key === 'google_drive_refresh_token');
        const accessRow = configRows.find((r) => r.key === 'google_drive_access_token');
        const emailRow = configRows.find((r) => r.key === 'google_drive_email');
        const expiryRow = configRows.find((r) => r.key === 'google_drive_token_expires_at');

        if (tokenRow?.value) refreshToken = tokenRow.value.trim();
        if (accessRow?.value) accessToken = accessRow.value.trim();
        if (emailRow?.value) userEmail = emailRow.value.trim();
        if (expiryRow?.value) tokenExpiryIso = expiryRow.value.trim();
      }
    } catch {
      appConfigLoaded = false;
    }
  }

  diagnostics.appConfigLoaded = appConfigLoaded;
  diagnostics.hasAccessToken = Boolean(accessToken);
  diagnostics.hasRefreshToken = Boolean(refreshToken);
  diagnostics.hasEmail = Boolean(userEmail);
  diagnostics.tokenExpiry = tokenExpiryIso || 'none';

  let storageQuota: GoogleAuthResolution['storageQuota'] | undefined = undefined;

  // 2. If access token exists, probe Google Drive API
  if (accessToken) {
    try {
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      diagnostics.accessTokenValidationStatus = aboutRes.status;

      if (aboutRes.ok) {
        const aboutData: any = (await aboutRes.json().catch(() => ({}))) as any;
        if (aboutData.user?.emailAddress) {
          userEmail = aboutData.user.emailAddress;
        }

        if (aboutData.storageQuota) {
          const usedBytes = Number(aboutData.storageQuota.usage || 0);
          const totalBytes = Number(aboutData.storageQuota.limit || 15 * 1024 * 1024 * 1024);
          const usagePercent = Math.min(100, Math.round((usedBytes / (totalBytes || 1)) * 100));
          storageQuota = {
            usedBytes,
            totalBytes,
            usagePercent,
            usedFormatted: `${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
            totalFormatted: `${(totalBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
          };
        }

        diagnostics.finalAuthenticationStatus = 'success';
        return {
          token: accessToken,
          email: userEmail,
          storageQuota,
          diagnostics,
        };
      }

      // Handle specific HTTP errors
      if (aboutRes.status === 403) {
        diagnostics.finalAuthenticationStatus = 'failure';
        return {
          token: null,
          email: userEmail,
          error: 'Google Drive permission denied (HTTP 403). Check OAuth scopes in Google Cloud Console.',
          diagnostics,
        };
      } else if (aboutRes.status === 429) {
        diagnostics.finalAuthenticationStatus = 'failure';
        return {
          token: null,
          email: userEmail,
          error: 'Google Drive rate limit exceeded (HTTP 429). Please retry in a few moments.',
          diagnostics,
        };
      } else if (aboutRes.status >= 500) {
        diagnostics.finalAuthenticationStatus = 'failure';
        return {
          token: null,
          email: userEmail,
          error: `Google Drive API temporarily unavailable (HTTP ${aboutRes.status}). Please retry shortly.`,
          diagnostics,
        };
      }
      // If 401 or other, proceed to token refresh below
    } catch (testErr: any) {
      diagnostics.accessTokenValidationStatus = testErr.message || 'error';
    }
  }

  // 3. If access token is missing or returned 401, attempt refresh token exchange
  if (clientId && clientSecret && refreshToken) {
    diagnostics.refreshAttempted = true;
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

      diagnostics.refreshResponseStatus = tokenRes.status;
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

        // Verify fresh token with Google Drive API /about
        try {
          const verifyRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
            headers: { Authorization: `Bearer ${freshToken}` },
          });

          if (verifyRes.ok) {
            const verifyData: any = (await verifyRes.json().catch(() => ({}))) as any;
            if (verifyData.user?.emailAddress) {
              userEmail = verifyData.user.emailAddress;
            }

            if (verifyData.storageQuota) {
              const usedBytes = Number(verifyData.storageQuota.usage || 0);
              const totalBytes = Number(verifyData.storageQuota.limit || 15 * 1024 * 1024 * 1024);
              const usagePercent = Math.min(100, Math.round((usedBytes / (totalBytes || 1)) * 100));
              storageQuota = {
                usedBytes,
                totalBytes,
                usagePercent,
                usedFormatted: `${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
                totalFormatted: `${(totalBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
              };
            }

            diagnostics.finalAuthenticationStatus = 'success';
            return {
              token: freshToken,
              email: userEmail,
              storageQuota,
              diagnostics,
            };
          }
        } catch {
          // Continue with fresh token even if verify /about threw network error
        }

        diagnostics.finalAuthenticationStatus = 'success';
        return {
          token: freshToken,
          email: userEmail,
          diagnostics,
        };
      }

      diagnostics.finalAuthenticationStatus = 'failure';
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to exchange refresh token';
      return {
        token: null,
        email: userEmail,
        error: errMsg,
        diagnostics,
      };
    } catch (refreshErr: any) {
      diagnostics.finalAuthenticationStatus = 'failure';
      return {
        token: null,
        email: userEmail,
        error: refreshErr.message || 'Token refresh request failed.',
        diagnostics,
      };
    }
  }

  // 4. Genuine not connected state
  diagnostics.finalAuthenticationStatus = 'failure';
  return {
    token: null,
    email: userEmail,
    error: 'Google Drive is not connected. Please click "Connect Google Drive" in Settings to authenticate.',
    diagnostics,
  };
}
