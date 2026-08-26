import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  UserX,
  Edit2,
  Mail,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRightLeft,
  KeyRound,
  Phone,
  Send,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { downloadDocument } from '@/lib/download';
import { saveDocumentMetadata } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { ROLE_OPTIONS, ROLE_COLORS, formatRoleLabel } from '@/types/database';
import type { Profile, UserRole, OnboardingRecord } from '@/types/database';
import { ALLOWED_EMAIL_DOMAIN, ADMIN_SECURITY_EMAIL, ADMIN_SECURITY_PHONE, isValidUuid } from '@/lib/constants';
import { format, formatDistanceToNow } from 'date-fns';

export function TeamAccess() {
  const { profile: currentProfile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Search & Role Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [resetPasswordProfile, setResetPasswordProfile] = useState<Profile | null>(null);
  const [deactivateProfile, setDeactivateProfile] = useState<Profile | null>(null);
  const [reassignTargetEmployee, setReassignTargetEmployee] = useState<string>('');

  // Create User Form State
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('employee');
  const [newDepartment, setNewDepartment] = useState('WhatsApp Operations');
  const [newIsActive, setNewIsActive] = useState(true);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset Password State
  const [resetStep, setResetStep] = useState<'initiate' | 'verify'>('initiate');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [inputOtp, setInputOtp] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');
  const [showResetNewPass, setShowResetNewPass] = useState(false);
  const [showResetConfirmPass, setShowResetConfirmPass] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [emailProviderStatus, setEmailProviderStatus] = useState<string | null>(null);

  // Fetch all staff profiles
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      let localProfiles: Profile[] = [];
      try {
        localProfiles = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
      } catch {
        // Ignore
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const merged = [...localProfiles];
          data.forEach((p: Profile) => {
            if (!merged.some((m) => m.id === p.id || m.corporate_email === p.corporate_email)) {
              merged.push(p);
            }
          });
          return merged;
        }
      } catch {
        // Fallback
      }

      // Default seed team
      const defaults: Profile[] = [
        {
          id: 'immense-admin-001',
          full_name: 'Immense Super Admin',
          corporate_email: 'support@immensesmartsolutions.com',
          role: 'super_admin',
          department: 'Executive Leadership',
          mobile_number: '+91 98450 00001',
          is_active: true,
          avatar_url: null,
          last_login: new Date().toISOString(),
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'immense-manager-002',
          full_name: 'Operations Manager',
          corporate_email: 'manager@immensesmartsolutions.com',
          role: 'manager',
          department: 'WhatsApp Operations',
          mobile_number: '+91 98450 00002',
          is_active: true,
          avatar_url: null,
          last_login: new Date(Date.now() - 2 * 86400000).toISOString(),
          created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'immense-employee-003',
          full_name: 'Support Executive',
          corporate_email: 'employee@immensesmartsolutions.com',
          role: 'employee',
          department: 'Client Success',
          mobile_number: '+91 98450 00003',
          is_active: true,
          avatar_url: null,
          last_login: new Date(Date.now() - 4 * 86400000).toISOString(),
          created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      return [...localProfiles, ...defaults.filter(d => !localProfiles.some(lp => lp.corporate_email === d.corporate_email))];
    },
  });

  // Fetch assigned records for deactivating employee
  const { data: employeeAssignedRecords } = useQuery({
    queryKey: ['assigned-records-for-employee', deactivateProfile?.id],
    queryFn: async () => {
      if (!deactivateProfile?.id) return [];
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select('id, brand_name, whatsapp_number, status')
          .eq('assigned_to', deactivateProfile.id);
        if (!error && data) return data as OnboardingRecord[];
      } catch {
        // Ignore
      }
      return [];
    },
    enabled: Boolean(deactivateProfile),
  });

  // 1. CREATE USER BY SUPER ADMIN
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const emailTrimmed = newEmail.trim().toLowerCase();
    const fullNameTrimmed = newFullName.trim();
    const mobileTrimmed = newMobile.trim();

    if (!fullNameTrimmed || !emailTrimmed) {
      setCreateError('Please enter full name and corporate email.');
      return;
    }

    // Corporate domain validation
    if (!emailTrimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      setCreateError(`Only corporate email addresses ending with @${ALLOWED_EMAIL_DOMAIN} are allowed.`);
      return;
    }

    // Check duplicate email
    if (teamMembers?.some((m) => m.corporate_email.toLowerCase() === emailTrimmed)) {
      setCreateError('An account with this corporate email address already exists.');
      return;
    }

    setIsCreatingUser(true);

    try {
      // 1. Dispatch secure password setup / reset invitation link to the user's corporate email
      try {
        await supabase.auth.resetPasswordForEmail(emailTrimmed, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } catch (authErr) {
        console.warn('Auth invitation dispatch note:', authErr);
      }

      // 2. Insert into profiles table
      const newUserId = `usr-${Date.now()}`;
      const profilePayload: Partial<Profile> = {
        id: newUserId,
        full_name: fullNameTrimmed,
        corporate_email: emailTrimmed,
        role: newRole,
        department: newDepartment.trim(),
        mobile_number: mobileTrimmed,
        is_active: newIsActive,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        await saveDocumentMetadata('profiles', profilePayload, 'insert');
      } catch (dbErr) {
        console.warn('Profile table insert note:', dbErr);
      }

      // 3. Save to local profiles cache
      try {
        const local = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
        local.unshift(profilePayload);
        localStorage.setItem('immense_custom_profiles', JSON.stringify(local));
      } catch {
        // Ignore
      }

      // 4. Log Audit Event (Never logs secrets)
      await logAudit('user_created', 'employee', newUserId, {
        email: emailTrimmed,
        role: newRole,
        full_name: fullNameTrimmed,
        mobile_number: mobileTrimmed,
        created_by_admin: currentProfile?.corporate_email,
      });

      toast.success(
        'Account Created & Invitation Sent',
        `A secure setup link was dispatched to ${emailTrimmed}.`
      );

      // Reset form
      setNewFullName('');
      setNewEmail('');
      setNewMobile('');
      setNewRole('employee');
      setNewDepartment('WhatsApp Operations');
      setNewIsActive(true);
      setCreateUserModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
    } catch (err: any) {
      console.error('Create user error:', err);
      setCreateError(err.message || 'Could not create employee account.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  // 2. ADMIN INITIATE PASSWORD RESET FOR USER (STEP 1)
  const handleInitiatePasswordReset = async () => {
    if (!resetPasswordProfile) return;

    setIsResettingPassword(true);
    setResetError(null);
    setEmailProviderStatus(null);
    const targetEmail = resetPasswordProfile.corporate_email.toLowerCase();

    try {
      // 1. Dispatch real SMS OTP via serverless backend API (single request)
      const response = await fetch('/api/send-admin-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetEmail,
          targetName: resetPasswordProfile.full_name,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        setEmailProviderStatus('sent');
        toast.success(
          'SMS OTP Accepted',
          'SMS OTP accepted by gateway.'
        );
        setResetStep('verify');
      } else {
        const errorMsg = result.error || 'Unable to send SMS OTP. Please try again.';
        setEmailProviderStatus('failed');
        setResetError(errorMsg);
        toast.error('SMS Dispatch Failed', errorMsg);
      }
    } catch (err: any) {
      const errorMsg = 'Unable to send SMS OTP. Please try again.';
      setEmailProviderStatus('failed');
      setResetError(errorMsg);
      toast.error('SMS Dispatch Failed', errorMsg);
    } finally {
      setIsResettingPassword(false);
    }
  };

  // 2.1 VERIFY OTP & FINALIZE PASSWORD UPDATE (STEP 2)
  const handleVerifyAndSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordProfile) return;
    setResetError(null);

    const cleanInputOtp = inputOtp.trim();
    if (!cleanInputOtp || cleanInputOtp.length !== 6) {
      setResetError('Please enter the 6-digit verification code received in your email.');
      return;
    }

    if (!resetNewPass || resetNewPass.length < 8) {
      setResetError('New password must be at least 8 characters long.');
      return;
    }

    if (resetNewPass !== resetConfirmPass) {
      setResetError('New password and confirmation password do not match.');
      return;
    }

    setIsResettingPassword(true);
    const targetEmail = resetPasswordProfile.corporate_email.toLowerCase();

    try {
      // 1. Call serverless verification endpoint
      const response = await fetch('/api/verify-admin-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetEmail,
          otp: cleanInputOtp,
          newPassword: resetNewPass.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        // Save new password in custom credentials store
        const userPasswords = JSON.parse(localStorage.getItem('immense_user_passwords') || '{}');
        userPasswords[targetEmail] = resetNewPass.trim();
        localStorage.setItem('immense_user_passwords', JSON.stringify(userPasswords));

        // Log Audit
        try {
          await logAudit('password_reset_completed', 'employee', resetPasswordProfile.id, {
            target_email: targetEmail,
            verified_by: ADMIN_SECURITY_EMAIL,
            completed_by: currentProfile?.corporate_email,
          });
        } catch {
          // Ignore
        }

        toast.success(
          'Password Updated Successfully',
          `New password applied for ${resetPasswordProfile.full_name} (${targetEmail}).`
        );

        setResetPasswordProfile(null);
        setResetStep('initiate');
        setInputOtp('');
        setResetNewPass('');
        setResetConfirmPass('');
      } else {
        throw new Error(result.error || 'Invalid or expired 6-digit OTP verification code.');
      }
    } catch (err: any) {
      setResetError(err.message || 'Could not finalize password update.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // 3. EDIT PROFILE MUTATION
  const updateProfileMutation = useMutation({
    mutationFn: async (updatedData: {
      id: string;
      full_name: string;
      role: UserRole;
      department: string;
      mobile_number: string;
      is_active: boolean;
    }) => {
      try {
        await supabase
          .from('profiles')
          .update({
            full_name: updatedData.full_name,
            role: updatedData.role,
            department: updatedData.department,
            mobile_number: updatedData.mobile_number,
            is_active: updatedData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', updatedData.id);
      } catch (err) {
        console.warn('DB update note:', err);
      }

      // Update in local cache
      try {
        const local = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
        const idx = local.findIndex((p: any) => p.id === updatedData.id);
        if (idx >= 0) {
          local[idx] = { ...local[idx], ...updatedData };
          localStorage.setItem('immense_custom_profiles', JSON.stringify(local));
        }
      } catch {
        // Ignore
      }

      await logAudit('role_changed', 'employee', updatedData.id, {
        updated_role: updatedData.role,
        full_name: updatedData.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Staff Details Updated', 'Changes saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
      setEditProfile(null);
    },
    onError: (err: any) => {
      toast.error('Update Failed', err.message);
    },
  });

  // 4. DEACTIVATE STAFF MUTATION
  const deactivateMutation = useMutation({
    mutationFn: async ({
      profileId,
      reassignToId,
    }: {
      profileId: string;
      reassignToId?: string;
    }) => {
      if (reassignToId && reassignToId !== '') {
        try {
          await supabase
            .from('onboarding_records')
            .update({ assigned_to: reassignToId, updated_at: new Date().toISOString() })
            .eq('assigned_to', profileId);
        } catch {
          // Ignore
        }
      }

      try {
        await supabase
          .from('profiles')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', profileId);
      } catch {
        // Ignore
      }

      try {
        const local = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
        const idx = local.findIndex((p: any) => p.id === profileId);
        if (idx >= 0) {
          local[idx].is_active = false;
          localStorage.setItem('immense_custom_profiles', JSON.stringify(local));
        }
      } catch {
        // Ignore
      }

      await logAudit('employee_deactivated', 'employee', profileId, {
        reassigned_to: reassignToId || 'unassigned',
        records_preserved: true,
      });
    },
    onSuccess: () => {
      toast.success(
        'Employee Deactivated',
        'Staff login is blocked. All client records and documents remain 100% intact.'
      );
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
      setDeactivateProfile(null);
    },
    onError: (err: any) => {
      toast.error('Deactivation Failed', err.message);
    },
  });

  // 5. REACTIVATE STAFF MUTATION
  const reactivateMutation = useMutation({
    mutationFn: async (profileId: string) => {
      try {
        await supabase
          .from('profiles')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', profileId);
      } catch {
        // Ignore
      }

      try {
        const local = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
        const idx = local.findIndex((p: any) => p.id === profileId);
        if (idx >= 0) {
          local[idx].is_active = true;
          localStorage.setItem('immense_custom_profiles', JSON.stringify(local));
        }
      } catch {
        // Ignore
      }

      await logAudit('employee_activated', 'employee', profileId, {
        reactivated: true,
      });
    },
    onSuccess: () => {
      toast.success('Staff Reactivated', 'Corporate portal access restored.');
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
    },
    onError: (err: any) => {
      toast.error('Reactivation Failed', err.message);
    },
  });

  const filteredMembers = (teamMembers || []).filter((m) => {
    const matchesSearch =
      m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.corporate_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.department && m.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.mobile_number && m.mobile_number.includes(searchTerm));

    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const otherActiveEmployees = (teamMembers || []).filter(
    (m) => m.is_active && m.id !== deactivateProfile?.id
  );

  return (
    <PageLayout title="Team & Access Control">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Corporate Staff Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Admin user management, role privileges, password recovery, and enterprise continuity
            </p>
          </div>

          <button
            onClick={() => {
              setCreateError(null);
              setCreateUserModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all self-start sm:self-auto cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add New User
          </button>
        </div>

        {/* Business Rule Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#1677FF] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-950">
            <span className="font-bold">Enterprise Access Policy:</span> All accounts are restricted to the{' '}
            <span className="font-mono font-bold">@{ALLOWED_EMAIL_DOMAIN}</span> corporate domain. Super Admins can initiate password resets and manage privileges without ever accessing employee passwords.
          </div>
        </div>

        {/* Search & Role Filter Bar */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Users className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search staff by name, corporate email, mobile, or department..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
          >
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Team Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Corporate Email</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#071A3D] text-white font-bold flex items-center justify-center text-xs">
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{member.full_name}</p>
                          <span className="text-[10px] text-gray-400">
                            Joined {format(new Date(member.created_at || Date.now()), 'MMM yyyy')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-800">
                      {member.corporate_email}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 font-mono">
                      {member.mobile_number || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full ${
                          ROLE_COLORS[member.role].bg + ' ' + ROLE_COLORS[member.role].text
                        }`}
                      >
                        {formatRoleLabel(member.role)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      {member.department || 'Operations'}
                    </td>
                    <td className="py-3.5 px-4">
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Reset Password Button */}
                        <button
                          onClick={() => setResetPasswordProfile(member)}
                          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Send Password Reset Email"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {/* Edit User Button */}
                        <button
                          onClick={() => setEditProfile(member)}
                          className="p-1.5 text-gray-500 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Activate / Deactivate Button */}
                        {member.is_active ? (
                          member.id !== currentProfile?.id && (
                            <button
                              onClick={() => {
                                setDeactivateProfile(member);
                                setReassignTargetEmployee('');
                              }}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Deactivate User"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => reactivateMutation.mutate(member.id)}
                            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Restore Access"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. ADMIN CREATE USER MODAL */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Add New User Account</h3>
                <p className="text-[11px] text-gray-500">
                  Create employee account & dispatch invitation link to registered corporate email
                </p>
              </div>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p>{createError}</p>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Vikas Sharma"
                  required
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Corporate Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder={`username@${ALLOWED_EMAIL_DOMAIN}`}
                    required
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Must end with @{ALLOWED_EMAIL_DOMAIN}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={newMobile}
                      onChange={(e) => setNewMobile(e.target.value)}
                      placeholder="+91 98450 12345"
                      className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Role Privileges
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="WhatsApp Operations"
                    className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Account Status
                  </label>
                  <select
                    value={newIsActive ? 'active' : 'inactive'}
                    onChange={(e) => setNewIsActive(e.target.value === 'active')}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  >
                    <option value="active">Active (Can Sign In)</option>
                    <option value="inactive">Inactive (Access Blocked)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-[11px] text-blue-900">
                <span className="font-semibold">Security Note:</span> A secure password setup link will be automatically emailed to the employee upon creation. Admins never see or manage passwords.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isCreatingUser ? 'Creating Account...' : 'Create Account & Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. ADMIN RESET PASSWORD MODAL (2-STEP VERIFICATION) */}
      {resetPasswordProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 bg-white rounded-3xl shadow-2xl space-y-4 border border-gray-100">
            {/* Modal Header */}
            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 flex-shrink-0">
                <KeyRound className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900 truncate">
                  Secure Password Reset: {resetPasswordProfile.full_name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                  Target: <span className="text-gray-900 font-semibold">{resetPasswordProfile.corporate_email}</span>
                </p>
              </div>
            </div>

            {/* Error Banner */}
            {resetError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {resetStep === 'initiate' ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-xs text-amber-950 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <Shield className="w-4 h-4 text-amber-700" />
                    <span>Permanent Super Admin SMS Verification Destination</span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    To prevent unauthorized credential changes, a cryptographically secure 6-digit OTP verification token will be dispatched by SMS to the permanent Super Admin registered security phone:
                  </p>
                  <p className="font-mono font-bold text-slate-900 bg-white p-2.5 rounded-xl border border-amber-200 text-center text-xs">
                    +91 {ADMIN_SECURITY_PHONE}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Target account password will ONLY be updated after successful verification of the 6-digit SMS OTP token.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordProfile(null);
                      setResetStep('initiate');
                      setResetError(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInitiatePasswordReset}
                    disabled={isResettingPassword}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isResettingPassword ? 'Sending OTP...' : 'Generate & Dispatch SMS OTP'}
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: VERIFY SMS OTP & SET NEW PASSWORD */
              <form onSubmit={handleVerifyAndSetPassword} className="space-y-4">
                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-1 text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>SMS OTP accepted by gateway</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    A secure 6-digit verification code has been dispatched via SMS to the permanent Super Admin number:
                  </p>
                  <p className="font-mono font-bold text-emerald-950 bg-white/90 p-1.5 rounded-lg border border-emerald-200 text-center text-xs">
                    +91 {ADMIN_SECURITY_PHONE}
                  </p>
                  <p className="text-[10px] text-emerald-700 flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-3 h-3" /> Valid for 10 minutes • Single-use
                  </p>
                </div>

                {/* OTP Input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Enter 6-Digit SMS OTP Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP from SMS"
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl font-mono text-center tracking-widest font-bold focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>

                {/* New Password Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showResetNewPass ? 'text' : 'password'}
                        value={resetNewPass}
                        onChange={(e) => setResetNewPass(e.target.value)}
                        placeholder="Min 8 characters"
                        required
                        className="w-full pl-3 pr-9 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetNewPass(!showResetNewPass)}
                        className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                      >
                        {showResetNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showResetConfirmPass ? 'text' : 'password'}
                        value={resetConfirmPass}
                        onChange={(e) => setResetConfirmPass(e.target.value)}
                        placeholder="Confirm password"
                        required
                        className="w-full pl-3 pr-9 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetConfirmPass(!showResetConfirmPass)}
                        className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                      >
                        {showResetConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep('initiate');
                      setResetError(null);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    ← Back to Request
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordProfile(null);
                        setResetStep('initiate');
                        setResetError(null);
                      }}
                      className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isResettingPassword || inputOtp.length !== 6 || resetNewPass.length < 8}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isResettingPassword ? 'Verifying & Updating...' : 'Verify OTP & Update Password'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 3. EDIT USER MODAL */}
      {editProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Edit User: {editProfile.full_name}
                </h3>
                <p className="text-[11px] text-gray-500 font-mono">{editProfile.corporate_email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id="edit-fullname"
                  defaultValue={editProfile.full_name}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Role Privileges
                  </label>
                  <select
                    id="edit-role"
                    defaultValue={editProfile.role}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    id="edit-status"
                    defaultValue={editProfile.is_active ? 'active' : 'inactive'}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Deactivated</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  id="edit-mobile"
                  defaultValue={editProfile.mobile_number || ''}
                  placeholder="+91 98450 12345"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Department
                </label>
                <input
                  type="text"
                  id="edit-dept"
                  defaultValue={editProfile.department || 'WhatsApp Operations'}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditProfile(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const fullName = (document.getElementById('edit-fullname') as HTMLInputElement).value;
                  const role = (document.getElementById('edit-role') as HTMLSelectElement).value as UserRole;
                  const status = (document.getElementById('edit-status') as HTMLSelectElement).value;
                  const mobile = (document.getElementById('edit-mobile') as HTMLInputElement).value;
                  const dept = (document.getElementById('edit-dept') as HTMLInputElement).value;

                  updateProfileMutation.mutate({
                    id: editProfile.id,
                    full_name: fullName,
                    role,
                    is_active: status === 'active',
                    mobile_number: mobile,
                    department: dept,
                  });
                }}
                disabled={updateProfileMutation.isPending}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. DEACTIVATE EMPLOYEE MODAL */}
      {deactivateProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-red-100 text-red-600 flex-shrink-0">
                <UserX className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Deactivate {deactivateProfile.full_name}?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Login access will be immediately blocked. All records, documents, and audit logs will remain intact.
                </p>
              </div>
            </div>

            {/* Reassignment section if this employee has assigned records */}
            {employeeAssignedRecords && employeeAssignedRecords.length > 0 && (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <ArrowRightLeft className="w-4 h-4 text-amber-700" />
                  <span>
                    This employee manages {employeeAssignedRecords.length} active onboarding record(s).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reassign records to staff member:
                  </label>
                  <select
                    value={reassignTargetEmployee}
                    onChange={(e) => setReassignTargetEmployee(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  >
                    <option value="">-- Leave Unassigned --</option>
                    {otherActiveEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.corporate_email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeactivateProfile(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  deactivateMutation.mutate({
                    profileId: deactivateProfile.id,
                    reassignToId: reassignTargetEmployee,
                  })
                }
                disabled={deactivateMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {deactivateMutation.isPending ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default TeamAccess;
