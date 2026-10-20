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

export type PosLine = { unitPrice: number; qty: number };

export type OrderTotals = {
  /** Σ unit price × qty, as printed on the lines. */
  linesTotal: number;
  /** Pre-service, pre-PB1 base (DPP). Equals linesTotal when exclusive. */
  subtotal: number;
  serviceTotal: number;
  taxTotal: number;
  grandTotal: number;
};

export function calculateOrderTotals(lines: readonly PosLine[], r: PosTaxRules): OrderTotals {
  const linesTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const s = Q.bps(r.serviceBps);
  const t = Q.bps(r.pb1Bps);

  if (r.priceMode === "exclusive") {
    // Rounding on aggregates, not per line (FOKAS D13).
    const subtotal = linesTotal;
    const serviceTotal = Q.of(subtotal).mul(s).round();
    const taxTotal = Q.of(subtotal + (r.pb1OnService ? serviceTotal : 0)).mul(t).round();
    return { linesTotal, subtotal, serviceTotal, taxTotal, grandTotal: subtotal + serviceTotal + taxTotal };
  }

  // Inclusive: back the base out; PB1 takes the rounding remainder so the
  // parts always sum to exactly what the customer was charged.
  const grandTotal = linesTotal;
  const factor = Q.ONE.add(s).add(t.mul(r.pb1OnService ? Q.ONE.add(s) : Q.ONE));
  const subtotal = Q.of(grandTotal).div(factor).round();
  const serviceTotal = Q.of(subtotal).mul(s).round();
  return { linesTotal, subtotal, serviceTotal, taxTotal: grandTotal - subtotal - serviceTotal, grandTotal };
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
