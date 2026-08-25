import { CheckCircle2, ArrowRight, ShieldCheck, Calendar, Hash, Building2, Radio, MessageSquare } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { OnboardingStatus } from '@/types/database';

interface SubmissionSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onViewRecord: () => void;
  type: 'rcs' | 'whatsapp';
  brandName: string;
  recordId: string;
  submittedAt: string;
  status?: OnboardingStatus;
}

export function SubmissionSuccessModal({
  open,
  onClose,
  onViewRecord,
  type,
  brandName,
  recordId,
  submittedAt,
  status = 'submitted',
}: SubmissionSuccessModalProps) {
  if (!open) return null;

  const isRcs = type === 'rcs';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden text-left p-6 sm:p-8 space-y-6">
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-emerald-100">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
              {isRcs ? 'RCS Onboarding Submitted Successfully' : 'WhatsApp Onboarding Submitted Successfully'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your {isRcs ? 'RCS Business Messaging' : 'WhatsApp Business'} onboarding record has been successfully verified & submitted.
            </p>
          </div>
        </div>

        {/* Record Overview Summary Card */}
        <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" /> Client / Brand
            </span>
            <span className="font-bold text-gray-900">{brandName}</span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-400" /> Onboarding ID
            </span>
            <span className="font-mono text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-200 text-[11px]">
              {recordId}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" /> Submission Time
            </span>
            <span className="font-medium text-gray-800">{submittedAt}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Current Status
            </span>
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button
            onClick={onViewRecord}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-md transition-all cursor-pointer"
          >
            View Onboarding & Document Vault <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmissionSuccessModal;
