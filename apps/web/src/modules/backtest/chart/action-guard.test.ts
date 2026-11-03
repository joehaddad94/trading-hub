import { describe, expect, it, vi } from 'vitest';
import { APP_UPDATED, guardActions, NO_CONNECTION } from './action-guard';

describe('server action guard', () => {
  it('turns a missing action (tab older than the deploy) into a reload message', async () => {
    const onStale = vi.fn();
    const actions = guardActions(
      {
        place: async () => {
          throw new Error('Server Action "6070" was not found on the server.');
        },
      },
      onStale,
    );
    await expect(actions.place()).resolves.toEqual({ ok: false, error: APP_UPDATED });
    expect(onStale).toHaveBeenCalledOnce();
  });

  it('a dropped connection is an error, results pass through', async () => {
    const onStale = vi.fn();
    const actions = guardActions(
      {
        fail: async () => {
          throw new TypeError('Failed to fetch');
        },
        ok: async () => ({ ok: true as const, data: 1 }),
      },
      onStale,
    );
    await expect(actions.fail()).resolves.toEqual({ ok: false, error: NO_CONNECTION });
    await expect(actions.ok()).resolves.toEqual({ ok: true, data: 1 });
    expect(onStale).not.toHaveBeenCalled();
  });
});
