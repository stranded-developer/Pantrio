"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Menu writes run as the signed-in manager; RLS ("managers write menu") is
// the boundary (P14). Items are never deleted, only hidden (FOKAS D12), and
// every order line snapshots name and price, so edits never rewrite history.

export type ActionResult = { ok: true } | { ok: false; error: string };

const item = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(1, "Name is required.").max(120),
  category_id: z.uuid("Pick a category."),
  // Whole rupiah. "25.5" is a typo, not an instruction.
  price: z.coerce.number().int("Price must be a whole number of rupiah, e.g. 25000.").min(0),
});

const category = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(1, "Name is required.").max(80),
  sort: z.coerce.number().int("Sort must be a whole number."),
});

async function done(slug: string): Promise<ActionResult> {
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function upsertMenuItem(slug: string, formData: FormData): Promise<ActionResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const parsed = item.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("menu_items").update(values).eq("id", id).eq("org_id", org.id)
    : await supabase.from("menu_items").insert({ ...values, org_id: org.id });
  return error ? { ok: false, error: error.message } : done(slug);
}

export async function setMenuItemActive(slug: string, id: string, active: boolean): Promise<ActionResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").update({ active }).eq("id", id).eq("org_id", org.id);
  return error ? { ok: false, error: error.message } : done(slug);
}

export async function upsertMenuCategory(slug: string, formData: FormData): Promise<ActionResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const parsed = category.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("menu_categories").update(values).eq("id", id).eq("org_id", org.id)
    : await supabase.from("menu_categories").insert({ ...values, org_id: org.id });
  return error ? { ok: false, error: error.message } : done(slug);
}

export async function setMenuCategoryActive(slug: string, id: string, active: boolean): Promise<ActionResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("menu_categories").update({ active }).eq("id", id).eq("org_id", org.id);
  return error ? { ok: false, error: error.message } : done(slug);
}
