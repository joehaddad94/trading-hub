import Link from 'next/link';
import { connection } from 'next/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { NewsHubCardSummary } from '@/modules/news/components/hub-card-summary';
import { getNewsHubSummary } from '@/modules/news/server/news';
import { TrackerHubCardSummary } from '@/modules/tracker/components/hub-card-summary';
import { getTrackerHubSummary } from '@/modules/tracker/server/hub';
import { ImportOnOpen } from '@/shell/import-on-open';
import { MODULES } from '@/shell/modules';
import { SyncBanner, SyncStatusLine } from '@/shell/sync-banner';

/** Tracker spec §8.0 hub. The Backtest summary arrives with M21. */
export default async function HubPage() {
  await connection();
  const now = new Date();
  const [tracker, news] = await Promise.all([getTrackerHubSummary(), getNewsHubSummary(now)]);
  return (
    <>
      <SyncBanner />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-8">
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
        <div className="grid gap-4 md:grid-cols-3">
          {MODULES.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle>{m.name}</CardTitle>
                <CardDescription>{m.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {m.id === 'tracker' && <TrackerHubCardSummary summary={tracker} />}
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
