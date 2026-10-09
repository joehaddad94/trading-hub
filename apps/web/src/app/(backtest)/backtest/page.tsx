import Link from 'next/link';
import { CandleCoverage } from '@/modules/backtest/components/candle-banner';
import { PlaceholderPage } from '@/shell/placeholder-page';

export default function Page() {
  return (
    <div className="h-full overflow-y-auto">
      <PlaceholderPage title="Sessions" milestone="M21" />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-6">
        <Link
          href="/backtest/chart"
          className="inline-flex h-11 items-center self-start rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
        >
          Open chart
        </Link>
        <CandleCoverage />
      </div>
    </div>
  );
}
