import Decimal from 'decimal.js';
import type { Bar } from './bars';
import type { Side } from './position';

/**
 * Simulated order engine (backtester spec §6). Deterministic and conservative:
 * - every fill and exit is evaluated on 1m bars, bar by bar, and only on bars the replay has reached;
 * - candles are bid prices: a buy fills at ask (bid + spread), a short exits at ask;
 * - a bar touching both SL and TP closes at the SL ("ambiguous");
 * - a bar opening beyond a level fills at its open (gap), not at the level;
 * - slippage is adverse and applies to market and stop fills, stop-loss exits and manual closes;
 * - on the bar a limit/stop order fills, only the stop loss is checked (its high/low may predate the fill);
 *   a market order fills at the bar's open, so the whole bar counts.
 * Prices are strings in and out; maths in decimal.js (CLAUDE.md rule 5).
 */
export type OrderType = 'market' | 'limit' | 'stop';

export type Costs = {
  /** Points added to bid to get ask. */
  spreadPoints: string;
  /** USD per lot, charged once per round trip. */
  commissionPerLot: string;
  /** Adverse points on market/stop fills and stop exits. */
  slippagePoints: string;
};

export const NO_COSTS: Costs = { spreadPoints: '0', commissionPerLot: '0', slippagePoints: '0' };

export type PendingOrder = {
  side: Side;
  type: OrderType;
  /** Requested entry: the limit/stop level, or the price the tool showed for a market order. */
  entry: string;
  sl: string;
  tp: string;
  /** Replay time the order was placed (a 1m open time); only later bars can fill it. */
  placedAt: number;
};

export type Position = {
  side: Side;
  fillPrice: string;
  filledAt: number;
  sl: string;
  tp: string;
};

export type Fill = { price: string; at: number; sl: string; tp: string };

export type ExitReason = 'tp' | 'sl' | 'breakeven' | 'manual';
export type Exit = { price: string; at: number; reason: ExitReason; ambiguous: boolean; gap: boolean };

const d = (v: number | string) => new Decimal(typeof v === 'number' ? String(v) : v);

/** Ask-side price of a bid price. */
const ask = (bid: number | string, costs: Costs) => d(bid).plus(costs.spreadPoints);

/**
 * Tries to fill an order on one 1m bar. Market orders fill at the open of the first bar after `placedAt`;
 * SL/TP keep their distances from the requested entry when the fill price differs (spec §6.1).
 */
export function tryFill(order: PendingOrder, bar: Bar, costs: Costs): Fill | null {
  if (bar.ts <= order.placedAt) return null;
  const long = order.side === 'long';
  const slip = d(costs.slippagePoints);
  const entry = d(order.entry);
  // Prices on the side the order trades: ask for buys, bid for sells.
  const px = (bid: number) => (long ? ask(bid, costs) : d(bid));
  const open = px(bar.open);
  const high = px(bar.high);
  const low = px(bar.low);
  let price: Decimal | null = null;
  if (order.type === 'market') {
    price = long ? open.plus(slip) : open.minus(slip);
  } else if (order.type === 'limit') {
    // Buy limit below the market, sell limit above; a gap through the level fills at the (better) open.
    if (long && low.lte(entry)) price = Decimal.min(entry, open);
    if (!long && high.gte(entry)) price = Decimal.max(entry, open);
  } else {
    // Buy stop above the market, sell stop below; a gap through the level fills at the (worse) open.
    if (long && high.gte(entry)) price = Decimal.max(entry, open).plus(slip);
    if (!long && low.lte(entry)) price = Decimal.min(entry, open).minus(slip);
  }
  if (price === null) return null;
  const shift = price.minus(entry);
  return {
    price: price.toString(),
    at: bar.ts,
    sl: d(order.sl).plus(shift).toString(),
    tp: d(order.tp).plus(shift).toString(),
  };
}

