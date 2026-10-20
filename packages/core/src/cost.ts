import { Q } from "./rational";
import { convert, ConversionError, type Conversion, type UnitCode } from "./units";

// Recipe costing. Pure: callers load the catalogue, this computes.
//
// Dish cost is variable cost only — ingredients and packaging (HPP). Wages,
// rent and electricity are monthly fixed costs and enter at the P&L, never
// per dish (decision P11).

/** A brand-specific product as bought: "Segitiga Biru 1 kg, Rp 14.500". */
export type Product = {
  id: string;
  name?: string;
  /** Integer rupiah per pack. `null` = price not entered yet — never treat as 0 (P7). */
  price: number | null;
  packQty: number | string;
  packUnit: UnitCode;
  /** Usable share after trimming/peeling, in bps. 7500 = 75% usable. Default 10000. */
  yieldBps?: number;
  conversions?: readonly Conversion[];
};

export type RecipeLine = (
  | { productId: string; recipeId?: never }
  | { recipeId: string; productId?: never }
) & {
  qty: number | string;
  unit: UnitCode;
  /** Process loss on this line in bps (spillage, over-portioning). Default 0. */
  wasteBps?: number;
};

/** A menu item (yield: 1 pcs) or a prep/sub-recipe (yield: 2 kg of dough). */
export type Recipe = {
  id: string;
  name?: string;
  yieldQty: number | string;
  yieldUnit: UnitCode;
  lines: readonly RecipeLine[];
  conversions?: readonly Conversion[];
};

export type Catalog = {
  products: ReadonlyMap<string, Product>;
  recipes: ReadonlyMap<string, Recipe>;
};

export type MissingCost = {
  reason: "no_price" | "unknown_product" | "unknown_recipe" | "no_conversion" | "zero_yield";
  /** Recipe ids from the top-level dish down to where the gap is. */
  path: string[];
  id: string;
  message: string;
};

export type LineCost = {
  line: RecipeLine;
  /** Exact cost of this line for the whole batch; null when it can't be known. */
  cost: Q | null;
};

export type RecipeCost = {
  recipeId: string;
  /** Exact cost of the whole batch, counting only the lines that are known. */
  knownBatchCost: Q;
  /** True when every line (recursively) has a price. */
  complete: boolean;
  /** Exact cost per one `yieldUnit`; null when incomplete. */
  perYieldUnit: Q | null;
  lines: LineCost[];
  missing: MissingCost[];
};

export class RecipeCycleError extends Error {
  constructor(readonly path: string[]) {
    super(`Recipe uses itself: ${path.join(" → ")}`);
    this.name = "RecipeCycleError";
  }
}

const TEN_K = Q.of(10_000);

function wasteFactor(wasteBps = 0): Q {
  return Q.ONE.add(Q.bps(wasteBps));
}

export function costRecipe(
  recipeId: string,
  catalog: Catalog,
  memo: Map<string, RecipeCost> = new Map(),
  stack: string[] = []
): RecipeCost {
  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);
  const cached = memo.get(recipeId);
  if (cached) return cached;

  const path = [...stack, recipeId];
  const recipe = catalog.recipes.get(recipeId);
  if (!recipe) {
    const missing: MissingCost = {
      reason: "unknown_recipe",
      path,
      id: recipeId,
      message: `Recipe ${recipeId} not found`,
    };
    return { recipeId, knownBatchCost: Q.ZERO, complete: false, perYieldUnit: null, lines: [], missing: [missing] };
  }

  const missing: MissingCost[] = [];
  const lines: LineCost[] = recipe.lines.map((line) => {
    const qty = Q.from(line.qty);
    const waste = wasteFactor(line.wasteBps);

    if (line.productId !== undefined) {
      const product = catalog.products.get(line.productId);
      if (!product) {
        missing.push({ reason: "unknown_product", path, id: line.productId, message: `Product ${line.productId} not found` });
        return { line, cost: null };
      }
      if (product.price === null) {
        missing.push({ reason: "no_price", path, id: product.id, message: `No price for ${product.name ?? product.id}` });
        return { line, cost: null };
      }
      const yieldBps = product.yieldBps ?? 10_000;
      if (yieldBps <= 0) {
        missing.push({ reason: "zero_yield", path, id: product.id, message: `Yield of ${product.name ?? product.id} is 0%` });
        return { line, cost: null };
      }
      try {
        const inPackUnits = convert(qty, line.unit, product.packUnit, [
          ...(product.conversions ?? []),
          ...(recipe.conversions ?? []),
        ]);
        const cost = inPackUnits
          .div(Q.from(product.packQty))
          .mul(Q.of(product.price))
          .mul(TEN_K)
          .div(Q.of(yieldBps))
          .mul(waste);
        return { line, cost };
      } catch (e) {
        if (!(e instanceof ConversionError)) throw e;
        missing.push({ reason: "no_conversion", path, id: product.id, message: e.message });
        return { line, cost: null };
      }
    }

    const sub = costRecipe(line.recipeId, catalog, memo, path);
    missing.push(...sub.missing);
    if (!sub.perYieldUnit) return { line, cost: null };
    const subRecipe = catalog.recipes.get(line.recipeId)!;
    try {
      const inYieldUnits = convert(qty, line.unit, subRecipe.yieldUnit, [
        ...(subRecipe.conversions ?? []),
        ...(recipe.conversions ?? []),
      ]);
      return { line, cost: inYieldUnits.mul(sub.perYieldUnit).mul(waste) };
    } catch (e) {
      if (!(e instanceof ConversionError)) throw e;
      missing.push({ reason: "no_conversion", path, id: subRecipe.id, message: e.message });
      return { line, cost: null };
    }
  });

  const knownBatchCost = lines.reduce((sum, l) => (l.cost ? sum.add(l.cost) : sum), Q.ZERO);
  const yieldQty = Q.from(recipe.yieldQty);
  let complete = missing.length === 0;
  if (yieldQty.cmp(Q.ZERO) <= 0) {
    missing.push({ reason: "zero_yield", path, id: recipe.id, message: `Recipe ${recipe.name ?? recipe.id} yields nothing` });
    complete = false;
  }

  const result: RecipeCost = {
    recipeId,
    knownBatchCost,
    complete,
    perYieldUnit: complete ? knownBatchCost.div(yieldQty) : null,
    lines,
    missing,
  };
  memo.set(recipeId, result);
  return result;
}

export type DishCost = {
  /** Rupiah per one portion (one yield unit), rounded once. null when incomplete. */
  cost: number | null;
  /** Rounded lower bound from the lines that do have prices. */
  knownCost: number;
  complete: boolean;
  missing: MissingCost[];
  detail: RecipeCost;
};

/** Cost of one portion of a dish, rounded to whole rupiah once, at the end. */
export function dishCost(recipeId: string, catalog: Catalog): DishCost {
  const detail = costRecipe(recipeId, catalog);
  const recipe = catalog.recipes.get(recipeId);
  const yieldQty = recipe ? Q.from(recipe.yieldQty) : Q.ONE;
  const known = yieldQty.cmp(Q.ZERO) > 0 ? detail.knownBatchCost.div(yieldQty) : Q.ZERO;
  return {
    cost: detail.perYieldUnit ? detail.perYieldUnit.round() : null,
    knownCost: known.round(),
    complete: detail.complete,
    missing: detail.missing,
    detail,
  };
}
