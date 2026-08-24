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
  ArrowRightLeft
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { ROLE_OPTIONS, ROLE_COLORS, formatRoleLabel } from '@/types/database';
import type { Profile, UserRole, OnboardingRecord } from '@/types/database';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/constants';
import { format, formatDistanceToNow } from 'date-fns';

export function TeamAccess() {
  const { profile: currentProfile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Search & Role Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editRoleProfile, setEditRoleProfile] = useState<Profile | null>(null);
  const [deactivateProfile, setDeactivateProfile] = useState<Profile | null>(null);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTargetEmployee, setReassignTargetEmployee] = useState<string>('');

  // Fetch all staff profiles
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch assigned records for deactivating employee
  const { data: employeeAssignedRecords } = useQuery({
    queryKey: ['assigned-records-for-employee', deactivateProfile?.id],
    queryFn: async () => {
      if (!deactivateProfile?.id) return [];
      const { data, error } = await supabase
        .from('onboarding_records')
        .select('id, brand_name, whatsapp_number, status')
        .eq('assigned_to', deactivateProfile.id);
      if (error) return [];
      return data as OnboardingRecord[];
    },
    enabled: Boolean(deactivateProfile),
  });

  // Update Role & Department Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({
      id,
      role,
      department,
    }: {
      id: string;
      role: UserRole;
      department: string;
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role, department, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await logAudit('employee_activated', 'employee', id, {
        updated_role: role,
        updated_department: department,
      });
    },
    onSuccess: () => {
      toast.success('Staff Permissions Updated', 'Role & Department privileges adjusted.');
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
      setEditRoleProfile(null);
    },
    onError: (err: any) => {
      toast.error('Update Failed', err.message);
    },
  });

  // Deactivate Staff Mutation (Preserves company data, blocks login)
  const deactivateMutation = useMutation({
    mutationFn: async ({
      profileId,
      reassignToId,
    }: {
      profileId: string;
      reassignToId?: string;
    }) => {
      // 1. Reassign onboarding records if specified
      if (reassignToId && reassignToId !== '') {
        const { error: reassignError } = await supabase
          .from('onboarding_records')
          .update({ assigned_to: reassignToId, updated_at: new Date().toISOString() })
          .eq('assigned_to', profileId);

        if (reassignError) throw reassignError;
      }

      // 2. Mark profile as deactivated
      const { error: deactivateError } = await supabase
        .from('profiles')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (deactivateError) throw deactivateError;

      // 3. Log Audit
      await logAudit('employee_deactivated', 'employee', profileId, {
        reassigned_to: reassignToId || 'unassigned',
        records_preserved: true,
      });
    },
    onSuccess: () => {
      toast.success(
        'Employee Access Revoked',
        'Staff login is blocked. All company records & documents remain completely intact.'
      );
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
      setDeactivateProfile(null);
      setReassignModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Deactivation Failed', err.message);
    },
  });

  // Reactivate Staff Mutation
  const reactivateMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (error) throw error;

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
      (m.department && m.department.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const otherActiveEmployees = (teamMembers || []).filter(
    (m) => m.is_active && m.id !== deactivateProfile?.id
  );

  return (
    <PageLayout title="Team & Access Control">
      <div className="space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Corporate Staff Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Role-based access control, employee lifecycle management, and offboarding data retention
            </p>
          </div>

          <button
            onClick={() => setInviteModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff Member
          </button>
        </div>

        {/* Business Rule Banner: Employee Leaves -> Company Loses Nothing */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#1677FF] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-950">
            <span className="font-bold">Enterprise Continuity Guarantee:</span> When an employee departs or is deactivated, their login is immediately invalidated while all client onboarding records, vaulted GST/PAN documents, and full audit logs remain <span className="font-semibold text-blue-800">100% company-owned and intact</span>.
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
              placeholder="Search staff by name, corporate email, or department..."
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
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Active</th>
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
                            Joined {format(new Date(member.created_at), 'MMM yyyy')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-800">
                      {member.corporate_email}
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
                    <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                      {member.last_login
                        ? formatDistanceToNow(new Date(member.last_login), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditRoleProfile(member)}
                          className="p-1.5 text-gray-500 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg"
                          title="Modify Role & Dept"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {member.is_active ? (
                          member.id !== currentProfile?.id && (
                            <button
                              onClick={() => {
                                setDeactivateProfile(member);
                                setReassignTargetEmployee('');
                              }}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Deactivate Staff"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => reactivateMutation.mutate(member.id)}
                            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
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

      {/* Add / Invite Staff Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Add Staff Member</h3>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Corporate Email Requirement</p>
              <p>
                Employees must register using their official <span className="font-mono font-bold">@{ALLOWED_EMAIL_DOMAIN}</span> email on the sign-in page. You can configure their role immediately once they sign in.
              </p>
            </div>

            <p className="text-xs text-gray-500">
              For security, new accounts default to Employee privileges until upgraded by a Super Admin.
            </p>

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] rounded-xl hover:bg-[#0B5FE0]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role & Department Modal */}
      {editRoleProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              Edit Privileges: {editRoleProfile.full_name}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Assigned Role
                </label>
                <select
                  id="role-select"
                  defaultValue={editRoleProfile.role}
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  id="dept-input"
                  defaultValue={editRoleProfile.department || 'WhatsApp Operations'}
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditRoleProfile(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const role = (document.getElementById('role-select') as HTMLSelectElement).value as UserRole;
                  const department = (document.getElementById('dept-input') as HTMLInputElement).value;
                  updateRoleMutation.mutate({
                    id: editRoleProfile.id,
                    role,
                    department,
                  });
                }}
                disabled={updateRoleMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-lg"
              >
                Save Privileges
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Employee Modal with Automatic Reassignment Option */}
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
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
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
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
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
