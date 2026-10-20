import { Q } from "./rational";

// Indonesian restaurant tax handling (decision P12, plan §3.1).
//
// - PB1 / PBJT makanan & minuman (UU 1/2022 HKPD): regional tax, max 10%,
//   rate set per regency. A pass-through — never revenue, never cost.
// - Service charge: not a tax. Often passed to staff, so whether it counts as
//   revenue is a setting.
// - Income tax: commonly PPh Final UMKM 0.5% of gross turnover (PP 55/2022),
//   with a tax-free annual turnover band for individual taxpayers.
//
// Defaults follow common practice and must be confirmed with a tax
// consultant; every rate is editable per organisation.

export type IncomeTaxMode = "pph_final_umkm" | "custom" | "none";

export type TaxSettings = {
  /** Do menu prices already include PB1 and service? */
  priceMode: "exclusive" | "inclusive";
  pb1Bps: number;
  serviceBps: number;
  /** PB1 charged on subtotal + service (FOKAS D13). */
  pb1OnService: boolean;
  serviceIsRevenue: boolean;
  incomeTaxMode: IncomeTaxMode;
  /** Used when mode is "custom". */
  incomeTaxBps: number;
  /** Annual turnover below this is income-tax free (e.g. Rp 500 juta). 0 = none. */
  incomeTaxFreeAnnualTurnover: number;
};

export const PPH_FINAL_UMKM_BPS = 50; // 0.5%

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  priceMode: "exclusive",
  pb1Bps: 1000,
  serviceBps: 0,
  pb1OnService: true,
  serviceIsRevenue: false,
  incomeTaxMode: "pph_final_umkm",
  incomeTaxBps: PPH_FINAL_UMKM_BPS,
  incomeTaxFreeAnnualTurnover: 0,
};

export function incomeTaxRate(t: TaxSettings): Q {
  switch (t.incomeTaxMode) {
    case "none":
      return Q.ZERO;
    case "pph_final_umkm":
      return Q.bps(PPH_FINAL_UMKM_BPS);
    case "custom":
      return Q.bps(t.incomeTaxBps);
  }
}

export type PriceBreakdown = {
  /** Price before service and PB1 (DPP). */
  base: Q;
  service: Q;
  pb1: Q;
  /** What the customer pays. */
  gross: Q;
  /** What the restaurant keeps as revenue: base (+ service if it counts). */
  netSales: Q;
};

/** Split one menu price into base / service / PB1, exactly. */
export function breakdownPrice(price: number, t: TaxSettings): PriceBreakdown {
  const s = Q.bps(t.serviceBps);
  const p = Q.bps(t.pb1Bps);
  const pb1BaseFactor = t.pb1OnService ? Q.ONE.add(s) : Q.ONE;

  const base =
    t.priceMode === "exclusive"
      ? Q.of(price)
      : // price = base·(1 + s) + p·base·pb1BaseFactor
        Q.of(price).div(Q.ONE.add(s).add(p.mul(pb1BaseFactor)));

  const service = base.mul(s);
  const pb1 = base.mul(pb1BaseFactor).mul(p);
  return {
    base,
    service,
    pb1,
    gross: base.add(service).add(pb1),
    netSales: t.serviceIsRevenue ? base.add(service) : base,
  };
}

export type DishMargin = {
  netSales: number;
  cost: number;
  grossProfit: number;
  /** Ingredient cost ÷ net sales ("food cost %"). */
  foodCostBps: number;
  /** Gross profit ÷ net sales. */
  marginBeforeTaxBps: number;
  /** Income tax attributable to one sale (ignores the annual tax-free band). */
  incomeTax: number;
  marginAfterTaxBps: number;
};

/**
 * Per-dish margin. Fixed costs are deliberately absent — they belong to the
 * month, not the dish (P11). Returns null margins when net sales are zero.
 */
export function dishMargin(sellingPrice: number, cost: number, t: TaxSettings): DishMargin {
  const { netSales } = breakdownPrice(sellingPrice, t);
  const c = Q.of(cost);
  const gp = netSales.sub(c);
  const tax = netSales.mul(incomeTaxRate(t));
  const ratio = (x: Q) => (netSales.isZero() ? 0 : x.div(netSales).toBps());
  return {
    netSales: netSales.round(),
    cost,
    grossProfit: gp.round(),
    foodCostBps: ratio(c),
    marginBeforeTaxBps: ratio(gp),
    incomeTax: tax.round(),
    marginAfterTaxBps: ratio(gp.sub(tax)),
  };
}

/**
 * Income tax on this period's turnover, honouring the annual tax-free band:
 * only turnover that pushes year-to-date past the band is taxed.
 */
export function periodIncomeTax(turnover: number, t: TaxSettings, ytdTurnoverBefore = 0): number {
  const band = t.incomeTaxFreeAnnualTurnover;
  const after = Math.max(0, ytdTurnoverBefore + turnover - band);
  const before = Math.max(0, ytdTurnoverBefore - band);
  return Q.of(after - before).mul(incomeTaxRate(t)).round();
}
