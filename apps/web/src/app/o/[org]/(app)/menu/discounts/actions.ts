"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Menu discounts (P27). save_discount() writes the discount and its item
// list together and checks menu.manage itself.

export type Result = { ok: true } | { ok: false; error: string };

const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const input = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Name the discount.").max(60),
    kind: z.enum(["percent", "amount"]),
    /** percent: e.g. 20 or 12.5; amount: rupiah. */
    value: z.number().positive("Enter how much off."),
    allItems: z.boolean(),
    items: z.array(z.uuid()),
    startsOn: day,
    endsOn: day.nullable(),
    weekdays: z.array(z.number().int().min(1).max(7)),
    active: z.boolean(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "A percentage is at most 100." })
  .refine((v) => v.kind !== "amount" || Number.isInteger(v.value), { message: "Whole rupiah only." })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { message: "The end date is before the start." })
  .refine((v) => v.allItems || v.items.length > 0, { message: "Tick at least one menu item, or All menu items." });

export async function saveDiscount(slug: string, raw: z.input<typeof input>): Promise<Result> {
  const { org } = await requireMembership(slug, "menu.manage");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_discount", {
    p_org: org.id,
    p_id: d.id as string, // null = new; the generated type doesn't know it is nullable
    p_name: d.name,
    p_kind: d.kind,
    p_value: d.kind === "percent" ? Math.round(d.value * 100) : d.value,
    p_all_items: d.allItems,
    p_items: d.allItems ? [] : d.items,
    p_starts: d.startsOn,
    p_ends: d.endsOn as string,
    // All seven ticked = every day.
    p_weekdays: (d.weekdays.length === 0 || d.weekdays.length === 7 ? null : [...new Set(d.weekdays)].sort()) as number[],
    p_active: d.active,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function deleteDiscount(slug: string, id: string): Promise<Result> {
  const { org } = await requireMembership(slug, "menu.manage");
  const supabase = await createClient();
  // Past orders keep the discount's name and amount on their lines.
  const { error } = await supabase.from("discounts").delete().eq("id", id).eq("org_id", org.id);
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
