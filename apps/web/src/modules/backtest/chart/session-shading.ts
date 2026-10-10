import { SESSION_LABELS, sessionRuns } from '@trading/core';
import type { IndicatorTemplate } from 'klinecharts';

export const SESSION_INDICATOR = 'KILL_ZONES';

/** Translucent bands per kill zone (tracker spec §6, ET). Defined once in core; this only paints them. */
const FILL: Record<string, string> = {
  asia: 'rgba(129, 140, 248, 0.10)',
  london: 'rgba(56, 189, 248, 0.10)',
  ny_am: 'rgba(250, 204, 21, 0.09)',
  ny_pm: 'rgba(251, 146, 60, 0.09)',
};

export const sessionShading: IndicatorTemplate = {
  name: SESSION_INDICATOR,
  shortName: 'Sessions',
  series: 'price',
  figures: [],
  calc: (list) => list.map(() => ({})),
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', legends: [], features: [] }),
  draw: ({ ctx, chart, bounding, xAxis }) => {
    const list = chart.getDataList();
    const { from, to } = chart.getVisibleRange();
    const visible = list.slice(Math.max(0, from), Math.min(list.length, to)).map((b) => b.timestamp);
    const half = chart.getBarSpace().halfBar;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    for (const run of sessionRuns(visible)) {
      const x1 = xAxis.convertTimestampToPixel(run.from) - half;
      const x2 = xAxis.convertTimestampToPixel(run.to) + half;
      ctx.fillStyle = FILL[run.name] ?? 'transparent';
      ctx.fillRect(x1, 0, x2 - x1, bounding.height);
      if (x2 - x1 > 48) {
        ctx.fillStyle = 'rgba(229, 231, 235, 0.55)';
        ctx.fillText(SESSION_LABELS[run.name], x1 + 4, bounding.height - 4);
      }
    }
    ctx.restore();
    return true;
  },
};
