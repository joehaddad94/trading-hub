import { CandleCoverage } from '@/modules/backtest/components/candle-banner';
import { PlaceholderPage } from '@/shell/placeholder-page';

export default function Page() {
  return (
    <div className="h-full overflow-y-auto">
      <PlaceholderPage title="Sessions" milestone="M21" />
      <div className="px-4 pb-6 md:px-6">
        <CandleCoverage />
      </div>
    </div>
  );
}
