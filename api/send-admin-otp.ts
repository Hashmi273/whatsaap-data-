import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';

interface SendOtpRequestBody {
  targetEmail: string;
  targetName?: string;
}

const ADMIN_SECURITY_PHONE = process.env.ADMIN_SECURITY_PHONE || '8858674641';
const ALLOWED_EMAIL_DOMAIN = 'immensesmartsolutions.com';

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
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  try {
    // Parse JSON request body
    let body: SendOtpRequestBody;
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

    const { targetEmail, targetName } = body;

    if (!targetEmail || !targetEmail.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Target staff email is required.' }));
      return;
    }

    const cleanTargetEmail = targetEmail.trim().toLowerCase();

    // 1. Corporate domain validation
    if (!cleanTargetEmail.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: `Password resets are restricted to corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}).`,
        })
      );
      return;
    }

    // 2. Generate Cryptographically Secure 6-Digit Dynamic OTP (never hardcoded)
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

    // 3. Format SMS Content according to approved DLT Template
    const messageText = `Your OTP for verification is ${otp}.\nDo not share it with anyone.\nValid for 10 minutes.\nZion`;

    // 4. Dispatch SMS via CPass SMS Gateway
    let smsSent = false;
    let providerError = '';

    const smsApiUrl = process.env.SMS_API_URL;
    const smsUserId = process.env.SMS_API_USER_ID;
    const smsPassword = process.env.SMS_API_PASSWORD;
    const smsSenderId = process.env.SMS_SENDER_ID || 'ZION';
    const smsEntityId = process.env.SMS_ENTITY_ID || '';
    const smsTemplateId = process.env.SMS_TEMPLATE_ID || '';
    const destinationPhone = ADMIN_SECURITY_PHONE.trim();

    if (smsApiUrl) {
      try {
        let endpointUrl = smsApiUrl.trim();

        // Check if URL has template placeholders
        if (endpointUrl.includes('{OTP}') || endpointUrl.includes('{PHONE}')) {
          endpointUrl = endpointUrl
            .replace('{OTP}', encodeURIComponent(otp))
            .replace('{PHONE}', encodeURIComponent(destinationPhone))
            .replace('{MESSAGE}', encodeURIComponent(messageText))
            .replace('{USER_ID}', encodeURIComponent(smsUserId || ''))
            .replace('{PASSWORD}', encodeURIComponent(smsPassword || ''))
            .replace('{SENDER_ID}', encodeURIComponent(smsSenderId))
            .replace('{ENTITY_ID}', encodeURIComponent(smsEntityId))
            .replace('{TEMPLATE_ID}', encodeURIComponent(smsTemplateId));

          const gatewayRes = await fetch(endpointUrl, { method: 'GET' });
          const gatewayText = await gatewayRes.text().catch(() => '');

          if (gatewayRes.ok && !gatewayText.toLowerCase().includes('error') && !gatewayText.toLowerCase().includes('failed') && !gatewayText.toLowerCase().includes('invalid')) {
            smsSent = true;
          } else {
            providerError = gatewayText || `SMS Gateway HTTP ${gatewayRes.status}`;
          }
        } else {
          // Standard HTTP POST / GET query parameters to SMS Gateway
          const params = new URLSearchParams();
          if (smsUserId) params.append('user', smsUserId);
          if (smsUserId) params.append('username', smsUserId);
          if (smsUserId) params.append('userid', smsUserId);
          if (smsPassword) params.append('pass', smsPassword);
          if (smsPassword) params.append('password', smsPassword);
          params.append('sender', smsSenderId);
          params.append('senderid', smsSenderId);
          params.append('phone', destinationPhone);
          params.append('mobile', destinationPhone);
          params.append('numbers', destinationPhone);
          params.append('text', messageText);
          params.append('msg', messageText);
          params.append('message', messageText);
          if (smsEntityId) {
            params.append('entityid', smsEntityId);
            params.append('entity_id', smsEntityId);
            params.append('dltentityid', smsEntityId);
          }
          if (smsTemplateId) {
            params.append('templateid', smsTemplateId);
            params.append('template_id', smsTemplateId);
            params.append('dlttemplateid', smsTemplateId);
          }

          // Try POST first
          let gatewayRes = await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          }).catch(() => null);

          // If POST rejected, try GET query params
          if (!gatewayRes || !gatewayRes.ok) {
            const separator = endpointUrl.includes('?') ? '&' : '?';
            const getUrl = `${endpointUrl}${separator}${params.toString()}`;
            gatewayRes = await fetch(getUrl, { method: 'GET' });
          }

          const gatewayText = await gatewayRes.text().catch(() => '');

          if (gatewayRes.ok && !gatewayText.toLowerCase().includes('error') && !gatewayText.toLowerCase().includes('failed') && !gatewayText.toLowerCase().includes('invalid')) {
            smsSent = true;
          } else {
            providerError = gatewayText || `SMS Gateway HTTP ${gatewayRes.status}`;
          }
        }
      } catch (e: any) {
        providerError = e.message || 'SMS Gateway connection failed.';
      }
    } else {
      providerError = 'SMS service is not configured. Please configure the SMS provider (SMS_API_URL, SMS_API_USER_ID, SMS_API_PASSWORD) in Vercel environment variables.';
    }

    // 5. Store Hashed OTP in Supabase Database (never plaintext OTP)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/admin_otp_verifications`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey.trim(),
            Authorization: `Bearer ${supabaseServiceKey.trim()}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            target_email: cleanTargetEmail,
            security_email: destinationPhone,
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0,
          }),
        });
      } catch (dbErr) {
        console.warn('DB OTP insert note:', dbErr);
      }
    }

    // 6. Return response based on actual SMS confirmation
    if (smsSent) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          message: `Verification OTP sent successfully to the Super Admin mobile number (+91 ${destinationPhone}).`,
          targetEmail: cleanTargetEmail,
          destinationPhone,
          expiresAt,
        })
      );
    } else {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error:
            providerError ||
            'Unable to send verification SMS OTP. Please check SMS provider configuration in Vercel environment variables.',
          targetEmail: cleanTargetEmail,
        })
      );
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Internal Server Error while dispatching SMS verification OTP.',
      })
    );
  }
}
