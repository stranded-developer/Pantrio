import { describe, expect, it } from "vitest";
import {
  ConversionError,
  DEFAULT_TAX_SETTINGS,
  Q,
  RecipeCycleError,
  breakdownPrice,
  computePnl,
  convert,
  dishCost,
  dishMargin,
  menuItemCost,
  monthFixedCosts,
  periodIncomeTax,
  type Catalog,
  type FixedCost,
  type Product,
  type Recipe,
  type StaffMember,
  type TaxSettings,
} from "./index";

// Every expected figure below is worked by hand, not copied from output.

const catalog = (products: Product[], recipes: Recipe[]): Catalog => ({
  products: new Map(products.map((p) => [p.id, p])),
  recipes: new Map(recipes.map((r) => [r.id, r])),
});

const flour: Product = { id: "flour", name: "Segitiga Biru 1kg", price: 14_500, packQty: 1, packUnit: "kg" };
const eggs: Product = {
  id: "eggs",
  name: "Telur 30 butir",
  price: 23_900,
  packQty: 30,
  packUnit: "pcs",
  conversions: [{ qty: 1, unit: "pcs", equalsQty: 55, equalsUnit: "g" }],
};
const butter: Product = { id: "butter", name: "Anchor 200g", price: 32_000, packQty: 200, packUnit: "g" };
const sugar: Product = { id: "sugar", name: "Gulaku 1kg", price: 18_000, packQty: 1, packUnit: "kg" };
const box: Product = { id: "box", name: "Box kraft", price: 1_500, packQty: 1, packUnit: "pcs" };

describe("Q (exact fractions)", () => {
  it("is exact where floats are not", () => {
    expect(Q.from(0.1).add(Q.from(0.2)).cmp(Q.from("0.3"))).toBe(0);
  });
  it("rounds half away from zero, like Postgres round(numeric)", () => {
    expect(Q.from("2.5").round()).toBe(3);
    expect(Q.from("-2.5").round()).toBe(-3);
    expect(Q.from("2.4999").round()).toBe(2);
  });
  it("parses exponent-form numbers exactly", () => {
    expect(Q.from(1e-7).cmp(Q.of(1, 10_000_000))).toBe(0);
    expect(Q.from(1e21).cmp(Q.of(10n ** 21n))).toBe(0);
  });
  it("rejects garbage", () => {
    expect(() => Q.from("abc")).toThrow(TypeError);
    expect(() => Q.from(".")).toThrow(TypeError);
  });
});

describe("units", () => {
  it("converts within a dimension, including ons and lusin", () => {
    expect(convert(Q.of(1), "kg", "g").round()).toBe(1000);
    expect(convert(Q.of(3), "ons", "g").round()).toBe(300);
    expect(convert(Q.of(2), "lusin", "pcs").round()).toBe(24);
    expect(convert(Q.of(250), "ml", "l").cmp(Q.of(1, 4))).toBe(0);
  });
  it("crosses dimensions only via an ingredient conversion, in both directions", () => {
    const egg = eggs.conversions!;
    expect(convert(Q.of(2), "pcs", "g", egg).round()).toBe(110);
    expect(convert(Q.of(110), "g", "pcs", egg).round()).toBe(2);
    expect(() => convert(Q.of(1), "pcs", "g")).toThrow(ConversionError);
  });
});

