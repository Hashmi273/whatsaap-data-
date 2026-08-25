import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co').replace(/\/+$/, '');
    const supabaseServiceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_KEY ||
      ''
    ).trim();

    if (supabaseUrl && supabaseServiceKey) {
      await fetch(`${supabaseUrl}/rest/v1/app_config?key=in.(google_drive_refresh_token,google_drive_access_token,google_drive_email,google_drive_connected_at)`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Google Drive disconnected successfully.' }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Failed to disconnect Google Drive.' }));
  }
}
