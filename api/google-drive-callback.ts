import type { IncomingMessage, ServerResponse } from 'http';

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

    // Exchange authorization code for tokens
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

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to exchange authorization code.';
      res.statusCode = 302;
      res.setHeader('Location', `${appUrl}/settings?gdrive_error=${encodeURIComponent(errMsg)}`);
      res.end();
      return;
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Fetch user email from Google UserInfo
    let userEmail = 'parvejweb1@gmail.com';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.email) {
          userEmail = userData.email;
        }
      }
    } catch {
      // Fallback
    }

    // Store tokens securely server-side in Supabase PostgreSQL app_config table
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_KEY ||
      ''
    ).trim();

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const configUpdates = [
          { key: 'google_drive_email', value: userEmail },
          { key: 'google_drive_connected_at', value: new Date().toISOString() },
        ];

        if (refreshToken) {
          configUpdates.push({ key: 'google_drive_refresh_token', value: refreshToken });
        }
        if (accessToken) {
          configUpdates.push({ key: 'google_drive_access_token', value: accessToken });
        }

        await fetch(`${supabaseUrl}/rest/v1/app_config`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(configUpdates),
        });
      } catch (dbErr: any) {
        console.error('Error saving Google Drive config to database:', dbErr.message);
      }
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