/** Checks one 1m bar for an exit. `fillBar`: the position filled on this bar, so only the SL counts. */
export function checkExit(pos: Position, bar: Bar, costs: Costs, fillBar = false): Exit | null {
  const long = pos.side === 'long';
  const slip = d(costs.slippagePoints);
  // Prices a position closes at: bid for longs, ask for shorts.
  const px = (bid: number) => (long ? d(bid) : ask(bid, costs));
  const open = px(bar.open);
  const high = px(bar.high);
  const low = px(bar.low);
  const sl = d(pos.sl);
  const tp = d(pos.tp);
  const reason: ExitReason = sl.eq(pos.fillPrice) ? 'breakeven' : 'sl';
  const stopAt = (level: Decimal) => (long ? level.minus(slip) : level.plus(slip));
  const exit = (price: Decimal, r: ExitReason, extra: Partial<Exit> = {}): Exit => ({
    price: price.toString(),
    at: bar.ts,
    reason: r,
    ambiguous: false,
    gap: false,
    ...extra,
  });

  const slGap = long ? open.lte(sl) : open.gte(sl);
  const tpGap = long ? open.gte(tp) : open.lte(tp);
  if (!fillBar) {
    if (slGap) return exit(stopAt(open), reason, { gap: true });
    if (tpGap) return exit(open, 'tp', { gap: true });
  }
  const slHit = long ? low.lte(sl) : high.gte(sl);
  const tpHit = !fillBar && (long ? high.gte(tp) : low.lte(tp));
  if (slHit) return exit(stopAt(sl), reason, { ambiguous: tpHit });
  if (tpHit) return exit(tp, 'tp');
  return null;
}

/** "Close at market": the close of the bar at the cursor (already on screen), minus slippage. */
export function closeAtMarket(pos: Position, bar: Bar, costs: Costs): Exit {
  const long = pos.side === 'long';
  const price = long ? d(bar.close).minus(costs.slippagePoints) : ask(bar.close, costs).plus(costs.slippagePoints);
  return { price: price.toString(), at: bar.ts, reason: 'manual', ambiguous: false, gap: false };
}

export type TradeResult = {
  /** Price P/L in USD (before commission), 2 dp. */
  profit: string;
  /** Negative: a cost. */
  commission: string;
  net: string;
  /** Risk at the initial stop, USD (spec §6.3). */
  riskUsd: string;
  /** Net ÷ risk at the initial stop, 2 dp; null when the initial stop carries no risk. */
  r: string | null;
};

/** P/L of a closed simulated trade. `pointValue` is USD per 1.0 price move per lot. */
export function tradeResult(
  input: { side: Side; lots: string; fillPrice: string; exitPrice: string; initialSl: string },
  pointValue: string,
  costs: Costs,
): TradeResult {
  const dir = input.side === 'long' ? 1 : -1;
  const perPoint = d(pointValue).times(input.lots);
  const profit = d(input.exitPrice).minus(input.fillPrice).times(dir).times(perPoint).toDecimalPlaces(2);
  const commission = d(costs.commissionPerLot).times(input.lots).negated().toDecimalPlaces(2);
  const net = profit.plus(commission);
  const risk = d(input.fillPrice).minus(input.initialSl).abs().times(perPoint).toDecimalPlaces(2);
  return {
    profit: profit.toFixed(2),
    commission: commission.toFixed(2),
    net: net.toFixed(2),
    riskUsd: risk.toFixed(2),
    r: risk.isZero() ? null : net.dividedBy(risk).toFixed(2),
  };
}

export type SimState =
  | { status: 'pending'; order: PendingOrder }
  | { status: 'open'; order: PendingOrder; position: Position; initialSl: string; initialTp: string }
  | {
      status: 'closed';
      order: PendingOrder;
      position: Position;
      initialSl: string;
      initialTp: string;
      exit: Exit;
    };

/**
 * Advances one order over 1m bars (oldest first, all at or before the replay cursor). Pure: the caller
 * stores the returned state. SL/TP edits are applied to `position` between calls.
 */
export function advance(state: SimState, bars: Bar[], costs: Costs): SimState {
  let s = state;
  for (const bar of bars) {
    if (s.status === 'closed') break;
    if (s.status === 'pending') {
      const fill = tryFill(s.order, bar, costs);
      if (!fill) continue;
      const position: Position = {
        side: s.order.side,
        fillPrice: fill.price,
        filledAt: fill.at,
        sl: fill.sl,
        tp: fill.tp,
      };
      s = { status: 'open', order: s.order, position, initialSl: fill.sl, initialTp: fill.tp };
      const exit = checkExit(position, bar, costs, s.order.type !== 'market');
      if (exit) s = { ...s, status: 'closed', exit };
      continue;
    }
    if (bar.ts <= s.position.filledAt) continue;
    const exit = checkExit(s.position, bar, costs);
    if (exit) s = { ...s, status: 'closed', exit };
  }
  return s;
}

/** Level checks for placing an order (spec §6.1): SL and TP on the right sides of the entry. */
export function validLevels(side: Side, entry: string, sl: string, tp: string): boolean {
  const e = d(entry);
  return side === 'long' ? d(sl).lt(e) && d(tp).gt(e) : d(sl).gt(e) && d(tp).lt(e);
}
