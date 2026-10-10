import {
  type ExportAccount,
  type ExportFile,
  type NormalizedTrade,
  normalizeTrade,
  parseServerTime,
} from '@trading/contract';
import {
  type AccountPhase,
  type AccountStatus,
  IMPACT_FROM_FIRM,
  mapAccountStatus,
  type NewsImpact,
  newsRange,
  phaseFromPlanType,
} from '@trading/core';
import Decimal from 'decimal.js';

/**
 * Pure: a validated export file → everything the DB writer must upsert (tracker spec §4/§5).
 * No I/O, no clock — the file's generated_at is the snapshot time.
 */

export type ChecksumResult =
  | { checked: false; reason: string }
  | { checked: true; match: boolean; tradeNet: string; balanceChange: string };

export type PlannedTrade = NormalizedTrade & { cycleExternalId: number };

export type PlannedAccount = {
  externalId: number;
  login: number;
  parentExternalId: number | null;
  phase: AccountPhase;
  isDemo: boolean;
  platform: string | null;
  typeLabel: string | null;
  planRaw: unknown;
  startingBalance: string;
  status: AccountStatus;
  statusReason: string | null;
  firmStatusHistory: { status: AccountStatus; statusReason: string | null; changedAt: Date; raw: unknown }[];
  /**
   * When a closed account really reached its status: the firm's latest status-history entry, else its last
   * trade's close (a pass or breach happens on a trade). Null while active. Beats "the day we imported it".
   */
  statusSince: Date | null;
  balance: string;
  equity: string | null;
  rules: {
    dailyLossLimit: string | null;
    maxLossLimit: string | null;
    profitTarget: string | null;
    raw: unknown;
  } | null;
  cycles: {
    externalId: number;
    reason: string | null;
    startedAt: Date | null;
    endsAt: Date | null;
    statsRaw: unknown;
  }[];
  /** Empty when the checksum rejected this account's trades. */
  trades: PlannedTrade[];
  checksum: ChecksumResult;
};

export type CashflowKind = 'challenge_fee' | 'reset_fee' | 'addon' | 'payout' | 'refund' | 'other';

export type PlannedCashflow = {
  kind: CashflowKind;
  accountLogin: number | null;
  amountUsd: string;
  occurredAt: Date;
  externalRef: string;
  raw: unknown;
};

export type PlannedNewsEvent = {
  externalId: number;
  title: string;
  currency: string;
  impact: NewsImpact;
  /** From the unix `timestamp` — true UTC for news (CLAUDE.md rule 13). */
  eventAt: Date;
  forecast: string | null;
  previous: string | null;
  isRestricted: boolean;
  restrictionLabel: string | null;
  raw: unknown;
};

/** News spec §1.2: the synced range (UTC days) and every event the firm listed in it. */
export type PlannedNews = { range: { start: Date; end: Date } | null; events: PlannedNewsEvent[] };

export type ImportPlan = {
  firm: string;
  generatedAt: Date;
  mode: 'full' | 'incremental';
  fileStatus: 'ok' | 'partial' | 'error';
  accounts: PlannedAccount[];
  cashflows: PlannedCashflow[];
  news: PlannedNews | null;
  rejectedAccounts: { login: number; reason: string }[];
  warnings: string[];
};

export function planImport(file: ExportFile): ImportPlan {
  const offset = file.firm_server_time_offset;
  const warnings: string[] = [];
  const rejectedAccounts: ImportPlan['rejectedAccounts'] = [];

  const accounts = file.accounts.map((account) => {
    const planned = planAccount(account, offset);
    if (planned.checksum.checked && !planned.checksum.match) {
      rejectedAccounts.push({
        login: planned.login,
        reason: `Trades sum to ${planned.checksum.tradeNet} but the balance changed by ${planned.checksum.balanceChange}`,
      });
    }
    return planned;
  });

  const firms = new Set(file.accounts.map((a) => a.firm));
  if (firms.size > 1) warnings.push(`File mixes firms: ${[...firms].join(', ')}`);

  if (file.cashflows.payouts.length > 0) {
    warnings.push(`${file.cashflows.payouts.length} payout row(s) kept raw only: payout shape not verified yet`);
  }

  return {
    firm: file.accounts[0]?.firm ?? 'FundedNext',
    generatedAt: new Date(file.generated_at),
    mode: file.mode,
    fileStatus: file.status,
    accounts,
    cashflows: file.cashflows.payments.map((p) => ({
      kind: paymentKind(p.order_type),
      accountLogin: p.login ?? null,
      // Fees are negative (tracker spec §5 cashflows).
      amountUsd: new Decimal(p.grand_total).negated().toFixed(),
      occurredAt: new Date(p.date),
      externalRef: `fundednext:payment:${p.id}`,
      raw: p,
    })),
    news: file.news ? planNews(file.news, warnings) : null,
    rejectedAccounts,
    warnings,
  };
}

