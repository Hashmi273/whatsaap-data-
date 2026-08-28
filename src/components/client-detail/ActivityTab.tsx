import { useQuery } from '@tanstack/react-query';
import { Shield, Clock, FileText, UserCheck, Edit, Eye, User } from 'lucide-react';
import { fetchDocumentMetadata } from '@/lib/storage';
import { format, formatDistanceToNow } from 'date-fns';
import type { AuditLog, Profile } from '@/types/database';

interface ActivityTabProps {
  recordId: string;
}

export function ActivityTab({ recordId }: ActivityTabProps) {
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['onboarding-audit-logs', recordId],
    queryFn: async () => {
      if (!recordId) return [];
      const res = await fetchDocumentMetadata('audit_logs', '*', {
        match: { entity_id: recordId },
        order: { column: 'created_at', ascending: false },
        limit: 50,
      });
      if (res.success && Array.isArray(res.data)) {
        return res.data as AuditLog[];
      }
      return [];
    },
  });

  const getActionIcon = (action: string) => {
    if (action.includes('document')) return <FileText className="w-4 h-4 text-blue-500" />;
    if (action.includes('assignment')) return <UserCheck className="w-4 h-4 text-purple-500" />;
    if (action.includes('status') || action.includes('edit')) return <Edit className="w-4 h-4 text-amber-500" />;
    if (action.includes('credential')) return <Eye className="w-4 h-4 text-rose-500" />;
    return <Shield className="w-4 h-4 text-gray-500" />;
  };

  const formatActionMessage = (log: any) => {
    const action = log.action.replace(/_/g, ' ');
    if (log.details?.file_name) {
      if (log.action === 'document_deleted') return `Deleted document: ${log.details.file_name}`;
      if (log.details.is_replacement) return `Replaced document with: ${log.details.file_name}`;
      return `Uploaded document: ${log.details.file_name}`;
    }
    if (log.action === 'credential_viewed') return 'Viewed Facebook/Meta login password';
    if (log.action === 'credential_copied') return 'Copied Facebook/Meta login password';
    if (log.action === 'assignment_changed') return 'Changed team assignment';
    if (log.action === 'record_edited') return 'Updated client details or status';
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  if (isLoading) {
    return <div className="p-8 text-center"><div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden max-w-4xl">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-50 text-gray-700 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Activity & Audit Trail</h3>
        </div>
      </div>

      {auditLogs?.length === 0 ? (
        <div className="p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-gray-900">No Activity Logged</h4>
          <p className="text-xs text-gray-500 mt-1">Actions on this record will appear here.</p>
        </div>
      ) : (
        <div className="p-6">
          <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
            {auditLogs?.map((log) => (
              <div key={log.id} className="relative pl-6">
                <div className="absolute -left-[17px] top-1 bg-white border-2 border-gray-100 p-1.5 rounded-full shadow-xs">
                  {getActionIcon(log.action)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatActionMessage(log)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.user_profile?.full_name || 'System / Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')} 
                      <span className="text-gray-400">({formatDistanceToNow(new Date(log.created_at))} ago)</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
