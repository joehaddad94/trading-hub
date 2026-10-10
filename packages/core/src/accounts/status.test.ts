import { describe, expect, it } from 'vitest';
import { mapAccountStatus, phaseFromPlanType } from './status';

describe('mapAccountStatus', () => {
  it.each([
    [{ bucket: 'active', breached: false, breachedBy: null }, 'active'],
    [{ bucket: 'active', breached: 0, breachedBy: null }, 'active'],
    [{ bucket: 'inactive', breachedBy: 'Profit Target Reached' }, 'passed'],
    [{ bucket: 'breached', breachedBy: 'Daily Loss Limit' }, 'breached'],
    [{ bucket: 'inactive', breachedBy: 'Account Merged into 7002880' }, 'merged'],
    [{ bucket: 'inactive', breachedBy: 'Paused by user' }, 'paused'],
    [{ bucket: 'active', breached: 1, breachedBy: 'Paused' }, 'paused'],
    [{ bucket: 'inactive', breachedBy: 'Something new' }, 'closed_other'],
    [{ bucket: 'inactive', breachedBy: null }, 'closed_other'],
  ] as const)('%o → %s', (state, status) => {
    expect(mapAccountStatus(state).status).toBe(status);
  });

  it('keeps the firm reason verbatim', () => {
    expect(mapAccountStatus({ bucket: 'breached', breachedBy: ' Max Loss Limit ' }).reason).toBe('Max Loss Limit');
    expect(mapAccountStatus({ bucket: 'active' }).reason).toBeNull();
  });
});

describe('phaseFromPlanType', () => {
  it.each([
    ['Evaluation P1', { phase: 'p1', isDemo: true }],
    ['Evaluation P2', { phase: 'p2', isDemo: true }],
    ['Evaluation Real', { phase: 'funded', isDemo: false }],
    ['Instant Funding', { phase: 'instant', isDemo: false }],
    ['Free Trial', { phase: 'other', isDemo: true }],
    [null, { phase: 'other', isDemo: true }],
  ] as const)('%s', (type, expected) => {
    expect(phaseFromPlanType(type)).toEqual(expected);
  });
});
