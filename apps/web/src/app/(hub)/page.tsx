import { TZDate } from '@date-fns/tz';
import Decimal from 'decimal.js';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { DISPLAY_TZ } from '@/lib/format';
import { getSessionsPage } from '@/modules/backtest/server/sessions';
import { NewsHubCardSummary } from '@/modules/news/components/hub-card-summary';
import { getNewsHubSummary } from '@/modules/news/server/news';
import { RecentTradesCard, TrackerHubHero, TrackerHubTileBody } from '@/modules/tracker/components/hub-card-summary';
import { getAccountDetail } from '@/modules/tracker/server/accounts';
import { getTrackerHubSummary } from '@/modules/tracker/server/hub';
import { AccountActions } from '@/shell/app-nav';
import { HubTile } from '@/shell/hub-tile';
import { MODULES, type ModuleId } from '@/shell/modules';
import { SyncStatusLine } from '@/shell/sync-banner';

function greeting(now: Date) {
  const hour = new TZDate(now, DISPLAY_TZ).getHours();
  return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Tracker spec §8.0 hub, redesigned (design spec): today's P&L hero, module tiles, recent trades. Every module starts here. */
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
  // One summary per registered module (shell/modules.ts); a new module without one fails the typecheck.
  const summaries: Record<ModuleId, ReactNode> = {
    tracker: <TrackerHubTileBody summary={tracker} />,
    news: <NewsHubCardSummary summary={news} now={now} />,
    backtest: (
      <>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground">No runs yet. Replay US30 or NAS100 bar by bar.</p>
        ) : (
          <p>
            <span className="num block font-semibold text-4xl">{sessions.length}</span>
            <span className="text-muted-foreground">{sessions.length === 1 ? 'run' : 'runs'}</span>
          </p>
        )}
        <p className="mt-2 text-muted-foreground text-xs">Includes Live vs backtest.</p>
      </>
    ),
  };
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:gap-6 md:p-8">
      {/* The hub is the only way between modules (Joe, 4 Nov 2026), so Settings, theme and Log out live here. */}
      <header className="rise flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground text-sm">{greeting(now)}, Joe</p>
          <h1 className="font-semibold text-3xl tracking-tight">Trading Hub</h1>
          <SyncStatusLine />
        </div>
        <AccountActions className="-mr-2" />
      </header>
      <TrackerHubHero summary={tracker} maxLoss={maxLoss} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m, i) => {
          const Icon = m.icon;
          return (
            <HubTile
              key={m.id}
              title={m.name}
              icon={<Icon className="size-4 text-primary" aria-hidden />}
              href={m.href}
              linkLabel={`Open ${m.name}`}
              index={i + 1}
            >
              {summaries[m.id]}
            </HubTile>
          );
        })}
      </div>
      <RecentTradesCard summary={tracker} />
    </main>
  );
}
