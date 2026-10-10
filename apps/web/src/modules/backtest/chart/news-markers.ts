import type { IndicatorTemplate } from 'klinecharts';

export const NEWS_INDICATOR = 'NEWS_MARKERS';

/** One marker per bar: the bar's open time and the colour of its most important event. */
export type Marker = { ts: number; color: string };

/** Vertical dashed lines in folder colours (news spec §4), with a small folder square on the time axis edge. */
export const newsMarkers: IndicatorTemplate<unknown, unknown, { markers: Marker[] }> = {
  name: NEWS_INDICATOR,
  shortName: 'News',
  series: 'price',
  figures: [],
  extendData: { markers: [] },
  calc: (list) => list.map(() => ({})),
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', legends: [], features: [] }),
  draw: ({ ctx, indicator, bounding, xAxis }) => {
    const markers = indicator.extendData?.markers ?? [];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const m of markers) {
      const x = Math.round(xAxis.convertTimestampToPixel(m.ts)) + 0.5;
      if (x < 0 || x > bounding.width) continue;
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bounding.height);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = m.color;
      ctx.fillRect(x - 4, bounding.height - 22, 8, 7);
    }
    ctx.restore();
    return true;
  },
};
