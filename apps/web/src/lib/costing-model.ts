// Pure costing helpers shared by server pages and the live recipe editor.
// All arithmetic is @pantrio/core (P15); this file only reshapes rows.

import {
  Q,
  toBase,
  dimensionOf,
  type Catalog,
  type Conversion,
  type Product,
  type Recipe,
  type TaxSettings,
  type UnitCode,
} from "@pantrio/core";

export type IngredientRow = { id: string; name: string; category: string | null; active: boolean };
export type ConversionRow = {
  id: string;
  ingredient_id: string;
  qty: number;
  unit: UnitCode;
  equals_qty: number;
  equals_unit: UnitCode;
};
export type ProductRow = {
  id: string;
  ingredient_id: string;
  brand: string | null;
  name: string;
  pack_qty: number;
  pack_unit: UnitCode;
  yield_bps: number;
  supplier_id: string | null;
  active: boolean;
};
export type PriceRow = { product_id: string; price: number; effective_from: string };
export type RecipeRow = {
  id: string;
  kind: "menu_item" | "prep";
  name: string;
  yield_qty: number;
  yield_unit: UnitCode;
  active: boolean;
};
export type LineRow = {
  id?: string;
  recipe_id: string;
  sort: number;
  product_id: string | null;
  sub_recipe_id: string | null;
  qty: number;
  unit: UnitCode;
  waste_bps: number;
};

export type CostingData = {
  ingredients: IngredientRow[];
  conversions: ConversionRow[];
  products: ProductRow[];
  /** Price in force today per product (current_product_prices). */
  prices: PriceRow[];
  recipes: RecipeRow[];
  lines: LineRow[];
};

export function toConversion(c: ConversionRow): Conversion {
  return { qty: c.qty, unit: c.unit, equalsQty: c.equals_qty, equalsUnit: c.equals_unit };
}

/** Rows → the core Catalog. `lineOverride` lets the editor cost an unsaved draft. */
export function buildCatalog(d: CostingData, lineOverride?: { recipeId: string; lines: LineRow[] }): Catalog {
  const priceOf = new Map(d.prices.map((p) => [p.product_id, p.price]));
  const conversionsOf = new Map<string, Conversion[]>();
  for (const c of d.conversions) {
    conversionsOf.set(c.ingredient_id, [...(conversionsOf.get(c.ingredient_id) ?? []), toConversion(c)]);
  }
  const ingredientName = new Map(d.ingredients.map((i) => [i.id, i.name]));

  const products = new Map<string, Product>(
    d.products.map((p) => [
      p.id,
      {
        id: p.id,
        name: productLabel(p, ingredientName.get(p.ingredient_id)),
        price: priceOf.get(p.id) ?? null,
        packQty: p.pack_qty,
        packUnit: p.pack_unit,
        yieldBps: p.yield_bps,
        conversions: conversionsOf.get(p.ingredient_id) ?? [],
      },
    ])
  );

  const lines = lineOverride
    ? [...d.lines.filter((l) => l.recipe_id !== lineOverride.recipeId), ...lineOverride.lines]
    : d.lines;
  const recipes = new Map<string, Recipe>(
    d.recipes.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        yieldQty: r.yield_qty,
        yieldUnit: r.yield_unit,
        lines: lines
          .filter((l) => l.recipe_id === r.id)
          .sort((a, b) => a.sort - b.sort)
          .map((l) =>
            l.product_id
              ? { productId: l.product_id, qty: l.qty, unit: l.unit, wasteBps: l.waste_bps }
              : { recipeId: l.sub_recipe_id!, qty: l.qty, unit: l.unit, wasteBps: l.waste_bps }
          ),
      },
    ])
  );
  return { products, recipes };
}

export function productLabel(p: Pick<ProductRow, "brand" | "name" | "pack_qty" | "pack_unit">, ingredient?: string) {
  const what = p.brand ? `${p.brand} ${p.name}` : p.name;
  return `${ingredient && !what.toLowerCase().includes(ingredient.toLowerCase()) ? `${ingredient} · ` : ""}${what} (${fmtQty(p.pack_qty)} ${p.pack_unit})`;
}

/** Price per kg / per L / per pcs — the number people compare when buying. */
export function unitPrice(price: number, packQty: number, packUnit: UnitCode): { value: Q; per: string } {
  const dim = dimensionOf(packUnit);
  const base = toBase(Q.from(packQty), packUnit);
  const perBase = Q.of(price).div(base);
  if (dim === "mass") return { value: perBase.mul(Q.of(1000)), per: "kg" };
  if (dim === "volume") return { value: perBase.mul(Q.of(1000)), per: "L" };
  return { value: perBase, per: "pcs" };
}

/** Rupiah with up to 2 decimals, for per-gram / per-line figures: "Rp 14,5". */
export function fmtRupiahQ(q: Q): string {
  const cents = q.mul(Q.of(100)).round();
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(cents / 100)}`;
}

export function fmtQty(n: number | string): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(n));
}

export function toTaxSettings(row: {
  price_mode: "exclusive" | "inclusive";
  pb1_bps: number;
  service_bps: number;
  pb1_on_service: boolean;
  service_is_revenue: boolean;
  income_tax_mode: "pph_final_umkm" | "custom" | "none";
  income_tax_bps: number;
  income_tax_free_annual_turnover: number;
}): TaxSettings {
  return {
    priceMode: row.price_mode,
    pb1Bps: row.pb1_bps,
    serviceBps: row.service_bps,
    pb1OnService: row.pb1_on_service,
    serviceIsRevenue: row.service_is_revenue,
    incomeTaxMode: row.income_tax_mode,
    incomeTaxBps: row.income_tax_bps,
    incomeTaxFreeAnnualTurnover: row.income_tax_free_annual_turnover,
  };
}
