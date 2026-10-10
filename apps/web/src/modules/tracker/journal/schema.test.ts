import { describe, expect, it } from 'vitest';
import { journalSchema, riskTagSchema, stopSideError } from './schema';

const base = {
  tradeId: '7b0c1a52-7a0e-4c1e-9b7a-0d8c7a6f1e21',
  setupTagId: '',
  followedPlan: '' as const,
  initialSl: '',
  plannedRr: '',
  plannedRiskUsd: '',
  emotionBefore: '',
  emotionAfter: '',
  mistakes: [],
  contextTagIds: [],
  notes: '',
  rating: '',
};

describe('journalSchema', () => {
  it('turns blanks into nulls and keeps money as strings', () => {
    const v = journalSchema.parse({ ...base, plannedRiskUsd: ' 125.50 ', followedPlan: 'no', rating: '4' });
    expect(v).toMatchObject({
      setupTagId: null,
      followedPlan: false,
      initialSl: null,
      plannedRiskUsd: '125.50',
      notes: null,
      rating: 4,
      next: false,
    });
  });

  it('rejects bad numbers and ratings', () => {
    expect(journalSchema.safeParse({ ...base, initialSl: '-5' }).success).toBe(false);
    expect(journalSchema.safeParse({ ...base, plannedRr: 'abc' }).success).toBe(false);
    expect(journalSchema.safeParse({ ...base, rating: '6' }).success).toBe(false);
  });
});

describe('stopSideError', () => {
  it('wants the stop below a buy and above a sell', () => {
    expect(stopSideError('buy', '100.5', '99')).toBeNull();
    expect(stopSideError('buy', '100.5', '100.5')).toMatch(/below/);
    expect(stopSideError('sell', '100.5', '101')).toBeNull();
    expect(stopSideError('sell', '100.5', '100')).toMatch(/above/);
    expect(stopSideError('sell', '100.5', null)).toBeNull();
  });
});

describe('riskTagSchema', () => {
  const tradeId = '00000000-0000-4000-8000-000000000001';
  it('accepts a % up to 10 and null to clear', () => {
    expect(riskTagSchema.parse({ tradeId, pct: '0.5' }).pct).toBe('0.5');
    expect(riskTagSchema.parse({ tradeId, pct: ' 1 ' }).pct).toBe('1');
    expect(riskTagSchema.parse({ tradeId, pct: null }).pct).toBeNull();
  });
  it('rejects zero, too much, too many decimals and text', () => {
    for (const pct of ['0', '12', '0.555', 'abc', '-1']) {
      expect(riskTagSchema.safeParse({ tradeId, pct }).success).toBe(false);
    }
  });
});
