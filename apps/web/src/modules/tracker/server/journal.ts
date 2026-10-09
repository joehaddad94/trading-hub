import 'server-only';
import { refreshTradeRisk } from '@trading/importer/server';
import {
  addScreenshot,
  createTag,
  dailyNotesBetween,
  deleteTag,
  type JournalInput,
  journalQueue,
  listTags,
  nextUnjournaled,
  type ResolvedScope,
  removeScreenshot,
  renameTag,
  saveJournal,
  type TagKind,
  tradeJournal,
  unjournaledCount,
} from '@trading/tracker/server';
import { connection } from 'next/server';
import { getDb } from '@/lib/server/db';
import { stopSideError } from '../journal/schema';
import {
  createScreenshotUpload,
  deleteScreenshotFile,
  screenshotExists,
  screenshotsEnabled,
  signedScreenshotUrls,
} from './storage';

/** A problem the user can fix; its message is shown on the form. */
export class JournalError extends Error {}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('The database is not configured.');
  return db;
}

/** Trade detail page data: trade, journal, tags, screenshot URLs. Null when the trade doesn't exist. */
export async function getTradeJournal(tradeId: string) {
  await connection();
  const db = getDb();
  if (!db) return null;
  const detail = await tradeJournal(db, tradeId);
  if (!detail) return null;
  const urls = await signedScreenshotUrls(detail.screenshots.map((s) => s.storagePath));
  return {
    ...detail,
    screenshots: detail.screenshots.map((s) => ({ ...s, url: urls.get(s.storagePath) ?? null })),
    tags: await listTags(db),
    screenshotsEnabled: screenshotsEnabled(),
  };
}

/** Saves the entry, then re-resolves risk so a journaled initial SL replaces the estimate (§6). */
export async function writeTradeJournal(tradeId: string, input: JournalInput) {
  const db = requireDb();
  await db.transaction(async (tx) => {
    const detail = await tradeJournal(tx, tradeId);
    if (!detail) throw new JournalError('Trade not found.');
    const slError = stopSideError(detail.trade.side, detail.trade.openPrice, input.initialSl);
    if (slError) throw new JournalError(slError);
    // Mistakes are stored by name; new ones typed on the form become mistake tags for next time.
    const existing = new Set((await listTags(tx)).filter((t) => t.kind === 'mistake').map((t) => t.name));
    for (const name of new Set(input.mistakes)) if (!existing.has(name)) await createTag(tx, name, 'mistake');
    await saveJournal(tx, tradeId, input);
    await refreshTradeRisk(tx, [detail.account.id]);
  });
}

export async function getNextUnjournaled(tradeId: string) {
  const db = requireDb();
  const detail = await tradeJournal(db, tradeId);
  return detail ? nextUnjournaled(db, { id: tradeId, closedAt: detail.trade.closedAt }) : null;
}

export async function getJournalQueue(scope: ResolvedScope) {
  const db = getDb();
  return db ? journalQueue(db, scope) : null;
}

export async function getUnjournaledCount() {
  await connection();
  const db = getDb();
  return db ? unjournaledCount(db) : 0;
}

export async function getDailyNotes(from: string, to: string) {
  const db = getDb();
  return db ? dailyNotesBetween(db, from, to) : [];
}

export async function getTags() {
  await connection();
  const db = getDb();
  return db ? listTags(db) : [];
}

export async function writeTag(name: string, kind: TagKind) {
  return createTag(requireDb(), name, kind);
}

export async function writeTagName(id: string, name: string) {
  await renameTag(requireDb(), id, name);
}

export async function removeTag(id: string) {
  await deleteTag(requireDb(), id);
}

/** Step 1 of a screenshot upload: a fresh path under the trade and a signed upload token for it. */
export async function startScreenshotUpload(tradeId: string, ext: string) {
  if (!(await tradeJournal(requireDb(), tradeId))) throw new JournalError('Trade not found.');
  return createScreenshotUpload(`${tradeId}/${crypto.randomUUID()}.${ext}`);
}

/** Step 2: the file is in the bucket; record it on the trade. */
export async function finishScreenshotUpload(tradeId: string, path: string, caption: string | null) {
  if (!path.startsWith(`${tradeId}/`)) throw new JournalError('That upload belongs to another trade.');
  if (!(await screenshotExists(path))) throw new JournalError('The upload did not finish; try again.');
  await addScreenshot(requireDb(), tradeId, path, caption);
}

export async function detachScreenshot(id: string) {
  const path = await removeScreenshot(requireDb(), id);
  if (path) await deleteScreenshotFile(path);
}
