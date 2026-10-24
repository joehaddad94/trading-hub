import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBarsCache, fetchBars, getJson, OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from './loader';

/** A fetch that never answers, like a request lost on a weak connection; it only ends when aborted. */
function stalled(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  clearBarsCache();
});

describe('candle requests', () => {
  it('gives up on a request that never answers instead of loading forever', async () => {
    vi.stubGlobal('fetch', vi.fn(stalled));
    await expect(getJson('/api/backtest/candles', null, 20)).rejects.toThrow(TIMEOUT_MESSAGE);
  });

  it('says the server could not be reached on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getJson('/api/backtest/candles')).rejects.toThrow(OFFLINE_MESSAGE);
  });

  it('names the status when the reply is not the route JSON (a gateway error page)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>timeout</html>', { status: 504 })));
    await expect(getJson('/api/backtest/candles')).rejects.toThrow(/answered 504/);
  });

  it("passes the caller's own abort through untouched", async () => {
    vi.stubGlobal('fetch', vi.fn(stalled));
    const controller = new AbortController();
    const page = getJson('/api/backtest/candles', controller.signal);
    controller.abort();
    await expect(page).rejects.toThrow('aborted');
  });

  it('returns the data and passes route errors on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ ts: null })));
    await expect(getJson('/x')).resolves.toEqual({ ts: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Unknown instrument.' }))),
    );
    await expect(getJson('/x')).rejects.toThrow('Unknown instrument.');
  });

  it('does not keep a failed page in the cache, so picking the same date again asks again', async () => {
    const params = { instrument: 'US30', tf: 5 as const, until: new Date('2026-10-06T14:00:00Z'), count: 500 };
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetch.mockResolvedValue(ok({ bars: [], hasMore: false }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchBars(params, null, 0)).rejects.toThrow(OFFLINE_MESSAGE);
    await expect(fetchBars(params, null, 0)).resolves.toEqual({ bars: [], hasMore: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
