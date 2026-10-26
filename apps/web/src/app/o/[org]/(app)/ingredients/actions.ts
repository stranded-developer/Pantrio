"use server";

import { revalidatePath } from "next/cache";
import { UNIT_CODES, type UnitCode } from "@pantrio/core";
import { z } from "zod";
import { getCurrentUser, requireMembership } from "@/lib/auth";
import { recomputeMenuCosts } from "@/lib/costing";
import { createClient } from "@/lib/supabase/server";

// Catalogue writes run as the signed-in manager; RLS is the boundary (P14).
// Prices are append-only history (P6): "change price" inserts a row.
// Every change re-costs the menu so the till snapshots fresh costs.

export type Result = { ok: true } | { ok: false; error: string };

const unit = z.enum(UNIT_CODES as [UnitCode, ...UnitCode[]]);
const id = z.union([z.literal(""), z.uuid()]);
const decimal = (label: string) =>
  z.coerce.number({ message: `${label} must be a number.` }).positive(`${label} must be more than 0.`);

async function done(slug: string, orgId: string): Promise<Result> {
  await recomputeMenuCosts(orgId);
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
const fail = (message: string): Result => ({ ok: false, error: message.replace(/^.*?:\s*(?=[A-Z])/, "") });

const ingredient = z.object({
  id,
  name: z.string().trim().min(1, "Name the ingredient.").max(120),
  category: z.string().trim().max(60).transform((v) => v || null),
});

export async function saveIngredient(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const p = ingredient.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { id: rowId, ...values } = p.data;
  const supabase = await createClient();
  const { error } = rowId
    ? await supabase.from("ingredients").update(values).eq("id", rowId).eq("org_id", org.id)
    : await supabase.from("ingredients").insert({ ...values, org_id: org.id });
  if (error) return fail(error.code === "23505" ? "An ingredient with that name already exists." : error.message);
  return done(slug, org.id);
}

const product = z.object({
  id,
  ingredient_id: z.uuid(),
  brand: z.string().trim().max(80).transform((v) => v || null),
  name: z.string().trim().min(1, "Describe the product, e.g. “Protein tinggi 1kg”.").max(120),
  pack_qty: decimal("Pack size"),
  pack_unit: unit,
  yield_pct: z.coerce.number().min(1, "Usable % must be 1–100.").max(100, "Usable % must be 1–100."),
  supplier_id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  // Only when adding: the first price.
  price: z.union([z.literal(""), z.coerce.number().int("Price is whole rupiah.").min(0)]).optional(),
});

export async function saveProduct(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const p = product.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { id: rowId, yield_pct, price, ...values } = p.data;
  const row = { ...values, yield_bps: Math.round(yield_pct * 100) };
  const supabase = await createClient();
  if (rowId) {
    const { error } = await supabase.from("ingredient_products").update(row).eq("id", rowId).eq("org_id", org.id);
    if (error) return fail(error.message);
  } else {
    const { data, error } = await supabase
      .from("ingredient_products")
      .insert({ ...row, org_id: org.id })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not add the product.");
    if (typeof price === "number") {
      const user = await getCurrentUser();
      const { error: pe } = await supabase
        .from("product_prices")
        .insert({ org_id: org.id, product_id: data.id, price, recorded_by: user!.id });
      if (pe) return fail(pe.message);
    }
  }
  return done(slug, org.id);
}

const price = z.object({
  product_id: z.uuid(),
  price: z.coerce.number().int("Price is whole rupiah, e.g. 14500.").min(0),
  effective_from: z.iso.date("Pick a date."),
  note: z.string().trim().max(200).transform((v) => v || null),
});

export async function recordPrice(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const p = price.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("product_prices").insert({ ...p.data, org_id: org.id, recorded_by: user!.id });
  if (error) return fail(error.message);
  return done(slug, org.id);
}

const conversion = z.object({
  ingredient_id: z.uuid(),
  qty: decimal("Amount"),
  unit,
  equals_qty: decimal("Amount"),
  equals_unit: unit,
});

export async function addConversion(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const p = conversion.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const supabase = await createClient();
  const { error } = await supabase.from("ingredient_conversions").insert({ ...p.data, org_id: org.id });
  if (error) return fail(error.message);
  return done(slug, org.id);
}

export async function removeConversion(slug: string, conversionId: string): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("ingredient_conversions").delete().eq("id", conversionId).eq("org_id", org.id);
  if (error) return fail(error.message);
  return done(slug, org.id);
}

export async function setActive(
  slug: string,
  table: "ingredients" | "ingredient_products" | "suppliers",
  rowId: string,
  active: boolean
): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  if (!["ingredients", "ingredient_products", "suppliers"].includes(table)) return fail("Invalid.");
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ active }).eq("id", rowId).eq("org_id", org.id);
  if (error) return fail(error.message);
  return done(slug, org.id);
}

const supplier = z.object({
  id,
  name: z.string().trim().min(1, "Name the supplier.").max(120),
  phone: z.string().trim().max(40).transform((v) => v || null),
  notes: z.string().trim().max(300).transform((v) => v || null),
});

export async function saveSupplier(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "ingredients.manage");
  const p = supplier.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { id: rowId, ...values } = p.data;
  const supabase = await createClient();
  const { error } = rowId
    ? await supabase.from("suppliers").update(values).eq("id", rowId).eq("org_id", org.id)
    : await supabase.from("suppliers").insert({ ...values, org_id: org.id });
  if (error) return fail(error.message);
  revalidatePath(`/o/${slug}/ingredients`);
  return { ok: true };
}
