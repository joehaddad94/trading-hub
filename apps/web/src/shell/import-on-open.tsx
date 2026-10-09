import { after, connection } from 'next/server';
import { maybeImport } from '@/lib/server/imports';

/** Renders nothing; schedules a throttled inbox import after the page is sent. */
export async function ImportOnOpen() {
  await connection();
  after(() => maybeImport());
  return null;
}
