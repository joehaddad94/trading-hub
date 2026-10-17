/// <reference path="./lzma.d.ts" />
import { AwsClient } from 'aws4fetch';
import lzma from 'lzma';
import { bi5DayKey, parseBi5MinuteCandles } from '../bi5';
import type { RawCandle } from '../candles';
import { checkS3Credentials, type S3Credentials } from '../credentials';
import type { MarketDataProvider } from '../provider';

const BUCKET_URL = 'https://cfg-public-proper-wallaby.s3.eu-west-1.amazonaws.com';
const DAY_MS = 86_400_000;

export type { S3Credentials };

/**
 * Dukascopy's historical data in their "Requester Pays" S3 bucket (eu-west-1): the same 1m bid candles the free
 * datafeed served before it started refusing bulk downloads (Oct 2026). The AWS account behind the keys pays the
 * (tiny) transfer cost. A day not published yet is a 404 and fails the run, so the next run retries it.
 */
export function createDukascopyS3Provider(raw: S3Credentials): MarketDataProvider {
  const checked = checkS3Credentials(raw);
  if (!checked.ok) {
    // Each run fails with a readable message (shown in the Backtest Lab banner) until the key is fixed.
    const { error } = checked;
    return {
      name: 'dukascopy',
      async fetchMinuteCandles() {
        throw new Error(error);
      },
    };
  }
  const aws = new AwsClient({ ...checked.credentials, region: 'eu-west-1', service: 's3' });
  return {
    name: 'dukascopy',
    async fetchMinuteCandles(providerCode, from, to) {
      const rows: RawCandle[] = [];
      for (let day = Math.floor(from.getTime() / DAY_MS) * DAY_MS; day < to.getTime(); day += DAY_MS) {
        const key = bi5DayKey(providerCode, new Date(day));
        const res = await aws.fetch(`${BUCKET_URL}/${key}`, { headers: { 'x-amz-request-payer': 'requester' } });
        if (!res.ok) throw new Error(`Dukascopy S3 ${res.status} for ${key}`);
        const compressed = new Uint8Array(await res.arrayBuffer());
        rows.push(...parseBi5MinuteCandles(decompress(compressed), day));
      }
      return rows.filter((r) => r.timestamp >= from.getTime() && r.timestamp < to.getTime());
    },
  };
}

function decompress(compressed: Uint8Array): Uint8Array {
  if (compressed.length === 0) return compressed;
  // LZMA-JS returns a string when the output happens to be valid UTF-8 (only possible for an empty file here).
  const out = lzma.decompress(compressed);
  // Otherwise it returns signed bytes (-128..127).
  return typeof out === 'string' ? new TextEncoder().encode(out) : Uint8Array.from(out, (b: number) => b & 0xff);
}
