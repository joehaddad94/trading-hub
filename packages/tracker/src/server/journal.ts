import type { Executor } from '@trading/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from '@trading/db/orm';
import {
  accounts,
  dailyNotes,
  journalEntries,
  screenshots,
  tags,
  tradeRisk,
  trades,
  tradeTags,
} from '@trading/db/schema';
import type { ResolvedScope } from './scope';

export type TagKind = 'setup' | 'mistake' | 'context';
export type Tag = { id: string; name: string; kind: TagKind };

export type JournalInput = {
  setupTagId: string | null;
  followedPlan: boolean | null;
  initialSl: string | null;
  plannedRr: string | null;
  plannedRiskUsd: string | null;
  emotionBefore: string | null;
  emotionAfter: string | null;
  mistakes: string[];
  contextTagIds: string[];
  notes: string | null;
  rating: number | null;
};

export async function listTags(db: Executor): Promise<Tag[]> {
  return db
    .select({ id: tags.id, name: tags.name, kind: tags.kind })
    .from(tags)
    .orderBy(asc(tags.kind), asc(tags.name));
}

export async function createTag(db: Executor, name: string, kind: TagKind): Promise<Tag> {
  const [row] = await db
    .insert(tags)
    .values({ name, kind })
    .onConflictDoUpdate({ target: [tags.kind, tags.name], set: { name } })
    .returning({ id: tags.id, name: tags.name, kind: tags.kind });
  if (!row) throw new Error('tag not created');
  return row;
}

export async function renameTag(db: Executor, id: string, name: string) {
  await db.update(tags).set({ name }).where(eq(tags.id, id));
}

/** Tags are journal data, not live trades: deleting one removes it from every trade (cascade). */
export async function deleteTag(db: Executor, id: string) {
  await db.update(journalEntries).set({ setupTagId: null }).where(eq(journalEntries.setupTagId, id));
  await db.delete(tags).where(eq(tags.id, id));
}

export type TradeJournal = {
  trade: typeof trades.$inferSelect;
  account: { id: string; login: number; phase: string; status: string; startingBalance: string };
  entry: typeof journalEntries.$inferSelect | null;
  contextTagIds: string[];
  screenshots: { id: string; storagePath: string; caption: string | null }[];
};

/** Trade detail + journal (§8.3 screen 6). Null when the trade doesn't exist. */
export async function tradeJournal(db: Executor, tradeId: string): Promise<TradeJournal | null> {
  const [row] = await db
    .select({
      trade: trades,
      account: {
        id: accounts.id,
        login: accounts.login,
        phase: accounts.phase,
        status: accounts.status,
        startingBalance: accounts.startingBalance,
      },
    })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(eq(trades.id, tradeId));
  if (!row) return null;
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.tradeId, tradeId));
  const ctx = await db.select({ id: tradeTags.tagId }).from(tradeTags).where(eq(tradeTags.tradeId, tradeId));
  const shots = await db
    .select({ id: screenshots.id, storagePath: screenshots.storagePath, caption: screenshots.caption })
    .from(screenshots)
    .where(eq(screenshots.tradeId, tradeId))
    .orderBy(asc(screenshots.createdAt));
  return { ...row, entry: entry ?? null, contextTagIds: ctx.map((c) => c.id), screenshots: shots };
}

/** Creates or replaces the journal entry and the trade's context tags in one go. */
export async function saveJournal(db: Executor, tradeId: string, input: JournalInput) {
  const { contextTagIds, ...fields } = input;
  await db
    .insert(journalEntries)
    .values({ tradeId, ...fields })
    .onConflictDoUpdate({ target: journalEntries.tradeId, set: fields });
  await db.delete(tradeTags).where(eq(tradeTags.tradeId, tradeId));
  if (contextTagIds.length) {
    await db
      .insert(tradeTags)
      .values(contextTagIds.map((tagId) => ({ tradeId, tagId })))
      .onConflictDoNothing();
  }
}

export async function addScreenshot(db: Executor, tradeId: string, storagePath: string, caption: string | null) {
  const [row] = await db
    .insert(screenshots)
    .values({ tradeId, storagePath, caption })
    .returning({ id: screenshots.id });
  return row?.id ?? null;
}

/** Removes the row and returns the storage path so the caller can delete the file. */
export async function removeScreenshot(db: Executor, id: string): Promise<string | null> {
  const [row] = await db.delete(screenshots).where(eq(screenshots.id, id)).returning({ path: screenshots.storagePath });
  return row?.path ?? null;
}

export type QueueTrade = {
  id: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  closedAt: Date;
  netProfit: string;
  riskSource: (typeof trades.$inferSelect)['riskSource'];
};

