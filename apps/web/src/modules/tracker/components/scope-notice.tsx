import type { ResolvedScope } from '@trading/tracker/server';

/** §8.1: dollar sums across demo and real money (or different sizes) are not the same kind of money. */
export function ScopeNotice({ scope }: { scope: ResolvedScope }) {
  if (scope.accountIds.length === 0) {
    return <p className="text-muted-foreground text-sm">No accounts in this scope yet.</p>;
  }
  if (!scope.mixedDemoAndReal && !scope.mixedSizes) return null;
  const what = scope.mixedDemoAndReal ? 'demo and real accounts' : 'account sizes';
  return (
    <p
      className="w-fit rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs"
      data-testid="scope-notice"
      title={`This scope mixes ${what}, so R is the fairer unit.`}
    >
      Mixes {what} · compare in R
    </p>
  );
}
