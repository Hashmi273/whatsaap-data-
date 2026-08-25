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

    const smsApiUrl = process.env.SMS_API_URL || 'http://cpassweb.in/api/SmsApi/SendSingleApi';
    const smsUserId = process.env.SMS_API_USER_ID || 'Immense_Rcs';
    const smsPassword = process.env.SMS_API_PASSWORD || 'Immense_Rcs';
    const smsSenderId = process.env.SMS_SENDER_ID || 'ZIONEN';
    const smsEntityId = process.env.SMS_ENTITY_ID || '1001970166055565595';
    const smsTemplateId = process.env.SMS_TEMPLATE_ID || '1207177987659243590';
    const destinationPhone = (process.env.ADMIN_SECURITY_PHONE || '8858674641').trim();

    try {
      // Build CPass SendSingleApi URL
      const cpassUrl = new URL(smsApiUrl.trim());
      cpassUrl.searchParams.set('UserID', smsUserId);
      cpassUrl.searchParams.set('Password', smsPassword);
      cpassUrl.searchParams.set('SenderID', smsSenderId);
      cpassUrl.searchParams.set('Phno', destinationPhone);
      cpassUrl.searchParams.set('Msg', messageText);
      cpassUrl.searchParams.set('EntityID', smsEntityId);
      cpassUrl.searchParams.set('TemplateID', smsTemplateId);

      const gatewayRes = await fetch(cpassUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
        },
      });

      const gatewayText = await gatewayRes.text().catch(() => '');

      // Check if response indicates success
      if (gatewayRes.ok) {
        const lower = gatewayText.toLowerCase();
        if (
          lower.includes('invalid') ||
          lower.includes('failed') ||
          lower.includes('unauthorized') ||
          lower.includes('insufficient') ||
          lower.includes('template mismatch')
        ) {
          providerError = gatewayText || 'SMS Gateway rejected the request.';
        } else {
          smsSent = true;
        }
      } else {
        providerError = gatewayText || `CPass Gateway HTTP ${gatewayRes.status}`;
      }
    } catch (e: any) {
      providerError = e.message || 'SMS Gateway connection failed.';
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
