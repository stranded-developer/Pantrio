import "server-only";
import { createClient } from "@/lib/supabase/server";

export type KitchenItem = { id: string; name_snapshot: string; qty: number; voided: boolean; modifiers_json: unknown };
export type KitchenOrder = {
  id: string;
  queue_no: number;
  priority: boolean;
  opened_at: string;
  kitchen_done_at: string | null;
  order_items: KitchenItem[];
};

// Windows rather than business_date: an order rung up just before the
// cutover must not vanish from the kitchen while it is still cooking.
const WINDOW_HOURS = 12;
const DONE_LIMIT = 50;
const SELECT =
  "id, queue_no, priority, opened_at, kitchen_done_at, order_items(id, name_snapshot, qty, voided, modifiers_json)";

/** The kitchen board for one outlet. Never voided orders — not food to make. */
export async function getKitchenOrders(orgId: string, outletId: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const [pending, done] = await Promise.all([
    supabase
      .from("orders")
      .select(SELECT)
      .eq("org_id", orgId)
      .eq("outlet_id", outletId)
      .not("queue_no", "is", null)
      .eq("status", "paid")
      .is("kitchen_done_at", null)
      .gte("opened_at", since)
      // Priority first, then oldest first — the order they should be cooked.
      .order("priority", { ascending: false })
      .order("opened_at", { ascending: true }),
    supabase
      .from("orders")
      .select(SELECT)
      .eq("org_id", orgId)
      .eq("outlet_id", outletId)
      .not("queue_no", "is", null)
      .eq("status", "paid")
      .gte("kitchen_done_at", since)
      .order("kitchen_done_at", { ascending: false })
      .limit(DONE_LIMIT),
  ]);
  return {
    pending: (pending.data ?? []) as unknown as KitchenOrder[],
    done: (done.data ?? []) as unknown as KitchenOrder[],
  };
}
