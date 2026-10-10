import { z } from 'zod';
import { ChartWorkspace } from '@/modules/backtest/chart/chart-workspace';
import { getChartInstruments, getCountedCurrencies } from '@/modules/backtest/server/chart';
import { getDrawings } from '@/modules/backtest/server/drawings';
import { getTradingState } from '@/modules/backtest/server/trading';
import { createDrawingAction, deleteAllDrawingsAction, deleteDrawingAction, updateDrawingAction } from './actions';
import {
  advanceAction,
  cancelOrderAction,
  closeOrderAction,
  deleteTradeAction,
  modifyOrderAction,
  ordersAction,
  placeOrderAction,
  restoreTradeAction,
} from './trading-actions';

export const metadata = { title: 'Chart · Backtest Lab' };

const drawingActions = {
  create: createDrawingAction,
  update: updateDrawingAction,
  remove: deleteDrawingAction,
  removeAll: deleteAllDrawingsAction,
};

const tradingActions = {
  place: placeOrderAction,
  advance: advanceAction,
  modify: modifyOrderAction,
  cancel: cancelOrderAction,
  close: closeOrderAction,
  remove: deleteTradeAction,
  restore: restoreTradeAction,
  list: ordersAction,
};

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { session } = await searchParams;
  const sessionId = typeof session === 'string' && z.uuid().safeParse(session).success ? session : null;
  const [instruments, currencies, drawings, trading] = await Promise.all([
    getChartInstruments(),
    getCountedCurrencies(),
    getDrawings(),
    getTradingState(sessionId),
  ]);
  return (
    <ChartWorkspace
      instruments={instruments}
      currencies={currencies}
      drawings={drawings}
      drawingActions={drawingActions}
      trading={trading}
      tradingActions={tradingActions}
    />
  );
}
