import { IMPACT_COLOURS, type NewsImpact } from '@trading/core';
import { IMPACT_LABELS } from '@trading/news';

/** Impact folder icon (news spec §1.1 colours). */
export function Folder({ impact, className }: { impact: NewsImpact; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 14"
      role="img"
      aria-label={`${IMPACT_LABELS[impact]} impact`}
      className={className ?? 'h-3.5 w-4 shrink-0'}
    >
      <path
        d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.6l1.6 1.8h5.8A1.5 1.5 0 0 1 15 4.3v7.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 11.5z"
        fill={IMPACT_COLOURS[impact]}
      />
    </svg>
  );
}
