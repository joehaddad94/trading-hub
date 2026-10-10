import { ChartWorkspace } from '@/modules/backtest/chart/chart-workspace';
import { getChartInstruments, getCountedCurrencies } from '@/modules/backtest/server/chart';

export const metadata = { title: 'Chart · Backtest Lab' };

export default async function ChartPage() {
  const [instruments, currencies] = await Promise.all([getChartInstruments(), getCountedCurrencies()]);
  return <ChartWorkspace instruments={instruments} currencies={currencies} />;
}
