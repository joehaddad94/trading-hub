const KEY = 'backtest.lastStart';

/** Where the last replay started (UTC ms), so the start panel opens on it. Per browser; null in private mode. */
export function readLastStart(): number | null {
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastStart(at: number): void {
  try {
    window.localStorage.setItem(KEY, String(at));
  } catch {
    // Private mode: the panel opens on the replay cursor instead.
  }
}
