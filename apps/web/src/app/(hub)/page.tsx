import Decimal from 'decimal.js';
import Link from 'next/link';
import { connection } from 'next/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { NewsHubCardSummary } from '@/modules/news/components/hub-card-summary';
import { getNewsHubSummary } from '@/modules/news/server/news';
import { TrackerHubCardSummary } from '@/modules/tracker/components/hub-card-summary';
import { getAccountDetail } from '@/modules/tracker/server/accounts';
import { getTrackerHubSummary } from '@/modules/tracker/server/hub';
import { ImportOnOpen } from '@/shell/import-on-open';
import { MODULES } from '@/shell/modules';
import { SyncBanner, SyncStatusLine } from '@/shell/sync-banner';

/** Tracker spec §8.0 hub. The Backtest summary arrives with M21. */
export default async function HubPage() {
  await connection();
  const now = new Date();
  const [tracker, news] = await Promise.all([getTrackerHubSummary(), getNewsHubSummary(now)]);
  // Max-loss room for the main active account (live before demo), from the account page's rule usage (U7).
  const active = tracker?.activeAccounts[0];
  const detail = active ? await getAccountDetail(active.login) : null;
  const usage = detail?.rules?.usage;
  const maxLoss =
    detail && usage?.distanceToMaxLoss && usage.maxLossFloor
      ? {
          room: usage.distanceToMaxLoss.toFixed(2),
          limit: new Decimal(detail.startingBalance).minus(usage.maxLossFloor).toFixed(2),
        }
      : null;
  return (
    <>
      <SyncBanner />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
        <ImportOnOpen />
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Trading Hub</h1>
            <SyncStatusLine />
          </div>
          <Link href="/settings" className="text-muted-foreground text-sm hover:text-foreground">
            Settings
          </Link>
        </header>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <Card key={m.id} className={m.id === 'tracker' ? 'md:col-span-2' : undefined}>
              <CardHeader>
                <CardTitle>{m.name}</CardTitle>
                <CardDescription>{m.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {m.id === 'tracker' && <TrackerHubCardSummary summary={tracker} maxLoss={maxLoss} />}
                {m.id === 'news' && <NewsHubCardSummary summary={news} now={now} />}
                {m.id === 'backtest' && (
                  <>
                    <span>No sessions yet.</span> <span className="md:hidden">Best on desktop.</span>
                  </>
                )}
              </CardContent>
              <CardFooter className="mt-auto">
                <Button asChild className="w-full">
                  <Link href={m.href}>Open {m.name}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
