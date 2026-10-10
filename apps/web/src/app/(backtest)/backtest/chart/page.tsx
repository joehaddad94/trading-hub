import { ChartWorkspace } from '@/modules/backtest/chart/chart-workspace';
import { getChartInstruments, getCountedCurrencies } from '@/modules/backtest/server/chart';
import { getDrawings } from '@/modules/backtest/server/drawings';
import { createDrawingAction, deleteAllDrawingsAction, deleteDrawingAction, updateDrawingAction } from './actions';

export const metadata = { title: 'Chart · Backtest Lab' };

const drawingActions = {
  create: createDrawingAction,
  update: updateDrawingAction,
  remove: deleteDrawingAction,
  removeAll: deleteAllDrawingsAction,
};

export default async function ChartPage() {
  const [instruments, currencies, drawings] = await Promise.all([
    getChartInstruments(),
    getCountedCurrencies(),
    getDrawings(),
  ]);
  return (
    <ChartWorkspace
      instruments={instruments}
      currencies={currencies}
      drawings={drawings}
      drawingActions={drawingActions}
    />
  );
}
