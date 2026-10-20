"use server";

import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SubmitOrderResult =
  | { ok: true; orderId: string; orderNo: number; queueNo: number; grandTotal: number; changeGiven: number }
  | { ok: false; error: string };

const input = z.object({
  slug: z.string().min(1),
  outletId: z.uuid(),
  items: z
    .array(z.object({ menuItemId: z.uuid(), qty: z.number().int().min(1).max(999), note: z.string().max(200).optional() }))
    .min(1, "The cart is empty."),
  amountTendered: z.number().int().nonnegative("Enter a valid amount received."),
  clientRequestId: z.uuid(),
  priority: z.boolean(),
});

/**
 * Takes a cash payment. The client sends only { menuItemId, qty } — never
 * prices; create_order re-reads every price (FOKAS D8). `clientRequestId`
 * makes a retry or a double-tap return the original order (D10). Runs as the
 * signed-in cashier: create_order checks membership itself (P14).
 */
export async function submitCashOrder(raw: z.input<typeof input>): Promise<SubmitOrderResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order." };
  const p = parsed.data;
  const { org } = await requireMembership(p.slug);

  const supabase = await createClient();
  const { data: order, error } = await supabase.rpc("create_order", {
    p_org: org.id,
    p_outlet: p.outletId,
    p_client_request_id: p.clientRequestId,
    p_items: p.items.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty, note: i.note ?? null })),
    p_amount_tendered: p.amountTendered,
    p_priority: p.priority,
  });
  if (error) return { ok: false, error: humanise(error.message) };
  if (!order) return { ok: false, error: "Order could not be created. Please try again." };

  return {
    ok: true,
    orderId: order.id,
    orderNo: order.order_no,
    queueNo: order.queue_no ?? order.order_no,
    grandTotal: order.grand_total,
    changeGiven: p.amountTendered - order.grand_total,
  };
}

/** Manager/owner, same business day — enforced again inside void_order() (D11, D14). */
export async function voidOrder(slug: string, orderId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireMembership(slug, ["owner", "manager"]);
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order." };
  if (!reason.trim()) return { ok: false, error: "A reason is required to void an order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_order", { p_order: orderId, p_reason: reason.trim() });
  return error ? { ok: false, error: humanise(error.message) } : { ok: true };
}

/** Another copy, printed marked SALINAN / REPRINT. Any staff member. */
export async function reprintReceipt(slug: string, orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireMembership(slug);
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("queue_reprint", { p_order: orderId });
  return error ? { ok: false, error: "Could not queue the reprint. Please try again." } : { ok: true };
}

/** Postgres RAISE messages are written for staff already. */
function humanise(message: string): string {
  return message.replace(/^.*?:\s*(?=[A-Z])/, "").trim() || "Something went wrong.";
}
