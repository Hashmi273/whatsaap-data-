import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  PlusCircle,
  Search,
  Users,
  ShieldCheck,
  FileText,
  TrendingUp,
  FolderLock,
  Radio,
  ArrowRight,
  Shield,
  Briefcase
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { fetchDocumentMetadata } from '@/lib/storage';
import { PageLayout } from '@/components/layout/PageLayout';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCategoryLabel } from '@/types/database';
import type { OnboardingRecord, OnboardingDocument, AuditLog, Profile } from '@/types/database';
import { format, formatDistanceToNow } from 'date-fns';

export function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Fetch stats via RPC or table count
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_stats');
        if (!rpcError && rpcData && rpcData.length > 0) {
          return rpcData[0];
        }

        const res = await fetchDocumentMetadata('onboarding_records', 'status');
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const records = res.data;
          return {
            total: records.length,
            pending: records.filter((r) => r.status === 'pending').length,
            in_progress: records.filter((r) => r.status === 'in_progress').length,
            live: records.filter((r) => r.status === 'live').length,
            completed: records.filter((r) => r.status === 'completed').length,
            rejected: records.filter((r) => r.status === 'rejected').length,
          };
        }
      } catch {
        // Fallback
      }

      return { total: 0, pending: 0, in_progress: 0, live: 0, completed: 0, rejected: 0 };
    },
  });

  // Fetch recent onboarding records
  const { data: recentOnboardings = [], isLoading: onboardingsLoading } = useQuery({
    queryKey: ['recent-onboardings'],
    queryFn: async () => {
      const res = await fetchDocumentMetadata('onboarding_records', '*', {
        order: { column: 'created_at', ascending: false },
        limit: 5,
      });
      if (res.success && Array.isArray(res.data)) {
        return res.data as OnboardingRecord[];
      }
      return [];
    },
  });

  // Fetch recent documents
  const { data: recentDocuments = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['recent-documents'],
    queryFn: async () => {
      const res = await fetchDocumentMetadata('onboarding_documents', '*', {
        order: { column: 'created_at', ascending: false },
        limit: 5,
      });
      if (res.success && Array.isArray(res.data)) {
        return res.data as OnboardingDocument[];
      }
      return [];
    },
  });

  // Fetch recent activity audit logs
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['recent-audit-logs'],
    queryFn: async () => {
      const res = await fetchDocumentMetadata('audit_logs', '*', {
        order: { column: 'created_at', ascending: false },
        limit: 5,
      });
      if (res.success && Array.isArray(res.data)) {
        return res.data as AuditLog[];
      }
      return [];
    },
  });

  // Fetch team workload
  const { data: teamWorkload = [] } = useQuery({
    queryKey: ['team-workload'],
    queryFn: async () => {
      const [profilesRes, recordsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, department').eq('is_active', true),
        fetchDocumentMetadata('onboarding_records', 'assigned_to, status'),
      ]);

      const staff = profilesRes.data || [];
      const records = (recordsRes.success && Array.isArray(recordsRes.data)) ? recordsRes.data : [];

      return staff.map((member: any) => {
        const assignedRecords = records.filter((r: any) => r.assigned_to === member.id);
        const liveCount = assignedRecords.filter((r: any) => r.status === 'live' || r.status === 'completed').length;
        return {
          id: member.id,
          name: member.full_name,
          role: member.role,
          total: assignedRecords.length,
          live: liveCount,
          pending: assignedRecords.length - liveCount,
        };
      }).filter((w: any) => w.total > 0).sort((a: any, b: any) => b.total - a.total);
    },
  });

  const chartData = [
    { name: 'Live', value: stats?.live || 0, color: '#10B981' },
    { name: 'In Progress', value: stats?.in_progress || 0, color: '#1677FF' },
    { name: 'Pending', value: stats?.pending || 0, color: '#F59E0B' },
    { name: 'Completed', value: stats?.completed || 0, color: '#14B8A6' },
    { name: 'Rejected', value: stats?.rejected || 0, color: '#EF4444' },
  ].filter((d) => d.value > 0);

  const canManage = hasPermission(profile?.role, 'onboarding:create');

  return (
    <PageLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="p-6 bg-gradient-to-r from-[#071A3D] via-[#0C2A5A] to-[#1677FF] rounded-2xl text-white shadow-xs relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-full bg-white/5 skew-x-12" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Enterprise WhatsApp & Meta Management
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {getGreeting()}, {profile?.full_name || 'Team Member'}
              </h2>
              <p className="mt-1 text-sm text-blue-100/90 max-w-xl">
                Manage WhatsApp Business onboarding, Meta Portfolio verification, WABA accounts, and compliance documents.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {canManage && (
                <>
                  <button
                    onClick={() => navigate('/onboarding/new')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-[#071A3D] font-bold text-xs rounded-xl shadow-xs hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-[#1677FF]" />
                    New WhatsApp Client
                  </button>
                  <button
                    onClick={() => navigate('/rcs/new')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Radio className="w-4 h-4 text-white" />
                    New RCS Client
                  </button>
                </>
              )}
              <button
                onClick={() => navigate('/documents/search')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl border border-white/20 transition-colors backdrop-blur-xs cursor-pointer"
              >
                <Search className="w-4 h-4 text-blue-300" />
                Search Vault
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {statsLoading ? '...' : stats?.total || 0}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">All Onboardings</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-amber-200/80 shadow-xs bg-amber-50/20">
            <div className="flex items-center justify-between text-amber-600 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-700">
              {statsLoading ? '...' : stats?.pending || 0}
            </p>
            <p className="text-[11px] text-amber-600/80 mt-1">Awaiting Review</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-blue-200/80 shadow-xs bg-blue-50/20">
            <div className="flex items-center justify-between text-blue-600 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">In Progress</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-blue-700">
              {statsLoading ? '...' : stats?.in_progress || 0}
            </p>
            <p className="text-[11px] text-blue-600/80 mt-1">Under Setup</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-emerald-200/80 shadow-xs bg-emerald-50/20">
            <div className="flex items-center justify-between text-emerald-600 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Live</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-700">
              {statsLoading ? '...' : stats?.live || 0}
            </p>
            <p className="text-[11px] text-emerald-600/80 mt-1">Active on WhatsApp</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-teal-200/80 shadow-xs bg-teal-50/20">
            <div className="flex items-center justify-between text-teal-600 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
              <TrendingUp className="w-4 h-4 text-teal-500" />
            </div>
            <p className="text-2xl font-bold text-teal-700">
              {statsLoading ? '...' : stats?.completed || 0}
            </p>
            <p className="text-[11px] text-teal-600/80 mt-1">Fully Deployed</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-red-200/80 shadow-xs bg-red-50/20">
            <div className="flex items-center justify-between text-red-600 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Rejected</span>
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-700">
              {statsLoading ? '...' : stats?.rejected || 0}
            </p>
            <p className="text-[11px] text-red-600/80 mt-1">Compliance Issue</p>
          </div>
        </div>

        {/* Charts & Quick Actions Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Breakdown Donut */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Onboarding Distribution</h3>
              <p className="text-xs text-gray-500 mt-0.5">Real-time status overview</p>
            </div>

            <div className="h-56 w-full flex items-center justify-center my-2">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-400 text-xs">
                  No onboarding records found to plot.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 text-xs text-gray-500 text-center">
              Total Accounts Managed: <span className="font-semibold text-gray-800">{stats?.total || 0}</span>
            </div>
          </div>

          {/* Quick Actions & Navigation Cards */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => navigate('/onboarding')}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677FF] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-gray-900 text-sm">WhatsApp Onboardings</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Manage client accounts, Meta Portfolios, WABA accounts, and active WhatsApp numbers.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1677FF] mt-4 inline-flex items-center gap-1">
                View Directory <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            <div
              onClick={() => navigate('/documents')}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677FF] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <FolderLock className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-gray-900 text-sm">Private Document Vault</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Access brand GST certificates, PAN cards, WhatsApp authorization letters, and agreements.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1677FF] mt-4 inline-flex items-center gap-1">
                Open Vault <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            <div
              onClick={() => navigate('/documents/search')}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677FF] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Search className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-gray-900 text-sm">Instant Document Search</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Quick search across all client documents with instant download and preview capabilities.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1677FF] mt-4 inline-flex items-center gap-1">
                Search Compliance Docs <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            <div
              onClick={() => navigate(hasPermission(profile?.role, 'employee:manage') ? '/team' : '/activity')}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677FF] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-gray-900 text-sm">Team & Operations</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Track employee workload, audit trails, permission matrices, and account reassignments.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1677FF] mt-4 inline-flex items-center gap-1">
                Manage Operations <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Split Row: Recent Onboardings, Team Workload & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Onboardings (Col 1-2) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Recent Client Onboardings</h3>
                <p className="text-xs text-gray-500">Latest WhatsApp Business accounts submitted</p>
              </div>
              <button
                onClick={() => navigate('/onboarding')}
                className="text-xs font-semibold text-[#1677FF] hover:underline inline-flex items-center gap-1"
              >
                View All <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {recentOnboardings.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  No recent onboarding records found.
                </div>
              ) : (
                recentOnboardings.map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => navigate(`/onboarding/${rec.id}`)}
                    className="p-4 hover:bg-gray-50/80 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#1677FF] font-bold text-sm flex items-center justify-center flex-shrink-0">
                        {rec.brand_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate hover:text-[#1677FF]">
                          {rec.brand_name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {rec.whatsapp_number}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={rec.status} />
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {rec.created_at ? format(new Date(rec.created_at), 'dd MMM yyyy') : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Team Workload & Activity (Col 3) */}
          <div className="space-y-6">
            {/* Team Workload */}
            {teamWorkload.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900">Team Workload</h3>
                  <span className="text-[11px] text-gray-400">{teamWorkload.length} Active Staff</span>
                </div>
                <div className="space-y-3">
                  {teamWorkload.slice(0, 4).map((w: any) => (
                    <div key={w.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-800">{w.name}</span>
                        <span className="text-gray-500">{w.total} clients ({w.live} live)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1677FF] rounded-full"
                          style={{ width: `${Math.min((w.total / (stats?.total || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Documents */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">Recent Vault Documents</h3>
                <button
                  onClick={() => navigate('/documents')}
                  className="text-xs font-semibold text-[#1677FF] hover:underline"
                >
                  Vault →
                </button>
              </div>
              <div className="space-y-2.5">
                {recentDocuments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No documents uploaded yet.</p>
                ) : (
                  recentDocuments.slice(0, 4).map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2.5 text-xs">
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-gray-400">{formatCategoryLabel(doc.category)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Dashboard;
