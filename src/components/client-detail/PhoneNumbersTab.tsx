import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { fetchDocumentMetadata, saveDocumentMetadata } from '@/lib/storage';
import { useToast } from '@/lib/toast';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PHONE_STATUS_OPTIONS } from '@/types/database';

interface PhoneNumbersTabProps {
  clientId: string;
}

export function PhoneNumbersTab({ clientId }: PhoneNumbersTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: phones = [], isLoading } = useQuery({
    queryKey: ['phone-numbers', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const res = await fetchDocumentMetadata('phone_numbers', '*', { match: { client_id: clientId }, order: { column: 'created_at', ascending: false } });
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
        display_name: payload.display_name?.trim() || '',
        phone_number: payload.phone_number?.trim() || '',
        phone_number_id: payload.phone_number_id?.trim() || '',
        status: payload.status || 'pending',
        verification_status: payload.verification_status || 'pending',
        messaging_limit: payload.messaging_limit || '1K',
        quality_rating: payload.quality_rating || 'GREEN',
        connected_date: payload.connected_date || null,
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
      const res = await saveDocumentMetadata('phone_numbers', dataToSave, 'upsert');
      if (!res.success) throw new Error(res.error || 'Failed to save phone number');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Phone Number Saved', 'Phone number details updated.');
      queryClient.invalidateQueries({ queryKey: ['phone-numbers', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-entity-counts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats', clientId] });
      setIsEditing(false);
      setFormData({});
    },
    onError: (err: any) => {
      toast.error('Failed to Save Phone Number', err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await saveDocumentMetadata('phone_numbers', null, 'delete', { id });
      if (!res.success) throw new Error(res.error || 'Failed to delete phone number');
    },
    onSuccess: () => {
      toast.success('Phone Number Deleted', 'Phone record removed.');
      queryClient.invalidateQueries({ queryKey: ['phone-numbers', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-entity-counts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats', clientId] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast.error('Failed to Delete Phone Number', err.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleEdit = (phone?: any) => {
    setFormData(phone ? {
      ...phone,
      verification_status: phone.verification_status || 'pending',
      status: phone.status || 'connected',
    } : {
      display_name: '',
      phone_number: '',
      phone_number_id: '',
      status: 'connected',
      verification_status: 'verified',
      messaging_limit: '1K',
      quality_rating: 'GREEN',
      connected_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500 font-medium">Loading phone numbers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Connected Phone Numbers</h3>
          <p className="text-xs text-gray-500">Active numbers linked to client WhatsApp Business accounts</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => handleEdit()}
            className="flex items-center gap-1.5 bg-[#1677FF] text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add Phone Number
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h4 className="text-sm font-bold text-gray-900 mb-4">{formData.id ? 'Edit Phone Number' : 'Add New Phone Number'}</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Display Name *</label>
                <input
                  required
                  type="text"
                  value={formData.display_name || ''}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="e.g. Prestige Support Desk"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Phone Number *</label>
                <input
                  required
                  type="text"
                  value={formData.phone_number || ''}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="+91 98450 12345"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Phone Number ID (Meta ID)</label>
                <input
                  type="text"
                  value={formData.phone_number_id || ''}
                  onChange={(e) => setFormData({ ...formData, phone_number_id: e.target.value })}
                  placeholder="e.g. 1029384756"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Connection Status</label>
                <select
                  value={formData.status || 'connected'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  {PHONE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Verification Status</label>
                <select
                  value={formData.verification_status || 'pending'}
                  onChange={(e) => setFormData({ ...formData, verification_status: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                >
                  <option value="verified">Verified</option>
                  <option value="pending">Pending</option>
                  <option value="not_verified">Not Verified</option>
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
                  <option value="N/A">N/A (Unrated)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Messaging Tier Limit</label>
                <input
                  type="text"
                  value={formData.messaging_limit || ''}
                  onChange={(e) => setFormData({ ...formData, messaging_limit: e.target.value })}
                  placeholder="e.g. 1K, 10K, Unlimited"
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#1677FF] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Connected Date</label>
                <input
                  type="date"
                  value={formData.connected_date || ''}
                  onChange={(e) => setFormData({ ...formData, connected_date: e.target.value })}
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
                <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Saving...' : 'Save Phone'}
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

      {!isEditing && phones.length === 0 && (
        <EmptyState
          icon={Phone}
          title="No Phone Numbers Connected"
          description="No WhatsApp phone numbers have been registered for this client yet."
          actionLabel="Add Phone Number"
          onAction={() => handleEdit()}
        />
      )}

      {!isEditing && phones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/75 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Display Name / Number</th>
                  <th className="px-5 py-3.5">Verification</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Limit / Quality</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {phones.map((phone: any) => (
                  <tr key={phone.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-gray-900">{phone.display_name || 'Unnamed Phone'}</div>
                      <div className="font-mono text-[11px] text-gray-500 mt-0.5">{phone.phone_number}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={phone.verification_status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={phone.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-gray-900">{phone.messaging_limit || '1K'}</span> / <span className={phone.quality_rating === 'GREEN' ? 'text-emerald-600 font-semibold' : phone.quality_rating === 'YELLOW' ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'}>{phone.quality_rating || 'GREEN'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEdit(phone)}
                          className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Phone"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(phone.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Phone"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Phone Number"
        message="Are you sure you want to delete this phone number? This operation is permanent."
        confirmLabel="Delete"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  );
}

export default PhoneNumbersTab;
