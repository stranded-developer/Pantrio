import { describe, expect, it } from "vitest";
import {
  businessDate,
  calculateChange,
  calculateOrderTotals,
  isDate,
  periodRange,
  suggestedTenders,
  bestDiscount,
  discountAppliesOn,
  lineDiscount,
  type PosDiscount,
  type PosTaxRules,
} from "./index";

// Shared with supabase/tests/pos_checks.sql — the database must agree.
const exclusive: PosTaxRules = { priceMode: "exclusive", serviceBps: 500, pb1Bps: 1000, pb1OnService: true };
const inclusive: PosTaxRules = { ...exclusive, priceMode: "inclusive" };

describe("calculateOrderTotals", () => {
  it("exclusive: service on subtotal, PB1 on subtotal + service (FOKAS D13)", () => {
    // 2 × 25.000 + 18.000 = 68.000; service 3.400; PB1 10% × 71.400 = 7.140
    expect(
      calculateOrderTotals(
        [
          { unitPrice: 25_000, qty: 2 },
          { unitPrice: 18_000, qty: 1 },
        ],
        exclusive
      )
    ).toEqual({ discountTotal: 0, linesTotal: 68_000, subtotal: 68_000, serviceTotal: 3_400, taxTotal: 7_140, grandTotal: 78_540 });
  });

  it("exclusive without PB1 on service", () => {
    const t = calculateOrderTotals([{ unitPrice: 68_000, qty: 1 }], { ...exclusive, pb1OnService: false });
    expect([t.serviceTotal, t.taxTotal, t.grandTotal]).toEqual([3_400, 6_800, 78_200]);
  });

  it("zero rates (FOKAS today) charge exactly the menu price", () => {
    const t = calculateOrderTotals([{ unitPrice: 25_000, qty: 3 }], { ...exclusive, serviceBps: 0, pb1Bps: 0 });
    expect(t.grandTotal).toBe(75_000);
  });

  it("inclusive: backs the base out exactly", () => {
    expect(calculateOrderTotals([{ unitPrice: 57_750, qty: 1 }], inclusive)).toEqual({
      linesTotal: 57_750,
      discountTotal: 0,
      subtotal: 50_000,
      serviceTotal: 2_500,
      taxTotal: 5_250,
      grandTotal: 57_750,
    });
  });

  it("inclusive: PB1 takes the rounding remainder", () => {
    // 33.333 ÷ 1,155 = 28.859,74 → 28.860; service 1.443; PB1 = 33.333 − 28.860 − 1.443 = 3.030
    const t = calculateOrderTotals([{ unitPrice: 33_333, qty: 1 }], inclusive);
    expect([t.subtotal, t.serviceTotal, t.taxTotal, t.grandTotal]).toEqual([28_860, 1_443, 3_030, 33_333]);
  });

  it("change and tenders (FOKAS behaviour)", () => {
    expect(calculateChange(78_540, 100_000)).toBe(21_460);
    expect(suggestedTenders(78_540)).toEqual([78_540, 80_000, 100_000]);
    expect(suggestedTenders(0)).toEqual([]);
  });
});

describe("businessDate", () => {
  it("cuts over at 05:00 WIB, not midnight", () => {
    // 2026-10-20 04:00 WIB = 2026-10-19 21:00Z → still the 19th
    expect(businessDate(new Date("2026-10-19T21:00:00Z"), "Asia/Jakarta", 5)).toBe("2026-10-19");
    // 06:00 WIB → the 20th
    expect(businessDate(new Date("2026-10-19T23:00:00Z"), "Asia/Jakarta", 5)).toBe("2026-10-20");
  });
  it("respects other Indonesian timezones", () => {
    // 2026-10-19 21:30Z = 05:30 WITA (UTC+8) → the 20th; but 04:30 WIB → the 19th
    expect(businessDate(new Date("2026-10-19T21:30:00Z"), "Asia/Makassar", 5)).toBe("2026-10-20");
    expect(businessDate(new Date("2026-10-19T21:30:00Z"), "Asia/Jakarta", 5)).toBe("2026-10-19");
  });
});

