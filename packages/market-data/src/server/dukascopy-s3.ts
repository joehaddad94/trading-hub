/// <reference path="./lzma-purejs.d.ts" />
import { GetObjectCommand, ListObjectsV2Command, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import lzma from 'lzma-purejs';
import { parseMinuteCandles } from '../bi5';
import { daysBetween, formatUtcDay } from '../days';
import type { MarketDataProvider } from '../provider';
import { dukascopyProvider } from './dukascopy';

/** Dukascopy's Requester Pays archive: the old datafeed's layout, one LZMA 1m-candle file per symbol per UTC day. */
export const DUKASCOPY_BUCKET = 'cfg-public-proper-wallaby';
const REGION = 'eu-west-1';

/**
 * Integer price → real price. Index CFDs carry 3 decimals in Dukascopy's binary files.
 * Verified against the bucket with `pnpm candles:probe` before the first backfill.
 */
const PRICE_SCALE: Record<string, number> = { usa30idxusd: 1000, usatechidxusd: 1000 };

/** `USA30IDXUSD/2026/00/05/BID_candles_min_1.bi5`: months are zero-based, as in the old datafeed. */
export function dukascopyKey(providerCode: string, day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${providerCode.toUpperCase()}/${y}/${String(m - 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/BID_candles_min_1.bi5`;
}

let client: S3Client | null = null;
/** Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (the SDK's default chain). */
function s3() {
  client ??= new S3Client({ region: REGION });
  return client;
}

/** The raw, still-compressed day file, or null when Dukascopy has none (weekend, holiday). */
export async function fetchDayFile(providerCode: string, day: string): Promise<Uint8Array | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({
        Bucket: DUKASCOPY_BUCKET,
        Key: dukascopyKey(providerCode, day),
        RequestPayer: 'requester',
      }),
    );
    return res.Body ? await res.Body.transformToByteArray() : null;
  } catch (e) {
    if (e instanceof NoSuchKey) return null;
    throw e;
  }
}

/** Top-level symbol folders in the archive (for the probe script). */
export async function listDukascopySymbols(): Promise<string[]> {
  const res = await s3().send(
    new ListObjectsV2Command({ Bucket: DUKASCOPY_BUCKET, Delimiter: '/', RequestPayer: 'requester', MaxKeys: 1000 }),
  );
  return (res.CommonPrefixes ?? []).flatMap((p) => (p.Prefix ? [p.Prefix.replace(/\/$/, '')] : []));
}

export function decodeDayFile(providerCode: string, day: string, file: Uint8Array) {
  const scale = PRICE_SCALE[providerCode.toLowerCase()];
  if (!scale) throw new Error(`No price scale for ${providerCode}.`);
  const raw = file.byteLength === 0 ? new Uint8Array() : new Uint8Array(lzma.decompressFile(Buffer.from(file)));
  return parseMinuteCandles(raw, Date.parse(`${day}T00:00:00Z`), scale);
}

/** Same 1m bid candles as the free feed gave, read from the S3 archive. */
export const dukascopyS3Provider: MarketDataProvider = {
  name: 'dukascopy-s3',
  async fetchMinuteCandles(providerCode: string, from: Date, to: Date) {
    const candles = [];
    for (const day of daysBetween(formatUtcDay(from), formatUtcDay(new Date(to.getTime() - 1)))) {
      const file = await fetchDayFile(providerCode, day);
      if (file) candles.push(...decodeDayFile(providerCode, day, file));
    }
    return candles.filter((c) => c.timestamp >= from.getTime() && c.timestamp < to.getTime());
  },
};

/** S3 once AWS credentials are configured; the free feed otherwise (it now refuses bulk downloads). */
export function candleProvider(env: Record<string, string | undefined> = process.env): MarketDataProvider {
  return env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? dukascopyS3Provider : dukascopyProvider;
}
