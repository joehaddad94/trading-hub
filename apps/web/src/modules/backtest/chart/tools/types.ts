import type { DrawingPoint, DrawingStyle, DrawingTool } from '@trading/backtest';
import type { Sizing, Timeframe } from '@trading/backtest-engine';
import type { OverlayTemplate } from 'klinecharts';

/** Context every overlay can read from `extendData` (set by the workspace). */
export type ToolData = {
  drawingId: string | null;
  style: DrawingStyle;
  label: string | null;
  pointValue: string;
  balance: string;
  priceDigits: number;
  /** Position size for long/short boxes: the order ticket's remembered size, shared by every box. */
  sizing?: Sizing;
  /** Measure drawings that aren't kept vanish on the next click. */
  temporary?: boolean;
};

/**
 * A drawing tool (backtester spec §4): self-contained, registered once. Adding Fibonacci, rectangle, ray or
 * text later means adding a module to the registry, not touching the others.
 */
export type ToolModule = {
  id: DrawingTool;
  label: string;
  /** `KeyboardEvent.code` used with Alt. */
  key: string;
  overlay: OverlayTemplate<ToolData>;
  /**
   * Completes a drawing after its clicks (positions place stop/target from one click). Returns the stored
   * points, or null when the overlay already holds them.
   */
  complete?: (points: DrawingPoint[], ctx: { tf: Timeframe; priceDigits: number }) => DrawingPoint[];
  /** Style defaults for a new drawing of this tool. */
  defaults?: Partial<DrawingStyle>;
};

export const overlayName = (tool: DrawingTool) => `bt_${tool}`;

export function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
