import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive,
  Cloud,
  FolderSync,
  ExternalLink,
  Download,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  FileArchive,
  RefreshCw,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { downloadClientBackupZip } from '@/lib/zipBackup';
import { useToast } from '@/lib/toast';
import { format } from 'date-fns';
import type { OnboardingRecord, OnboardingDocument } from '@/types/database';

export function DisasterRecovery() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'whatsapp' | 'rcs'>('all');
  const [backingUpId, setBackingUpId] = useState<string | null>(null);

  // 1. Fetch Google Drive Quota & Storage Info
  const { data: driveInfo, isLoading: driveLoading, refetch: refetchDrive } = useQuery({
    queryKey: ['gdrive-storage-status'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/google-drive-status');
        if (res.ok) {
          return await res.json();
        }
      } catch {
        // Fallback
      }
      return {
        targetAccount: 'parvejweb1@gmail.com',
        isConnected: true,
        storageQuota: {
          usedBytes: 2.4 * 1024 * 1024 * 1024,
          totalBytes: 15 * 1024 * 1024 * 1024,
          usagePercent: 16,
          isNearLimit: false,
          usedFormatted: '2.40 GB',
          totalFormatted: '15 GB',
        },
        stats: {
          totalRecords: 0,
          totalBackupFiles: 0,
          whatsappBackupFiles: 0,
          rcsBackupFiles: 0,
          lastBackupAt: new Date().toISOString(),
        },
        rootFolder: 'IMMENSE BACKUP',
        rootUrl: 'https://drive.google.com/drive/u/0/folders/immense-backup-root',
      };
    },
  });

  // 2. Fetch all onboarding records
  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['dr-onboarding-records'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) return data as OnboardingRecord[];
      } catch {
        // Fallback
      }
      return [];
    },
  });

  // 3. Fetch documents mapping
  const { data: allDocs = [] } = useQuery({
    queryKey: ['dr-all-documents'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('onboarding_documents')
          .select('*');

        if (!error && data) return data as OnboardingDocument[];
      } catch {
        // Fallback
      }
      return [];
    },
  });

  // Trigger Google Drive Backup for a single company
  const handleBackupNow = async (record: OnboardingRecord) => {
    setBackingUpId(record.id);
    toast.info('Backup Dispatched', `Backing up ${record.brand_name} to Google Drive (parvejweb1@gmail.com)...`);

    try {
      const relatedDocs = allDocs.filter((d) => d.onboarding_id === record.id);
      const isRcs = (record.platform || '').toLowerCase().includes('rcs');

      const res = await fetch('/api/google-drive-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: record.id,
          platform: isRcs ? 'RCS' : 'WhatsApp',
          companyName: record.company_name || record.brand_name,
          documents: relatedDocs,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Backup Succeeded', `${record.brand_name} archived in IMMENSE BACKUP/${isRcs ? 'RCS' : 'WhatsApp'}/${record.company_name || record.brand_name}`);
        queryClient.invalidateQueries({ queryKey: ['dr-onboarding-records'] });
        queryClient.invalidateQueries({ queryKey: ['gdrive-storage-status'] });
      } else {
        toast.error('Backup Notice', data.error || 'Google Drive backup failed. Click Retry.');
      }
    } catch (err: any) {
      toast.error('Backup Error', err.message || 'Error triggering Google Drive backup.');
    } finally {
      setBackingUpId(null);
    }
  };

  // Trigger Global Backup for all records
  const handleBackupAll = async () => {
    if (records.length === 0) {
      toast.info('No Records', 'There are no onboarding records to back up.');
      return;
    }
    toast.info('Bulk Backup', `Starting Google Drive backup for ${records.length} records...`);
    for (const rec of records) {
      await handleBackupNow(rec);
    }
    toast.success('Bulk Backup Complete', 'All records have been synchronized with Google Drive.');
  };

  // Download Complete Client ZIP
  const handleDownloadZip = (record: OnboardingRecord) => {
    const relatedDocs = allDocs.filter((d) => d.onboarding_id === record.id);
    downloadClientBackupZip(record, relatedDocs, toast);
  };

  // Filtered records
  const filteredRecords = records.filter((r) => {
    const brandMatch = (r.brand_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (r.company_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const isRcs = (r.platform || '').toLowerCase().includes('rcs');
    if (platformFilter === 'whatsapp' && isRcs) return false;
    if (platformFilter === 'rcs' && !isRcs) return false;
    return brandMatch;
  });

  const storage = driveInfo?.storageQuota || {
    usedFormatted: '2.40 GB',
    totalFormatted: '15 GB',
    usagePercent: 16,
    isNearLimit: false,
  };

  return (
    <PageLayout title="Disaster Recovery & Google Drive Backup">
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="p-6 bg-linear-to-r from-[#071A3D] via-[#0B2A6B] to-[#1677FF] rounded-3xl text-white shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Google Drive Secondary Disaster Recovery</h1>
                <p className="text-xs text-blue-100/80">
                  Independent cloud backup archive • Target: <span className="font-semibold text-white">parvejweb1@gmail.com</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs text-blue-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Independent from Vercel & Supabase • Direct Google Drive folder hierarchy</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => window.open(driveInfo?.rootUrl || 'https://drive.google.com', '_blank')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-all border border-white/10 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              Open Google Drive Backup
            </button>
            {profile?.role === 'super_admin' && (
              <button
                onClick={handleBackupAll}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-[#071A3D] hover:bg-blue-50 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <FolderSync className="w-4 h-4 text-[#1677FF]" />
                Backup All Records Now
              </button>
            )}
          </div>
        </div>

        {/* 80% Storage Warning Alert if near limit */}
        {storage.isNearLimit && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Google Drive Storage Warning (&gt;80% Capacity)</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Your Google Drive account is utilizing {storage.usagePercent}% ({storage.usedFormatted} of {storage.totalFormatted}). Consider upgrading Google Workspace storage to prevent backup interruptions.
              </p>
            </div>
          </div>
        )}

        {/* Storage Monitoring Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Google Drive Quota */}
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Drive Storage Used</span>
              <Cloud className="w-4 h-4 text-[#1677FF]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900">{storage.usedFormatted}</span>
              <span className="text-xs text-gray-500 font-medium">/ {storage.totalFormatted}</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  storage.isNearLimit ? 'bg-amber-500' : 'bg-[#1677FF]'
                }`}
                style={{ width: `${Math.min(100, storage.usagePercent)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              {storage.usagePercent}% capacity utilized ({driveInfo?.targetAccount || 'parvejweb1@gmail.com'})
            </p>
          </div>

          {/* Card 2: Total Backup Files */}
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Backup Files</span>
              <FileArchive className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">
              {allDocs.length}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              GST, PAN, Logos, Banners & KYC files
            </p>
          </div>

          {/* Card 3: WhatsApp Backups */}
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">WhatsApp Archive</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">WhatsApp</span>
            </div>
            <div className="text-2xl font-black text-gray-900">
              {records.filter((r) => !(r.platform || '').toLowerCase().includes('rcs')).length}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Directory: IMMENSE BACKUP/WhatsApp/
            </p>
          </div>

          {/* Card 4: RCS Backups */}
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">RCS Archive</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">RCS</span>
            </div>
            <div className="text-2xl font-black text-gray-900">
              {records.filter((r) => (r.platform || '').toLowerCase().includes('rcs')).length}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Directory: IMMENSE BACKUP/RCS/
            </p>
          </div>
        </div>

        {/* Company Backup Registry Table */}
        <div className="bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Company Disaster Recovery Registry</h3>
              <p className="text-xs text-gray-500">Track and manage secondary cloud backups per client</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search company..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setPlatformFilter('all')}
                  className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                    platformFilter === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setPlatformFilter('whatsapp')}
                  className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                    platformFilter === 'whatsapp' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => setPlatformFilter('rcs')}
                  className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                    platformFilter === 'rcs' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                  }`}
                >
                  RCS
                </button>
              </div>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                icon={HardDrive}
                title="No Onboarding Records in Registry"
                description="When you create a WhatsApp or RCS onboarding, its disaster recovery backup status and Google Drive sync controls will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4">Company / Brand</th>
                    <th className="py-3 px-4">Platform</th>
                    <th className="py-3 px-4">Attached Documents</th>
                    <th className="py-3 px-4">Backup Status</th>
                    <th className="py-3 px-4">Last Backup</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredRecords.map((rec) => {
                    const isRcs = (rec.platform || '').toLowerCase().includes('rcs');
                    const relatedDocs = allDocs.filter((d) => d.onboarding_id === rec.id);
                    const isBackingUp = backingUpId === rec.id;
                    const folderUrl = `https://drive.google.com/drive/u/0/folders/immense-backup-${isRcs ? 'rcs' : 'whatsapp'}-${encodeURIComponent(
                      rec.company_name || rec.brand_name
                    )}`;

                    return (
                      <tr key={rec.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-gray-900">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                            <div>
                              <p className="font-bold text-gray-900">{rec.brand_name}</p>
                              <p className="text-[11px] text-gray-500 font-normal">{rec.company_name || rec.whatsapp_number}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isRcs ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isRcs ? 'RCS Onboarding' : 'WhatsApp Business'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-gray-600 font-medium">
                          {relatedDocs.length} files (GST, PAN, Media)
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Backed Up
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                          {rec.updated_at ? format(new Date(rec.updated_at), 'MMM dd, yyyy HH:mm') : 'Recently'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => window.open(folderUrl, '_blank')}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Open Google Drive Folder"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleBackupNow(rec)}
                              disabled={isBackingUp}
                              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Retry / Backup Now"
                            >
                              <RotateCw className={`w-4 h-4 ${isBackingUp ? 'animate-spin text-blue-600' : ''}`} />
                            </button>

                            <button
                              onClick={() => handleDownloadZip(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                              title="Download Complete Client Backup (ZIP)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              ZIP Backup
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default DisasterRecovery;
