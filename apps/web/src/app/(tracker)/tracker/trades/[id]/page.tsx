import { rMultiple, SESSION_LABELS, sessionOf } from '@trading/core';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { formatBeirut, formatMoney } from '@/lib/format';
import { formatPrice } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import { formatHold, formatR } from '@/modules/tracker/calendar/format';
import { StatusBadge } from '@/modules/tracker/components/account-badge';
import { TradeNewsSection } from '@/modules/tracker/components/trade-news';
import { JournalForm } from '@/modules/tracker/journal/journal-form';
import { Screenshots } from '@/modules/tracker/journal/screenshots';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getTradeJournal } from '@/modules/tracker/server/journal';
import { getTradeNews } from '@/modules/tracker/server/news';
import {
  deleteScreenshotAction,
  finishScreenshotUploadAction,
  saveJournalAction,
  startScreenshotUploadAction,
} from './actions';

const RISK_SOURCES: Record<string, string> = {
  full_stop_loss: 'full stop loss',
  journal_sl: 'journaled stop loss',
  journal_usd: 'planned or tagged risk',
  estimated: 'estimated',
};

/** `51887.75000` → `51887.75` for form fields (numeric columns come back zero-padded). */
const plain = (v: string | null | undefined) => (v ? new Decimal(v).toString() : '');

export const metadata = { title: 'Trade · Tracker' };

/** Trade detail + journal (§8.3 screen 6). Mobile-first: facts on top, the form below with a sticky save bar. */
export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, news] = await Promise.all([getTradeJournal(id), getTradeNews(id)]);
  if (!data) notFound();
  const { trade: t, account, entry } = data;
  const net = new Decimal(t.netProfit);
  const r = rMultiple(t.netProfit, t.riskUsd);
  const facts: [string, string][] = [
    ['Opened', formatBeirut(t.openedAt, 'd MMM yyyy HH:mm')],
    ['Closed', formatBeirut(t.closedAt, 'd MMM yyyy HH:mm')],
    ['Hold', formatHold(t.closedAt.getTime() - t.openedAt.getTime())],
    ['Session', SESSION_LABELS[sessionOf(t.openedAt)]],
    ['Lots', t.lots],
    ['Entry → exit', `${formatPrice(t.openPrice)} → ${formatPrice(t.closePrice)}`],
    ['SL / TP (final)', `${formatPrice(t.slFinal)} / ${formatPrice(t.tpFinal)}`],
    ['Gross', formatMoney(t.profit)],
    ['Commission + swap', formatMoney(new Decimal(t.commission).plus(t.swap))],
    ['Risk', `${t.riskUsd ? formatMoney(t.riskUsd) : '—'} (${RISK_SOURCES[t.riskSource ?? ''] ?? '—'})`],
    ['Ticket', String(t.ticket)],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link href="/tracker/trades" className="text-muted-foreground text-sm hover:underline">
          ‹ Trades
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-xl">
            {t.symbol} <span className="capitalize">{t.side}</span> · {t.lots}
          </h2>
          <p
            className={cn('font-semibold text-lg num', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}
            data-testid="trade-net"
          >
            {formatMoney(t.netProfit)} · {formatR(r)}
            {t.riskSource === 'estimated' && (
              <span className="ml-1 rounded bg-muted px-1 font-normal text-muted-foreground text-xs">est.</span>
            )}
          </p>
        </div>
        <Link
          href={`/tracker/accounts/${account.login}` as Route}
          className="inline-flex w-fit items-center gap-2 text-sm hover:underline"
        >
          {accountLabel(account)} <StatusBadge status={account.status} />
        </Link>
      </div>
      {news && <TradeNewsSection news={news} />}

      <dl
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3 text-sm md:grid-cols-4"
        data-testid="trade-facts"
      >
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="truncate num">{value}</dd>
          </div>
        ))}
      </dl>
      {t.riskSource === 'estimated' && (
        <p className="text-warning text-sm">
          Risk is estimated. Add the initial stop loss below to get a real R for this trade.
        </p>
      )}

      <JournalForm
        save={saveJournalAction}
        tags={data.tags}
        side={t.side}
        openPrice={t.openPrice}
        startingBalance={account.startingBalance}
        defaults={{
          tradeId: t.id,
          setupTagId: entry?.setupTagId ?? '',
          followedPlan: entry?.followedPlan === true ? 'yes' : entry?.followedPlan === false ? 'no' : '',
          initialSl: plain(entry?.initialSl),
          plannedRr: plain(entry?.plannedRr),
          plannedRiskUsd: plain(entry?.plannedRiskUsd),
          emotionBefore: entry?.emotionBefore ?? '',
          emotionAfter: entry?.emotionAfter ?? '',
          mistakes: entry?.mistakes ?? [],
          contextTagIds: data.contextTagIds,
          notes: entry?.notes ?? '',
          rating: entry?.rating ?? '',
        }}
      />

      <Screenshots
        tradeId={t.id}
        shots={data.screenshots}
        enabled={data.screenshotsEnabled}
        startUpload={startScreenshotUploadAction}
        finishUpload={finishScreenshotUploadAction}
        remove={deleteScreenshotAction}
      />
    </div>
  );
}
