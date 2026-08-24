import type { OnboardingStatus } from '@/types/database';
import { STATUS_COLORS, formatStatusLabel } from '@/types/database';

interface StatusBadgeProps {
  status: OnboardingStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const label = formatStatusLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      } ${color.bg} ${color.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
      {label}
    </span>
  );
}

export default StatusBadge;
