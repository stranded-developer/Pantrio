import "server-only";
import { createClient } from "@/lib/supabase/server";

// Table service (P29): the floor plan of one branch, and the open bills on it.

export type FloorArea = { id: string; name: string; sort: number };
export type TableShape = "square" | "round" | "long";
export type DiningTable = {
  id: string;
  area_id: string;
  name: string;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
};
/** What the floor plan shows on a busy table. */
export type OpenBill = {
  id: string;
  table_id: string;
  order_no: number;
  grand_total: number;
  opened_at: string;
  bill_printed_at: string | null;
  guests: number | null;
};

const TABLE_COLUMNS = "id, area_id, name, seats, shape, x, y, w, h";

export async function getFloor(orgId: string, outletId: string) {
  const supabase = await createClient();
  const [areas, tables, bills] = await Promise.all([
    supabase.from("floor_areas").select("id, name, sort").eq("org_id", orgId).eq("outlet_id", outletId).eq("active", true).order("sort").order("created_at"),
    supabase.from("dining_tables").select(TABLE_COLUMNS).eq("org_id", orgId).eq("outlet_id", outletId).eq("active", true).order("name"),
    supabase
      .from("orders")
      .select("id, table_id, order_no, grand_total, opened_at, bill_printed_at, guests")
      .eq("org_id", orgId)
      .eq("outlet_id", outletId)
      .eq("status", "open")
      .not("table_id", "is", null),
  ]);
  return {
    areas: (areas.data ?? []) as FloorArea[],
    tables: (tables.data ?? []) as DiningTable[],
    bills: (bills.data ?? []) as OpenBill[],
  };
}

export type BillLine = {
  id: string;
  round_id: string | null;
  name_snapshot: string;
  qty: number;
  unit_price: number;
  line_subtotal: number;
  line_discount: number;
  discount_name: string | null;
  voided: boolean;
  void_reason: string | null;
  modifiers_json: unknown;
};
export type BillRound = { id: string; round_no: number; created_at: string; created_by: string; kitchen_done_at: string | null };
export type Bill = {
  id: string;
  order_no: number;
  status: string;
  subtotal: number;
  discount_total: number;
  service_total: number;
  tax_total: number;
  grand_total: number;
  price_mode: "exclusive" | "inclusive";
  opened_at: string;
  guests: number | null;
  bill_printed_at: string | null;
};

/** One table, and its open bill with every round and line (voided ones too). */
export async function getTableBill(orgId: string, tableId: string) {
  const supabase = await createClient();
  const { data: table } = await supabase
    .from("dining_tables")
    .select(`${TABLE_COLUMNS}, outlet_id, active`)
    .eq("org_id", orgId)
    .eq("id", tableId)
    .maybeSingle();
  if (!table) return null;
  const { data: bill } = await supabase
    .from("orders")
    .select("id, order_no, status, subtotal, discount_total, service_total, tax_total, grand_total, price_mode, opened_at, guests, bill_printed_at")
    .eq("org_id", orgId)
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();
  if (!bill) return { table, bill: null, rounds: [] as BillRound[], lines: [] as BillLine[] };
  const [rounds, lines] = await Promise.all([
    supabase.from("order_rounds").select("id, round_no, created_at, created_by, kitchen_done_at").eq("order_id", bill.id).order("round_no"),
    supabase
      .from("order_items")
      .select("id, round_id, name_snapshot, qty, unit_price, line_subtotal, line_discount, discount_name, voided, void_reason, modifiers_json")
      .eq("order_id", bill.id)
      .order("id"),
  ]);
  return {
    table,
    bill: bill as Bill,
    rounds: (rounds.data ?? []) as BillRound[],
    lines: (lines.data ?? []) as BillLine[],
  };
}
