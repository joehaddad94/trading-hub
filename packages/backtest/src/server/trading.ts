import {
  advance,
  type Bar,
  type Costs,
  closeAtMarket,
  type Exit,
  type PendingOrder,
  pendingType,
  type SimState,
  tradeResult,
  validLevels,
} from '@trading/backtest-engine';
import type { Executor } from '@trading/db';
import { and, asc, desc, eq, gt, inArray, lte, sql } from '@trading/db/orm';
import {
  accounts,
  backtestOrders,
  backtestSessions,
  candles1m,
  firms,
  instruments,
  journalEntries,
  screenshots,
  tags,
  trades,
  tradeTags,
} from '@trading/db/schema';
import Decimal from 'decimal.js';
import type {
  ModifyOrderInput,
  OrderView,
  PlaceOrderInput,
  SessionInput,
  SessionSummary,
  SessionView,
} from '../trading';
import { type Owner, ownedBy } from './owned-by';

/** A refusal the user should see (bad levels, closed order, live trade). */
export class TradingError extends Error {}

export const BACKTEST_FIRM = 'Backtest Lab';
/** Bars evaluated per query while advancing. */
const BATCH = 5000;

type OrderRow = typeof backtestOrders.$inferSelect;

/**
 * Joe's rule (25 Oct 2026): while a trade is open or pending the replay can't go back before it, so a trade is
 * never closed before it opened and nothing is traded with hindsight. Live orders are processed up to the
 * newest cursor they saw; an action dated earlier is refused.
 */
export const BEHIND_LIVE_TRADE =
  'The replay is behind your open trade. Close or cancel it from where you left off before replaying another time.';

function assertNotBehind(live: Pick<OrderRow, 'processedUntil' | 'placedAt'>[], at: Date) {
  if (live.some((o) => (o.processedUntil ?? o.placedAt).getTime() > at.getTime())) {
    throw new TradingError(BEHIND_LIVE_TRADE);
  }
}

async function liveOrders(db: Executor, sessionId: string): Promise<OrderRow[]> {
  return db
    .select()
    .from(backtestOrders)
    .where(and(eq(backtestOrders.sessionId, sessionId), inArray(backtestOrders.status, ['pending', 'open'])))
    .orderBy(asc(backtestOrders.placedAt));
}
type SessionRow = typeof backtestSessions.$inferSelect;
type Instrument = typeof instruments.$inferSelect;

const toSession = (s: SessionRow): SessionView => ({
  id: s.id,
  name: s.name,
  accountId: s.accountId,
  startingBalance: s.startingBalance,
  riskPct: s.riskPct,
  cursor: s.cursorTs?.getTime() ?? null,
  status: s.status,
  costs: (s.costs ?? {}) as SessionView['costs'],
  setupTagId: s.setupTagId,
  notes: s.notes,
});

/**
 * Creates a session and its synthetic tracker account (spec §7): Backtest Lab firm, phase `other`, demo,
 * labelled "Backtest – <name>". Logins count up from 1 within the Backtest Lab firm.
 */
