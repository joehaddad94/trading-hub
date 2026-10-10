import type { DrawingTool } from '@trading/backtest';
import { horizontalTool } from './horizontal';
import { measureTool } from './measure';
import { longTool, shortTool } from './position';
import { trendTool } from './trend';
import type { ToolModule } from './types';

/** Tool registry (backtester spec §4): the toolbar, shortcuts and overlay registration all read from here. */
export const TOOLS: ToolModule[] = [horizontalTool, trendTool, longTool, shortTool, measureTool];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<DrawingTool, ToolModule>;

export function toolForKey(code: string): ToolModule | null {
  return TOOLS.find((t) => t.key === code) ?? null;
}
