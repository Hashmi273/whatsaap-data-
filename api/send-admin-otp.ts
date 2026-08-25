import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';

interface SendOtpRequestBody {
  targetEmail: string;
  targetName?: string;
}

const ADMIN_SECURITY_PHONE = (process.env.ADMIN_SECURITY_PHONE || '8858674641').trim();
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
    // 1. Parse JSON request body
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

    // 2. Validate Corporate Domain
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

    // 3. Generate Cryptographically Secure 6-Digit Dynamic OTP (100000 to 999999)
    // NEVER hardcoded (no 1111)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // 4. Formulate DLT Approved SMS Message Text with dynamic OTP
    // Valid for 10 minutes. Zion
    const messageText = `Your OTP for verification is ${otp}.\nDo not share it with anyone.\nValid for 10 minutes.\nZion`;

    // 5. CPass SMS Gateway Parameters (strictly server-side)
    const smsApiUrl = process.env.SMS_API_URL || 'http://cpassweb.in/api/SmsApi/SendSingleApi';
    const smsUserId = process.env.SMS_API_USER_ID || 'Immense_Rcs';
    const smsPassword = process.env.SMS_API_PASSWORD || 'Immense_Rcs';
    const smsSenderId = process.env.SMS_SENDER_ID || 'ZIONEN';
    const smsEntityId = process.env.SMS_ENTITY_ID || '1001970166055565595';
    const smsTemplateId = process.env.SMS_TEMPLATE_ID || '1207177987659243590';
    const destinationPhone = ADMIN_SECURITY_PHONE;

    // 6. Construct Clean URL-Encoded CPass Single Request
    const cpassUrl = new URL(smsApiUrl.trim());
    cpassUrl.searchParams.set('UserID', smsUserId);
    cpassUrl.searchParams.set('Password', smsPassword);
    cpassUrl.searchParams.set('SenderID', smsSenderId);
    cpassUrl.searchParams.set('Phno', destinationPhone);
    cpassUrl.searchParams.set('Msg', messageText);
    cpassUrl.searchParams.set('EntityID', smsEntityId);
    cpassUrl.searchParams.set('TemplateID', smsTemplateId);

    let smsSent = false;
    let gatewayResponseText = '';
    let cpassMessageId = '';

    // EXACTLY ONE single HTTP request
    try {
      const gatewayRes = await fetch(cpassUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      });

      gatewayResponseText = await gatewayRes.text().catch(() => '');

      if (gatewayRes.ok) {
        const lower = gatewayResponseText.toLowerCase();
        // Check for common error keywords in gateway response
        if (
          lower.includes('invalid') ||
          lower.includes('failed') ||
          lower.includes('unauthorized') ||
          lower.includes('insufficient') ||
          lower.includes('template mismatch') ||
          lower.includes('error')
        ) {
          smsSent = false;
        } else {
          smsSent = true;
          // Extract message ID if returned as JSON or string token
          try {
            const parsed = JSON.parse(gatewayResponseText);
            cpassMessageId = parsed?.MessageId || parsed?.id || parsed?.Status || gatewayResponseText.trim();
          } catch {
            cpassMessageId = gatewayResponseText.trim();
          }
        }
      } else {
        smsSent = false;
      }
    } catch (err: any) {
      smsSent = false;
      gatewayResponseText = err.message || 'Connection to CPass SMS gateway timed out.';
    }

    // 7. If dispatch failed, DO NOT create or save any OTP verification record
    if (!smsSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: 'Unable to send SMS OTP. Please try again.',
          gatewayResponse: gatewayResponseText,
        })
      );
      return;
    }

    // 8. ONLY upon verified gateway acceptance: Store SHA-256 Hashed OTP in Database
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
        console.warn('DB OTP hash record note:', dbErr);
      }

      // Log dispatch audit record with CPass message ID
      try {
        await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
          method: 'POST',
          headers: {
            apikey: supabaseServiceKey.trim(),
            Authorization: `Bearer ${supabaseServiceKey.trim()}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            action: 'sms_otp_dispatched',
            entity_type: 'auth',
            entity_id: cleanTargetEmail,
            metadata: {
              target_email: cleanTargetEmail,
              security_phone: destinationPhone,
              cpass_message_id: cpassMessageId,
              gateway_response: gatewayResponseText,
              dispatch_status: 'success',
              requested_at: new Date().toISOString(),
            },
          }),
        });
      } catch (auditErr) {
        console.warn('Audit log dispatch note:', auditErr);
      }
    }

    // 9. Return success with gateway confirmation
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: 'SMS OTP accepted by gateway.',
        messageId: cpassMessageId,
        destinationPhone,
        targetEmail: cleanTargetEmail,
        expiresAt,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'Unable to send SMS OTP. Please try again.',
      })
    );
  }
}
