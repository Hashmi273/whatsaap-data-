import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white border border-dashed border-gray-300 rounded-xl">
      <div className="flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-blue-50 text-[#1677FF]">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="max-w-sm mt-1.5 text-sm text-gray-500">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 mt-5 text-sm font-medium text-white bg-[#1677FF] rounded-lg shadow-xs hover:bg-[#0B5FE0] transition-colors focus:outline-hidden"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
