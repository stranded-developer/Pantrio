import { Q } from "./rational";
import { periodIncomeTax, type TaxSettings } from "./tax";

// Monthly fixed costs and the period P&L (decision P11).
//
// Staff are entered by name with a monthly wage. Rent, electricity and the
// rest carry a default amount that is versioned by the month it takes effect
// — a change applies going forward and never restates a past month — plus an
// optional actual figure for one specific month that overrides the default.

/** "2026-10" */
export type Month = string;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(m: string): asserts m is Month {
  if (!MONTH_RE.test(m)) throw new TypeError(`Expected YYYY-MM, got "${m}"`);
}

export type FixedCostCategory = "rent" | "electricity" | "water" | "gas" | "internet" | "other";

export type FixedCost = {
  id: string;
  name: string;
  category: FixedCostCategory;
  /** Default amounts, each in force from its month until the next one. */
  rates: readonly { amount: number; period: "monthly" | "yearly"; effectiveFrom: Month }[];
  /** Actual bills for specific months; win over the default. */
  actuals?: readonly { month: Month; amount: number }[];
};

export type StaffMember = {
  id: string;
  name: string;
  role?: string;
  wages: readonly { monthlyWage: number; effectiveFrom: Month }[];
  /** Last month this person is paid for. Absent = still employed. */
  endMonth?: Month;
};

export type FixedCostLine = {
  kind: "staff" | "fixed";
  id: string;
  name: string;
  category: FixedCostCategory | "wages";
  amount: number;
  source: "actual" | "default";
};

function inForce<T extends { effectiveFrom: Month }>(rows: readonly T[], month: Month): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (r.effectiveFrom <= month && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best;
}

/** Amount for one fixed cost in a month, or null if nothing is in force yet. */
export function resolveFixedCost(cost: FixedCost, month: Month): FixedCostLine | null {
  assertMonth(month);
  const actual = cost.actuals?.find((a) => a.month === month);
  const base = { kind: "fixed" as const, id: cost.id, name: cost.name, category: cost.category };
  if (actual) return { ...base, amount: actual.amount, source: "actual" };

  const rate = inForce(cost.rates, month);
  if (!rate) return null;
  // Yearly rent shown monthly. Rounds per month, so twelve months can differ
  // from the yearly figure by a few rupiah — enter monthly to avoid it.
  const amount = rate.period === "yearly" ? Q.of(rate.amount).div(Q.of(12)).round() : rate.amount;
  return { ...base, amount, source: "default" };
}

export function resolveWage(staff: StaffMember, month: Month): FixedCostLine | null {
  assertMonth(month);
  if (staff.endMonth && month > staff.endMonth) return null;
  const wage = inForce(staff.wages, month);
  if (!wage) return null;
  return {
    kind: "staff",
    id: staff.id,
    name: staff.name,
    category: "wages",
    amount: wage.monthlyWage,
    source: "default",
  };
}

export function monthFixedCosts(
  month: Month,
  staff: readonly StaffMember[],
  costs: readonly FixedCost[]
): { lines: FixedCostLine[]; total: number } {
  const lines = [
    ...staff.map((s) => resolveWage(s, month)),
    ...costs.map((c) => resolveFixedCost(c, month)),
  ].filter((l): l is FixedCostLine => l !== null);
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

export type PnlInput = {
  /** Revenue the restaurant keeps (excl. PB1; service per settings). */
  netSales: number;
  /** Σ dish cost × qty sold. */
  cogs: number;
  fixedCosts: number;
  tax: TaxSettings;
  /** Turnover earlier in the same tax year, for the tax-free band. */
  ytdTurnoverBefore?: number;
};

export type Pnl = {
  netSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginBps: number;
  fixedCosts: number;
  operatingProfit: number;
  marginBeforeTaxBps: number;
  incomeTax: number;
  netProfit: number;
  marginAfterTaxBps: number;
  /** Net sales needed to cover fixed costs; null if gross margin ≤ 0. */
  breakEvenSales: number | null;
};

export function computePnl(i: PnlInput): Pnl {
  const grossProfit = i.netSales - i.cogs;
  const operatingProfit = grossProfit - i.fixedCosts;
  const incomeTax = periodIncomeTax(i.netSales, i.tax, i.ytdTurnoverBefore ?? 0);
  const netProfit = operatingProfit - incomeTax;
  const ratio = (x: number) => (i.netSales === 0 ? 0 : Q.of(x).div(Q.of(i.netSales)).toBps());

  // break-even = fixed ÷ (gross profit ÷ net sales), kept exact until the end
  const breakEvenSales =
    grossProfit > 0 && i.netSales > 0
      ? Q.of(i.fixedCosts).mul(Q.of(i.netSales)).div(Q.of(grossProfit)).round()
      : null;

  return {
    netSales: i.netSales,
    cogs: i.cogs,
    grossProfit,
    grossMarginBps: ratio(grossProfit),
    fixedCosts: i.fixedCosts,
    operatingProfit,
    marginBeforeTaxBps: ratio(operatingProfit),
    incomeTax,
    netProfit,
    marginAfterTaxBps: ratio(netProfit),
    breakEvenSales,
  };
}
