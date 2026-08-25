import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';

export function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Check URL hash for error parameters from Supabase
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('error_description')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const errDesc = params.get('error_description');
      if (errDesc) {
        setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
      }
    }
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
      // Update password via Supabase GoTrue Auth
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      if (updateError) throw updateError;

      const userId = data.user?.id || 'auth-user';
      await logAudit('password_reset_completed', 'auth', userId, {
        email: data.user?.email,
      });

      setIsSuccess(true);
      toast.success('Password Updated', 'Your password has been securely reset.');

      // Sign out from any temporary reset session and redirect to login
      setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore
        }
        navigate('/login');
      }, 2500);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Could not reset password. The link may have expired.');
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
            : 'Enter and confirm your new corporate account password'}
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
                className="w-full py-2.5 px-4 rounded-xl bg-[#1677FF] hover:bg-[#0B5FE0] text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2"
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
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
                  className="text-xs text-slate-400 hover:text-white transition-colors"
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
