import type { OnboardingStatus } from '@/types/database';
import {
  STATUS_COLORS,
  VERIFICATION_STATUS_COLORS,
  WABA_STATUS_COLORS,
  PHONE_STATUS_COLORS,
  formatStatusLabel
} from '@/types/database';

interface StatusBadgeProps {
  status?: string | OnboardingStatus | null;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Pending
      </span>
    );
  }

  // Lookup in standard status colors, or specialized verification / WABA / phone maps
  const color =
    (STATUS_COLORS as Record<string, { bg: string; text: string; dot: string }>)[status] ||
    (VERIFICATION_STATUS_COLORS as Record<string, { bg: string; text: string; dot: string }>)[status] ||
    (WABA_STATUS_COLORS as Record<string, { bg: string; text: string; dot: string }>)[status] ||
    (PHONE_STATUS_COLORS as Record<string, { bg: string; text: string; dot: string }>)[status] ||
    STATUS_COLORS.pending;

  const label = formatStatusLabel(status as OnboardingStatus) || status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full capitalize ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${color.bg} ${color.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
      {label}
    </span>
  );
}

export default StatusBadge;
