import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Edit, Plus, Save, X } from 'lucide-react';
import { fetchDocumentMetadata, saveDocumentMetadata } from '@/lib/storage';
import { useToast } from '@/lib/toast';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { VERIFICATION_STATUS_OPTIONS } from '@/types/database';

interface MetaBusinessTabProps {
  clientId: string;
}

export function MetaBusinessTab({ clientId }: MetaBusinessTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['meta-business', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const res = await fetchDocumentMetadata('meta_business_portfolios', '*', { match: { client_id: clientId } });
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        return res.data[0];
      }
      return null;
    },
    enabled: Boolean(clientId),
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const dataToSave = {
        portfolio_name: payload.portfolio_name?.trim() || '',
        portfolio_id: payload.portfolio_id?.trim() || '',
        portfolio_owner: payload.portfolio_owner?.trim() || payload.owner?.trim() || '',
        meta_login_email: payload.meta_login_email?.trim() || '',
        verification_status: payload.verification_status || 'not_started',
        verification_date: payload.verification_date || null,
        admin_access: payload.admin_access ? 'Yes' : 'No',
        recovery_email: payload.recovery_email?.trim() || '',
        recovery_phone: payload.recovery_phone?.trim() || '',
        notes: payload.notes?.trim() || '',
        client_id: clientId,
        updated_at: new Date().toISOString(),
      };
      
      if (payload.id) {
        (dataToSave as any).id = payload.id;
      } else {
        (dataToSave as any).id = crypto.randomUUID();
        (dataToSave as any).created_at = new Date().toISOString();
      }

      const res = await saveDocumentMetadata('meta_business_portfolios', dataToSave, 'upsert');
      if (!res.success) throw new Error(res.error || 'Failed to save portfolio');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Meta Business Portfolio Saved', 'Details updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['meta-business', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-entity-counts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats', clientId] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error('Failed to Save Portfolio', err.message);
    }
  });

  const handleEdit = () => {
    setFormData(portfolio ? {
      ...portfolio,
      admin_access: portfolio.admin_access === 'Yes' || portfolio.admin_access === true,
      verification_status: portfolio.verification_status || 'not_started',
    } : {
      portfolio_name: '',
      portfolio_id: '',
      portfolio_owner: '',
      meta_login_email: '',
      verification_status: 'not_started',
      admin_access: true,
      recovery_email: '',
      recovery_phone: '',
      notes: '',
    });
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500 font-medium">Loading Meta Business details...</p>
      </div>
    );
  }

  if (!portfolio && !isEditing) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No Meta Business Portfolio"
        description="This client does not have a Meta Business Portfolio configured yet."
        actionLabel="Configure Meta Portfolio"
        onAction={handleEdit}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-[#1677FF] rounded-lg">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Meta Business Portfolio</h3>
            <p className="text-xs text-gray-500">Corporate Meta account and verification profile</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold border border-gray-200"
          >
            <Edit className="w-3.5 h-3.5" /> Edit Details
          </button>
        )}
      </div>

      <div className="p-6">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Portfolio Name *</label>
                <input
                  required
                  type="text"
                  name="portfolio_name"
                  value={formData.portfolio_name || ''}
                  onChange={handleChange}
                  placeholder="e.g. Prestige Estates Meta Portfolio"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Portfolio ID (Meta BM ID)</label>
                <input
                  type="text"
                  name="portfolio_id"
                  value={formData.portfolio_id || ''}
                  onChange={handleChange}
                  placeholder="e.g. 102938475610293"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Portfolio Owner</label>
                <input
                  type="text"
                  name="portfolio_owner"
                  value={formData.portfolio_owner || ''}
                  onChange={handleChange}
                  placeholder="e.g. Prestige Estates Ltd"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Meta Login Email</label>
                <input
                  type="email"
                  name="meta_login_email"
                  value={formData.meta_login_email || ''}
                  onChange={handleChange}
                  placeholder="admin@prestige.com"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Verification Status</label>
                <select
                  name="verification_status"
                  value={formData.verification_status || 'not_started'}
                  onChange={handleChange}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  {VERIFICATION_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Verification Date</label>
                <input
                  type="date"
                  name="verification_date"
                  value={formData.verification_date || ''}
                  onChange={handleChange}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Recovery Email</label>
                <input
                  type="email"
                  name="recovery_email"
                  value={formData.recovery_email || ''}
                  onChange={handleChange}
                  placeholder="recovery@prestige.com"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Recovery Phone</label>
                <input
                  type="text"
                  name="recovery_phone"
                  value={formData.recovery_phone || ''}
                  onChange={handleChange}
                  placeholder="+91 98450 99999"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="admin_access"
                    checked={Boolean(formData.admin_access)}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, admin_access: e.target.checked }))}
                    className="w-4 h-4 text-[#1677FF] rounded border-gray-300 focus:ring-[#1677FF]"
                  />
                  Immense Team Granted Full Admin Access
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Additional portfolio details, 2FA backup codes, or partner links..."
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex items-center gap-2 bg-[#1677FF] text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors"
              >
                <Save className="w-4 h-4" /> {mutation.isPending ? 'Saving...' : 'Save Portfolio'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-5 py-2 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Portfolio Name</p>
              <p className="text-sm font-bold text-gray-900">{portfolio?.portfolio_name || '—'}</p>
            </div>
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Portfolio ID (Meta BM ID)</p>
              <p className="text-sm font-mono font-medium text-gray-900">{portfolio?.portfolio_id || '—'}</p>
            </div>
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Verification Status</p>
              <StatusBadge status={portfolio?.verification_status} />
            </div>
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Owner</p>
              <p className="text-sm font-medium text-gray-900">{portfolio?.portfolio_owner || '—'}</p>
            </div>
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Admin Access</p>
              <p className="text-sm font-semibold text-emerald-700">{portfolio?.admin_access || 'Yes'}</p>
            </div>
            <div className="p-3.5 bg-gray-50/60 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Meta Login Email</p>
              <p className="text-sm font-medium text-gray-900">{portfolio?.meta_login_email || '—'}</p>
            </div>
            {portfolio?.notes && (
              <div className="md:col-span-2 lg:col-span-3 bg-blue-50/30 rounded-xl p-4 border border-blue-100">
                <p className="text-[10px] text-blue-900 font-bold uppercase mb-1">Portfolio Notes</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{portfolio.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MetaBusinessTab;
