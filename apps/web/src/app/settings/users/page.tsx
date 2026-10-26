import { MAX_BACKTEST_USERS } from '@trading/backtest/server';
import { connection } from 'next/server';
import { ActionForm } from '@/components/action-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatBeirut } from '@/lib/format';
import { getBacktestUsers } from '@/modules/backtest/server/users';
import { addUserAction, removeUserAction } from './actions';
import { RemoveUser } from './remove-user';

export const metadata = { title: 'Users · Settings' };

/** Owner only (proxy + actions): the emails that may use the Backtest Lab, and nothing else. */
export default async function UsersPage() {
  await connection();
  const users = await getBacktestUsers();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Users</h2>
      <Card>
        <CardHeader>
          <CardTitle>Backtest Lab access</CardTitle>
          <CardDescription>
            People on this list sign in with their email alone, with no link or password, and see only the Backtest Lab.
            Their runs and drawings are private to them. Anyone who knows a listed email can sign in as that person.
            Removing someone cuts access at once and keeps their runs. Up to {MAX_BACKTEST_USERS} people.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {users === null ? (
            <p className="text-muted-foreground text-sm">The database is not configured yet.</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody else yet.</p>
          ) : (
            <ul className="flex flex-col divide-y" aria-label="Backtest Lab users">
              {users.map((u) => (
                <li key={u.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{u.email}</span>
                    <span className="text-muted-foreground text-xs">
                      {u.lastSignInAt ? `Last signed in ${formatBeirut(u.lastSignInAt)}` : 'Not signed in yet'}
                    </span>
                  </div>
                  <RemoveUser email={u.email} action={removeUserAction} />
                </li>
              ))}
            </ul>
          )}
          {users !== null && users.length < MAX_BACKTEST_USERS && (
            <ActionForm action={addUserAction} submit="Add" label="Add a user" className="gap-2">
              <Input name="email" type="email" aria-label="Email to add" placeholder="name@example.com" required />
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
