import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SalesSummary = {
  from: string;
  to: string;
  totals: {
    orders: number;
    gross: number;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
    cogs: number;
    costed_subtotal: number;
  };
  voided: { orders: number; amount: number };
  by_day: { date: string; orders: number; gross: number }[];
  by_hour: { hour: number; orders: number; gross: number }[];
  top_items: { name: string; qty: number; revenue: number; cost: number | null }[];
  by_method: { method: string; orders: number; amount: number }[];
};

/** Summed in SQL (PostgREST's 1000-row cap would under-count a month in JS). */
export async function getSalesSummary(orgId: string, from: string, to: string, outletId?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_summary", {
    p_org: orgId,
    p_from: from,
    p_to: to,
    ...(outletId ? { p_outlet: outletId } : {}),
  });
  if (error || !data) throw new Error(`Could not load sales: ${error?.message ?? "no data"}`);
  return data as unknown as SalesSummary;
}
