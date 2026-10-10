import { overlayName, type ToolModule } from './types';

/** Horizontal line: one click, price label on the axis, optional text label. */
export const horizontalTool: ToolModule = {
  id: 'horizontal',
  label: 'Horizontal line',
  key: 'KeyH',
  overlay: {
    name: overlayName('horizontal'),
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const y = coordinates[0]?.y ?? 0;
      const { style, label } = overlay.extendData;
      const figures = [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y },
            ],
          },
          styles: { color: style.color, size: style.width },
        },
      ];
      if (label) {
        figures.push({
          type: 'text',
          attrs: { x: 8, y: y - 4, text: label, baseline: 'bottom' } as never,
          styles: { color: style.color, backgroundColor: 'transparent', size: 12 } as never,
        });
      }
      return figures;
    },
  },
};
