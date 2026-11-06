import { Q } from "./rational";

// Till arithmetic. Ported from FOKAS src/lib/money and extended for
// inclusive pricing. Mirrors create_order() in
// supabase/migrations/00000000000003_tenancy_pos.sql exactly: the till uses
// this to show live totals, the database recomputes independently and is the
// source of truth. Change one, change both — pos.test.ts and
// supabase/tests/pos_checks.sql share fixtures.

export type PosTaxRules = {
  priceMode: "exclusive" | "inclusive";
  serviceBps: number;
  pb1Bps: number;
  pb1OnService: boolean;
};

/** `discount`: rupiah off this line (from bestDiscount), 0 when none. */
export type PosLine = { unitPrice: number; qty: number; discount?: number };

export type OrderTotals = {
  /** Σ unit price × qty, as printed on the lines (before discount). */
  linesTotal: number;
  /** Σ line discounts (P27). Service and PB1 are on linesTotal − this. */
  discountTotal: number;
  /** Pre-service, pre-PB1 base (DPP), after discount. */
  subtotal: number;
  serviceTotal: number;
  taxTotal: number;
  grandTotal: number;
};

export function calculateOrderTotals(lines: readonly PosLine[], r: PosTaxRules): OrderTotals {
  const linesTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const discountTotal = lines.reduce((sum, l) => sum + (l.discount ?? 0), 0);
  const net = linesTotal - discountTotal;
  const s = Q.bps(r.serviceBps);
  const t = Q.bps(r.pb1Bps);

  if (r.priceMode === "exclusive") {
    // Rounding on aggregates, not per line (FOKAS D13).
    const subtotal = net;
    const serviceTotal = Q.of(subtotal).mul(s).round();
    const taxTotal = Q.of(subtotal + (r.pb1OnService ? serviceTotal : 0)).mul(t).round();
    return { linesTotal, discountTotal, subtotal, serviceTotal, taxTotal, grandTotal: subtotal + serviceTotal + taxTotal };
  }

  // Inclusive: back the base out; PB1 takes the rounding remainder so the
  // parts always sum to exactly what the customer was charged.
  const grandTotal = net;
  const factor = Q.ONE.add(s).add(t.mul(r.pb1OnService ? Q.ONE.add(s) : Q.ONE));
  const subtotal = Q.of(grandTotal).div(factor).round();
  const serviceTotal = Q.of(subtotal).mul(s).round();
  return { linesTotal, discountTotal, subtotal, serviceTotal, taxTotal: grandTotal - subtotal - serviceTotal, grandTotal };
}

// ── Discounts (P27), mirroring best_discount() in migration 11 ──────────

export type PosDiscount = {
  id: string;
  name: string;
  kind: "percent" | "amount";
  /** percent: basis points (2000 = 20%); amount: rupiah off each unit. */
  value: number;
  allItems: boolean;
  menuItemIds: readonly string[];
  /** YYYY-MM-DD, inclusive. */
  startsOn: string;
  endsOn: string | null;
  /** ISO weekdays, 1 = Monday … 7 = Sunday; null = every day. */
  weekdays: readonly number[] | null;
  active: boolean;
};

/** Does the discount run on this business day? */
export function discountAppliesOn(d: PosDiscount, businessDay: string): boolean {
  if (!d.active || d.startsOn > businessDay || (d.endsOn !== null && d.endsOn < businessDay)) return false;
  if (d.weekdays === null) return true;
  const dow = new Date(`${businessDay}T00:00:00Z`).getUTCDay();
  return d.weekdays.includes(dow === 0 ? 7 : dow);
}

/** Rupiah off one line: % rounded once per line; a fixed amount never below 0. */
export function lineDiscount(unitPrice: number, qty: number, d: Pick<PosDiscount, "kind" | "value">): number {
  if (d.kind === "percent") return Q.of(unitPrice * qty).mul(Q.bps(d.value)).round();
  return Math.min(d.value, unitPrice) * qty;
}

/** The largest discount for a line on a business day — they never stack. Ties: lowest id. */
export function bestDiscount(
  menuItemId: string,
  unitPrice: number,
  qty: number,
  discounts: readonly PosDiscount[],
  businessDay: string
): { discount: PosDiscount; amount: number } | null {
  let best: { discount: PosDiscount; amount: number } | null = null;
  for (const d of discounts) {
    if (!discountAppliesOn(d, businessDay) || !(d.allItems || d.menuItemIds.includes(menuItemId))) continue;
    const amount = lineDiscount(unitPrice, qty, d);
    if (!best || amount > best.amount || (amount === best.amount && d.id < best.discount.id)) best = { discount: d, amount };
  }
  return best && best.amount > 0 ? best : null;
}

/** Change owed. Negative means the customer still owes money. */
export function calculateChange(grandTotal: number, tendered: number): number {
  return tendered - grandTotal;
}

/** Rounds a tendered amount up to the next note a customer would plausibly hand over. */
export function suggestedTenders(grandTotal: number): number[] {
  if (grandTotal <= 0) return [];
  const suggestions = new Set<number>([grandTotal]);
  for (const note of [5000, 10000, 20000, 50000, 100000]) {
    const rounded = Math.ceil(grandTotal / note) * note;
    if (rounded !== grandTotal) suggestions.add(rounded);
  }
  return [...suggestions].sort((a, b) => a - b).slice(0, 4);
}

/** "Rp 61.000" — Indonesian thousands separator. */
export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

/** 1050 bps → "10,5%" */
export function formatBps(bps: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}
