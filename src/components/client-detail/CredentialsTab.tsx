import { useState } from 'react';
import { KeyRound, Shield, AlertTriangle, Eye, EyeOff, Copy, Check, ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast';
import { logCredentialView, logCredentialCopy } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import type { OnboardingRecord } from '@/types/database';

interface CredentialsTabProps {
  record: OnboardingRecord;
}

export function CredentialsTab({ record }: CredentialsTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  
  const [showPassword, setShowPassword] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleTogglePassword = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_credential', { record_id: record.id });
      
      if (!rpcError && rpcData && rpcData.length > 0) {
        setDecryptedPassword(rpcData[0].credential);
      } else {
        setDecryptedPassword(record.credential_encrypted || '••••••••');
        await logCredentialView(record.id);
      }

      setShowPassword(true);
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', record.id] });
      toast.info('Credential Accessed', 'Credential viewing event was logged to compliance audit.');
    } catch (err: any) {
      toast.error('Credential Decryption Error', err.message);
    }
  };

  const handleCopy = async (text: string, fieldName: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);

    if (fieldName === 'password') {
      await logCredentialCopy(record.id);
      queryClient.invalidateQueries({ queryKey: ['onboarding-audit-logs', record.id] });
    }
    toast.success('Copied to Clipboard', `${fieldName} copied.`);
  };

  return (
    <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4 max-w-3xl">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
            <KeyRound className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Facebook / Meta Login Details</h3>
        </div>
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
          AES-256 Vault
        </span>
      </div>

      <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] leading-tight">
          <strong>Security Notice:</strong> All viewing and copying of credentials is fully audited. 
          Use these credentials solely for IMMENSE business operations. Never share outside the organization.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Platform</span>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm font-semibold text-gray-800 flex-1">
              {record.platform === 'WhatsApp' ? 'Meta Business Manager' : record.platform}
            </span>
            <a href="https://business.facebook.com" target="_blank" rel="noreferrer" className="p-1 text-gray-400 hover:text-[#1677FF] transition-colors" title="Open Meta Business">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Username / Email</span>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 group">
            <span className="text-sm font-mono font-medium text-gray-800 flex-1 truncate">
              {record.username || '—'}
            </span>
            <button onClick={() => handleCopy(record.username || '', 'username')} className="p-1 text-gray-400 hover:text-[#1677FF] opacity-0 group-hover:opacity-100 transition-all" title="Copy Username">
              {copiedField === 'username' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Encrypted Password</span>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 group">
            <div className="flex-1 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-sm font-mono font-medium text-gray-800">
                {showPassword ? (decryptedPassword || '••••••••') : '••••••••••••••••'}
              </span>
            </div>
            
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
              <button onClick={handleTogglePassword} className="p-1.5 text-gray-400 hover:text-[#1677FF] hover:bg-blue-50 rounded" title={showPassword ? "Hide Password" : "Reveal Password"}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {showPassword && decryptedPassword && (
                <button onClick={() => handleCopy(decryptedPassword, 'password')} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Copy Password">
                  {copiedField === 'password' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
