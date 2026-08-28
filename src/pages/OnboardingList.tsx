import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit,
  Eye,
  Lock,
  Building2,
  Phone,
  ArrowUpDown,
  X
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchDocumentMetadata, saveDocumentMetadata } from '@/lib/storage';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ImportExcel } from '@/components/onboarding/ImportExcel';
import { ExportData } from '@/components/onboarding/ExportData';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { hasPermission } from '@/lib/permissions';
import { STATUS_OPTIONS, CLIENT_TYPE_OPTIONS, getClientDisplayName } from '@/types/database';
import type { OnboardingRecord, Profile } from '@/types/database';
import { format, formatDistanceToNow } from 'date-fns';

export function OnboardingList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedClientType, setSelectedClientType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'brand' | 'status'>('latest');

  // Modals
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<OnboardingRecord | null>(null);

  // Fetch employees list for filter dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['profiles-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, corporate_email')
        .eq('is_active', true)
        .order('full_name');
      return (data || []) as Profile[];
    },
  });

  // Fetch onboarding records with joined profile info
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['onboarding-records'],
    queryFn: async () => {
      const res = await fetchDocumentMetadata('onboarding_records', '*', {
        order: { column: 'created_at', ascending: false },
      });
      if (res.success && Array.isArray(res.data)) {
        return res.data as (OnboardingRecord & { assigned_profile: Profile | null })[];
      }
      return [];
    },
  });

  // Delete mutation (super_admin only)
  const deleteMutation = useMutation({
    mutationFn: async (record: OnboardingRecord) => {
      const res = await saveDocumentMetadata('onboarding_records', {}, 'delete', { id: record.id });
      if (!res.success) throw new Error(res.error || 'Failed to delete record.');

      await logAudit('record_deleted', 'onboarding', record.id, {
        brand_name: getClientDisplayName(record),
      });
    },
    onSuccess: () => {
      toast.success('Record Deleted', 'Client record was permanently removed.');
      queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setDeleteConfirmRecord(null);
    },
    onError: (err: any) => {
      toast.error('Deletion Failed', err.message);
    },
  });

  // Filter and sort records
  const filteredRecords = records
    .filter((record) => {
      const clientName = getClientDisplayName(record);
      const matchesSearch =
        clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.company_name && record.company_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        record.whatsapp_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.contact_person && record.contact_person.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (record.client_type && record.client_type.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = selectedStatus === 'all' || record.status === selectedStatus;
      const matchesEmployee = selectedEmployee === 'all' || record.assigned_to === selectedEmployee;
      const matchesClientType = selectedClientType === 'all' || record.client_type === selectedClientType;

      return matchesSearch && matchesStatus && matchesEmployee && matchesClientType;
    })
    .sort((a, b) => {
      if (sortBy === 'latest') {
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
      }
      if (sortBy === 'brand') {
        return getClientDisplayName(a).localeCompare(getClientDisplayName(b));
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });

  const canCreate = hasPermission(profile?.role, 'onboarding:create');
  const canDelete = hasPermission(profile?.role, 'onboarding:delete');

  return (
    <PageLayout title="WhatsApp Onboarding">
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Client WhatsApp Onboarding
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Manage client WhatsApp Business accounts, Meta Portfolios, and compliance documents.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canCreate && (
              <>
                <button
                  onClick={() => setImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Import Excel
                </button>
                <button
                  onClick={() => setExportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  Export
                </button>
                <button
                  onClick={() => navigate('/onboarding/new')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1677FF] hover:bg-blue-600 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Client
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search brand, company, WhatsApp number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Client Type Filter */}
            <div>
              <select
                value={selectedClientType}
                onChange={(e) => setSelectedClientType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Client Types</option>
                {CLIENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned Staff Filter */}
            <div>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Assigned Staff</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-toolbar: Active Count & Sort */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-500">
            <div>
              Showing <span className="font-semibold text-gray-900">{filteredRecords.length}</span> of {records.length} clients
            </div>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="font-medium text-gray-700 bg-transparent border-0 focus:ring-0 cursor-pointer text-xs p-0"
              >
                <option value="latest">Latest First</option>
                <option value="oldest">Oldest First</option>
                <option value="brand">Brand A-Z</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table / Cards */}
        {isLoading ? (
          <div className="p-16 bg-white rounded-2xl border border-gray-200 text-center">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-medium text-gray-500">Loading client directory...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No Client Records Found"
            description={searchTerm ? "No records matched your search filters." : "Start by adding your first client onboarding record."}
            actionLabel={canCreate ? "Add New Client" : undefined}
            onAction={canCreate ? () => navigate('/onboarding/new') : undefined}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Client / Brand</th>
                    <th className="py-3.5 px-4">WhatsApp Number</th>
                    <th className="py-3.5 px-4">Client Type</th>
                    <th className="py-3.5 px-4">Meta Platform User</th>
                    <th className="py-3.5 px-4">Assigned Staff</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => navigate(`/onboarding/${record.id}`)}
                      className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                    >
                      {/* Brand & Company */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677FF] font-bold text-xs flex items-center justify-center flex-shrink-0 group-hover:bg-[#1677FF] group-hover:text-white transition-colors">
                            {getClientDisplayName(record).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 group-hover:text-[#1677FF] transition-colors">
                              {getClientDisplayName(record)}
                            </p>
                            {record.company_name && record.company_name.trim().toLowerCase() !== getClientDisplayName(record).toLowerCase() && (
                              <p className="text-[11px] text-gray-400">{record.company_name}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* WhatsApp Phone */}
                      <td className="py-3.5 px-4 font-mono text-gray-700 font-medium">
                        {record.whatsapp_number}
                      </td>

                      {/* Client Type */}
                      <td className="py-3.5 px-4">
                        {record.client_type ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 uppercase">
                            {record.client_type}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Meta Platform User */}
                      <td className="py-3.5 px-4 text-gray-600">
                        {record.username ? (
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-500" />
                            {record.username}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Assigned Staff */}
                      <td className="py-3.5 px-4 text-gray-600">
                        {employees.find((e) => e.id === record.assigned_to)?.full_name || (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={record.status} />
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/onboarding/${record.id}`)}
                            title="View Client"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canCreate && (
                            <button
                              onClick={() => navigate(`/onboarding/${record.id}/edit`)}
                              title="Edit Client"
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteConfirmRecord(record)}
                              title="Delete Client"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                  className="p-4 space-y-3 active:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{getClientDisplayName(record)}</h4>
                      {record.company_name && record.company_name.trim().toLowerCase() !== getClientDisplayName(record).toLowerCase() && (
                        <p className="text-xs text-gray-500">{record.company_name}</p>
                      )}
                    </div>
                    <StatusBadge status={record.status} />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-600 font-mono">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{record.whatsapp_number}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-400">
                    <span>Staff: {employees.find((e) => e.id === record.assigned_to)?.full_name || 'Unassigned'}</span>
                    <span>{record.created_at ? formatDistanceToNow(new Date(record.created_at)) + ' ago' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Modals */}
        {importModalOpen && (
          <ImportExcel
            open={importModalOpen}
            onClose={() => setImportModalOpen(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            }}
          />
        )}

        {exportModalOpen && (
          <ExportData
            open={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
          />
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmRecord && (
          <ConfirmDialog
            open={!!deleteConfirmRecord}
            onClose={() => setDeleteConfirmRecord(null)}
            onConfirm={() => deleteMutation.mutate(deleteConfirmRecord)}
            title="Delete Client Record"
            message={`Are you sure you want to permanently delete "${getClientDisplayName(deleteConfirmRecord)}"? All associated Meta Portfolio records, WABAs, phone numbers, and documents will also be removed.`}
            confirmLabel="Delete Client"
            variant="danger"
          />
        )}
      </div>
    </PageLayout>
  );
}

export default OnboardingList;
