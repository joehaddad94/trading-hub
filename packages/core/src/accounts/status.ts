/** Tracker spec §5.1 — every account has exactly one current status. */
export type AccountStatus = 'active' | 'passed' | 'breached' | 'merged' | 'paused' | 'closed_other' | 'missing';

export type FirmAccountState = {
  bucket: 'active' | 'inactive' | 'breached';
  breached?: boolean | 0 | 1 | null | undefined;
  breachedBy?: string | null | undefined;
};

export function mapAccountStatus(state: FirmAccountState): { status: AccountStatus; reason: string | null } {
  const reason = state.breachedBy?.trim() || null;
  const lower = reason?.toLowerCase() ?? '';

  if (lower.includes('merge')) return { status: 'merged', reason };
  if (lower.includes('pause')) return { status: 'paused', reason };
  if (state.bucket === 'active' && !state.breached) return { status: 'active', reason };
  if (state.bucket === 'breached') return { status: 'breached', reason };
  if (lower === 'profit target reached') return { status: 'passed', reason };
  // Unknown firm reasons are kept verbatim, never dropped.
  return { status: 'closed_other', reason };
}

export type AccountPhase = 'p1' | 'p2' | 'funded' | 'instant' | 'other';

/** "Evaluation P1/P2" = demo challenge phases, "Evaluation Real" = funded (tracker spec §5). */
export function phaseFromPlanType(planType: string | null | undefined): { phase: AccountPhase; isDemo: boolean } {
  const t = planType?.toLowerCase() ?? '';
  if (/\bp1\b/.test(t)) return { phase: 'p1', isDemo: true };
  if (/\bp2\b/.test(t)) return { phase: 'p2', isDemo: true };
  if (t.includes('real') || t.includes('funded')) return { phase: 'funded', isDemo: false };
  if (t.includes('instant')) return { phase: 'instant', isDemo: false };
  return { phase: 'other', isDemo: true };
}
