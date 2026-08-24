import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Building2,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ALLOWED_EMAIL_DOMAIN, APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { useToast } from '@/lib/toast';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid corporate email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function Login() {
  const { user, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // If already logged in, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const res = await signIn(data.email, data.password);
      if (res.error) {
        setAuthError(res.error);
      } else {
        toast.success('Authentication Successful', 'Welcome to Immense Onboarding Portal');
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      setAuthError('An unexpected authentication error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;

    const res = await resetPassword(resetEmail);
    if (res.error) {
      toast.error('Password Reset Failed', res.error);
    } else {
      setResetSent(true);
      toast.success('Reset Link Dispatched', 'Check your corporate inbox for instructions.');
    }
  };

  return (
    <div className="flex min-h-screen bg-[#071A3D]">
      {/* Left panel (Branding & Enterprise Identity) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-gradient-to-br from-[#071A3D] via-[#0C2A5A] to-[#0B5FE0] text-white overflow-hidden">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-[#1677FF]/20 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-[#0B5FE0]/30 blur-2xl" />

        {/* Top Logo */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-white p-1 shadow-lg flex items-center justify-center">
            <img src="/logo.jpg" alt="Immense Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wider">{APP_NAME}</h2>
            <p className="text-xs text-blue-200">{APP_SUBTITLE}</p>
          </div>
        </div>

        {/* Middle Value Proposition */}
        <div className="relative z-10 max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            Enterprise Business Communications
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            WhatsApp Business Onboarding & Document Vault
          </h1>
          <p className="text-sm text-blue-100/90 leading-relaxed">
            Secure client onboarding repository, encrypted credential vault, KYC/GST compliance management, and role-enforced access for enterprise teams.
          </p>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <div className="flex items-center gap-3 text-xs text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Strict Corporate Domain Restriction (@{ALLOWED_EMAIL_DOMAIN})</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>AES-256 Encrypted Platform Secrets & Audited Copy Logs</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Private Document Vaults with Expiring Signed Access</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-blue-200/70">
          Immense Smart Solutions • Protected by Row Level Security & Real-Time Auditing
        </div>
      </div>

      {/* Right panel (Auth Form) */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-12 lg:px-20 bg-white overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto">
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#071A3D] p-1 flex items-center justify-center">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{APP_NAME}</h2>
              <p className="text-xs text-gray-500">{APP_SUBTITLE}</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Enterprise Sign In</h2>
            <p className="mt-1 text-xs text-gray-600">
              Enter your corporate credentials to access the onboarding records.
            </p>
          </div>

          {/* Corporate domain restriction notice */}
          <div className="p-3.5 mb-5 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#1677FF] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <p className="font-semibold">Corporate Email Restricted</p>
              <p className="mt-0.5 text-blue-700">
                Access is strictly allowed for verified <span className="font-mono font-bold">@{ALLOWED_EMAIL_DOMAIN}</span> accounts.
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-4 mb-5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">{authError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Corporate Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  {...register('email')}
                  placeholder={`support@${ALLOWED_EMAIL_DOMAIN}`}
                  className={`w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all ${
                    errors.email ? 'border-red-400 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordOpen(true);
                    setResetSent(false);
                  }}
                  className="text-xs text-[#1677FF] hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  placeholder="••••••••••••"
                  className={`w-full pl-10 pr-10 py-2.5 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all ${
                    errors.password ? 'border-red-400 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 focus:outline-hidden"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Verifying Access...
                </>
              ) : (
                'Sign In to Immense Portal'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-500">
              Only authorized staff of <strong>Immense Smart Solutions</strong> with verified corporate domain credentials may sign in.
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
            <p className="mt-1.5 text-sm text-gray-600">
              Enter your corporate email. We'll dispatch a secure recovery link.
            </p>

            {resetSent ? (
              <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-900">Reset Link Sent</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Check your corporate inbox for instructions.
                </p>
                <button
                  onClick={() => setForgotPasswordOpen(false)}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Corporate Email
                  </label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder={`support@${ALLOWED_EMAIL_DOMAIN}`}
                    className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-lg"
                  >
                    Send Recovery Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
