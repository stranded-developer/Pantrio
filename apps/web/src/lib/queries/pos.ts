import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MenuCategory = { id: string; name: string; sort: number; active: boolean };
export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  active: boolean;
  unit_cost: number | null;
  recipe_id: string | null;
};

const ITEM_COLUMNS = "id, category_id, name, price, active, unit_cost, recipe_id";

/** Active menu for the POS grid. */
export async function getPosMenu(orgId: string) {
  const supabase = await createClient();
  const [categories, items] = await Promise.all([
    supabase.from("menu_categories").select("id, name, sort, active").eq("org_id", orgId).eq("active", true).order("sort"),
    supabase.from("menu_items").select(ITEM_COLUMNS).eq("org_id", orgId).eq("active", true).order("name"),
  ]);
  return { categories: (categories.data ?? []) as MenuCategory[], items: (items.data ?? []) as MenuItem[] };
}

/** Full menu including hidden rows, for the management screen. */
export async function getFullMenu(orgId: string) {
  const supabase = await createClient();
  const [categories, items] = await Promise.all([
    supabase.from("menu_categories").select("id, name, sort, active").eq("org_id", orgId).order("sort"),
    supabase.from("menu_items").select(ITEM_COLUMNS).eq("org_id", orgId).order("name"),
  ]);
  return { categories: (categories.data ?? []) as MenuCategory[], items: (items.data ?? []) as MenuItem[] };
}

export type OrderSummary = {
  id: string;
  order_no: number;
  queue_no: number | null;
  status: string;
  grand_total: number;
  opened_at: string;
  void_reason: string | null;
  opened_by: string;
};

/** One business day's orders for one outlet, newest first. */
export async function getOrdersForDate(orgId: string, outletId: string, businessDate: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_no, queue_no, status, grand_total, opened_at, void_reason, opened_by")
    .eq("org_id", orgId)
    .eq("outlet_id", outletId)
    .eq("business_date", businessDate)
    .order("order_no", { ascending: false })
    // PostgREST caps at 1000 rows; ask explicitly so a busy day fails loudly.
    .limit(1000);
  return (data ?? []) as OrderSummary[];
}

/** id → full name for the people on a list of orders (RLS: co-workers only). */
export async function getNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

export async function getOrderDetail(orgId: string, orderId: string) {
  const supabase = await createClient();
  const [order, items, payment, printJob] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, queue_no, status, subtotal, service_total, tax_total, grand_total, cost_total, price_mode, opened_at, opened_by, business_date, void_reason, voided_at"
      )
      .eq("org_id", orgId)
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, name_snapshot, qty, unit_price, line_subtotal, unit_cost, voided, modifiers_json")
      .eq("org_id", orgId)
      .eq("order_id", orderId),
    supabase
      .from("payments")
      .select("method, amount, amount_tendered, change_given, status")
      .eq("org_id", orgId)
      .eq("order_id", orderId)
      .maybeSingle(),
    supabase
      .from("print_jobs")
      .select("kind, status, last_error, created_at, printed_at")
      .eq("org_id", orgId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { order: order.data, items: items.data ?? [], payment: payment.data, lastPrint: printJob.data };
}

/** A line note is stored as [{ "note": "…" }] (FOKAS create_cafe_order). */
export function noteOf(modifiers: unknown): string | null {
  if (!Array.isArray(modifiers)) return null;
  const notes = modifiers
    .map((entry) => (entry as { note?: unknown })?.note)
    .filter((note): note is string => typeof note === "string" && note.length > 0);
  return notes.length > 0 ? notes.join(", ") : null;
}
