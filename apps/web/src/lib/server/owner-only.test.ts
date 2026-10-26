import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(import.meta.dirname, '../../app');
/** Server Actions invited users may call: the Backtest Lab's own (scoped to them) and sign-in. */
const OPEN_TO_GUESTS = ['(backtest)/', '(auth)/'];

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return actionFiles(path);
    return name.endsWith('.ts') && readFileSync(path, 'utf8').startsWith("'use server'") ? [path] : [];
  });
}

describe('owner-only Server Actions', () => {
  // A Server Action can be posted from any page, so the proxy's page rules don't cover it: each one checks.
  const files = actionFiles(APP).filter((f) => !OPEN_TO_GUESTS.some((p) => relative(APP, f).startsWith(p)));

  it('finds the Tracker, News and Settings actions', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of files) {
    it(`${relative(APP, file)}: every exported action starts with ownerOnly()`, () => {
      const source = readFileSync(file, 'utf8');
      const bodies = source.split(/^export async function /m).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const start = body.slice(body.indexOf('{\n') + 2).trimStart();
        expect(start.startsWith('const denied = await ownerOnly();'), body.split('(')[0]).toBe(true);
      }
      expect(source).not.toMatch(/^export (const|function) /m);
    });
  }
});
