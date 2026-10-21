import { TZDate } from '@date-fns/tz';
import Decimal from 'decimal.js';
import { FlaskConical, Newspaper } from 'lucide-react';
import { connection } from 'next/server';
import { DISPLAY_TZ } from '@/lib/format';
import { getSessionsPage } from '@/modules/backtest/server/sessions';
import { NewsHubCardSummary } from '@/modules/news/components/hub-card-summary';
import { getNewsHubSummary } from '@/modules/news/server/news';
import {
  JournalHubTile,
  RecentTradesCard,
  TrackerHubHero,
  TrackerHubTile,
} from '@/modules/tracker/components/hub-card-summary';
import { getAccountDetail } from '@/modules/tracker/server/accounts';
import { getTrackerHubSummary } from '@/modules/tracker/server/hub';
import { HubTile } from '@/shell/hub-tile';
import { SyncStatusLine } from '@/shell/sync-banner';

function greeting(now: Date) {
  const hour = new TZDate(now, DISPLAY_TZ).getHours();
  return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Tracker spec §8.0 hub, redesigned (design spec): today's P&L hero, module tiles, recent trades. */
export default async function HubPage() {
  await connection();
  const now = new Date();
  const [tracker, news, backtest] = await Promise.all([
    getTrackerHubSummary(),
    getNewsHubSummary(now),
    getSessionsPage().catch(() => null),
  ]);
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
  const sessions = backtest?.sessions ?? [];
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:gap-6 md:p-8">
      <header className="rise flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{greeting(now)}, Joe</p>
        <h1 className="font-semibold text-3xl tracking-tight">Trading Hub</h1>
        <SyncStatusLine />
      </header>
      <TrackerHubHero summary={tracker} maxLoss={maxLoss} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrackerHubTile summary={tracker} />
        <JournalHubTile summary={tracker} />
        <HubTile
          title="News"
          icon={<Newspaper className="size-4 text-primary" aria-hidden />}
          href="/news"
          linkLabel="Open News"
          index={3}
        >
          <NewsHubCardSummary summary={news} now={now} />
        </HubTile>
        <HubTile
          title="Backtest Lab"
          icon={<FlaskConical className="size-4 text-primary" aria-hidden />}
          href="/backtest"
          linkLabel="Open Backtest Lab"
          index={4}
        >
          {sessions.length === 0 ? (
            <p className="text-muted-foreground">No runs yet. Replay US30 or NAS100 bar by bar.</p>
          ) : (
            <p>
              <span className="num block font-semibold text-4xl">{sessions.length}</span>
              <span className="text-muted-foreground">{sessions.length === 1 ? 'run' : 'runs'}</span>
            </p>
          )}
          <p className="mt-2 text-muted-foreground text-xs md:hidden">Best on desktop.</p>
        </HubTile>
      </div>
      <RecentTradesCard summary={tracker} />
    </main>
  );
}
