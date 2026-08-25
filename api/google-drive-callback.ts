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
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    const appUrl = (
      process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      `https://${req.headers.host || 'whatsaap-data.vercel.app'}`
    ).replace(/\/+$/, '');

    if (error) {
      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(error)}`);
      res.end();
      return;
    }

    if (!code) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Authorization code is missing from Google callback.' }));
      return;
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      'https://whatsaap-data.vercel.app/api/google-drive-callback'
    ).trim();

    if (!clientId || !clientSecret) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in server environment variables.',
        })
      );
      return;
    }

    // Exchange authorization code for tokens with Google OAuth
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData: any = (await tokenRes.json()) as any;

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to exchange authorization code.';
      console.error('[GDRIVE-CALLBACK] Token exchange failed:', errMsg);
      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(errMsg)}`);
      res.end();
      return;
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in || 3600);
    const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log(`[GDRIVE-CALLBACK] Received tokens. Has refreshToken: ${Boolean(refreshToken)}, expiresIn: ${expiresIn}s`);

    // Fetch user email from Google UserInfo
    let userEmail = 'parvejweb1@gmail.com';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userData: any = (await userRes.json()) as any;
        if (userData.email) {
          userEmail = userData.email;
        }
      }
    } catch {
      // Fallback
    }

    // Store tokens securely server-side in Supabase PostgreSQL app_config table using on_conflict=key
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const configUpdates: Array<{ key: string; value: string }> = [
          { key: 'google_drive_email', value: userEmail },
          { key: 'google_drive_access_token', value: accessToken },
          { key: 'google_drive_token_expires_at', value: expiresAtIso },
          { key: 'google_drive_connected_at', value: new Date().toISOString() },
        ];

        if (refreshToken) {
          configUpdates.push({ key: 'google_drive_refresh_token', value: refreshToken });
        }

        const dbRes = await fetch(`${supabaseUrl}/rest/v1/app_config?on_conflict=key`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(configUpdates),
        });

        if (!dbRes.ok) {
          const errText = await dbRes.text().catch(() => '');
          console.error('[GDRIVE-CALLBACK] Failed to persist tokens to app_config:', errText);
        } else {
          console.log('[GDRIVE-CALLBACK] Successfully persisted Google Drive OAuth tokens to app_config table.');
        }
      } catch (dbErr: any) {
        console.error('[GDRIVE-CALLBACK] Error saving Google Drive config to database:', dbErr.message);
      }
    } else {
      console.error('[GDRIVE-CALLBACK] SUPABASE_SERVICE_ROLE_KEY is missing; cannot save OAuth tokens.');
    }

    // Redirect user back to portal settings with success parameter
    res.statusCode = 302;
    res.setHeader('Location', `${appUrl}/settings?gdrive=connected&email=${encodeURIComponent(userEmail)}`);
    res.end();
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'OAuth callback processing failed.' }));
  }
}
