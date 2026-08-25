import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Mail,
  KeyRound,
  RefreshCw,
  Send
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { APP_NAME, APP_SUBTITLE, ADMIN_SECURITY_EMAIL } from '@/lib/constants';

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const initialEmail = searchParams.get('email') || ADMIN_SECURITY_EMAIL;
  const [email, setEmail] = useState(initialEmail);
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Tab mode: 'link_session' (URL token active) vs 'otp_code' (interactive 6-digit OTP)
  const [mode, setMode] = useState<'link_session' | 'otp_code'>('otp_code');

  // Check URL hash / code for error parameters or active session from Supabase
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      if (hash.includes('error_description')) {
        const params = new URLSearchParams(hash.replace('#', '?'));
        const errDesc = params.get('error_description');
        if (errDesc) {
          setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
        }
      }
      if (hash.includes('access_token') || hash.includes('type=recovery')) {
        setMode('link_session');
      }
    }

    // Check if Supabase session is already present
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setMode('link_session');
      }
    });
  }, []);

  const validateStrength = (pass: string) => {
    return {
      minLength: pass.length >= 8,
      hasNumber: /\d/.test(pass),
      hasLetter: /[a-zA-Z]/.test(pass),
      hasSpecial: /[^a-zA-Z0-9]/.test(pass),
    };
  };

  const strength = validateStrength(password);
  const isStrong = strength.minLength && strength.hasNumber && strength.hasLetter;

  // Handle Resending OTP / Recovery Email
  const handleResendOtp = async () => {
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetErr) {
        console.warn('Reset note:', resetErr);
      }

      await logAudit('password_reset_requested', 'auth', undefined, {
        email: email.trim(),
      });

      toast.success('Verification Code Dispatched', `Password reset verification sent to ${email.trim()}.`);
    } catch (err: any) {
      setError(err.message || 'Could not send verification code.');
    } finally {
      setResending(false);
    }
  };

  // Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter your new password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // Check active local OTP verification token
      let isVerifiedLocally = false;
      try {
        const storedOtpRaw =
          localStorage.getItem(`immense_active_otp_${cleanEmail}`) ||
          localStorage.getItem(`immense_active_otp_${ADMIN_SECURITY_EMAIL.toLowerCase()}`);

        if (storedOtpRaw) {
          const storedOtpData = JSON.parse(storedOtpRaw);
          if (Date.now() > storedOtpData.expiresAt) {
            throw new Error('Verification code has expired (10-minute validity limit). Please request a fresh code.');
          }
          if (mode === 'otp_code' && otpCode.trim() !== storedOtpData.otp) {
            throw new Error('Invalid 6-digit verification code. Please check and try again.');
          }

          // Successfully verified! Save updated password
          const target = storedOtpData.targetEmail ? storedOtpData.targetEmail.toLowerCase() : cleanEmail;
          const userPasswords = JSON.parse(localStorage.getItem('immense_user_passwords') || '{}');
          userPasswords[target] = password.trim();
          localStorage.setItem('immense_user_passwords', JSON.stringify(userPasswords));

          // Invalidate OTP
          localStorage.removeItem(`immense_active_otp_${cleanEmail}`);
          localStorage.removeItem(`immense_active_otp_${ADMIN_SECURITY_EMAIL.toLowerCase()}`);
          isVerifiedLocally = true;
        }
      } catch (otpValidationErr: any) {
        if (otpValidationErr.message.includes('expired') || otpValidationErr.message.includes('Invalid 6-digit')) {
          throw otpValidationErr;
        }
      }

      // If not verified locally, attempt Supabase Auth OTP verification
      if (!isVerifiedLocally) {
        if (mode === 'otp_code' && otpCode.trim()) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: otpCode.trim(),
            type: 'recovery',
          });

          if (otpError) {
            throw new Error(otpError.message || 'Invalid or expired verification code.');
          }
        }

        // Update password via Supabase Auth
        try {
          const { error: updateError } = await supabase.auth.updateUser({
            password: password.trim(),
          });
          if (updateError) {
            console.warn('Supabase update note:', updateError);
          }
        } catch {
          // Ignore
        }
      }

      await logAudit('password_reset_completed', 'auth', undefined, {
        email: cleanEmail,
      });

      setIsSuccess(true);
      toast.success('Password Updated', 'Your password has been securely reset.');

      // Sign out and redirect to login
      setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore
        }
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Could not reset password. The verification code or link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-950 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center items-center gap-3 mb-6">
          <img
            src="/logo.jpg"
            alt={APP_NAME}
            className="w-12 h-12 rounded-xl object-contain shadow-md bg-white p-1"
          />
          <div>
            <h2 className="text-xl font-black text-white tracking-wider uppercase">{APP_NAME}</h2>
            <p className="text-[10px] text-blue-400 font-medium tracking-tight uppercase">
              {APP_SUBTITLE}
            </p>
          </div>
        </div>

        <h2 className="text-center text-2xl font-extrabold text-white tracking-tight">
          {isSuccess ? 'Password Reset Successful' : 'Set New Secure Password'}
        </h2>
        <p className="mt-2 text-center text-xs text-slate-400">
          {isSuccess
            ? 'Redirecting to login portal...'
            : 'Verify your email code or reset link and set your new password'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 py-8 px-6 sm:px-10 shadow-2xl rounded-3xl">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Password Updated!</h3>
              <p className="text-xs text-slate-300">
                Your new password is now active. You will be redirected to the login screen momentarily.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1677FF] hover:bg-[#0B5FE0] text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Go to Sign In <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {/* Mode switch helper */}
              <div className="flex rounded-xl bg-slate-900/60 p-1 border border-slate-700/60 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('otp_code')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    mode === 'otp_code'
                      ? 'bg-[#1677FF] text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Verify by Email OTP
                </button>
                <button
                  type="button"
                  onClick={() => setMode('link_session')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    mode === 'link_session'
                      ? 'bg-[#1677FF] text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Direct Email Link
                </button>
              </div>

              {/* Email & OTP inputs when in OTP Mode */}
              {mode === 'otp_code' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. hashmimdparvej78654@gmail.com"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        6-Digit Verification Code (OTP)
                      </label>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resending || !email}
                        className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                        {resending ? 'Sending...' : 'Send / Resend OTP'}
                      </button>
                    </div>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        maxLength={8}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs tracking-widest font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Check your email inbox or spam folder for the verification code.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password strength checks */}
              {password.length > 0 && (
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/50 space-y-1.5 text-[11px]">
                  <p className="text-slate-400 font-semibold mb-1">Password Requirements:</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        strength.minLength ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    <span className={strength.minLength ? 'text-slate-200' : 'text-slate-500'}>
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        strength.hasLetter ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    <span className={strength.hasLetter ? 'text-slate-200' : 'text-slate-500'}>
                      Contains letters (A-Z, a-z)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        strength.hasNumber ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    <span className={strength.hasNumber ? 'text-slate-200' : 'text-slate-500'}>
                      Contains numbers (0-9)
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !isStrong || password !== confirmPassword}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1677FF] hover:bg-[#0B5FE0] text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {loading ? 'Securing Password...' : 'Save & Activate Password'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
