"use server";

import { z } from "zod";
import { can, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Moves an order between the kitchen's "To cook" and "Done" tabs (FOKAS D35).
 * `done = false` is the undo for a mis-tap. Runs as the signed-in staff
 * member; set_kitchen_done() checks they belong to the order's restaurant.
 */
export async function setKitchenDone(slug: string, orderId: string, done: boolean) {
  const m = await requireMembership(slug);
  if (!can(m, "kitchen.view") && !can(m, "pos.sell")) return { ok: false as const, error: "Your role can't use the kitchen screen." };
  if (!z.uuid().safeParse(orderId).success) return { ok: false as const, error: "Invalid order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_kitchen_done", { p_order: orderId, p_done: done });
  return error ? { ok: false as const, error: "Could not update the order. Please try again." } : { ok: true as const };
}
