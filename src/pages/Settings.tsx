import { useState } from 'react';
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
  Server
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { ALLOWED_EMAIL_DOMAIN, APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { getActiveSupabaseUrl, getActiveSupabaseAnonKey, setRuntimeSupabaseConfig } from '@/lib/supabase';
import { useToast } from '@/lib/toast';

export function Settings() {
  const { profile } = useAuth();
  const toast = useToast();

  const [supabaseUrl, setSupabaseUrl] = useState(getActiveSupabaseUrl());
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(getActiveSupabaseAnonKey());
  const [isSaving, setIsSaving] = useState(false);

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
            Security policies, domain restrictions, database connection, and encryption vault settings
          </p>
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
