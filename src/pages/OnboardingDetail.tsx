import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Phone,
  Clock,
  Edit,
  FolderLock,
  ScrollText,
  KeyRound,
  Briefcase,
  Smartphone,
  CheckCircle2,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { hasPermission } from '@/lib/permissions';
import { saveDocumentMetadata, fetchDocumentMetadata } from '@/lib/storage';
import { STATUS_OPTIONS, formatStatusLabel } from '@/types/database';
import type {
  OnboardingRecord,
  OnboardingDocument,
  OnboardingStatus,
  Profile
} from '@/types/database';

// Tab Components
import { ClientOverviewTab } from '@/components/client-detail/ClientOverviewTab';
import { MetaBusinessTab } from '@/components/client-detail/MetaBusinessTab';
import { WabaTab } from '@/components/client-detail/WabaTab';
import { PhoneNumbersTab } from '@/components/client-detail/PhoneNumbersTab';
import { DocumentsTab } from '@/components/client-detail/DocumentsTab';
import { CredentialsTab } from '@/components/client-detail/CredentialsTab';
import { ActivityTab } from '@/components/client-detail/ActivityTab';

type TabKey = 'overview' | 'meta' | 'waba' | 'phones' | 'documents' | 'credentials' | 'activity';

export function OnboardingDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Safe date helper
  const formatDateSafe = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Fetch Onboarding Record
  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ['onboarding-detail', id],
    queryFn: async () => {
      if (!id) throw new Error('No record ID provided');

      // 1. Primary secure fetch through authenticated serverless metadata API
      try {
        const res = await fetchDocumentMetadata('onboarding_records', '*', { match: { id } });
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          return res.data[0] as OnboardingRecord;
        }
      } catch (e) {
        console.warn('Metadata API fetch error:', e);
      }

      // 2. Direct Supabase client fallback
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select(`
            *,
            assigned_profile:profiles!onboarding_records_assigned_to_fkey(id, full_name, corporate_email, department),
            creator_profile:profiles!onboarding_records_created_by_fkey(id, full_name, corporate_email)
          `)
          .eq('id', id)
          .single();

        if (!error && data) {
          return data as OnboardingRecord & {
            assigned_profile: Profile | null;
            creator_profile: Profile | null;
          };
        }
      } catch {
        // Fallback
      }

      // 3. Check local storage
      try {
        const localCustom = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
        const localMatch = localCustom.find((r: any) => r.id === id);
        if (localMatch) return localMatch;
      } catch {
        // Ignore
      }

      return null;
    },
    enabled: Boolean(id),
  });

  // Fetch Documents
  const { data: documents = [], refetch: refetchDocuments } = useQuery({
    queryKey: ['onboarding-documents', id],
    queryFn: async () => {
      if (!id) return [];
      try {
        const res = await fetchDocumentMetadata('onboarding_documents', '*', {
          match: { onboarding_id: id },
          order: { column: 'created_at', ascending: false }
        });
        if (res.success && Array.isArray(res.data)) {
          return res.data as OnboardingDocument[];
        }
      } catch (err) {
        console.warn('Document fetch error:', err);
      }
      return [];
    },
    enabled: Boolean(id),
  });

  // Fetch Staff List
  const { data: staffList = [] } = useQuery({
    queryKey: ['profiles-employees'],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, corporate_email, is_active, department')
          .eq('is_active', true)
          .order('full_name');
        return (data || []) as Profile[];
      } catch {
        return [];
      }
    },
  });

  // Fetch related Meta Portfolio, WABA, Phone counts for progress calculation
  const { data: entityCounts } = useQuery({
    queryKey: ['client-entity-counts', id],
    queryFn: async () => {
      if (!id) return { meta: 0, waba: 0, phones: 0 };
      const [metaRes, wabaRes, phoneRes] = await Promise.all([
        fetchDocumentMetadata('meta_business_portfolios', 'id', { match: { client_id: id } }),
        fetchDocumentMetadata('waba_accounts', 'id', { match: { client_id: id } }),
        fetchDocumentMetadata('phone_numbers', 'id', { match: { client_id: id } }),
      ]);
      return {
        meta: metaRes?.success && Array.isArray(metaRes.data) ? metaRes.data.length : 0,
        waba: wabaRes?.success && Array.isArray(wabaRes.data) ? wabaRes.data.length : 0,
        phones: phoneRes?.success && Array.isArray(phoneRes.data) ? phoneRes.data.length : 0,
      };
    },
    enabled: Boolean(id),
  });

  // Change Status Mutation
  const statusMutation = useMutation({
    mutationFn: async (newStatus: OnboardingStatus) => {
      if (!id) return;
      const res = await saveDocumentMetadata(
        'onboarding_records',
        { status: newStatus, updated_at: new Date().toISOString() },
        'update',
        { id }
      );
      if (!res.success) throw new Error(res.error || 'Failed to update record status.');

      await logAudit('record_edited', 'onboarding', id, {
        previous_status: record?.status,
        new_status: newStatus,
      });
    },
    onSuccess: (_, newStatus) => {
      toast.success('Status Updated', `Record status changed to ${formatStatusLabel(newStatus)}`);
      queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    },
    onError: (err: any) => {
      toast.error('Status Update Failed', err.message);
    },
  });

  // Reassignment Mutation
  const reassignMutation = useMutation({
    mutationFn: async (newAssigneeId: string) => {
      if (!id) return;
      const res = await saveDocumentMetadata(
        'onboarding_records',
        { assigned_to: newAssigneeId || null, updated_at: new Date().toISOString() },
        'update',
        { id }
      );
      if (!res.success) throw new Error(res.error || 'Failed to reassign record.');

      await logAudit('assignment_changed', 'onboarding', id, {
        previous_assigned: record?.assigned_to,
        new_assigned: newAssigneeId,
      });
    },
    onSuccess: () => {
      toast.success('Employee Assigned', 'Onboarding responsibility was updated.');
      queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', id] });
    },
    onError: (err: any) => {
      toast.error('Reassignment Failed', err.message);
    },
  });

  // Calculate Onboarding Completion Percentage safely
  const calculateProgress = () => {
    let score = 20; // Client base record created
    if (record?.credential_encrypted) score += 15;
    if (Array.isArray(documents) && documents.length > 0) score += 20;
    if (entityCounts?.meta && entityCounts.meta > 0) score += 15;
    if (entityCounts?.waba && entityCounts.waba > 0) score += 15;
    if (entityCounts?.phones && entityCounts.phones > 0) score += 15;
    return Math.min(score, 100);
  };

  const progress = calculateProgress();

  if (recordLoading) {
    return (
      <PageLayout title="Loading Client...">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-500">Loading client record...</p>
        </div>
      </PageLayout>
    );
  }

  if (!record) {
    return (
      <PageLayout title="Client Not Found">
        <div className="p-8 bg-white rounded-xl border border-gray-100 shadow-sm text-center my-8">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900">Client Record Not Found</h3>
          <p className="text-sm text-gray-500 mt-1 mb-6">The requested client record could not be located.</p>
          <button
            onClick={() => navigate('/onboarding')}
            className="px-4 py-2 bg-[#1677FF] text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Client List
          </button>
        </div>
      </PageLayout>
    );
  }

  const tabs: { id: TabKey; label: string; icon: any; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'meta', label: 'Meta Business', icon: Briefcase, count: entityCounts?.meta },
    { id: 'waba', label: 'WABA', icon: Smartphone, count: entityCounts?.waba },
    { id: 'phones', label: 'Phone Numbers', icon: Phone, count: entityCounts?.phones },
    { id: 'documents', label: 'Documents', icon: FolderLock, count: Array.isArray(documents) ? documents.length : 0 },
    { id: 'credentials', label: 'Credentials', icon: KeyRound },
    { id: 'activity', label: 'Activity', icon: ScrollText },
  ];

  return (
    <PageLayout title={record?.brand_name || 'Client Details'}>
      <div className="space-y-6 pb-12">
        {/* Top Header Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-4">
              <button
                onClick={() => navigate('/onboarding')}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors mt-0.5 cursor-pointer"
                title="Back to List"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                    {record.brand_name || 'Unnamed Brand'}
                  </h1>
                  <StatusBadge status={record.status} />
                  {record.client_type && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                      {record.client_type}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                  {record.company_name && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      {record.company_name}
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {record.whatsapp_number || '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    Created {formatDateSafe(record.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Status Changer */}
            <div className="flex flex-wrap items-center gap-3 self-end lg:self-center">
              {hasPermission(profile?.role, 'onboarding:edit') && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Status:</label>
                  <select
                    value={record.status || 'pending'}
                    onChange={(e) => statusMutation.mutate(e.target.value as OnboardingStatus)}
                    disabled={statusMutation.isPending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hasPermission(profile?.role, 'onboarding:edit') && (
                <button
                  onClick={() => navigate(`/onboarding/${record.id}/edit`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Client
                </button>
              )}
            </div>
          </div>

          {/* Workflow Progress Bar */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#1677FF]" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Onboarding Completion
                </span>
              </div>
              <span className="text-xs font-bold text-[#1677FF]">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Step Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-[11px] font-medium text-gray-400">
              <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>1. Client Info</span>
              </div>
              <div className={`flex items-center gap-1 ${entityCounts?.meta ? 'text-emerald-600 font-semibold' : ''}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>2. Meta Portfolio</span>
              </div>
              <div className={`flex items-center gap-1 ${entityCounts?.waba ? 'text-emerald-600 font-semibold' : ''}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>3. WABA Setup</span>
              </div>
              <div className={`flex items-center gap-1 ${entityCounts?.phones ? 'text-emerald-600 font-semibold' : ''}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>4. Phone Number</span>
              </div>
              <div className={`flex items-center gap-1 ${Array.isArray(documents) && documents.length > 0 ? 'text-emerald-600 font-semibold' : ''}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>5. Documents</span>
              </div>
              <div className={`flex items-center gap-1 ${record.status === 'live' || record.status === 'completed' ? 'text-emerald-600 font-semibold' : ''}`}>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>6. Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1.5">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1677FF] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <ClientOverviewTab
              record={record}
              staffList={staffList}
              onReassign={(staffId) => reassignMutation.mutate(staffId)}
              onStatusChange={(status) => statusMutation.mutate(status as OnboardingStatus)}
            />
          )}

          {activeTab === 'meta' && <MetaBusinessTab clientId={record.id} />}

          {activeTab === 'waba' && <WabaTab clientId={record.id} />}

          {activeTab === 'phones' && <PhoneNumbersTab clientId={record.id} />}

          {activeTab === 'documents' && (
            <DocumentsTab
              recordId={record.id}
              record={record}
              documents={documents}
              onRefresh={refetchDocuments}
            />
          )}

          {activeTab === 'credentials' && <CredentialsTab record={record} />}

          {activeTab === 'activity' && <ActivityTab recordId={record.id} />}
        </div>
      </div>
    </PageLayout>
  );
}

export default OnboardingDetail;
