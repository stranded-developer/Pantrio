import { costRecipe, dishCost, dishMargin, Q, RecipeCycleError } from "@pantrio/core";
import { requirePermPage } from "@/lib/auth";
import { loadCostingData } from "@/lib/costing";
import { buildCatalog, toTaxSettings, unitPrice } from "@/lib/costing-model";
import { getFullMenu } from "@/lib/queries/pos";
import { getTaxSettings, tenantBase } from "@/lib/tenant";
import { RecipeList, type DishRow, type PrepRow } from "./recipe-list";

export default async function RecipesPage({ params }: PageProps<"/o/[org]/recipes">) {
  const { org: slug } = await params;
  const base = await tenantBase(slug);
  const { org } = await requirePermPage(slug, base, "recipes.manage");
  const [data, { items, categories }, taxRow] = await Promise.all([
    loadCostingData(org.id),
    getFullMenu(org.id),
    getTaxSettings(org.id),
  ]);
  const catalog = buildCatalog(data);
  const tax = toTaxSettings(taxRow);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const dishes: DishRow[] = items
    .filter((i) => i.active)
    .map((item) => {
      const recipeId = item.recipe_id && data.recipes.some((r) => r.id === item.recipe_id) ? item.recipe_id : null;
      const base = { id: item.id, name: item.name, category: categoryName.get(item.category_id) ?? "", price: item.price, recipeId };
      if (!recipeId) return { ...base, status: "none" as const };
      try {
        const c = dishCost(recipeId, catalog);
        const lines = catalog.recipes.get(recipeId)?.lines.length ?? 0;
        if (lines === 0) return { ...base, status: "empty" as const };
        if (c.cost === null) return { ...base, status: "incomplete" as const, missing: c.missing.length, knownCost: c.knownCost };
        const m = dishMargin(item.price, c.cost, tax);
        return {
          ...base,
          status: "costed" as const,
          cost: c.cost,
          foodCostBps: m.foodCostBps,
          marginBeforeTaxBps: m.marginBeforeTaxBps,
          marginAfterTaxBps: m.marginAfterTaxBps,
        };
      } catch (e) {
        if (e instanceof RecipeCycleError) return { ...base, status: "incomplete" as const, missing: 1, knownCost: 0 };
        throw e;
      }
    });

  const usedIn = (id: string) => new Set(data.lines.filter((l) => l.sub_recipe_id === id).map((l) => l.recipe_id)).size;
  const preps: PrepRow[] = data.recipes
    .filter((r) => r.kind === "prep")
    .map((r) => {
      const c = costRecipe(r.id, catalog);
      const per = c.complete ? unitPrice(c.knownBatchCost.round(), r.yield_qty, r.yield_unit) : null;
      return {
        id: r.id,
        name: r.name,
        yieldQty: r.yield_qty,
        yieldUnit: r.yield_unit,
        batchCost: c.complete ? c.knownBatchCost.round() : null,
        perUnit: per ? { value: per.value.mul(Q.of(100)).round() / 100, per: per.per } : null,
        usedIn: usedIn(r.id),
      };
    });

  return <RecipeList dishes={dishes} preps={preps} priceMode={tax.priceMode} />;
}