/** Journal screen: trades still to journal (newest first) and recently journaled ones, in scope. */
export async function journalQueue(db: Executor, scope: ResolvedScope, limit = 50) {
  if (scope.accountIds.length === 0) return { pending: [], pendingCount: 0, recent: [] };
  const base = {
    id: trades.id,
    accountId: trades.accountId,
    symbol: trades.symbol,
    side: trades.side,
    closedAt: trades.closedAt,
    netProfit: trades.netProfit,
    riskSource: trades.riskSource,
  };
  const where = (journaled: boolean) =>
    and(
      inArray(trades.accountId, scope.accountIds),
      eq(trades.source, scope.source),
      journaled ? isNotNull(journalEntries.id) : isNull(journalEntries.id),
    );
  const pending: QueueTrade[] = await db
    .select(base)
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(where(false))
    .orderBy(desc(trades.closedAt))
    .limit(limit);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(where(false));
  const recent: (QueueTrade & { followedPlan: boolean | null; rating: number | null })[] = await db
    .select({ ...base, followedPlan: journalEntries.followedPlan, rating: journalEntries.rating })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(where(true))
    .orderBy(desc(journalEntries.updatedAt))
    .limit(20);
  return { pending, pendingCount: count?.n ?? 0, recent };
}

export type RiskQueueTrade = {
  id: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  closedAt: Date;
  netProfit: string;
  riskUsd: string | null;
  startingBalance: string;
};

/**
 * Risk queue: trades in scope whose R is still an estimate, newest first, so Joe can tag 0.5% / 1% / … in one
 * tap each. A trade leaves the queue once it has a journaled stop or risk, or a tagged risk.
 */
export async function riskQueue(db: Executor, scope: ResolvedScope, limit = 100) {
  if (scope.accountIds.length === 0) return { trades: [] as RiskQueueTrade[], count: 0 };
  const where = and(
    inArray(trades.accountId, scope.accountIds),
    eq(trades.source, scope.source),
    eq(trades.riskSource, 'estimated'),
  );
  const rows: RiskQueueTrade[] = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      symbol: trades.symbol,
      side: trades.side,
      lots: trades.lots,
      closedAt: trades.closedAt,
      netProfit: trades.netProfit,
      riskUsd: trades.riskUsd,
      startingBalance: accounts.startingBalance,
    })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(where)
    .orderBy(desc(trades.closedAt))
    .limit(limit);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(trades).where(where);
  return { trades: rows, count: count?.n ?? 0 };
}

/** Stores the risk tagged on a trade (replacing any earlier tag); null clears it. Returns the trade's account. */
export async function setTradeRisk(
  db: Executor,
  tradeId: string,
  risk: { riskUsd: string; riskPct: string | null } | null,
): Promise<string | null> {
  const [trade] = await db.select({ accountId: trades.accountId }).from(trades).where(eq(trades.id, tradeId));
  if (!trade) return null;
  if (risk === null) {
    await db.delete(tradeRisk).where(eq(tradeRisk.tradeId, tradeId));
  } else {
    await db
      .insert(tradeRisk)
      .values({ tradeId, ...risk })
      .onConflictDoUpdate({ target: tradeRisk.tradeId, set: risk });
  }
  return trade.accountId;
}

/** Count of live trades without a journal entry (Journal nav badge, hub card). */
export async function unjournaledCount(db: Executor): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(and(eq(trades.source, 'live'), isNull(journalEntries.id)));
  return row?.n ?? 0;
}

/** The unjournaled trade to open after this one ("Save & next"): the next older one, else the newest. */
export async function nextUnjournaled(db: Executor, after: { closedAt: Date; id: string }): Promise<string | null> {
  const pick = (older: boolean) =>
    db
      .select({ id: trades.id })
      .from(trades)
      .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
      .where(
        and(
          eq(trades.source, 'live'),
          isNull(journalEntries.id),
          sql`${trades.id} <> ${after.id}`,
          older ? lt(trades.closedAt, after.closedAt) : undefined,
        ),
      )
      .orderBy(desc(trades.closedAt))
      .limit(1);
  const [older] = await pick(true);
  if (older) return older.id;
  const [any] = await pick(false);
  return any?.id ?? null;
}

/** Daily notes in [from, to] (screen 10). */
export async function dailyNotesBetween(db: Executor, from: string, to: string) {
  return db
    .select({
      date: dailyNotes.date,
      notes: dailyNotes.notes,
      mood: dailyNotes.mood,
      marketContext: dailyNotes.marketContext,
    })
    .from(dailyNotes)
    .where(and(gte(dailyNotes.date, from), sql`${dailyNotes.date} <= ${to}`))
    .orderBy(desc(dailyNotes.date));
}
