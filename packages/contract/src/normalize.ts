import Decimal from 'decimal.js';
import { parseRr, parseServerTime, parseSide, priceOrNull, toDecimalString } from './fields';
import type { ExportTrade } from './schema';

export type NormalizedTrade = {
  ticket: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  volume: number | null;
  openPrice: string;
  closePrice: string;
  openedAt: Date;
  closedAt: Date;
  slFinal: string | null;
  tpFinal: string | null;
  profit: string;
  commission: string;
  swap: string;
  /** profit + commission + swap (tracker spec §6). */
  netProfit: string;
  firmRrRaw: string | null;
  firmRr: string | null;
  isNews: boolean | null;
  reasonCode: number | null;
  raw: ExportTrade;
};

export function normalizeTrade(trade: ExportTrade, serverOffset: string): NormalizedTrade {
  const profit = toDecimalString(trade.profit);
  const commission = toDecimalString(trade.commission);
  const swap = toDecimalString(trade.swap);
  return {
    ticket: trade.ticket,
    symbol: trade.symbol,
    side: parseSide(trade.type),
    lots: toDecimalString(trade.lots),
    volume: trade.volume ?? null,
    openPrice: toDecimalString(trade.open_price),
    closePrice: toDecimalString(trade.close_price),
    openedAt: parseServerTime(trade.open_time_str, serverOffset),
    closedAt: parseServerTime(trade.close_time_str, serverOffset),
    slFinal: priceOrNull(trade.sl),
    tpFinal: priceOrNull(trade.tp),
    profit,
    commission,
    swap,
    netProfit: new Decimal(profit).plus(commission).plus(swap).toFixed(),
    firmRrRaw: trade.rr_ratio ?? null,
    firmRr: parseRr(trade.rr_ratio),
    isNews: trade.is_news === null || trade.is_news === undefined ? null : Boolean(trade.is_news),
    reasonCode: trade.reason ?? null,
    raw: trade,
  };
}