describe("dishCost", () => {
  it("costs a dish from brand products, rounding once per portion", () => {
    // Gingerbread, batch of 10:
    //   flour 300 g  = 0.3 × 14.500         = 4.350
    //   eggs 2 pcs   = 2/30 × 23.900        = 1.593,33…
    //   butter 100 g = 100/200 × 32.000     = 16.000
    //   sugar 150 g  = 0.15 × 18.000        = 2.700
    //   batch = 24.643,33…  ÷ 10 = 2.464,33… → 2.464
    const gingerbread: Recipe = {
      id: "gingerbread",
      yieldQty: 10,
      yieldUnit: "pcs",
      lines: [
        { productId: "flour", qty: 300, unit: "g" },
        { productId: "eggs", qty: 2, unit: "pcs" },
        { productId: "butter", qty: 100, unit: "g" },
        { productId: "sugar", qty: 150, unit: "g" },
      ],
    };
    const r = dishCost("gingerbread", catalog([flour, eggs, butter, sugar], [gingerbread]));
    expect(r.complete).toBe(true);
    expect(r.cost).toBe(2_464);
    expect(r.missing).toEqual([]);
  });

  it("does not drift the way per-line rounding does", () => {
    // Rp 10 per 25 g = Rp 0,4/g. Three 1 g lines: exact 1,2 → 1; per-line 0+0+0 = 0.
    const spice: Product = { id: "spice", price: 10, packQty: 25, packUnit: "g" };
    const r: Recipe = {
      id: "r",
      yieldQty: 1,
      yieldUnit: "pcs",
      lines: [1, 2, 3].map(() => ({ productId: "spice", qty: 1, unit: "g" as const })),
    };
    expect(dishCost("r", catalog([spice], [r])).cost).toBe(1);
  });

  it("applies product yield and line waste", () => {
    // Chicken Rp 40.000/kg, 75% usable: 150 g → 0.15 × 40.000 ÷ 0.75 = 8.000
    // Flour 120 g with 10% waste: 0.12 × 14.500 × 1.1 = 1.914
    const chicken: Product = { id: "chicken", price: 40_000, packQty: 1, packUnit: "kg", yieldBps: 7_500 };
    const r: Recipe = {
      id: "r",
      yieldQty: 1,
      yieldUnit: "pcs",
      lines: [
        { productId: "chicken", qty: 150, unit: "g" },
        { productId: "flour", qty: 120, unit: "g", wasteBps: 1_000 },
      ],
    };
    expect(dishCost("r", catalog([chicken, flour], [r])).cost).toBe(9_914);
  });

  it("costs sub-recipes by their yield", () => {
    // Dough: 1 kg flour (14.500) + 200 g butter (32.000) = 46.500 per 2 kg = 23,25/g
    // Pie: 250 g dough = 5.812,5 + box 1.500 = 7.312,5 → 7.313
    const dough: Recipe = {
      id: "dough",
      yieldQty: 2,
      yieldUnit: "kg",
      lines: [
        { productId: "flour", qty: 1, unit: "kg" },
        { productId: "butter", qty: 200, unit: "g" },
      ],
    };
    const pie: Recipe = {
      id: "pie",
      yieldQty: 1,
      yieldUnit: "pcs",
      lines: [
        { recipeId: "dough", qty: 250, unit: "g" },
        { productId: "box", qty: 1, unit: "pcs" },
      ],
    };
    expect(dishCost("pie", catalog([flour, butter, box], [dough, pie])).cost).toBe(7_313);
  });

  it("reports a missing price as unknown, never as zero", () => {
    const vanilla: Product = { id: "vanilla", name: "Vanili", price: null, packQty: 1, packUnit: "g" };
    const dough: Recipe = {
      id: "dough",
      yieldQty: 1,
      yieldUnit: "kg",
      lines: [{ productId: "vanilla", qty: 1, unit: "g" }, { productId: "flour", qty: 1, unit: "kg" }],
    };
    const cake: Recipe = {
      id: "cake",
      yieldQty: 1,
      yieldUnit: "pcs",
      lines: [{ recipeId: "dough", qty: 1, unit: "kg" }, { productId: "box", qty: 1, unit: "pcs" }],
    };
    const r = dishCost("cake", catalog([vanilla, flour, box], [dough, cake]));
    expect(r.cost).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.knownCost).toBe(1_500); // only the box is knowable at this level
    expect(r.missing).toEqual([
      expect.objectContaining({ reason: "no_price", id: "vanilla", path: ["cake", "dough"] }),
    ]);
  });

  it("flags a unit with no conversion instead of guessing", () => {
    const r: Recipe = { id: "r", yieldQty: 1, yieldUnit: "pcs", lines: [{ productId: "flour", qty: 2, unit: "pcs" }] };
    const out = dishCost("r", catalog([flour], [r]));
    expect(out.cost).toBeNull();
    expect(out.missing[0]?.reason).toBe("no_conversion");
  });

  it("treats a recipe with no ingredients as unknown, never free", () => {
    const empty: Recipe = { id: "e", name: "Latte", yieldQty: 1, yieldUnit: "pcs", lines: [] };
    const r = dishCost("e", catalog([], [empty]));
    expect(r.cost).toBeNull();
    expect(r.missing[0]?.reason).toBe("no_lines");
  });

  it("rejects a recipe that contains itself", () => {
    const a: Recipe = { id: "a", yieldQty: 1, yieldUnit: "kg", lines: [{ recipeId: "b", qty: 1, unit: "kg" }] };
    const b: Recipe = { id: "b", yieldQty: 1, yieldUnit: "kg", lines: [{ recipeId: "a", qty: 1, unit: "kg" }] };
    expect(() => dishCost("a", catalog([], [a, b]))).toThrow(RecipeCycleError);
  });
});

