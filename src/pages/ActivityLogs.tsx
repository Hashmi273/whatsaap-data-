import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ScrollText,
  Search,
  Filter,
  Shield,
  Eye,
  Copy,
  Upload,
  Download,
  Trash2,
  UserCheck,
  UserX,
  LogIn,
  LogOut,
  Edit,
  PlusCircle,
  ExternalLink,
  Laptop,
  Mail
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import type { AuditLog, Profile } from '@/types/database';
import { format } from 'date-fns';

export function ActivityLogs() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          user_profile:profiles!audit_logs_user_id_fkey(id, full_name, corporate_email, role)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as (AuditLog & { user_profile: Profile | null })[];
    },
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'credential_viewed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
            <Eye className="w-3 h-3 text-amber-600" /> Credential Revealed
          </span>
        );
      case 'credential_copied':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
            <Copy className="w-3 h-3 text-amber-600" /> Credential Copied
          </span>
        );
      case 'document_uploaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-bold text-[11px]">
            <Upload className="w-3 h-3 text-blue-600" /> Document Vaulted
          </span>
        );
      case 'document_downloaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[11px]">
            <Download className="w-3 h-3 text-emerald-600" /> Document Downloaded
          </span>
        );
      case 'record_created':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-bold text-[11px]">
            <PlusCircle className="w-3 h-3 text-indigo-600" /> Onboarding Created
          </span>
        );
      case 'record_edited':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 font-bold text-[11px]">
            <Edit className="w-3 h-3 text-purple-600" /> Record Modified
          </span>
        );
      case 'record_deleted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-900 font-bold text-[11px]">
            <Trash2 className="w-3 h-3 text-red-600" /> Record Deleted
          </span>
        );
      case 'employee_deactivated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-900 font-bold text-[11px]">
            <UserX className="w-3 h-3 text-red-600" /> Staff Deactivated
          </span>
        );
      case 'user_created':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[11px]">
            <UserCheck className="w-3 h-3 text-emerald-600" /> Account Created
          </span>
        );
      case 'role_changed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-bold text-[11px]">
            <Shield className="w-3 h-3 text-blue-600" /> Role Changed
          </span>
        );
      case 'password_reset_initiated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
            <Mail className="w-3 h-3 text-amber-600" /> Reset Link Dispatched
          </span>
        );
      case 'password_reset_completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-100 text-teal-900 font-bold text-[11px]">
            <Shield className="w-3 h-3 text-teal-600" /> Password Reset Completed
          </span>
        );
      case 'password_changed_own':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-bold text-[11px]">
            <Shield className="w-3 h-3 text-indigo-600" /> Changed Password
          </span>
        );
      case 'login':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium text-[11px]">
            <LogIn className="w-3 h-3 text-gray-500" /> Portal Login
          </span>
        );
      case 'logout':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium text-[11px]">
            <LogOut className="w-3 h-3 text-gray-500" /> Portal Logout
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium text-[11px] capitalize">
            {action.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  const filteredLogs = (logs || []).filter((log) => {
    const matchesSearch =
      (log.user_profile?.full_name &&
        log.user_profile.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user_profile?.corporate_email &&
        log.user_profile.corporate_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <PageLayout title="Activity & Audit Trail">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Compliance Audit Trail</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Append-only immutable record of all staff logins, secret accesses, and document movements
            </p>
          </div>

          <div className="p-2.5 bg-blue-50 text-blue-900 rounded-xl border border-blue-100 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto">
            <Shield className="w-4 h-4 text-[#1677FF]" />
            <span>Immutable Ledger • Row Level Security Guarded</span>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search audit trail by user, action, or details..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full sm:w-60 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
          >
            <option value="all">All Action Types</option>
            <option value="credential_viewed">Credential Revealed</option>
            <option value="credential_copied">Credential Copied</option>
            <option value="document_uploaded">Document Uploaded</option>
            <option value="document_downloaded">Document Downloaded</option>
            <option value="record_created">Record Created</option>
            <option value="record_edited">Record Edited</option>
            <option value="employee_deactivated">Staff Deactivated</option>
            <option value="login">User Login</option>
          </select>
        </div>

        {/* Audit Trail Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No Activity Logs"
            description="No compliance activity records match your current filter."
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action Event</th>
                  <th className="py-3 px-4">Entity Reference</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Device / Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#071A3D] text-white font-bold flex items-center justify-center text-[10px]">
                          {log.user_profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {log.user_profile?.full_name || 'System / Automated'}
                          </p>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {log.user_profile?.corporate_email || ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">{getActionBadge(log.action)}</td>
                    <td className="py-3 px-4">
                      {log.entity_id && log.entity_type === 'onboarding' ? (
                        <button
                          onClick={() => navigate(`/onboarding/${log.entity_id}`)}
                          className="inline-flex items-center gap-1 text-[#1677FF] hover:underline font-mono text-[11px]"
                        >
                          <span>{log.entity_id.slice(0, 8)}...</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-gray-400 font-mono text-[11px]">
                          {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 6)})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                      {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-[10px]">
                      <div className="flex items-center gap-1 max-w-xs truncate" title={log.user_agent || ''}>
                        <Laptop className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {log.user_agent ? log.user_agent.split(' ')[0] : 'Web Client'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default ActivityLogs;
