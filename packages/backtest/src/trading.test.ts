import { describe, expect, it } from 'vitest';
import { modifyOrderSchema, placeOrderSchema, sessionInputSchema } from './trading';

const session = {
  name: ' London ORB ',
  startingBalance: '50000',
  riskPct: '0.75',
  costs: { US30: { spreadPoints: '2', commissionPerLot: '', slippagePoints: 0.5 } },
  setupTagId: null,
  notes: null,
};

describe('session input', () => {
  it('trims, keeps money as strings and blanks costs to 0', () => {
    expect(sessionInputSchema.parse(session)).toEqual({
      ...session,
      name: 'London ORB',
      costs: { US30: { spreadPoints: '2', commissionPerLot: '0', slippagePoints: '0.5' } },
    });
  });

  it('rejects a bad balance, risk outside 0.01–10%, a bad instrument code and negative costs', () => {
    expect(sessionInputSchema.safeParse({ ...session, startingBalance: '-5' }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ ...session, startingBalance: '1.234' }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ ...session, riskPct: '12' }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ ...session, riskPct: '0' }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ ...session, name: '  ' }).success).toBe(false);
    expect(
      sessionInputSchema.safeParse({
        ...session,
        costs: { us30: { spreadPoints: '1', commissionPerLot: '0', slippagePoints: '0' } },
      }).success,
    ).toBe(false);
    expect(
      sessionInputSchema.safeParse({
        ...session,
        costs: { US30: { spreadPoints: '-1', commissionPerLot: '0', slippagePoints: '0' } },
      }).success,
    ).toBe(false);
  });
});

describe('order input', () => {
  const order = { instrument: 'US30', side: 'long', kind: 'market', entry: '100', sl: 90, tp: '120', lots: '0.5' };

  it('takes the cursor as epoch ms or ISO and prices as strings', () => {
    const parsed = placeOrderSchema.parse({ ...order, at: '2026-10-07T14:00:00Z' });
    expect(parsed.at.toISOString()).toBe('2026-10-07T14:00:00.000Z');
    expect(parsed.sl).toBe('90');
    expect(modifyOrderSchema.parse({ sl: '91', tp: '121', at: 0 }).at.getTime()).toBe(0);
  });

  it('rejects bad times, prices and lots', () => {
    expect(placeOrderSchema.safeParse({ ...order, at: 'soon' }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...order, at: 0, entry: '-1' }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...order, at: 0, lots: '0' }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...order, at: 0, lots: '0.123' }).success).toBe(false);
  });
});
