"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Table service (P29). The client sends only { menuItemId, qty, note } —
// SQL prices every line (D8) and totals the whole bill. Every call runs as
// the signed-in waiter (P22); SQL checks permissions again.

export type Result = { ok: true } | { ok: false; error: string };

const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "").trim() || "Something went wrong.";

const round = z.object({
  slug: z.string().min(1),
  outletId: z.uuid(),
  tableId: z.uuid(),
  /** The bill the waiter was looking at; null = the table was free. */
  orderId: z.uuid().nullable(),
  clientRequestId: z.uuid(),
  guests: z.number().int().min(1).max(200).nullable(),
  items: z
    .array(z.object({ menuItemId: z.uuid(), qty: z.number().int().min(1).max(999), note: z.string().max(200).optional() }))
    .min(1, "Add something first."),
});

export async function sendRound(raw: z.input<typeof round>): Promise<Result> {
  const parsed = round.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order." };
  const p = parsed.data;
  const { org } = await requireMembership(p.slug, "pos.sell");
  const { error } = await (await createClient()).rpc("send_round", {
    p_org: org.id,
    p_outlet: p.outletId,
    p_table: p.tableId,
    // The generated types don't know these are nullable.
    p_order: p.orderId as string,
    p_client_request_id: p.clientRequestId,
    p_items: p.items.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty, note: i.note ?? null })),
    p_guests: p.guests as number,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${p.slug}/tables`, "layout");
  return { ok: true };
}

export async function voidBillItem(slug: string, itemId: string, reason: string): Promise<Result> {
  await requireMembership(slug, "orders.void");
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  if (!reason.trim()) return { ok: false, error: "Give a reason." };
  const { error } = await (await createClient()).rpc("void_bill_item", { p_item: itemId, p_reason: reason.trim() });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/tables`, "layout");
  return { ok: true };
}

export async function moveBill(slug: string, orderId: string, tableId: string): Promise<Result> {
  await requireMembership(slug, "pos.sell");
  if (!z.uuid().safeParse(orderId).success || !z.uuid().safeParse(tableId).success) return { ok: false, error: "Invalid table." };
  const { error } = await (await createClient()).rpc("move_bill", { p_order: orderId, p_table: tableId });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/tables`, "layout");
  return { ok: true };
}

export async function printBill(slug: string, orderId: string): Promise<Result> {
  await requireMembership(slug, "pos.sell");
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Invalid bill." };
  const { error } = await (await createClient()).rpc("print_bill", { p_order: orderId });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/tables`, "layout");
  return { ok: true };
}

export type SettleResult = { ok: true; grandTotal: number; changeGiven: number } | { ok: false; error: string };

export async function settleBill(slug: string, orderId: string, amountTendered: number): Promise<SettleResult> {
  await requireMembership(slug, "pos.sell");
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Invalid bill." };
  if (!Number.isInteger(amountTendered) || amountTendered < 0) return { ok: false, error: "Enter a valid amount received." };
  const { data, error } = await (await createClient()).rpc("settle_bill", { p_order: orderId, p_amount_tendered: amountTendered });
  if (error || !data) return { ok: false, error: clean(error?.message ?? "Could not take the payment.") };
  revalidatePath(`/o/${slug}/tables`, "layout");
  return { ok: true, grandTotal: data.grand_total, changeGiven: amountTendered - data.grand_total };
}

/** Guests left / everything off: cancels the open bill (orders.void, audited). */
export async function cancelBill(slug: string, orderId: string, reason: string): Promise<Result> {
  await requireMembership(slug, "orders.void");
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Invalid bill." };
  if (!reason.trim()) return { ok: false, error: "Give a reason." };
  const { error } = await (await createClient()).rpc("void_order", { p_order: orderId, p_reason: reason.trim() });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/tables`, "layout");
  return { ok: true };
}
