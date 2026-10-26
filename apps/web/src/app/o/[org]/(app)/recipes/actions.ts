"use server";

import { revalidatePath } from "next/cache";
import { UNIT_CODES, type UnitCode } from "@pantrio/core";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { recomputeMenuCosts } from "@/lib/costing";
import { createClient } from "@/lib/supabase/server";

// Recipes run as the signed-in manager (RLS, P14). A menu item's recipe is
// linked through menu_items.recipe_id; its computed cost is cached on the
// menu item for the till to snapshot (recomputeMenuCosts).

export type Result = { ok: true } | { ok: false; error: string };
export type IdResult = { ok: true; value: string } | { ok: false; error: string };

const unit = z.enum(UNIT_CODES as [UnitCode, ...UnitCode[]]);
const fail = (m: string) => ({ ok: false as const, error: m.replace(/^.*?:\s*(?=[A-Z])/, "") });

async function refresh(slug: string, orgId: string) {
  await recomputeMenuCosts(orgId);
  revalidatePath(`/o/${slug}`, "layout");
}

/** Create the recipe for a menu item (1 portion) and link it. Returns its id. */
export async function createMenuRecipe(slug: string, menuItemId: string): Promise<IdResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("menu_items")
    .select("id, name, recipe_id")
    .eq("id", menuItemId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!item) return fail("Menu item not found.");
  if (item.recipe_id) return { ok: true, value: item.recipe_id };

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({ org_id: org.id, kind: "menu_item", name: item.name, yield_qty: 1, yield_unit: "pcs" })
    .select("id")
    .single();
  if (error || !recipe) return fail(error?.message ?? "Could not create the recipe.");
  const { error: linkError } = await supabase
    .from("menu_items")
    .update({ recipe_id: recipe.id })
    .eq("id", item.id)
    .eq("org_id", org.id);
  if (linkError) return fail(linkError.message);
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true, value: recipe.id };
}

const prep = z.object({
  name: z.string().trim().min(1, "Name the prep recipe.").max(120),
  yield_qty: z.coerce.number().positive("Batch size must be more than 0."),
  yield_unit: unit,
});

/** A sub-recipe used inside dishes: dough, sauce, syrup, cold brew… */
export async function createPrepRecipe(slug: string, formData: FormData): Promise<IdResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const p = prep.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...p.data, org_id: org.id, kind: "prep" })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Could not create the recipe.");
  revalidatePath(`/o/${slug}/recipes`);
  return { ok: true, value: data.id };
}

const saveInput = z.object({
  name: z.string().trim().min(1, "Name the recipe.").max(120),
  yieldQty: z.number().positive("Batch size must be more than 0."),
  yieldUnit: unit,
  lines: z
    .array(
      z
        .object({
          productId: z.uuid().nullable(),
          subRecipeId: z.uuid().nullable(),
          qty: z.number().positive("Every line needs an amount above 0."),
          unit,
          wasteBps: z.number().int().min(0).max(10_000),
        })
        .refine((l) => (l.productId === null) !== (l.subRecipeId === null), "Pick an ingredient on every line.")
    )
    .max(100),
});

export async function saveRecipe(slug: string, recipeId: string, raw: z.input<typeof saveInput>): Promise<Result> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const p = saveInput.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]!.message);
  const supabase = await createClient();
  // One transaction (migration 6): a failed save never leaves an empty recipe.
  const { error } = await supabase.rpc("save_recipe", {
    p_recipe: recipeId,
    p_name: p.data.name,
    p_yield_qty: p.data.yieldQty,
    p_yield_unit: p.data.yieldUnit,
    p_lines: p.data.lines.map((l) => ({
      product_id: l.productId,
      sub_recipe_id: l.subRecipeId,
      qty: l.qty,
      unit: l.unit,
      waste_bps: l.wasteBps,
    })),
  });
  if (error) return fail(error.message);
  await refresh(slug, org.id);
  return { ok: true };
}

/** Delete a recipe. A prep recipe still used by another recipe is refused. */
export async function deleteRecipe(slug: string, recipeId: string): Promise<Result> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId).eq("org_id", org.id);
  if (error) {
    return fail(error.code === "23503" ? "This prep recipe is used in another recipe. Remove it there first." : error.message);
  }
  await refresh(slug, org.id);
  return { ok: true };
}
