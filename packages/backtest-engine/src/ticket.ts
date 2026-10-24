import Decimal from 'decimal.js';
import { defaultLevels, type Side } from './position';

/**
 * Order ticket maths (backtester spec §6.1): the Buy/Sell buttons open a ticket whose entry, stop and target
 * show on the chart as draggable lines before anything is sent. Prices are numbers (chart coordinates); money
 * goes through decimal.js (CLAUDE.md rule 5).
 */
export type TicketKind = 'market' | 'pending';

export type Ticket = {
  side: Side;
  kind: TicketKind;
  entry: number;
  sl: number;
  tp: number;
};

/** Default stop distance for a new ticket or position tool: 0.1% of price (≈46 points on US30). */
export const DEFAULT_STOP_SHARE = 0.001;

const roundTo = (n: number, digits: number) => new Decimal(String(n)).toDecimalPlaces(digits).toNumber();

/** The stop distance a new ticket starts with at `price`: 0.1% of it, on the instrument's tick, never 0. */
export function defaultStopPoints(price: number, priceDigits: number): number {
  const step = 10 ** -priceDigits;
  return Math.max(step, roundTo(Math.round((price * DEFAULT_STOP_SHARE) / step) * step, priceDigits));
}

/** A new market ticket at the last close: stop 0.1% away (or `stopPoints`), target at 1:2. */
export function newTicket(side: Side, price: number, priceDigits: number, stopPoints?: number): Ticket {
  const distance = stopPoints && stopPoints > 0 ? stopPoints : defaultStopPoints(price, priceDigits);
  const { stop, target } = defaultLevels(side, price, distance);
  return { side, kind: 'market', entry: price, sl: roundTo(stop, priceDigits), tp: roundTo(target, priceDigits) };
}

/**
 * A market ticket follows the price as replay moves: entry at the new close, stop and target keep their
 * distances. A pending ticket stays where it was put.
 */
export function followPrice(ticket: Ticket, price: number, priceDigits: number): Ticket {
  if (ticket.kind !== 'market' || price === ticket.entry) return ticket;
  const shift = new Decimal(String(price)).minus(String(ticket.entry));
  const move = (p: number) => roundTo(shift.plus(String(p)).toNumber(), priceDigits);
  return { ...ticket, entry: price, sl: move(ticket.sl), tp: move(ticket.tp) };
}

/** The other side with mirrored levels: same entry and distances. */
export function flipTicket(ticket: Ticket, priceDigits: number): Ticket {
  const e = new Decimal(String(ticket.entry));
  const mirror = (p: number) => roundTo(e.times(2).minus(String(p)).toNumber(), priceDigits);
  return { ...ticket, side: ticket.side === 'long' ? 'short' : 'long', sl: mirror(ticket.sl), tp: mirror(ticket.tp) };
}

/**
 * What a pending order at `entry` becomes against the current price (same rule as the server): a buy below the
 * price is a limit, above it a stop; a sell the other way round.
 */
export function pendingType(side: Side, entry: number | string, price: number | string): 'limit' | 'stop' {
  const below = new Decimal(String(entry)).lt(String(price));
  return side === 'long' ? (below ? 'limit' : 'stop') : below ? 'stop' : 'limit';
}

/** Stop and target on the right sides of the entry. */
export function ticketValid(ticket: Pick<Ticket, 'side' | 'entry' | 'sl' | 'tp'>): boolean {
  const sign = ticket.side === 'long' ? 1 : -1;
  return (ticket.entry - ticket.sl) * sign > 0 && (ticket.tp - ticket.entry) * sign > 0;
}

/**
 * Open profit at `price` before closing costs: (price − fill) × direction × lots × point value. An estimate:
 * the close itself happens on the server at the cursor bar's close, with costs.
 */
export function openPnl(
  order: { side: Side; fill: string; lots: string },
  price: number | string,
  pointValue: string,
): string {
  return new Decimal(String(price))
    .minus(order.fill)
    .times(order.side === 'long' ? 1 : -1)
    .times(order.lots)
    .times(pointValue)
    .toFixed(2);
}

/** `share` (0–1) of a position in lots, rounded down to 0.01 and never below 0.01 lots. */
export function partOf(lots: string, share: number): string {
  return Decimal.max(new Decimal(lots).times(share).toDecimalPlaces(2, Decimal.ROUND_DOWN), '0.01').toFixed(2);
}

/** "+$12.50" / "−$3.00": signed money for labels. */
export function signedUsd(amount: string): string {
  if (new Decimal(amount).isZero()) return '$0.00';
  return amount.startsWith('-') ? `−$${amount.slice(1)}` : `+$${amount}`;
}