function planNews(news: NonNullable<ExportFile['news']>, warnings: string[]): PlannedNews {
  if (news.timezone && news.timezone !== 'Etc/UTC' && news.timezone !== 'UTC') {
    warnings.push(`News queried in ${news.timezone}; event times come from the unix timestamp and stay UTC`);
  }
  const byId = new Map<number, PlannedNewsEvent>();
  for (const e of news.events) {
    byId.set(e.id, {
      externalId: e.id,
      title: e.title.trim(),
      currency: e.country.trim().toUpperCase(),
      impact: IMPACT_FROM_FIRM[e.impact] ?? 'low',
      eventAt: new Date(e.timestamp * 1000),
      forecast: e.forecast || null,
      previous: e.previous || null,
      isRestricted: e.is_restricted === 1 || e.is_restricted === true,
      restrictionLabel: e.restriction ?? null,
      raw: e,
    });
  }
  if (byId.size < news.events.length) warnings.push(`${news.events.length - byId.size} repeated news id(s) ignored`);
  return { range: news.range ? newsRange(news.range) : null, events: [...byId.values()] };
}

function planAccount(account: ExportAccount, offset: string): PlannedAccount {
  const { phase, isDemo } = phaseFromPlanType(account.plan?.type);
  const { status, reason } = mapAccountStatus({
    bucket: account.bucket,
    breached: account.breached,
    breachedBy: account.breached_by,
  });

  const allTrades: PlannedTrade[] = account.cycles.flatMap((cycle) =>
    cycle.trades.map((t) => ({ ...normalizeTrade(t, offset), cycleExternalId: cycle.external_id })),
  );
  const checksum = checkAccount(account, allTrades);
  const rejected = checksum.checked && !checksum.match;

  return {
    externalId: account.external_id,
    login: account.login,
    parentExternalId: account.parent_external_id ?? null,
    phase,
    isDemo,
    platform: account.platform ?? null,
    typeLabel: account.type_label ?? null,
    planRaw: account.plan ?? null,
    startingBalance: new Decimal(account.starting_balance).toFixed(),
    status,
    statusReason: reason,
    statusSince: status === 'active' ? null : statusSince(account.status_history, allTrades),
    firmStatusHistory: account.status_history.map((row) => {
      const label = [row.to, row.reason].filter(Boolean).join(' — ') || null;
      return {
        status: mapAccountStatus({ bucket: 'inactive', breachedBy: row.reason ?? row.to }).status,
        statusReason: label,
        changedAt: new Date(row.at),
        raw: row,
      };
    }),
    balance: new Decimal(account.balance).toFixed(),
    equity: account.equity === null || account.equity === undefined ? null : new Decimal(account.equity).toFixed(),
    rules: planRules(account),
    cycles: account.cycles.map((c) => ({
      externalId: c.external_id,
      reason: c.reason ?? null,
      startedAt: c.created_at ? parseServerTime(c.created_at, offset) : null,
      endsAt: c.ending_at ? parseServerTime(c.ending_at, offset) : null,
      statsRaw: c.stats ?? null,
    })),
    trades: rejected ? [] : allTrades,
    checksum,
  };
}

/**
 * CLAUDE.md rule 14: Σ(profit + swap + commission) must equal balance − starting balance.
 * Only meaningful for single-cycle accounts whose full trade list is in the file.
 */
function checkAccount(account: ExportAccount, trades: PlannedTrade[]): ChecksumResult {
  if (account.cycles.length === 0) return { checked: false, reason: 'no cycles in this file' };
  if (account.cycles.length > 1) return { checked: false, reason: 'multi-cycle account: balance resets per cycle' };
  const tradeNet = trades.reduce((sum, t) => sum.plus(t.netProfit), new Decimal(0));
  const balanceChange = new Decimal(account.balance).minus(account.starting_balance);
  return {
    checked: true,
    match: tradeNet.equals(balanceChange),
    tradeNet: tradeNet.toFixed(2),
    balanceChange: balanceChange.toFixed(2),
  };
}

function planRules(account: ExportAccount): PlannedAccount['rules'] {
  const rules = account.rules?.applicable_rules;
  if (!rules || rules.length === 0) return null;
  const value = (match: (condition: string, label: string) => boolean) => {
    const rule = rules.find((r) => match(r.condition, r.label ?? ''));
    return rule?.value === null || rule?.value === undefined ? null : new Decimal(rule.value).toFixed();
  };
  return {
    dailyLossLimit: value((c) => c === 'DLL'),
    maxLossLimit: value((c) => c === 'MLL'),
    // No profit-target rule seen in data yet; matched by label so it is picked up when it appears.
    profitTarget: value((c, l) => c === 'PT' || /profit target/i.test(l)),
    raw: account.rules,
  };
}

function paymentKind(orderType: string | null | undefined): CashflowKind {
  const t = orderType?.toLowerCase() ?? '';
  if (t.includes('reset')) return 'reset_fee';
  if (t.includes('refund')) return 'refund';
  if (/add.?on/.test(t)) return 'addon';
  if (t.includes('new account') || t.includes('challenge') || t.includes('purchase')) return 'challenge_fee';
  return 'other';
}

function statusSince(history: { at: string }[], trades: { closedAt: Date }[]): Date | null {
  const times = history.map((h) => Date.parse(h.at)).filter((t) => !Number.isNaN(t));
  if (times.length > 0) return new Date(Math.max(...times));
  if (trades.length > 0) return new Date(Math.max(...trades.map((t) => t.closedAt.getTime())));
  return null;
}
