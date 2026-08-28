import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Building2, Phone, Mail, User, Briefcase, FileText, Smartphone, Hash } from 'lucide-react';
import { fetchDocumentMetadata } from '@/lib/storage';
import type { OnboardingRecord, Profile } from '@/types/database';

interface ClientOverviewTabProps {
  record: OnboardingRecord;
  staffList?: Profile[];
  onReassign: (staffId: string) => void;
  onStatusChange: (status: string) => void;
}

export function ClientOverviewTab({
  record,
  staffList = [],
  onReassign,
}: ClientOverviewTabProps) {
  const [reassignMode, setReassignMode] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(record?.assigned_to || '');

  // Safe date formatter
  const formatDateSafe = (dateStr?: string | null, formatStr: string = 'dd MMMM yyyy') => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, formatStr);
    } catch {
      return dateStr;
    }
  };

  // Fetch counts for Quick Stats
  const { data: stats } = useQuery({
    queryKey: ['client-stats', record?.id],
    queryFn: async () => {
      if (!record?.id) return { documents: 0, wabas: 0, phones: 0 };
      const [docs, wabas, phones] = await Promise.all([
        fetchDocumentMetadata('onboarding_documents', 'id', { match: { onboarding_id: record.id } }),
        fetchDocumentMetadata('waba_accounts', 'id', { match: { client_id: record.id } }),
        fetchDocumentMetadata('phone_numbers', 'id', { match: { client_id: record.id } })
      ]);
      return {
        documents: docs?.success && Array.isArray(docs.data) ? docs.data.length : 0,
        wabas: wabas?.success && Array.isArray(wabas.data) ? wabas.data.length : 0,
        phones: phones?.success && Array.isArray(phones.data) ? phones.data.length : 0,
      };
    },
    enabled: Boolean(record?.id),
  });

  const handleReassign = () => {
    if (selectedStaff && selectedStaff !== record?.assigned_to) {
      onReassign(selectedStaff);
    }
    setReassignMode(false);
  };

  if (!record) return null;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-[#1677FF] rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase">Documents</p>
            <p className="text-xl font-bold text-gray-900">{stats?.documents || 0}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase">WABA Accounts</p>
            <p className="text-xl font-bold text-gray-900">{stats?.wabas || 0}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase">Phone Numbers</p>
            <p className="text-xl font-bold text-gray-900">{stats?.phones || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Details */}
        <div className="lg:col-span-2 p-6 bg-white rounded-xl border border-gray-100 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Client & Business Details</h3>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {record.whatsapp_number || 'No Number'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Registered Brand</span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block">{record.brand_name || '—'}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Legal Company Name</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">{record.company_name || '—'}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Contact Person</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">{record.contact_person || '—'}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Contact Email</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                {record.contact_email ? (
                  <a href={`mailto:${record.contact_email}`} className="text-[#1677FF] hover:underline">
                    {record.contact_email}
                  </a>
                ) : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Contact Phone</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">{record.contact_number || '—'}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Onboarding Date</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                {formatDateSafe(record.onboarding_date)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Client Type</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block capitalize">{record.client_type || 'Enterprise'}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-gray-400 font-semibold block uppercase text-[10px]">Website</span>
              <span className="text-sm font-semibold text-gray-800 mt-0.5 block">
                {record.website ? (
                  <a href={record.website.startsWith('http') ? record.website : `https://${record.website}`} target="_blank" rel="noreferrer" className="text-[#1677FF] hover:underline">
                    {record.website}
                  </a>
                ) : '—'}
              </span>
            </div>
          </div>

          {record.notes && (
            <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-100 text-xs mt-4">
              <span className="font-bold text-blue-900 block mb-1">Internal Notes:</span>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}
        </div>

        {/* Assigned Staff */}
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Assigned Team Staff</h3>
              </div>
            </div>

            {!reassignMode ? (
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {staffList?.find(s => s.id === record?.assigned_to)?.full_name || 'Unassigned'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {staffList?.find(s => s.id === record?.assigned_to)?.corporate_email || 'No staff assigned'}
                  </p>
                </div>
                <button
                  onClick={() => setReassignMode(true)}
                  className="text-xs font-semibold text-[#1677FF] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#1677FF] focus:border-transparent outline-none"
                >
                  <option value="">Select Staff...</option>
                  {staffList?.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name} ({staff.department || 'Operations'})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleReassign}
                    className="flex-1 bg-[#1677FF] text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setReassignMode(false);
                      setSelectedStaff(record?.assigned_to || '');
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 text-xs font-semibold py-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClientOverviewTab;
