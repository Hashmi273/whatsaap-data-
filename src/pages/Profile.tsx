import { useState } from 'react';
import {
  User,
  Mail,
  Building2,
  Shield,
  Calendar,
  Lock,
  CheckCircle2,
  Save,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Phone
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { useToast } from '@/lib/toast';
import { logAudit } from '@/lib/audit';
import { formatRoleLabel, ROLE_COLORS } from '@/types/database';
import { format } from 'date-fns';

export function Profile() {
  const { profile, refreshProfile, resetPassword } = useAuth();
  const toast = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Profile details state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [mobileNumber, setMobileNumber] = useState(profile?.mobile_number || '');

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    try {
      const updateData: any = {
        full_name: fullName.trim(),
        department: department.trim(),
        updated_at: new Date().toISOString(),
      };

      if (mobileNumber) {
        updateData.mobile_number = mobileNumber.trim();
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Profile Saved', 'Personal information updated.');
    } catch (err: any) {
      toast.error('Update Failed', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);

    if (!newPassword || !confirmPassword) {
      setPassError('Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('New password and confirmation do not match.');
      return;
    }

    setIsChangingPass(true);

    try {
      // 1. Verify current password if provided and user has active email
      if (currentPassword && profile?.corporate_email) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: profile.corporate_email,
          password: currentPassword,
        });

        if (verifyError) {
          throw new Error('Current password verification failed. Please check your current password.');
        }
      }

      // 2. Update to new password via Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (updateError) throw updateError;

      // 3. Log audit event (NEVER log the actual password)
      await logAudit('password_changed_own', 'auth', profile?.id || 'admin-user', {
        email: profile?.corporate_email,
      });

      toast.success('Password Changed', 'Your account password was successfully updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change error:', err);
      setPassError(err.message || 'Could not change password.');
      toast.error('Password Change Failed', err.message);
    } finally {
      setIsChangingPass(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile?.corporate_email) return;

    const res = await resetPassword(profile.corporate_email);
    if (res.error) {
      toast.error('Reset Failed', res.error);
    } else {
      setResetSent(true);
      await logAudit('password_reset_requested', 'auth', profile.id, {
        email: profile.corporate_email,
      });
      toast.success('Email Dispatched', 'Password reset instructions sent to your corporate inbox.');
    }
  };

  return (
    <PageLayout title="My Profile & Security">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Profile Card */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-gray-100">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#071A3D] to-[#1677FF] text-white text-2xl font-bold flex items-center justify-center shadow-md">
              {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{profile?.full_name}</h2>
                <span
                  className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                    profile?.role
                      ? ROLE_COLORS[profile.role].bg + ' ' + ROLE_COLORS[profile.role].text
                      : ''
                  }`}
                >
                  {profile?.role ? formatRoleLabel(profile.role) : 'Staff'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {profile?.corporate_email}
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Corporate Email (Read Only)
                </label>
                <input
                  type="email"
                  disabled
                  value={profile?.corporate_email || ''}
                  className="w-full px-3.5 py-2 text-xs bg-gray-100 border border-gray-200 rounded-xl text-gray-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. WhatsApp Operations, Client Success"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+91 98450 12345"
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Joining Date
                </label>
                <input
                  type="text"
                  disabled
                  value={
                    profile?.created_at
                      ? format(new Date(profile.created_at), 'dd MMMM yyyy')
                      : '—'
                  }
                  className="w-full px-3.5 py-2 text-xs bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Account Password Section */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Change Account Password</h3>
              <p className="text-[11px] text-gray-500">
                Update your corporate portal password directly through Supabase Auth
              </p>
            </div>
          </div>

          {passError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <p>{passError}</p>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-9 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    className="w-full pl-9 pr-9 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    className="w-full pl-9 pr-9 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isChangingPass || !newPassword || newPassword !== confirmPassword}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                {isChangingPass ? 'Updating Password...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Password Reset Link via Email */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Email Recovery Link</h3>
              <p className="text-[11px] text-gray-500">Dispatch a one-time short-lived reset link to your corporate email</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-900">Send Recovery Email</p>
              <p className="text-xs text-gray-500 mt-0.5">
                A secure password change link will be dispatched to {profile?.corporate_email}.
              </p>
            </div>

            <button
              onClick={handlePasswordReset}
              disabled={resetSent}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-2xs self-start sm:self-auto cursor-pointer"
            >
              {resetSent ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Link Sent
                </>
              ) : (
                'Request Reset Email'
              )}
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Profile;
