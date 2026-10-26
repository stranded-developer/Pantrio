import { notFound } from "next/navigation";
import { requirePermPage } from "@/lib/auth";
import { loadCostingData } from "@/lib/costing";
import { toTaxSettings } from "@/lib/costing-model";
import { createClient } from "@/lib/supabase/server";
import { getTaxSettings, tenantBase } from "@/lib/tenant";
import { RecipeEditor } from "./recipe-editor";

export default async function RecipePage({ params }: PageProps<"/o/[org]/recipes/[id]">) {
  const { org: slug, id } = await params;
  const { org } = await requirePermPage(slug, await tenantBase(slug), "recipes.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [data, taxRow, { data: menuItem }] = await Promise.all([
    loadCostingData(org.id, supabase),
    getTaxSettings(org.id),
    supabase.from("menu_items").select("id, name, price").eq("org_id", org.id).eq("recipe_id", id).maybeSingle(),
  ]);
  const recipe = data.recipes.find((r) => r.id === id);
  if (!recipe) notFound();

  return <RecipeEditor data={data} recipe={recipe} menuItem={menuItem} tax={toTaxSettings(taxRow)} />;
}
