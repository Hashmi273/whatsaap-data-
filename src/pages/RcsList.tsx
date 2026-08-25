import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Plus,
  Search,
  Filter,
  Building2,
  Globe,
  Mail,
  Phone,
  FileCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Edit2,
  Trash2,
  Eye,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { STATUS_OPTIONS } from '@/types/database';
import type { RcsOnboardingRecord, OnboardingStatus, Profile } from '@/types/database';
import { format } from 'date-fns';

const INITIAL_DEMO_RCS_RECORDS: RcsOnboardingRecord[] = [
  {
    id: 'rcs-demo-001',
    brand_name: 'Nexus Retail India',
    company_name: 'Nexus Commercial Retail Private Limited',
    gst_number: '29ABCDE1234F1Z5',
    website: 'https://nexusretail.in',
    contact_person: 'Rahul Sharma',
    contact_number: '+91 98450 11223',
    contact_email: 'rahul@nexusretail.in',
    rcs_business_name: 'Nexus India Verified',
    rcs_agent_id: 'nexus_retail_bot_v1',
    status: 'live',
    assigned_to: 'immense-manager-002',
    onboarding_date: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
    notes: 'Primary retail client verified on Google RCS Jibe platform.',
    created_by: 'immense-admin-001',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rcs-demo-002',
    brand_name: 'Apex Healthcare Solutions',
    company_name: 'Apex Care Hospitals LLP',
    gst_number: '27AABCA5678G2Z1',
    website: 'https://apexhealthcare.com',
    contact_person: 'Dr. Priya Desai',
    contact_number: '+91 98200 44556',
    contact_email: 'priya@apexhealthcare.com',
    rcs_business_name: 'Apex Hospitals Alert',
    rcs_agent_id: 'apex_health_bot_prod',
    status: 'in_progress',
    assigned_to: 'immense-employee-003',
    onboarding_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    notes: 'KYC & GST documents vaulted. Pending carrier test message verification.',
    created_by: 'immense-admin-001',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rcs-demo-003',
    brand_name: 'Starlight Financial',
    company_name: 'Starlight Capital Management Services',
    gst_number: '07AAACS9988H1Z0',
    website: 'https://starlightfin.com',
    contact_person: 'Amitabh Verma',
    contact_number: '+91 98111 88990',
    contact_email: 'compliance@starlightfin.com',
    rcs_business_name: 'Starlight OTP & Alerts',
    rcs_agent_id: 'starlight_otp_agent',
    status: 'pending',
    assigned_to: null,
    onboarding_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    notes: 'Awaiting brand logo and GST certificate upload from client.',
    created_by: 'immense-admin-001',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function RcsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<RcsOnboardingRecord | null>(null);

  // Fetch Team Profiles for assignment filters
  const { data: teamMembers } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error && data) return data as Profile[];
      } catch {
        // Ignore
      }
      return [];
    },
  });

  // Fetch RCS Onboarding Records
  const { data: rcsRecords, isLoading } = useQuery({
    queryKey: ['rcs-records'],
    queryFn: async () => {
      let localRcs: RcsOnboardingRecord[] = [];
      try {
        localRcs = JSON.parse(localStorage.getItem('immense_rcs_records') || '[]');
      } catch {
        // Ignore
      }

      let dbRcs: RcsOnboardingRecord[] = [];
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select(`
            *,
            assigned_profile:profiles!onboarding_records_assigned_to_fkey(id, full_name, corporate_email)
          `)
          .eq('platform', 'RCS Business Messaging')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          dbRcs = data.map((d: any) => ({
            ...d,
            gst_number: d.notes?.match(/GST:\s*([A-Z0-9]+)/i)?.[1] || d.notes || '—',
            website: d.login_url || '—',
            rcs_business_name: d.username || d.brand_name,
            rcs_agent_id: d.credential_encrypted || 'rcs_agent_default',
          }));
        }
      } catch {
        // Fallback
      }

      const merged = [...localRcs];
      dbRcs.forEach((d) => {
        if (!merged.some((m) => m.id === d.id)) {
          merged.push(d);
        }
      });

      if (merged.length === 0) {
        return INITIAL_DEMO_RCS_RECORDS;
      }

      return merged;
    },
  });

  // Delete RCS Record Mutation
  const deleteMutation = useMutation({
    mutationFn: async (record: RcsOnboardingRecord) => {
      try {
        await supabase.from('onboarding_records').delete().eq('id', record.id);
      } catch {
        // Ignore
      }

      try {
        const local = JSON.parse(localStorage.getItem('immense_rcs_records') || '[]');
        const updated = local.filter((r: any) => r.id !== record.id);
        localStorage.setItem('immense_rcs_records', JSON.stringify(updated));
      } catch {
        // Ignore
      }

      await logAudit('record_deleted', 'onboarding', record.id, {
        brand_name: record.brand_name,
        platform: 'RCS',
      });
    },
    onSuccess: () => {
      toast.success('RCS Record Deleted', 'Client record permanently removed.');
      queryClient.invalidateQueries({ queryKey: ['rcs-records'] });
      setDeleteRecordTarget(null);
    },
    onError: (err: any) => {
      toast.error('Delete Failed', err.message || 'Could not delete RCS record.');
    },
  });

  // Search across: Brand Name, GST, Company Name, Contact Email, Website
  const filteredRecords = (rcsRecords || []).filter((r) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      r.brand_name.toLowerCase().includes(term) ||
      (r.company_name && r.company_name.toLowerCase().includes(term)) ||
      (r.gst_number && r.gst_number.toLowerCase().includes(term)) ||
      (r.contact_email && r.contact_email.toLowerCase().includes(term)) ||
      (r.contact_person && r.contact_person.toLowerCase().includes(term)) ||
      (r.website && r.website.toLowerCase().includes(term)) ||
      (r.rcs_business_name && r.rcs_business_name.toLowerCase().includes(term)) ||
      (r.rcs_agent_id && r.rcs_agent_id.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesEmployee =
      employeeFilter === 'all' ||
      (employeeFilter === 'unassigned' && !r.assigned_to) ||
      r.assigned_to === employeeFilter;

    return matchesSearch && matchesStatus && matchesEmployee;
  });

  // Counts
  const totalCount = rcsRecords?.length || 0;
  const pendingCount = rcsRecords?.filter((r) => r.status === 'pending').length || 0;
  const inProgressCount = rcsRecords?.filter((r) => r.status === 'in_progress').length || 0;
  const liveCount = rcsRecords?.filter((r) => r.status === 'live').length || 0;
  const completedCount = rcsRecords?.filter((r) => r.status === 'completed').length || 0;

  const canCreate = profile?.role === 'super_admin' || profile?.role === 'manager';
  const canDelete = profile?.role === 'super_admin';

  return (
    <PageLayout title="RCS Onboarding">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Radio className="w-5 h-5 text-[#1677FF]" />
              RCS Business Messaging Onboarding
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Client entity verification, Google RCS agent provisioning, brand assets & compliance documents
            </p>
          </div>

          {canCreate && (
            <button
              onClick={() => navigate('/rcs/new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New RCS Onboarding
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total RCS Clients</span>
            <p className="text-2xl font-black text-gray-900 mt-1">{totalCount}</p>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pending Docs</span>
            <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Carrier Review</span>
            <p className="text-2xl font-black text-blue-600 mt-1">{inProgressCount}</p>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Live & Active</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{liveCount}</p>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">Completed</span>
            <p className="text-2xl font-black text-teal-600 mt-1">{completedCount}</p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Brand Name, GST, Legal Entity, Email, or Website..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:w-40 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="flex-1 sm:w-44 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {(teamMembers || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* RCS Records Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No RCS Onboarding Records Found"
            description="No client onboarding entries match your search query or filters."
            actionLabel={canCreate ? 'Create RCS Onboarding' : undefined}
            onAction={canCreate ? () => navigate('/rcs/new') : undefined}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Brand & Legal Entity</th>
                    <th className="py-3 px-4">GST Number</th>
                    <th className="py-3 px-4">RCS Agent / Sender</th>
                    <th className="py-3 px-4">Contact Info</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Assigned Staff</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredRecords.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/rcs/${item.id}`)}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1677FF] flex items-center justify-center flex-shrink-0 font-bold">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 hover:text-[#1677FF] transition-colors">
                              {item.brand_name}
                            </p>
                            <span className="text-[11px] text-gray-500 line-clamp-1">
                              {item.company_name || 'Legal entity pending'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-gray-800">
                        {item.gst_number ? (
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]">
                            {item.gst_number}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-gray-900">{item.rcs_business_name || item.brand_name}</p>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {item.rcs_agent_id || 'ID Pending'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="text-gray-900 font-medium">{item.contact_person || '—'}</p>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {item.contact_email || item.contact_number || '—'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="py-3.5 px-4 text-gray-600">
                        {item.assigned_profile?.full_name ||
                          (item.assigned_to ? 'Staff Assigned' : <span className="text-gray-400 italic">Unassigned</span>)}
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/rcs/${item.id}`)}
                            className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Open RCS Vault"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canCreate && (
                            <button
                              onClick={() => navigate(`/rcs/${item.id}/edit`)}
                              className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => setDeleteRecordTarget(item)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteRecordTarget)}
        onClose={() => setDeleteRecordTarget(null)}
        onConfirm={() => deleteRecordTarget && deleteMutation.mutate(deleteRecordTarget)}
        title="Delete RCS Onboarding Record"
        message={`Are you sure you want to permanently delete the RCS onboarding record for "${deleteRecordTarget?.brand_name}"? All linked client documents and settings will be removed.`}
        confirmLabel="Delete RCS Record"
        variant="danger"
      />
    </PageLayout>
  );
}

export default RcsList;
