import { Lock, type LucideIcon, Newspaper, NotebookPen, RefreshCw, StickyNote, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const GLYPHS: Record<string, { icon: LucideIcon; label: string; colour: string }> = {
  restricted: { icon: Lock, label: 'Restricted', colour: 'text-warning' },
  warning: { icon: TriangleAlert, label: 'Close to a rule limit', colour: 'text-warning' },
  news: { icon: Newspaper, label: 'News trade', colour: 'text-muted-foreground' },
  journaled: { icon: NotebookPen, label: 'Journaled', colour: 'text-primary' },
  status: { icon: RefreshCw, label: 'Account status changed', colour: 'text-muted-foreground' },
  note: { icon: StickyNote, label: 'Daily note', colour: 'text-muted-foreground' },
};

/** Small outline status icon with a tooltip and an accessible name (replaces the old emoji markers). */
export function Glyph({
  kind,
  label,
  className,
}: {
  kind: keyof typeof GLYPHS;
  label?: string | undefined;
  className?: string;
}) {
  const g = GLYPHS[kind];
  if (!g) return null;
  const Icon = g.icon;
  const name = label ?? g.label;
  return (
    <span title={name} className="inline-flex shrink-0 align-[-2px]">
      <Icon role="img" aria-label={name} className={cn('size-3.5', g.colour, className)} strokeWidth={2} />
    </span>
  );
}
