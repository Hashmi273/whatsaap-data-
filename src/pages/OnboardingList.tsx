import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit,
  Eye,
  KeyRound,
  Lock,
  User,
  Calendar,
  Building2,
  XCircle,
  MoreVertical,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ImportExcel } from '@/components/onboarding/ImportExcel';
import { ExportData } from '@/components/onboarding/ExportData';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { hasPermission } from '@/lib/permissions';
import { STATUS_OPTIONS, formatStatusLabel } from '@/types/database';
import type { OnboardingRecord, OnboardingStatus, Profile } from '@/types/database';
import { format, formatDistanceToNow } from 'date-fns';

import { INITIAL_DEMO_ONBOARDINGS } from '@/lib/demoData';

export function OnboardingList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'brand' | 'status'>('latest');

  // Modals
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<OnboardingRecord | null>(null);

  // Fetch employees list for filter dropdown
  const { data: employees } = useQuery({
    queryKey: ['profiles-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, corporate_email')
        .order('full_name');
      if (error || !data || data.length === 0) {
        return [
          { id: 'demo-super-admin-001', full_name: 'Vikram Mehta', corporate_email: 'admin@immenseair.com' },
          { id: 'demo-manager-002', full_name: 'Priya Sharma', corporate_email: 'manager@immenseair.com' },
          { id: 'demo-employee-003', full_name: 'Arjun Verma', corporate_email: 'employee@immenseair.com' },
        ] as Profile[];
      }
      return data as Profile[];
    },
  });

  // Fetch onboarding records with joined profile info
  const { data: records, isLoading } = useQuery({
    queryKey: ['onboarding-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_records')
        .select(`
          *,
          assigned_profile:profiles!onboarding_records_assigned_to_fkey(id, full_name, corporate_email)
        `)
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return INITIAL_DEMO_ONBOARDINGS as (OnboardingRecord & { assigned_profile: Profile | null })[];
      }
      return data as (OnboardingRecord & { assigned_profile: Profile | null })[];
    },
  });

  // Delete mutation (super_admin only)
  const deleteMutation = useMutation({
    mutationFn: async (record: OnboardingRecord) => {
      const { error } = await supabase
        .from('onboarding_records')
        .delete()
        .eq('id', record.id);

      if (error) throw error;

      await logAudit('record_deleted', 'onboarding', record.id, {
        brand_name: record.brand_name,
      });
    },
    onSuccess: () => {
      toast.success('Record Deleted', 'Onboarding record was permanently removed.');
      queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setDeleteConfirmRecord(null);
    },
    onError: (err: any) => {
      toast.error('Deletion Failed', err.message || 'Could not delete record.');
    },
  });

  // Filtering & Sorting Logic
  const filteredRecords = (records || []).filter((record) => {
    const matchesSearch =
      record.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.whatsapp_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.username && record.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (record.assigned_profile?.full_name &&
        record.assigned_profile.full_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = selectedStatus === 'all' || record.status === selectedStatus;
    const matchesEmployee =
      selectedEmployee === 'all' || record.assigned_to === selectedEmployee;

    return matchesSearch && matchesStatus && matchesEmployee;
  }).sort((a, b) => {
    if (sortBy === 'latest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === 'brand') {
      return a.brand_name.localeCompare(b.brand_name);
    }
    if (sortBy === 'status') {
      return a.status.localeCompare(b.status);
    }
    return 0;
  });

  const canCreate = hasPermission(profile?.role, 'onboarding:create');
  const canEdit = hasPermission(profile?.role, 'onboarding:edit');
  const canDelete = hasPermission(profile?.role, 'onboarding:delete');
  const canImport = hasPermission(profile?.role, 'import:excel');
  const canExport = hasPermission(profile?.role, 'export:data');

  return (
    <PageLayout title="WhatsApp Onboarding">
      <div className="space-y-6">
        {/* Top Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Client Onboarding Roster</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Secure record repository for WhatsApp Business accounts & credentials
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canImport && (
              <button
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Import Excel
              </button>
            )}

            {canExport && (
              <button
                onClick={() => setExportModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
              >
                <Download className="w-4 h-4 text-blue-600" />
                Export
              </button>
            )}

            {canCreate && (
              <button
                onClick={() => navigate('/onboarding/new')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                New Onboarding
              </button>
            )}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search brand, number, user..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Employee Filter */}
            <div>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                <option value="all">All Assigned Staff</option>
                {(employees || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Filter */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                <option value="latest">Sort: Latest Created</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="brand">Sort: Brand Name (A-Z)</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>
          </div>

          {(searchTerm || selectedStatus !== 'all' || selectedEmployee !== 'all') && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
              <span className="text-gray-500">
                Found <span className="font-semibold text-gray-800">{filteredRecords.length}</span> records
              </span>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedStatus('all');
                  setSelectedEmployee('all');
                }}
                className="text-xs text-[#1677FF] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Data Table / Cards */}
        {isLoading ? (
          <div className="p-8 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No Onboarding Records Found"
            description="Get started by registering a new WhatsApp Business onboarding or import from Excel."
            actionLabel={canCreate ? 'New Onboarding' : undefined}
            onAction={canCreate ? () => navigate('/onboarding/new') : undefined}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Brand / Client</th>
                    <th className="py-3 px-4">WhatsApp Number</th>
                    <th className="py-3 px-4">Platform User</th>
                    <th className="py-3 px-4">Assigned Staff</th>
                    <th className="py-3 px-4">Onboarding Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredRecords.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => navigate(`/onboarding/${record.id}`)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 text-sm group-hover:text-[#1677FF] transition-colors">
                          {record.brand_name}
                        </div>
                        {record.company_name && (
                          <div className="text-[11px] text-gray-400">
                            {record.company_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-gray-800">
                        {record.whatsapp_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-900 font-medium">
                            {record.username || '—'}
                          </span>
                          {record.credential_encrypted && (
                            <span title="Encrypted Secret Present">
                              <Lock className="w-3 h-3 text-emerald-600" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {record.assigned_profile ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center text-[10px]">
                              {record.assigned_profile.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900">
                              {record.assigned_profile.full_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {record.onboarding_date
                          ? format(new Date(record.onboarding_date), 'dd MMM yyyy')
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={record.status} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                        {formatDistanceToNow(new Date(record.updated_at), { addSuffix: true })}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/onboarding/${record.id}`)}
                            title="View Detail"
                            className="p-1.5 text-gray-500 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canEdit && (
                            <button
                              onClick={() => navigate(`/onboarding/${record.id}/edit`)}
                              title="Edit Record"
                              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => setDeleteConfirmRecord(record)}
                              title="Delete Record"
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
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

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredRecords.map((record) => (
                <div
                  key={record.id}
                  onClick={() => navigate(`/onboarding/${record.id}`)}
                  className="p-4 space-y-3 hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{record.brand_name}</h4>
                      <p className="text-xs font-mono text-gray-600 mt-0.5">
                        {record.whatsapp_number}
                      </p>
                    </div>
                    <StatusBadge status={record.status} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">Assigned Staff</span>
                      <span className="font-medium text-gray-800">
                        {record.assigned_profile?.full_name || 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">Onboarding Date</span>
                      <span className="font-medium text-gray-800">
                        {record.onboarding_date || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Excel Import Modal */}
      <ImportExcel
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
      />

      {/* Export Modal */}
      <ExportData open={exportModalOpen} onClose={() => setExportModalOpen(false)} />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteConfirmRecord)}
        onClose={() => setDeleteConfirmRecord(null)}
        onConfirm={() => deleteConfirmRecord && deleteMutation.mutate(deleteConfirmRecord)}
        isLoading={deleteMutation.isPending}
        title="Delete Onboarding Record"
        message={`Are you sure you want to permanently delete "${deleteConfirmRecord?.brand_name}"? All associated document references and vault data will be removed.`}
        confirmLabel="Delete Record"
        variant="danger"
      />
    </PageLayout>
  );
}

export default OnboardingList;
