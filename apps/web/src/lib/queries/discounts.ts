import "server-only";
import type { PosDiscount } from "@pantrio/core";
import { createClient } from "@/lib/supabase/server";

// Menu discounts (P27). create_order applies them; the till shows the same
// result using bestDiscount() from @pantrio/core.

export async function getDiscounts(orgId: string): Promise<PosDiscount[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: links }] = await Promise.all([
    supabase
      .from("discounts")
      .select("id, name, kind, value, all_items, starts_on, ends_on, weekdays, active")
      .eq("org_id", orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("discount_items").select("discount_id, menu_item_id").eq("org_id", orgId),
  ]);
  return (rows ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    value: d.value,
    allItems: d.all_items,
    menuItemIds: (links ?? []).filter((l) => l.discount_id === d.id).map((l) => l.menu_item_id),
    startsOn: d.starts_on,
    endsOn: d.ends_on,
    weekdays: d.weekdays,
    active: d.active,
  }));
}
