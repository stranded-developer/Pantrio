import "server-only";
import { createClient } from "@/lib/supabase/server";

export type KitchenItem = { id: string; name_snapshot: string; qty: number; voided: boolean; modifiers_json: unknown };
/**
 * One ticket on the board: a pay-now order (by customer number, D35) or one
 * round of a table's bill (P29) — a table sends several over a meal.
 */
export type KitchenOrder = {
  id: string;
  kind: "order" | "round";
  /** Customer number, or the table's name. */
  label: string;
  /** Round number for a table, null for a pay-now order. */
  round_no: number | null;
  priority: boolean;
  opened_at: string;
  kitchen_done_at: string | null;
  order_items: KitchenItem[];
};

// Windows rather than business_date: an order rung up just before the
// cutover must not vanish from the kitchen while it is still cooking.
const WINDOW_HOURS = 12;
const DONE_LIMIT = 50;
const ITEMS = "order_items(id, name_snapshot, qty, voided, modifiers_json)";
const ORDER_SELECT = `id, queue_no, priority, opened_at, kitchen_done_at, ${ITEMS}`;
const ROUND_SELECT = `id, round_no, created_at, kitchen_done_at, orders!inner(status, dining_tables(name)), ${ITEMS}`;

type OrderRow = { id: string; queue_no: number; priority: boolean; opened_at: string; kitchen_done_at: string | null; order_items: KitchenItem[] };
type RoundRow = {
  id: string;
  round_no: number;
  created_at: string;
  kitchen_done_at: string | null;
  orders: { status: string; dining_tables: { name: string } | null };
  order_items: KitchenItem[];
};

const fromOrder = (o: OrderRow): KitchenOrder => ({
  id: o.id,
  kind: "order",
  label: String(o.queue_no),
  round_no: null,
  priority: o.priority,
  opened_at: o.opened_at,
  kitchen_done_at: o.kitchen_done_at,
  order_items: o.order_items,
});
const fromRound = (r: RoundRow): KitchenOrder => ({
  id: r.id,
  kind: "round",
  label: `T${r.orders.dining_tables?.name ?? "?"}`,
  round_no: r.round_no,
  priority: false,
  opened_at: r.created_at,
  kitchen_done_at: r.kitchen_done_at,
  order_items: r.order_items,
});
// A round whose lines were all taken off has nothing to cook.
const hasFood = (t: KitchenOrder) => t.order_items.some((i) => !i.voided);

/** The kitchen board for one outlet. Never voided orders — not food to make. */
export async function getKitchenOrders(orgId: string, outletId: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const orders = () =>
    supabase.from("orders").select(ORDER_SELECT).eq("org_id", orgId).eq("outlet_id", outletId).not("queue_no", "is", null).eq("status", "paid");
  const rounds = () =>
    supabase.from("order_rounds").select(ROUND_SELECT).eq("org_id", orgId).eq("outlet_id", outletId).in("orders.status", ["open", "paid"]);
  const [pendingOrders, doneOrders, pendingRounds, doneRounds] = await Promise.all([
    orders().is("kitchen_done_at", null).gte("opened_at", since),
    orders().gte("kitchen_done_at", since).order("kitchen_done_at", { ascending: false }).limit(DONE_LIMIT),
    rounds().is("kitchen_done_at", null).gte("created_at", since),
    rounds().gte("kitchen_done_at", since).order("kitchen_done_at", { ascending: false }).limit(DONE_LIMIT),
  ]);
  const pending = [
    ...((pendingOrders.data ?? []) as unknown as OrderRow[]).map(fromOrder),
    ...((pendingRounds.data ?? []) as unknown as RoundRow[]).map(fromRound),
  ]
    .filter(hasFood)
    // Priority first, then oldest first — the order they should be cooked.
    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.opened_at.localeCompare(b.opened_at));
  const done = [
    ...((doneOrders.data ?? []) as unknown as OrderRow[]).map(fromOrder),
    ...((doneRounds.data ?? []) as unknown as RoundRow[]).map(fromRound),
  ]
    .filter(hasFood)
    .sort((a, b) => (b.kitchen_done_at ?? "").localeCompare(a.kitchen_done_at ?? ""))
    .slice(0, DONE_LIMIT);
  return { pending, done };
}
