import { type AnyColumn, eq, isNull } from '@trading/db/orm';

/** Whose Backtest Lab rows these are: an invited user's auth id, or null for the app owner. */
export type Owner = string | null;

export const ownedBy = (column: AnyColumn, owner: Owner) => (owner === null ? isNull(column) : eq(column, owner));
