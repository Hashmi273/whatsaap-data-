import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  User,
  Mail,
  Building2,
  Shield,
  Calendar,
  Lock,
  CheckCircle2,
  Save
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { useToast } from '@/lib/toast';
import { formatRoleLabel, ROLE_COLORS } from '@/types/database';
import { format } from 'date-fns';

export function Profile() {
  const { profile, refreshProfile, resetPassword } = useAuth();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          department: department.trim(),
          updated_at: new Date().toISOString(),
        })
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

  const handlePasswordReset = async () => {
    if (!profile?.corporate_email) return;

    const res = await resetPassword(profile.corporate_email);
    if (res.error) {
      toast.error('Reset Failed', res.error);
    } else {
      setResetSent(true);
      toast.success('Email Dispatched', 'Password reset instructions sent to your corporate inbox.');
    }
  };

  return (
    <PageLayout title="My Profile">
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
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Password Reset */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Security & Password</h3>
              <p className="text-[11px] text-gray-500">Corporate password recovery management</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-900">Reset Corporate Password</p>
              <p className="text-xs text-gray-500 mt-0.5">
                A secure password change link will be dispatched to {profile?.corporate_email}.
              </p>
            </div>

            <button
              onClick={handlePasswordReset}
              disabled={resetSent}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-2xs self-start sm:self-auto"
            >
              {resetSent ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Link Sent
                </>
              ) : (
                'Request Password Reset'
              )}
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Profile;
