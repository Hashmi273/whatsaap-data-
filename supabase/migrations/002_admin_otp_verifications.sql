-- ============================================================
-- IMMENSE PORTAL - SECURE ADMIN OTP VERIFICATIONS TABLE
-- SECURITY: Stores cryptographically hashed OTP tokens for Super Admin password resets.
-- Passwords and plaintext OTPs are NEVER stored in this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_email TEXT NOT NULL,
  security_email TEXT NOT NULL DEFAULT 'hashmimdparvej78654@gmail.com',
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create Indexes for rapid lookup and rate limiting
CREATE INDEX IF NOT EXISTS idx_admin_otp_target ON public.admin_otp_verifications(target_email);
CREATE INDEX IF NOT EXISTS idx_admin_otp_security ON public.admin_otp_verifications(security_email);
CREATE INDEX IF NOT EXISTS idx_admin_otp_created ON public.admin_otp_verifications(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_otp_expires ON public.admin_otp_verifications(expires_at);

-- Enable RLS
ALTER TABLE public.admin_otp_verifications ENABLE ROW LEVEL SECURITY;

-- Policies: Only service_role can read/write directly (server-side only)
CREATE POLICY admin_otp_service_role_all ON public.admin_otp_verifications
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