describe("periods (FOKAS period.ts)", () => {
  it("weeks are Monday–Sunday across a year end", () => {
    const r = periodRange("week", "2026-01-01");
    expect([r.from, r.to]).toEqual(["2025-12-29", "2026-01-04"]);
  });
  it("months handle leap February", () => {
    expect(periodRange("month", "2028-02-10").to).toBe("2028-02-29");
  });
  it("rejects impossible dates", () => {
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-02-28")).toBe(true);
  });
});

// Shared with supabase/tests/discount_checks.sql — the database must agree.
describe("discounts (P27)", () => {
  const base: PosDiscount = {
    id: "a", name: "Promo", kind: "percent", value: 2000, allItems: false, menuItemIds: ["latte"],
    startsOn: "2026-11-01", endsOn: "2026-11-30", weekdays: null, active: true,
  };

  it("percent rounds once per line, half away from zero", () => {
    expect(lineDiscount(25_000, 2, base)).toBe(10_000);
    expect(lineDiscount(18_500, 1, { kind: "percent", value: 1250 })).toBe(2_313); // 2312.5
  });

  it("fixed amount is per unit and never below 0", () => {
    expect(lineDiscount(25_000, 2, { kind: "amount", value: 5_000 })).toBe(10_000);
    expect(lineDiscount(4_000, 3, { kind: "amount", value: 5_000 })).toBe(12_000);
  });

  it("window, weekdays and inactive", () => {
    expect(discountAppliesOn(base, "2026-11-01")).toBe(true);
    expect(discountAppliesOn(base, "2026-12-01")).toBe(false);
    expect(discountAppliesOn(base, "2026-10-31")).toBe(false);
    // 2026-11-03 is a Tuesday (ISO 2)
    expect(discountAppliesOn({ ...base, weekdays: [2] }, "2026-11-03")).toBe(true);
    expect(discountAppliesOn({ ...base, weekdays: [2] }, "2026-11-04")).toBe(false);
    expect(discountAppliesOn({ ...base, weekdays: [7] }, "2026-11-08")).toBe(true); // Sunday
    expect(discountAppliesOn({ ...base, active: false }, "2026-11-01")).toBe(false);
    expect(discountAppliesOn({ ...base, endsOn: null }, "2030-01-01")).toBe(true);
  });

  it("largest wins, no stacking; all-items; ties by id", () => {
    const all: PosDiscount = { ...base, id: "b", kind: "amount", value: 3_000, allItems: true, menuItemIds: [] };
    // latte 25.000: 20% = 5.000 beats Rp 3.000
    expect(bestDiscount("latte", 25_000, 1, [all, base], "2026-11-02")?.discount.id).toBe("a");
    // croissant only gets the all-items one
    expect(bestDiscount("croissant", 18_000, 1, [all, base], "2026-11-02")).toMatchObject({ amount: 3_000 });
    const tie: PosDiscount = { ...all, id: "0", value: 5_000 };
    expect(bestDiscount("latte", 25_000, 1, [base, tie], "2026-11-02")?.discount.id).toBe("0");
    expect(bestDiscount("latte", 25_000, 1, [base], "2026-12-02")).toBeNull();
  });

  it("service and PB1 on the price after discount", () => {
    // 2 × 25.000 − 20% = 40.000; + 18.000 = 58.000; service 2.900; PB1 6.090
    expect(
      calculateOrderTotals(
        [
          { unitPrice: 25_000, qty: 2, discount: 10_000 },
          { unitPrice: 18_000, qty: 1 },
        ],
        exclusive
      )
    ).toEqual({ linesTotal: 68_000, discountTotal: 10_000, subtotal: 58_000, serviceTotal: 2_900, taxTotal: 6_090, grandTotal: 66_990 });
  });
});