describe("Indonesian tax", () => {
  const svc5: TaxSettings = { ...DEFAULT_TAX_SETTINGS, serviceBps: 500 };

  it("exclusive prices: PB1 on subtotal + service, service not revenue by default", () => {
    // 50.000 + service 2.500 + PB1 10% of 52.500 = 5.250 → customer pays 57.750
    const b = breakdownPrice(50_000, svc5);
    expect([b.service.round(), b.pb1.round(), b.gross.round(), b.netSales.round()]).toEqual([
      2_500, 5_250, 57_750, 50_000,
    ]);
    expect(breakdownPrice(50_000, { ...svc5, serviceIsRevenue: true }).netSales.round()).toBe(52_500);
  });

  it("inclusive prices: backs PB1 and service out exactly", () => {
    expect(breakdownPrice(57_750, { ...svc5, priceMode: "inclusive" }).base.round()).toBe(50_000);
    expect(breakdownPrice(33_000, { ...DEFAULT_TAX_SETTINGS, priceMode: "inclusive" }).base.round()).toBe(30_000);
  });

  it("dish margin before and after PPh Final 0.5%", () => {
    // net 25.000, cost 7.500 → GP 17.500 (70%); PPh 125 → 17.375 (69,5%)
    const expected = {
      netSales: 25_000,
      cost: 7_500,
      grossProfit: 17_500,
      foodCostBps: 3_000,
      marginBeforeTaxBps: 7_000,
      incomeTax: 125,
      marginAfterTaxBps: 6_950,
    };
    expect(dishMargin(25_000, 7_500, DEFAULT_TAX_SETTINGS)).toEqual(expected);
    // Same dish priced inclusive of 10% PB1 gives the same margin: PB1 is never revenue.
    expect(dishMargin(27_500, 7_500, { ...DEFAULT_TAX_SETTINGS, priceMode: "inclusive" })).toEqual(expected);
  });

  it("income tax only on turnover above the annual tax-free band", () => {
    const t = { ...DEFAULT_TAX_SETTINGS, incomeTaxFreeAnnualTurnover: 500_000_000 };
    expect(periodIncomeTax(40_000_000, t, 0)).toBe(0);
    expect(periodIncomeTax(40_000_000, t, 480_000_000)).toBe(100_000); // 20 jt × 0,5%
    expect(periodIncomeTax(40_000_000, t, 600_000_000)).toBe(200_000);
    expect(periodIncomeTax(40_000_000, { ...t, incomeTaxMode: "none" }, 600_000_000)).toBe(0);
  });
});

describe("fixed costs and P&L", () => {
  const costs: FixedCost[] = [
    { id: "rent", name: "Sewa", category: "rent", rates: [{ amount: 60_000_000, period: "yearly", effectiveFrom: "2026-01" }] },
    {
      id: "pln",
      name: "Listrik PLN",
      category: "electricity",
      rates: [
        { amount: 2_000_000, period: "monthly", effectiveFrom: "2026-01" },
        { amount: 2_400_000, period: "monthly", effectiveFrom: "2026-07" },
      ],
      actuals: [{ month: "2026-08", amount: 3_100_000 }],
    },
  ];
  const staff: StaffMember[] = [
    {
      id: "ani",
      name: "Ani",
      wages: [
        { monthlyWage: 3_000_000, effectiveFrom: "2026-01" },
        { monthlyWage: 3_300_000, effectiveFrom: "2026-09" },
      ],
    },
    { id: "budi", name: "Budi", wages: [{ monthlyWage: 2_800_000, effectiveFrom: "2026-01" }], endMonth: "2026-08" },
  ];

  it("resolves defaults, versioned changes, one-off actuals and leavers", () => {
    expect(monthFixedCosts("2026-06", staff, costs).total).toBe(12_800_000);
    const aug = monthFixedCosts("2026-08", staff, costs);
    expect(aug.total).toBe(13_900_000);
    expect(aug.lines.find((l) => l.id === "pln")).toMatchObject({ amount: 3_100_000, source: "actual" });
    expect(monthFixedCosts("2026-09", staff, costs).total).toBe(10_700_000);
    expect(monthFixedCosts("2025-12", staff, costs)).toEqual({ lines: [], total: 0 });
    expect(() => monthFixedCosts("2026-13", staff, costs)).toThrow(TypeError);
  });

  it("computes the month: gross, operating, after tax, break-even", () => {
    const pnl = computePnl({ netSales: 40_000_000, cogs: 14_000_000, fixedCosts: 12_800_000, tax: DEFAULT_TAX_SETTINGS });
    expect(pnl).toEqual({
      netSales: 40_000_000,
      cogs: 14_000_000,
      grossProfit: 26_000_000,
      grossMarginBps: 6_500,
      fixedCosts: 12_800_000,
      operatingProfit: 13_200_000,
      marginBeforeTaxBps: 3_300,
      incomeTax: 200_000,
      netProfit: 13_000_000,
      marginAfterTaxBps: 3_250,
      breakEvenSales: 19_692_308, // 12,8 jt ÷ 65%
    });
  });

  it("has no break-even and zero ratios with no sales", () => {
    const pnl = computePnl({ netSales: 0, cogs: 0, fixedCosts: 5_000_000, tax: DEFAULT_TAX_SETTINGS });
    expect(pnl.breakEvenSales).toBeNull();
    expect(pnl.grossMarginBps).toBe(0);
    expect(pnl.netProfit).toBe(-5_000_000);
  });
});

describe("wire schemas", () => {
  it("rejects a float price and accepts an unknown cost", () => {
    const base = {
      externalId: "m1",
      name: "Gingerbread",
      sellingPrice: 25_000,
      unitCost: null,
      complete: false,
      marginBeforeTaxBps: null,
      marginAfterTaxBps: null,
      computedAt: "2026-10-20T10:00:00Z",
    };
    expect(menuItemCost.safeParse(base).success).toBe(true);
    expect(menuItemCost.safeParse({ ...base, sellingPrice: 25_000.5 }).success).toBe(false);
  });
});
