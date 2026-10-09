import type { ResolvedScope } from '@trading/tracker/server';

/** §8.1: dollar sums across demo and real money (or different sizes) are not the same kind of money. */
export function ScopeNotice({ scope }: { scope: ResolvedScope }) {
  if (scope.accountIds.length === 0) {
    return <p className="text-muted-foreground text-sm">No accounts in this scope yet.</p>;
  }
  if (!scope.mixedDemoAndReal && !scope.mixedSizes) return null;
  return (
    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="scope-notice">
      {scope.mixedDemoAndReal
        ? 'This scope mixes demo and real accounts, so R is the fairer unit.'
        : 'This scope mixes account sizes, so R is the fairer unit.'}
    </p>
  );
}
