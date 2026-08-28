import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { fetchDocumentMetadata, saveDocumentMetadata } from '@/lib/storage';
import { useToast } from '@/lib/toast';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { WABA_STATUS_OPTIONS } from '@/types/database';

interface WabaTabProps {
  clientId: string;
}

export function WabaTab({ clientId }: WabaTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: wabas = [], isLoading } = useQuery({
    queryKey: ['waba-accounts', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const res = await fetchDocumentMetadata('waba_accounts', '*', { match: { client_id: clientId }, order: { column: 'created_at', ascending: false } });
      if (res.success && Array.isArray(res.data)) {
        return res.data;
      }
      return [];
    },
    enabled: Boolean(clientId),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const dataToSave = {
        waba_name: payload.waba_name?.trim() || '',
        waba_id: payload.waba_id?.trim() || '',
        business_name: payload.business_name?.trim() || '',
        waba_status: payload.waba_status || payload.status || 'pending',
        messaging_limit: payload.messaging_limit || '1K',
        quality_rating: payload.quality_rating || 'GREEN',
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
      const res = await saveDocumentMetadata('waba_accounts', dataToSave, 'upsert');
      if (!res.success) throw new Error(res.error || 'Failed to save WABA');
      return res.data;
    },
    onSuccess: () => {
      toast.success('WABA Account Saved', 'Account details updated.');
      queryClient.invalidateQueries({ queryKey: ['waba-accounts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-entity-counts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats', clientId] });
      setIsEditing(false);
      setFormData({});
    },
    onError: (err: any) => {
      toast.error('Failed to Save WABA', err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await saveDocumentMetadata('waba_accounts', null, 'delete', { id });
      if (!res.success) throw new Error(res.error || 'Failed to delete WABA');
    },
    onSuccess: () => {
      toast.success('WABA Account Deleted', 'Account removed successfully.');
      queryClient.invalidateQueries({ queryKey: ['waba-accounts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-entity-counts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats', clientId] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast.error('Failed to Delete WABA', err.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleEdit = (waba?: any) => {
    setFormData(waba ? {
      ...waba,
      waba_status: waba.waba_status || waba.status || 'pending',
    } : {
      waba_name: '',
      waba_id: '',
      business_name: '',
      waba_status: 'active',
      messaging_limit: '1K',
      quality_rating: 'GREEN',
      notes: '',
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500 font-medium">Loading WABA accounts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">WhatsApp Business Accounts (WABA)</h3>
          <p className="text-xs text-gray-500">Registered Meta WABA accounts, limits, and quality ratings</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => handleEdit()}
            className="flex items-center gap-1.5 bg-[#1677FF] text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add WABA Account
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h4 className="text-sm font-bold text-gray-900 mb-4">{formData.id ? 'Edit WABA' : 'Add New WABA Account'}</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">WABA Name *</label>
                <input
                  required
                  type="text"
                  value={formData.waba_name || ''}
                  onChange={(e) => setFormData({ ...formData, waba_name: e.target.value })}
                  placeholder="e.g. Prestige Real Estate WABA"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">WABA ID *</label>
                <input
                  required
                  type="text"
                  value={formData.waba_id || ''}
                  onChange={(e) => setFormData({ ...formData, waba_id: e.target.value })}
                  placeholder="e.g. 109283746501928"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Business Display Name</label>
                <input
                  type="text"
                  value={formData.business_name || ''}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  placeholder="e.g. Prestige Group"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">WABA Status</label>
                <select
                  value={formData.waba_status || 'active'}
                  onChange={(e) => setFormData({ ...formData, waba_status: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  {WABA_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Messaging Tier Limit</label>
                <select
                  value={formData.messaging_limit || '1K'}
                  onChange={(e) => setFormData({ ...formData, messaging_limit: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  <option value="250">Tier 0 (250 msgs/24hr)</option>
                  <option value="1K">Tier 1 (1K msgs/24hr)</option>
                  <option value="10K">Tier 2 (10K msgs/24hr)</option>
                  <option value="100K">Tier 3 (100K msgs/24hr)</option>
                  <option value="Unlimited">Tier 4 (Unlimited msgs)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Quality Rating</label>
                <select
                  value={formData.quality_rating || 'GREEN'}
                  onChange={(e) => setFormData({ ...formData, quality_rating: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  <option value="GREEN">Green (High Quality)</option>
                  <option value="YELLOW">Yellow (Medium Quality)</option>
                  <option value="RED">Red (Low Quality)</option>
                  <option value="N/A">N/A (New / Unrated)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Template approval notes or BSP webhook details..."
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 bg-[#1677FF] text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors"
              >
                <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Saving...' : 'Save Account'}
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
        </div>
      )}

      {!isEditing && wabas.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title="No WABA Accounts Found"
          description="No WhatsApp Business Accounts (WABA) have been linked to this client yet."
          actionLabel="Link WABA Account"
          onAction={() => handleEdit()}
        />
      )}

      {!isEditing && wabas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {wabas.map((waba: any) => (
            <div key={waba.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-base font-bold text-gray-900">{waba.waba_name}</h4>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">WABA ID: {waba.waba_id}</p>
                  </div>
                  <StatusBadge status={waba.waba_status || waba.status} />
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs my-3 p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase">Business Name</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{waba.business_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase">Limit / Quality</p>
                    <p className="font-semibold text-gray-900 mt-0.5">
                      {waba.messaging_limit || '1K'} / <span className={waba.quality_rating === 'GREEN' ? 'text-emerald-600' : waba.quality_rating === 'YELLOW' ? 'text-amber-600' : waba.quality_rating === 'RED' ? 'text-red-600' : 'text-gray-500'}>{waba.quality_rating || 'GREEN'}</span>
                    </p>
                  </div>
                </div>
                
                {waba.notes && (
                  <p className="text-xs text-gray-600 bg-blue-50/30 p-2.5 rounded-lg border border-blue-50 mb-3">{waba.notes}</p>
                )}
              </div>
              
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleEdit(waba)}
                  className="text-xs font-semibold text-[#1677FF] hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => setDeleteId(waba.id)}
                  className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors ml-auto inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete WABA Account"
        message="Are you sure you want to delete this WABA account? All associated phone numbers under this account may also be affected."
        confirmLabel="Delete Account"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  );
}

export default WabaTab;
