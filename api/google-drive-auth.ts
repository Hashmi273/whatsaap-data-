import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';

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
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      'https://whatsaap-data.vercel.app/api/google-drive-callback'
    ).trim();

    if (!clientId) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: 'GOOGLE_CLIENT_ID is not configured in server environment variables.',
        })
      );
      return;
    }

    // Secure CSRF state token
    const state = crypto.randomBytes(24).toString('hex');

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'true',
    }).toString()}`;

    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const format = urlObj.searchParams.get('format');

    if (format === 'json') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, url: authUrl, state }));
      return;
    }

    // Direct HTTP 302 Redirect
    res.statusCode = 302;
    res.setHeader('Location', authUrl);
    res.end();
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Failed to initialize Google Drive OAuth.' }));
  }
}
