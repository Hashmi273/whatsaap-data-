import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';

interface SendOtpRequestBody {
  targetEmail: string;
  targetName?: string;
}

const ADMIN_SECURITY_EMAIL = 'hashmimdparvej78654@gmail.com';
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
    // Parse JSON body
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
      res.end(JSON.stringify({ success: false, error: 'Target email is required.' }));
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
          error: `Registration and password resets are restricted to corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}).`,
        })
      );
      return;
    }

    // 2. Generate 6-Digit Cryptographic Random OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins
    const requestTime = new Date().toUTCString();

    // 3. Email Template
    const subject = `[IMMENSE Security] Password Reset OTP for ${cleanTargetEmail}`;
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
        <div style="background-color: #071A3D; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">IMMENSE</h1>
          <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Smart Business Communication Solutions</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <span style="background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px;">
              SECURITY VERIFICATION REQUEST
            </span>
          </div>
          
          <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 12px 0;">Super Admin Authorization Required</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">
            A password reset request was initiated for the following corporate staff account:
          </p>
          
          <div style="background-color: #f1f5f9; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; font-size: 13px; color: #334155;">
              <tr>
                <td style="font-weight: bold; width: 140px;">Target Account:</td>
                <td style="font-family: monospace; color: #071A3D; font-weight: bold;">${cleanTargetEmail}</td>
              </tr>
              ${targetName ? `<tr><td style="font-weight: bold;">Staff Name:</td><td>${targetName}</td></tr>` : ''}
              <tr>
                <td style="font-weight: bold;">Request Timestamp:</td>
                <td>${requestTime}</td>
              </tr>
              <tr>
                <td style="font-weight: bold;">Security Destination:</td>
                <td>${ADMIN_SECURITY_EMAIL}</td>
              </tr>
            </table>
          </div>
          
          <p style="color: #475569; font-size: 14px; margin: 0 0 8px 0; font-weight: bold;">
            Your 6-Digit One-Time Password (OTP):
          </p>
          <div style="background-color: #071A3D; color: #38bdf8; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            ${otp}
          </div>
          
          <p style="color: #dc2626; font-size: 12px; margin: 0 0 20px 0; font-weight: bold;">
            ⏱ This code expires in 10 minutes and can only be used once.
          </p>
          
          <div style="text-align: center; margin-bottom: 20px;">
            <a href="https://whatsaap-data.vercel.app/reset-password?email=${encodeURIComponent(cleanTargetEmail)}" 
               style="display: inline-block; background-color: #1677FF; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px;">
              Verify & Set New Password
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          
          <p style="color: #64748b; font-size: 11px; margin: 0; line-height: 1.4;">
            <strong>Security Notice:</strong> If you did not initiate or authorize this password reset request, please do NOT share this OTP code with anyone and inspect your portal audit logs immediately.
          </p>
        </div>
        
        <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
          © ${new Date().getFullYear()} IMMENSE Smart Business Communication Solutions. All rights reserved.
        </p>
      </div>
    `;

    // 4. Dispatch Email via Transactional Provider
    let emailSent = false;
    let providerError = '';

    // Check Resend Provider
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'IMMENSE Security <security@immensesmartsolutions.com>',
            to: [ADMIN_SECURITY_EMAIL],
            subject,
            html: htmlContent,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
        } else {
          const errData = await resendRes.json().catch(() => ({}));
          providerError = errData?.message || `Resend Error HTTP ${resendRes.status}`;
        }
      } catch (e: any) {
        providerError = e.message || 'Resend request failed';
      }
    }

    // Check SendGrid Provider if Resend was not used
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!emailSent && sendgridApiKey) {
      try {
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: ADMIN_SECURITY_EMAIL }] }],
            from: {
              email: process.env.EMAIL_FROM_ADDRESS || 'security@immensesmartsolutions.com',
              name: 'IMMENSE Security',
            },
            subject,
            content: [{ type: 'text/html', value: htmlContent }],
          }),
        });

        if (sgRes.ok || sgRes.status === 202) {
          emailSent = true;
        } else {
          const errData = await sgRes.text().catch(() => '');
          providerError = errData || `SendGrid Error HTTP ${sgRes.status}`;
        }
      } catch (e: any) {
        providerError = e.message || 'SendGrid request failed';
      }
    }

    // Check Brevo / Sendinblue if configured
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!emailSent && brevoApiKey) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey.trim(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              name: 'IMMENSE Security',
              email: process.env.EMAIL_FROM_ADDRESS || 'security@immensesmartsolutions.com',
            },
            to: [{ email: ADMIN_SECURITY_EMAIL }],
            subject,
            htmlContent,
          }),
        });

        if (brevoRes.ok) {
          emailSent = true;
        } else {
          const errData = await brevoRes.json().catch(() => ({}));
          providerError = errData?.message || `Brevo Error HTTP ${brevoRes.status}`;
        }
      } catch (e: any) {
        providerError = e.message || 'Brevo request failed';
      }
    }

    // 5. Store OTP Verification Token in Database
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
            security_email: ADMIN_SECURITY_EMAIL,
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0,
          }),
        });
      } catch (dbErr) {
        console.warn('DB OTP insert note:', dbErr);
      }
    }

    // 6. Return response based on actual email transport confirmation
    if (emailSent) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          message: `Verification email & OTP sent successfully to ${ADMIN_SECURITY_EMAIL}`,
          targetEmail: cleanTargetEmail,
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
            'Email service is not configured. Please configure the transactional email provider (RESEND_API_KEY, SENDGRID_API_KEY, or BREVO_API_KEY in Vercel environment variables).',
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
        error: err.message || 'Internal Server Error while dispatching OTP verification email.',
      })
    );
  }
}
