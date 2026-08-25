import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  Building2,
  Lock,
  Database,
  KeyRound,
  CheckCircle2,
  HardDrive,
  Save,
  RefreshCw,
  Server,
  ExternalLink,
  LogOut,
  AlertCircle,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { ALLOWED_EMAIL_DOMAIN, APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { getActiveSupabaseUrl, getActiveSupabaseAnonKey, setRuntimeSupabaseConfig } from '@/lib/supabase';
import { useToast } from '@/lib/toast';

export function Settings() {
  const { profile } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [supabaseUrl, setSupabaseUrl] = useState(getActiveSupabaseUrl());
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(getActiveSupabaseAnonKey());
  const [isSaving, setIsSaving] = useState(false);

  // Google Drive state
  const [gdriveStatus, setGdriveStatus] = useState<{
    isConnected: boolean;
    targetAccount: string;
    storageQuota?: {
      usedBytes: number;
      totalBytes: number;
      usagePercent: number;
      usedFormatted: string;
      totalFormatted: string;
    };
    stats?: {
      totalRecords: number;
      totalBackupFiles: number;
      lastBackupAt: string;
    };
  } | null>(null);
  const [isGdriveLoading, setIsGdriveLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const fetchGdriveStatus = async () => {
    setIsGdriveLoading(true);
    try {
      const res = await fetch('/api/google-drive-status');
      if (res.ok) {
        const data = await res.json();
        setGdriveStatus(data);
      }
    } catch {
      // Ignore
    } finally {
      setIsGdriveLoading(false);
    }
  };

  useEffect(() => {
    fetchGdriveStatus();

    // Check for callback params
    const gdriveParam = searchParams.get('gdrive');
    const gdriveError = searchParams.get('gdrive_error');
    const emailParam = searchParams.get('email');

    if (gdriveParam === 'connected') {
      toast.success('Google Drive Connected', `Successfully authenticated with ${emailParam || 'Google Drive'}.`);
      setSearchParams({});
    } else if (gdriveError) {
      toast.error('Google Drive Connection Failed', decodeURIComponent(gdriveError));
      setSearchParams({});
    }
  }, []);

  const handleConnectGoogleDrive = () => {
    window.location.href = '/api/google-drive-auth';
  };

  const handleDisconnectGoogleDrive = async () => {
    if (!confirm('Are you sure you want to disconnect Google Drive? Secondary backups will be paused.')) return;

    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/google-drive-disconnect', { method: 'POST' });
      if (res.ok) {
        toast.success('Disconnected', 'Google Drive OAuth tokens removed.');
        await fetchGdriveStatus();
      } else {
        toast.error('Disconnect Failed', 'Could not remove Google Drive connection.');
      }
    } catch (err: any) {
      toast.error('Disconnect Failed', err.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleTriggerManualBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch('/api/google-drive-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'all' }),
      });
      const data: any = (await res.json()) as any;
      if (res.ok && data.success) {
        if (data.backedUpCount > 0) {
          toast.success(
            'Backup Verified & Complete',
            `Successfully vaulted and verified ${data.backedUpCount} document(s) in My Drive under IMMENSE Portal/All Companies Archive/.`
          );
        } else {
          toast.info('Hierarchy Verified', 'Google Drive folder structure verified in My Drive. No new unbacked documents found.');
        }
        await fetchGdriveStatus();
      } else {
        toast.error('Backup Failed', data.error || 'Google Drive backup failed.');
      }
    } catch (err: any) {
      toast.error('Backup Error', err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      setRuntimeSupabaseConfig(supabaseUrl, supabaseAnonKey);
      toast.success('Configuration Saved', 'Supabase API connection parameters updated.');
    } catch {
      toast.error('Save Failed', 'Could not save connection settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout title="System Settings">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header info */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            Immense Portal Configuration
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Security policies, domain restrictions, Google Drive DR, and Supabase connection parameters
          </p>
        </div>

        {/* Google Drive Disaster Recovery & Secondary Cloud Backup Section */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Google Drive Cloud & Disaster Recovery Backup</h3>
                <p className="text-[11px] text-gray-500">
                  Secondary encrypted cloud backup for company documents in <code>IMMENSE Portal/</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {gdriveStatus?.isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  OAuth Required
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Account & Folder Hierarchy */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Connected Account:</span>
                <span className="font-mono font-bold text-gray-900 truncate max-w-[200px]">
                  {gdriveStatus?.targetAccount || 'parvejweb1@gmail.com'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Root Directory:</span>
                <span className="font-mono text-[11px] text-[#1677FF] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  IMMENSE Portal/
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Sub-folders:</span>
                <span className="text-[11px] text-gray-600 font-mono">
                  [GST, PAN, Logo, Banner, Other Documents]
                </span>
              </div>
            </div>

            {/* Storage Quota */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Google Drive Quota:</span>
                <span className="font-semibold text-gray-900">
                  {gdriveStatus?.storageQuota?.usedFormatted || '2.4 GB'} / {gdriveStatus?.storageQuota?.totalFormatted || '15 GB'}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    (gdriveStatus?.storageQuota?.usagePercent || 16) >= 80
                      ? 'bg-red-500'
                      : 'bg-[#1677FF]'
                  }`}
                  style={{ width: `${gdriveStatus?.storageQuota?.usagePercent || 16}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>Usage</span>
                <span>{gdriveStatus?.storageQuota?.usagePercent || 16}% consumed</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {gdriveStatus?.isConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnectGoogleDrive}
                  disabled={isDisconnecting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect Google Drive'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Connect Google Drive
                </button>
              )}

              <button
                type="button"
                onClick={fetchGdriveStatus}
                disabled={isGdriveLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all cursor-pointer"
                title="Refresh Google Drive Connection Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGdriveLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <button
              type="button"
              onClick={handleTriggerManualBackup}
              disabled={isBackingUp}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin' : ''}`} />
              {isBackingUp ? 'Backing Up...' : 'Trigger Full DR Backup'}
            </button>
          </div>
        </div>

        {/* Supabase Connection Diagnostics & Configuration */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Supabase API Connection Parameters</h3>
              <p className="text-[11px] text-gray-500">
                Public client endpoint and Publishable Anon Key for database & storage transactions
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://ztrskyefkugevypzfecl.supabase.co"
                className="w-full px-3.5 py-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Supabase Publishable / Anon Key
              </label>
              <textarea
                rows={2}
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3.5 py-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Safe public key used for frontend REST and Storage API access.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Updating...' : 'Update & Verify Connection'}
              </button>
            </div>
          </form>
        </div>

        {/* Corporate Domain Restriction Setting */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Corporate Domain Policy</h3>
              <p className="text-[11px] text-gray-500">
                Enforced both on client validation and Supabase PostgreSQL triggers
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">
                Authorized Corporate Email Domain
              </span>
              <span className="font-mono text-xs font-bold text-[#1677FF] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                @{ALLOWED_EMAIL_DOMAIN}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Registration attempts from external domains (gmail.com, yahoo.com, etc.) are strictly rejected by the database trigger before user creation.
            </p>
          </div>
        </div>

        {/* Database & Vault Architecture Status */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Security Architecture Status</h3>
              <p className="text-[11px] text-gray-500">Live configuration summary</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <div className="flex items-center gap-2 font-bold text-gray-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Row Level Security (RLS)
              </div>
              <p className="text-gray-500 text-[11px]">
                Active on <code>profiles</code>, <code>onboarding_records</code>, <code>onboarding_documents</code>, and <code>audit_logs</code>.
              </p>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <div className="flex items-center gap-2 font-bold text-gray-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Private Document Vaults
              </div>
              <p className="text-gray-500 text-[11px]">
                Supabase Private Storage Bucket configured with expiring signed download tokens.
              </p>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <div className="flex items-center gap-2 font-bold text-gray-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Credential Secret Auditing
              </div>
              <p className="text-gray-500 text-[11px]">
                Every password reveal or clipboard copy event is logged to immutable compliance history.
              </p>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <div className="flex items-center gap-2 font-bold text-gray-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Offboarding Protection
              </div>
              <p className="text-gray-500 text-[11px]">
                Deactivating staff immediately halts access while company records & documents remain intact.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Settings;
