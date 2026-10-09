import { describe, expect, it } from 'vitest';
import { journalSchema, stopSideError } from './schema';

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
