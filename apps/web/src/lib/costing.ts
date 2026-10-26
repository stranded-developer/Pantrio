import "server-only";
import { dishCost, RecipeCycleError } from "@pantrio/core";
import { createClient } from "@/lib/supabase/server";
import { buildCatalog, type CostingData } from "./costing-model";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Everything costing needs for one restaurant (RLS: members only). */
export async function loadCostingData(orgId: string, supabase?: Client): Promise<CostingData> {
  const db = supabase ?? (await createClient());
  const [ingredients, conversions, products, prices, recipes, lines] = await Promise.all([
    db.from("ingredients").select("id, name, category, active").eq("org_id", orgId).order("name"),
    db.from("ingredient_conversions").select("id, ingredient_id, qty, unit, equals_qty, equals_unit").eq("org_id", orgId),
    db
      .from("ingredient_products")
      .select("id, ingredient_id, brand, name, pack_qty, pack_unit, yield_bps, supplier_id, active")
      .eq("org_id", orgId)
      .order("name"),
    db.from("current_product_prices").select("product_id, price, effective_from").eq("org_id", orgId),
    db.from("recipes").select("id, kind, name, yield_qty, yield_unit, active").eq("org_id", orgId).order("name"),
    db
      .from("recipe_lines")
      .select("id, recipe_id, sort, product_id, sub_recipe_id, qty, unit, waste_bps")
      .eq("org_id", orgId),
  ]);
  for (const r of [ingredients, conversions, products, prices, recipes, lines]) {
    if (r.error) throw new Error(`Could not load costing data: ${r.error.message}`);
  }
  return {
    ingredients: ingredients.data ?? [],
    conversions: conversions.data ?? [],
    products: products.data ?? [],
    prices: (prices.data ?? []).map((p) => ({
      product_id: p.product_id!,
      price: p.price!,
      effective_from: p.effective_from!,
    })),
    recipes: recipes.data ?? [],
    lines: lines.data ?? [],
  };
}

/**
 * Re-cost every menu item that has a recipe and cache the result on
 * menu_items.unit_cost, which create_order() snapshots onto each sale.
 * Unknown (a price or conversion missing) is stored as null, never 0 (P7).
 * Called after any change to prices, products, conversions or recipes.
 */
export async function recomputeMenuCosts(orgId: string): Promise<void> {
  const supabase = await createClient();
  const [data, { data: items }] = await Promise.all([
    loadCostingData(orgId, supabase),
    supabase.from("menu_items").select("id, recipe_id, unit_cost").eq("org_id", orgId),
  ]);
  const catalog = buildCatalog(data);

  const updates = (items ?? []).flatMap((item) => {
    let cost: number | null = null;
    if (item.recipe_id) {
      try {
        cost = dishCost(item.recipe_id, catalog).cost;
      } catch (e) {
        if (!(e instanceof RecipeCycleError)) throw e;
      }
    }
    return cost === item.unit_cost ? [] : [{ id: item.id, cost }];
  });

  if (updates.length === 0) return;
  // Via set_menu_costs (migration 8): recipe/ingredient editors may not hold
  // menu.manage, but the cost cache must still follow their change.
  const { error } = await supabase.rpc("set_menu_costs", { p_org: orgId, p_costs: updates });
  if (error) throw new Error(`Could not update menu costs: ${error.message}`);
}