export async function createSession(
  db: Executor,
  owner: Owner,
  input: { name: string; startingBalance?: string; riskPct?: string } & Partial<
    Pick<SessionInput, 'costs' | 'setupTagId' | 'notes'>
  >,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const [firm] = await tx.select({ id: firms.id }).from(firms).where(eq(firms.name, BACKTEST_FIRM));
    if (!firm) throw new Error(`Firm ${BACKTEST_FIRM} is missing (migration seed)`);
    // Serialise login allocation (single user, but two tabs could race).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('backtest_login'))`);
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${accounts.login}), 0) + 1`.mapWith(Number) })
      .from(accounts)
      .where(eq(accounts.firmId, firm.id));
    const startingBalance = input.startingBalance ?? '25000';
    const riskPct = input.riskPct ?? '0.5';
    const [account] = await tx
      .insert(accounts)
      .values({
        firmId: firm.id,
        externalId: next,
        login: next,
        phase: 'other',
        isDemo: true,
        isBacktest: true,
        typeLabel: `Backtest – ${input.name}`,
        startingBalance,
        defaultRiskPct: riskPct,
      })
      .returning({ id: accounts.id });
    if (!account) throw new Error('Could not create the backtest account');
    const [session] = await tx
      .insert(backtestSessions)
      .values({
        accountId: account.id,
        ownerId: owner,
        name: input.name,
        startingBalance,
        riskPct,
        costs: input.costs ?? {},
        setupTagId: input.setupTagId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!session) throw new Error('Could not create the session');
    return toSession(session);
  });
}

/**
 * The owner's session the chart trades in: `id` when given (and still there), else their newest in-progress
 * one, created on first use.
 */
export async function currentSession(db: Executor, owner: Owner, id?: string | null): Promise<SessionView> {
  const mine = ownedBy(backtestSessions.ownerId, owner);
  if (id) {
    const [chosen] = await db
      .select()
      .from(backtestSessions)
      .where(and(eq(backtestSessions.id, id), mine));
    if (chosen) return toSession(chosen);
  }
  const [row] = await db
    .select()
    .from(backtestSessions)
    .where(and(eq(backtestSessions.status, 'in_progress'), mine))
    .orderBy(desc(backtestSessions.createdAt))
    .limit(1);
  if (row) return toSession(row);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(backtestSessions).where(mine);
  return createSession(db, owner, { name: `Run ${n + 1}` });
}

async function getSession(db: Executor, id: string): Promise<SessionRow> {
  const [row] = await db.select().from(backtestSessions).where(eq(backtestSessions.id, id));
  if (!row) throw new TradingError('That backtest run no longer exists.');
  return row;
}

async function instrumentBy(db: Executor, where: { code?: string; id?: string }): Promise<Instrument> {
  const [row] = await db
    .select()
    .from(instruments)
    .where(where.code ? eq(instruments.code, where.code) : eq(instruments.id, where.id as string));
  if (!row) throw new TradingError('Unknown instrument.');
  return row;
}

/** Costs for an instrument: the session's override, else the instrument's spread with no commission or slippage. */
export function costsFor(session: Pick<SessionRow, 'costs'>, instrument: Instrument): Costs {
  const all = (session.costs ?? {}) as Record<string, Partial<Costs> | undefined>;
  const own = all[instrument.code] ?? {};
  return {
    spreadPoints: own.spreadPoints ?? instrument.defaultSpreadPoints ?? '0',
    commissionPerLot: own.commissionPerLot ?? '0',
    slippagePoints: own.slippagePoints ?? '0',
  };
}

/** The 1m bar at or just before `at` (the bar on screen at the cursor). */
async function barAt(db: Executor, instrumentId: string, at: Date): Promise<Bar | null> {
  const [r] = await db
    .select()
    .from(candles1m)
    .where(and(eq(candles1m.instrumentId, instrumentId), lte(candles1m.ts, at)))
    .orderBy(desc(candles1m.ts))
    .limit(1);
  return r ? toBar(r) : null;
}

const toBar = (r: typeof candles1m.$inferSelect): Bar => ({
  ts: r.ts.getTime(),
  open: Number(r.open),
  high: Number(r.high),
  low: Number(r.low),
  close: Number(r.close),
  volume: r.volume === null ? 0 : Number(r.volume),
});

const side = (s: 'buy' | 'sell') => (s === 'buy' ? 'long' : 'short') as 'long' | 'short';

/**
 * Places an order. Market orders fill at the next 1m bar's open; a pending order is a limit when its entry is
 * on the better side of the cursor bar's close, else a stop. A `drawn` order (a long/short box) is open at once
 * at exactly its drawn entry, stop and target: no spread or slippage on the entry (Joe, 26 Oct 2026). Never
 * looks past `at`.
 */
export async function placeOrder(db: Executor, sessionId: string, input: PlaceOrderInput): Promise<OrderView> {
  const session = await getSession(db, sessionId);
  if (session.status !== 'in_progress') throw new TradingError('This run is completed. Reopen it to trade.');
  const instrument = await instrumentBy(db, { code: input.instrument });
  if (!validLevels(input.side, input.entry, input.sl, input.tp)) {
    throw new TradingError(
      input.side === 'long'
        ? 'A long needs its stop below and target above the entry.'
        : 'A short needs its stop above and target below the entry.',
    );
  }
  assertNotBehind(await liveOrders(db, sessionId), input.at);
  const now = await barAt(db, instrument.id, input.at);
  if (!now) throw new TradingError('No candles at the replay cursor yet.');
  let type: 'market' | 'limit' | 'stop' = 'market';
  if (input.kind === 'pending') {
    type = pendingType(input.side, input.entry, now.close);
  }
  // A drawn box opens at its own levels on the cursor bar; exits are checked from the next bar on.
  const opened =
    input.kind === 'drawn'
      ? {
          status: 'open' as const,
          fillPrice: input.entry,
          filledAt: new Date(now.ts),
          initialSl: input.sl,
          initialTp: input.tp,
        }
      : {};
  const [row] = await db
    .insert(backtestOrders)
    .values({
      sessionId,
      instrumentId: instrument.id,
      drawingId: input.drawingId ?? null,
      side: input.side === 'long' ? 'buy' : 'sell',
      type,
      lots: input.lots,
      entry: input.entry,
      sl: input.sl,
      tp: input.tp,
      placedAt: new Date(now.ts),
      processedUntil: new Date(now.ts),
      ...opened,
    })
    .returning();
  if (!row) throw new Error('Could not place the order');
  await db
    .update(backtestSessions)
    .set({
      instrumentIds: sql`array(select distinct unnest(${backtestSessions.instrumentIds} || ${sql`array[${instrument.id}]::uuid[]`}))`,
    })
    .where(eq(backtestSessions.id, sessionId));
  return viewOf(row, instrument.code, null);
}

function simState(o: OrderRow): SimState {
  const order: PendingOrder = {
    side: side(o.side),
    type: o.type,
    entry: o.entry,
    sl: o.sl,
    tp: o.tp,
    placedAt: o.placedAt.getTime(),
  };
  if (o.status === 'pending') return { status: 'pending', order };
  return {
    status: 'open',
    order,
    position: {
      side: side(o.side),
      fillPrice: o.fillPrice as string,
      filledAt: (o.filledAt as Date).getTime(),
      sl: o.sl,
      tp: o.tp,
    },
    initialSl: o.initialSl as string,
    initialTp: o.initialTp as string,
  };
}

/**
 * Replays every pending/open order of the session up to `cursor` on 1m bars (spec §6.2) and records the
 * cursor. Closed orders become backtest trades. Returns the number of orders whose status changed.
 */
export async function advanceSession(db: Executor, sessionId: string, cursor: Date): Promise<number> {
  const session = await getSession(db, sessionId);
  const live = await liveOrders(db, sessionId);
  assertNotBehind(live, cursor);
  let changed = 0;
  for (const o of live) {
    const instrument = await instrumentBy(db, { id: o.instrumentId });
    const costs = costsFor(session, instrument);
    let state = simState(o);
    let from = o.processedUntil ?? o.placedAt;
    while (from < cursor && state.status !== 'closed') {
      const rows = await db
        .select()
        .from(candles1m)
        .where(and(eq(candles1m.instrumentId, o.instrumentId), gt(candles1m.ts, from), lte(candles1m.ts, cursor)))
        .orderBy(asc(candles1m.ts))
        .limit(BATCH);
      if (rows.length === 0) {
        from = cursor;
        break;
      }
      const bars = rows.map(toBar);
      state = advance(state, bars, costs);
      from = new Date((bars.at(-1) as Bar).ts);
      if (rows.length < BATCH) from = cursor;
    }
    const before = o.status;
    await db.transaction(async (tx) => {
      await saveState(tx, o, state, from, session, instrument, costs);
    });
    if (state.status !== before) changed += 1;
  }
  await db.update(backtestSessions).set({ cursorTs: cursor }).where(eq(backtestSessions.id, sessionId));
  return changed;
}

async function saveState(
  tx: Executor,
  o: OrderRow,
  state: SimState,
  processedUntil: Date,
  session: SessionRow,
  instrument: Instrument,
  costs: Costs,
) {
  if (state.status === 'pending') {
    await tx.update(backtestOrders).set({ processedUntil }).where(eq(backtestOrders.id, o.id));
    return;
  }
  const fill = {
    status: state.status,
    fillPrice: state.position.fillPrice,
    filledAt: new Date(state.position.filledAt),
    sl: state.position.sl,
    tp: state.position.tp,
    initialSl: state.initialSl,
    initialTp: state.initialTp,
    processedUntil,
  };
  if (state.status === 'open') {
    await tx.update(backtestOrders).set(fill).where(eq(backtestOrders.id, o.id));
    return;
  }
  const tradeId = await writeTrade(tx, { ...o, ...fill }, state.exit, session, instrument, costs);
  await tx
    .update(backtestOrders)
    .set({
      ...fill,
      closePrice: state.exit.price,
      closedAt: new Date(state.exit.at),
      exitReason: state.exit.reason,
      ambiguous: state.exit.ambiguous,
      tradeId,
    })
    .where(eq(backtestOrders.id, o.id));
}

/** Spec §6.3: the closed order as a `source = 'backtest'` trade on the session's account, R at the initial stop. */
async function writeTrade(
  tx: Executor,
  o: OrderRow,
  exit: Exit,
  session: SessionRow,
  instrument: Instrument,
  costs: Costs,
): Promise<string> {
  const result = tradeResult(
    {
      side: side(o.side),
      lots: o.lots,
      fillPrice: o.fillPrice as string,
      exitPrice: exit.price,
      initialSl: o.initialSl as string,
    },
    instrument.pointValuePerLot,
    costs,
  );
  const [trade] = await tx
    .insert(trades)
    .values({
      accountId: session.accountId,
      source: 'backtest',
      ticket: `BT-${o.id}`,
      symbol: instrument.firmSymbol ?? instrument.code,
      side: o.side,
      lots: o.lots,
      openPrice: o.fillPrice as string,
      closePrice: exit.price,
      openedAt: o.filledAt as Date,
      closedAt: new Date(exit.at),
      slFinal: o.sl,
      tpFinal: o.tp,
      profit: result.profit,
      commission: result.commission,
      swap: '0',
      riskUsd: result.riskUsd === '0.00' ? null : result.riskUsd,
      riskSource: result.riskUsd === '0.00' ? null : 'journal_sl',
      raw: {
        orderId: o.id,
        orderType: o.type,
        instrument: instrument.code,
        initialSl: o.initialSl,
        initialTp: o.initialTp,
        exitReason: exit.reason,
        ambiguous: exit.ambiguous,
        gap: exit.gap,
        costs,
        modifications: o.modifications,
      },
    })
    .returning({ id: trades.id });
  if (!trade) throw new Error('Could not record the trade');
  // The journal knows the initial stop, so the tracker's risk resolution agrees with the backtester's R.
  await tx.insert(journalEntries).values({
    tradeId: trade.id,
    setupTagId: session.setupTagId,
    initialSl: o.initialSl,
    plannedRr: plannedRr(o),
  });
  return trade.id;
}

function plannedRr(o: OrderRow): string | null {
  const entry = new Decimal(o.fillPrice as string);
  const risk = entry.minus(o.initialSl as string).abs();
  if (risk.isZero()) return null;
  return entry
    .minus(o.initialTp as string)
    .abs()
    .dividedBy(risk)
    .toFixed(2);
}

async function liveOrder(db: Executor, id: string): Promise<OrderRow> {
  const [o] = await db.select().from(backtestOrders).where(eq(backtestOrders.id, id));
  if (!o) throw new TradingError('That order no longer exists.');
  if (o.status !== 'pending' && o.status !== 'open') throw new TradingError('That order is already closed.');
  return o;
}

/**
 * Moves SL/TP (e.g. to breakeven) and, for a pending order, its entry; every change is logged with the replay
 * time (spec §6.1). A moved entry is re-typed against the cursor bar's close, as when it was placed.
 */
export async function modifyOrder(db: Executor, id: string, input: ModifyOrderInput): Promise<void> {
  const o = await liveOrder(db, id);
  assertNotBehind([o], input.at);
  const s = side(o.side);
  if (input.entry !== undefined && o.status !== 'pending') {
    throw new TradingError('Only a pending order can move its entry; this one has filled.');
  }
  if (input.entry !== undefined && o.type === 'market') {
    throw new TradingError('A market order fills at the next open; cancel it to pick another entry.');
  }
  const entry = input.entry ?? o.entry;
  const ok = s === 'long' ? new Decimal(input.sl).lt(input.tp) : new Decimal(input.sl).gt(input.tp);
  if (!ok) throw new TradingError('The stop must stay on the losing side of the target.');
  if (o.status === 'pending' && !validLevels(s, entry, input.sl, input.tp)) {
    throw new TradingError('A pending order needs its stop and target on either side of the entry.');
  }
  let type = o.type;
  if (input.entry !== undefined) {
    const now = await barAt(db, o.instrumentId, input.at);
    if (!now) throw new TradingError('No candle at the replay cursor.');
    type = pendingType(s, entry, now.close);
  }
  const change = { at: input.at.toISOString(), sl: input.sl, tp: input.tp, ...(input.entry ? { entry } : {}) };
  const log = [...((o.modifications as unknown[]) ?? []), change];
  await db
    .update(backtestOrders)
    .set({ sl: input.sl, tp: input.tp, entry, type, modifications: log })
    .where(eq(backtestOrders.id, id));
}

export async function cancelOrder(db: Executor, id: string): Promise<void> {
  const o = await liveOrder(db, id);
  if (o.status !== 'pending') throw new TradingError('Only a pending order can be cancelled; close an open one.');
  await db.update(backtestOrders).set({ status: 'cancelled' }).where(eq(backtestOrders.id, id));
}

/**
 * "Close at market" at the cursor bar's close, after replaying the order up to the cursor. With `lots` below
 * the position size only that part closes: it is split off as its own closed order (and trade), and the rest
 * stays open on the original order with the same fill, stop and target.
 */
export async function closeOrder(db: Executor, id: string, at: Date, lots?: string): Promise<void> {
  const first = await liveOrder(db, id);
  await advanceSession(db, first.sessionId, at);
  const o = await liveOrder(db, id).catch(() => null);
  if (!o) return; // It hit SL/TP on the way.
  if (o.status === 'pending') {
    await db.update(backtestOrders).set({ status: 'cancelled' }).where(eq(backtestOrders.id, id));
    return;
  }
  const session = await getSession(db, o.sessionId);
  const instrument = await instrumentBy(db, { id: o.instrumentId });
  const bar = await barAt(db, o.instrumentId, at);
  if (!bar) throw new TradingError('No candle at the replay cursor.');
  const costs = costsFor(session, instrument);
  const state = simState(o);
  if (state.status !== 'open') return;
  const exit = closeAtMarket(state.position, bar, costs);
  const part = lots === undefined ? null : new Decimal(lots);
  if (part?.gt(o.lots)) throw new TradingError(`This position is only ${o.lots} lots.`);
  if (!part || part.eq(o.lots)) {
    await db.transaction(async (tx) => {
      await saveState(tx, o, { ...state, status: 'closed', exit }, at, session, instrument, costs);
    });
    return;
  }
  await db.transaction(async (tx) => {
    const { id: _id, tradeId: _trade, drawingId: _drawing, ...rest } = o;
    const [piece] = await tx
      .insert(backtestOrders)
      .values({ ...rest, lots: part.toFixed(2), drawingId: null, tradeId: null })
      .returning();
    if (!piece) throw new Error('Could not split the position');
    await saveState(tx, piece, { ...state, status: 'closed', exit }, at, session, instrument, costs);
    await tx
      .update(backtestOrders)
      .set({ lots: new Decimal(o.lots).minus(part).toFixed(2), processedUntil: at })
      .where(eq(backtestOrders.id, o.id));
  });
}

function viewOf(o: OrderRow, instrument: string, trade: { net: string; riskUsd: string | null } | null): OrderView {
  const r =
    trade?.riskUsd && !new Decimal(trade.riskUsd).isZero()
      ? new Decimal(trade.net).dividedBy(trade.riskUsd).toFixed(2)
      : null;
  return {
    id: o.id,
    instrument,
    side: side(o.side),
    type: o.type,
    status: o.status,
    lots: o.lots,
    entry: o.entry,
    sl: o.sl,
    tp: o.tp,
    placedAt: o.placedAt.getTime(),
    fillPrice: o.fillPrice,
    filledAt: o.filledAt?.getTime() ?? null,
    closePrice: o.closePrice,
    closedAt: o.closedAt?.getTime() ?? null,
    exitReason: o.exitReason,
    ambiguous: o.ambiguous,
    drawingId: o.drawingId,
    tradeId: o.tradeId,
    net: trade?.net ?? null,
    r,
  };
}

/** The session's orders, newest first, with closed trades' P/L and R. Cancelled orders are left out. */
export async function listOrders(db: Executor, sessionId: string): Promise<OrderView[]> {
  const rows = await db
    .select({ order: backtestOrders, instrument: instruments.code, net: trades.netProfit, riskUsd: trades.riskUsd })
    .from(backtestOrders)
    .innerJoin(instruments, eq(instruments.id, backtestOrders.instrumentId))
    .leftJoin(trades, eq(trades.id, backtestOrders.tradeId))
    .where(and(eq(backtestOrders.sessionId, sessionId), inArray(backtestOrders.status, ['pending', 'open', 'closed'])))
    .orderBy(desc(backtestOrders.placedAt));
  return rows
    .filter((r) => r.order.status !== 'closed' || r.net !== null)
    .map((r) => viewOf(r.order, r.instrument, r.net === null ? null : { net: r.net, riskUsd: r.riskUsd }));
}

/** Everything a deleted backtest trade had, so Undo can put it back exactly (spec §6.4). */
export type DeletedTrade = {
  trade: Omit<typeof trades.$inferSelect, 'netProfit'>;
  journal: (typeof journalEntries.$inferSelect)[];
  tags: (typeof tradeTags.$inferSelect)[];
  screenshots: (typeof screenshots.$inferSelect)[];
  orders: OrderRow[];
};

/**
 * Deletes a backtest trade and everything attached (journal, tags, screenshot rows, its order and SL log) in
 * one transaction. Live trades are refused here and by the database trigger.
 */
export async function deleteBacktestTrade(db: Executor, tradeId: string): Promise<DeletedTrade> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(trades).where(eq(trades.id, tradeId));
    if (!row) throw new TradingError('That trade no longer exists.');
    if (row.source !== 'backtest') throw new TradingError('Live trades can never be deleted.');
    const { netProfit: _net, ...trade } = row;
    const snapshot: DeletedTrade = {
      trade,
      journal: await tx.select().from(journalEntries).where(eq(journalEntries.tradeId, tradeId)),
      tags: await tx.select().from(tradeTags).where(eq(tradeTags.tradeId, tradeId)),
      screenshots: await tx.select().from(screenshots).where(eq(screenshots.tradeId, tradeId)),
      orders: await tx.select().from(backtestOrders).where(eq(backtestOrders.tradeId, tradeId)),
    };
    // Cascades remove journal, tags, screenshots and the order.
    await tx.delete(trades).where(eq(trades.id, tradeId));
    return snapshot;
  });
}

/** Undo: re-inserts a deleted backtest trade with the same ids. */
export async function restoreBacktestTrade(db: Executor, snapshot: DeletedTrade): Promise<void> {
  if (snapshot.trade.source !== 'backtest') throw new TradingError('Only backtest trades can be restored.');
  await db.transaction(async (tx) => {
    await tx.insert(trades).values(snapshot.trade);
    if (snapshot.journal.length) await tx.insert(journalEntries).values(snapshot.journal);
    if (snapshot.tags.length) await tx.insert(tradeTags).values(snapshot.tags);
    if (snapshot.screenshots.length) await tx.insert(screenshots).values(snapshot.screenshots);
    if (snapshot.orders.length) await tx.insert(backtestOrders).values(snapshot.orders);
  });
}

/** Deletes a session with its synthetic account, trades, orders and drawings (spec §6.4). */
export async function deleteSession(db: Executor, sessionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await getSession(tx, sessionId);
    await tx.delete(trades).where(and(eq(trades.accountId, session.accountId), eq(trades.source, 'backtest')));
    await tx.delete(backtestSessions).where(eq(backtestSessions.id, sessionId));
    await tx.delete(accounts).where(and(eq(accounts.id, session.accountId), eq(accounts.isBacktest, true)));
  });
}

/** The owner's sessions, newest first, with trade count, net P/L, open orders and ambiguous-bar count. */
export async function listSessions(db: Executor, owner: Owner): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      session: backtestSessions,
      trades: sql<number>`(select count(*)::int from trades t where t.account_id = backtest_sessions.account_id and t.source = 'backtest')`,
      net: sql<string>`(select coalesce(sum(t.net_profit), 0)::text from trades t where t.account_id = backtest_sessions.account_id and t.source = 'backtest')`,
      openOrders: sql<number>`(select count(*)::int from backtest_orders o where o.session_id = backtest_sessions.id and o.status in ('pending', 'open'))`,
      ambiguous: sql<number>`(select count(*)::int from backtest_orders o where o.session_id = backtest_sessions.id and o.ambiguous and o.trade_id is not null)`,
      instruments: sql<
        string[]
      >`(select coalesce(array_agg(i.code order by i.code), '{}') from instruments i where i.id = any(backtest_sessions.instrument_ids))`,
    })
    .from(backtestSessions)
    .where(ownedBy(backtestSessions.ownerId, owner))
    .orderBy(desc(backtestSessions.updatedAt));
  return rows.map((r) => ({
    ...toSession(r.session),
    trades: Number(r.trades),
    net: new Decimal(r.net).toFixed(2),
    openOrders: Number(r.openOrders),
    ambiguous: Number(r.ambiguous),
    instruments: r.instruments ?? [],
    createdAt: r.session.createdAt.getTime(),
    updatedAt: r.session.updatedAt.getTime(),
  }));
}

export async function getSessionView(db: Executor, id: string): Promise<SessionView | null> {
  const [row] = await db.select().from(backtestSessions).where(eq(backtestSessions.id, id));
  return row ? toSession(row) : null;
}

/** Edits a session's settings; the synthetic account's label, balance and risk follow (spec §7). */
export async function updateSession(db: Executor, id: string, input: SessionInput): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await getSession(tx, id);
    await tx
      .update(backtestSessions)
      .set({
        name: input.name,
        startingBalance: input.startingBalance,
        riskPct: input.riskPct,
        costs: input.costs,
        setupTagId: input.setupTagId,
        notes: input.notes,
      })
      .where(eq(backtestSessions.id, id));
    await tx
      .update(accounts)
      .set({
        typeLabel: `Backtest – ${input.name}`,
        startingBalance: input.startingBalance,
        defaultRiskPct: input.riskPct,
      })
      .where(and(eq(accounts.id, session.accountId), eq(accounts.isBacktest, true)));
  });
}

/** Marks a session completed (open orders are cancelled) or back in progress. */
export async function setSessionStatus(db: Executor, id: string, status: 'in_progress' | 'completed'): Promise<void> {
  await db.transaction(async (tx) => {
    await getSession(tx, id);
    if (status === 'completed') {
      await tx
        .update(backtestOrders)
        .set({ status: 'cancelled' })
        .where(and(eq(backtestOrders.sessionId, id), inArray(backtestOrders.status, ['pending', 'open'])));
    }
    await tx.update(backtestSessions).set({ status }).where(eq(backtestSessions.id, id));
  });
}

/** A closed backtest trade of a session, for its stats and equity curve (metrics come from @trading/core). */
export type SessionTrade = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  openedAt: Date;
  closedAt: Date;
  netProfit: string;
  riskUsd: string | null;
  riskSource: 'journal_sl' | 'journal_usd' | 'full_stop_loss' | 'estimated' | null;
  exitReason: string | null;
  ambiguous: boolean;
};

export async function sessionTrades(db: Executor, id: string): Promise<SessionTrade[]> {
  const session = await getSession(db, id);
  const rows = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      side: trades.side,
      lots: trades.lots,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      netProfit: trades.netProfit,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
      exitReason: backtestOrders.exitReason,
      ambiguous: backtestOrders.ambiguous,
    })
    .from(trades)
    .leftJoin(backtestOrders, eq(backtestOrders.tradeId, trades.id))
    .where(and(eq(trades.accountId, session.accountId), eq(trades.source, 'backtest')))
    .orderBy(asc(trades.closedAt), asc(trades.ticket));
  return rows.map((r) => ({ ...r, ambiguous: r.ambiguous ?? false }));
}

/** Setup tags a session can be tagged with (the journal's `setup` kind). */
export async function setupTags(db: Executor): Promise<{ id: string; name: string }[]> {
  return db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.kind, 'setup')).orderBy(asc(tags.name));
}
