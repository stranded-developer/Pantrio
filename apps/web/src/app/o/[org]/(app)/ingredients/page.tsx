import { requirePermPage } from "@/lib/auth";
import { loadCostingData } from "@/lib/costing";
import { createClient } from "@/lib/supabase/server";
import { businessDateToday, tenantBase } from "@/lib/tenant";
import { IngredientManager } from "./ingredient-manager";

export default async function IngredientsPage({ params }: PageProps<"/o/[org]/ingredients">) {
  const { org: slug } = await params;
  const { org } = await requirePermPage(slug, await tenantBase(slug), "ingredients.manage");
  const supabase = await createClient();
  const [data, history, suppliers, today] = await Promise.all([
    loadCostingData(org.id, supabase),
    supabase
      .from("product_prices")
      .select("id, product_id, price, effective_from, note, created_at")
      .eq("org_id", org.id)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("suppliers").select("id, name, phone, notes, active").eq("org_id", org.id).order("name"),
    businessDateToday(org.id),
  ]);
  return (
    <IngredientManager
      data={data}
      history={history.data ?? []}
      suppliers={suppliers.data ?? []}
      today={today}
    />
  );
}
