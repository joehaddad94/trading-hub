import { ChartWorkspace } from '@/modules/backtest/chart/chart-workspace';
import { getChartInstruments } from '@/modules/backtest/server/chart';

export const metadata = { title: 'Chart · Backtest Lab' };

export default async function ChartPage() {
  const instruments = await getChartInstruments();
  return <ChartWorkspace instruments={instruments} />;
}
