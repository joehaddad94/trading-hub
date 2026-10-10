import Decimal from 'decimal.js';

/** Money values arrive as strings (Postgres `numeric`) or numbers (export file). Never parseFloat them. */
export type MoneyInput = Decimal.Value;

export function money(value: MoneyInput): Decimal {
  return new Decimal(value);
}

export function sumMoney(values: Iterable<MoneyInput>): Decimal {
  let total = new Decimal(0);
  for (const value of values) total = total.plus(value);
  return total;
}
