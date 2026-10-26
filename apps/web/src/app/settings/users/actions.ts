'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { ownerOnly } from '@/lib/server/viewer';
import { inviteBacktestUser, revokeBacktestUser } from '@/modules/backtest/server/users';

const email = z.object({ email: z.email('Enter a valid email.') });

type Result = ActionResult<string>;

/** Lets an email into the Backtest Lab (no email is sent; Joe shares the link). */
export async function addUserAction(_prev: Result | null, form: FormData): Promise<Result> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = email.safeParse({ email: String(form.get('email') ?? '').trim() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' };
  const result = await inviteBacktestUser(parsed.data.email);
  revalidatePath('/settings/users');
  return result;
}

/** Cuts access from the next request; their runs stay. */
export async function removeUserAction(_prev: Result | null, form: FormData): Promise<Result> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = email.safeParse({ email: form.get('email') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' };
  const result = await revokeBacktestUser(parsed.data.email);
  revalidatePath('/settings/users');
  return result;
}
