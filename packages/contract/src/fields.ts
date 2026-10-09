import Decimal from 'decimal.js';

/** Number or numeric string → canonical decimal string. Never goes through a JS float sum. */
export function toDecimalString(value: number | string): string {
  return new Decimal(value).toFixed();
}

const OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const SERVER_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * FundedNext time strings are server time (tracker spec §4: UTC+03:00, from the file's
 * `firm_server_time_offset`). Their unix fields are 3 h off and must not be used.
 */
export function parseServerTime(value: string, offset: string): Date {
  const t = SERVER_TIME.exec(value);
  const o = OFFSET.exec(offset);
  if (!t) throw new Error(`Invalid server time: ${value}`);
  if (!o) throw new Error(`Invalid server time offset: ${offset}`);
  const [, y, mo, d, h, mi, s] = t.map(Number) as [number, number, number, number, number, number, number];
  const sign = o[1] === '-' ? -1 : 1;
  const offsetMinutes = sign * (Number(o[2]) * 60 + Number(o[3]));
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offsetMinutes * 60_000);
}

/** "1:1.03" → "1.03"; null/empty/unparseable → null. Meaning unconfirmed: "firm-reported RR". */
export function parseRr(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^\s*1\s*:\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  return m?.[1] ? toDecimalString(m[1]) : null;
}

/** `type`: 0 = Buy, 1 = Sell. */
export function parseSide(type: 0 | 1): 'buy' | 'sell' {
  return type === 0 ? 'buy' : 'sell';
}

/** SL/TP of 0 means "not set". */
export function priceOrNull(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = new Decimal(value);
  return d.isZero() ? null : d.toFixed();
}
