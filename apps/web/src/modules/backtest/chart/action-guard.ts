import { unstable_isUnrecognizedActionError } from 'next/navigation';

/** Shown when this tab's code is older than the deployed app: its Server Actions no longer exist. */
export const APP_UPDATED = 'The app was updated. Reload the page to keep trading.';
export const NO_CONNECTION = 'Could not reach the server. Check your connection and try again.';

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Wraps Server Actions so a call that throws (a tab left open across a deploy, a dropped connection) returns
 * `{ ok: false, error }` like any refusal, instead of a rejected promise that makes a button do nothing
 * (Joe, 3 Nov 2026: "I click the button, nothing happens"; the console showed UnrecognizedActionError).
 */
export function guardActions<T extends object>(actions: T, onStale: () => void): T {
  const guarded: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(actions)) {
    guarded[name] =
      typeof fn === 'function'
        ? async (...args: unknown[]): Promise<Result> => {
            try {
              return await (fn as (...a: unknown[]) => Promise<Result>)(...args);
            } catch (error) {
              if (isStaleAction(error)) {
                onStale();
                return { ok: false, error: APP_UPDATED };
              }
              return { ok: false, error: NO_CONNECTION };
            }
          }
        : fn;
  }
  return guarded as T;
}

/** Next.js's "Server Action … was not found on the server" (the page's code is from an older deploy). */
export function isStaleAction(error: unknown): boolean {
  if (unstable_isUnrecognizedActionError(error)) return true;
  return error instanceof Error && /Server Action .* was not found on the server/.test(error.message);
}
