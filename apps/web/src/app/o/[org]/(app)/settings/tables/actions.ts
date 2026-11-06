"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOutlet } from "@/lib/tenant";

// Settings → Tables (P29): the switch and the floor plan of the branch this
// device works in. SQL checks settings.manage and guards tables in use.

export type Result = { ok: true } | { ok: false; error: string };

const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "");

async function done(slug: string): Promise<Result> {
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function setTableService(slug: string, on: boolean): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const outlet = await getCurrentOutlet(org.id);
  if (!outlet) return { ok: false, error: "No active branch." };
  const { error } = await (await createClient()).rpc("set_table_service", { p_outlet: outlet.id, p_on: on });
  return error ? { ok: false, error: clean(error.message) } : done(slug);
}

const areaName = z.string().trim().min(1, "Name the area.").max(40);

export async function addArea(slug: string, name: string): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const outlet = await getCurrentOutlet(org.id);
  const parsed = areaName.safeParse(name);
  if (!outlet || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "No active branch." };
  const supabase = await createClient();
  const { count } = await supabase.from("floor_areas").select("id", { count: "exact", head: true }).eq("outlet_id", outlet.id);
  const { error } = await supabase
    .from("floor_areas")
    .insert({ org_id: org.id, outlet_id: outlet.id, name: parsed.data, sort: count ?? 0 });
  return error ? { ok: false, error: clean(error.message) } : done(slug);
}

export async function renameArea(slug: string, id: string, name: string): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const parsed = areaName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { error } = await (await createClient()).from("floor_areas").update({ name: parsed.data }).eq("id", id).eq("org_id", org.id);
  return error ? { ok: false, error: clean(error.message) } : done(slug);
}

/** Hide an area. Only an empty one: remove its tables first (that guards open bills). */
export async function removeArea(slug: string, id: string): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const supabase = await createClient();
  const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("area_id", id).eq("active", true);
  if (count) return { ok: false, error: "Remove this area's tables first, then save." };
  const { error } = await supabase.from("floor_areas").update({ active: false }).eq("id", id).eq("org_id", org.id);
  return error ? { ok: false, error: clean(error.message) } : done(slug);
}

const table = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(1, "Every table needs a number or name.").max(12, "Table names are up to 12 characters."),
  seats: z.number().int().min(1).max(50),
  shape: z.enum(["square", "round", "long"]),
  x: z.number().int().min(0).max(23),
  y: z.number().int().min(0).max(15),
  w: z.number().int().min(1).max(8),
  h: z.number().int().min(1).max(8),
});

export async function saveFloorPlan(slug: string, areaId: string, tables: z.input<typeof table>[]): Promise<Result> {
  await requireMembership(slug, "settings.manage");
  const parsed = z.array(table).max(200).safeParse(tables);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const names = parsed.data.map((t) => t.name.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { ok: false, error: `Two tables are called "${dup}". Table numbers must be different.` };
  const { error } = await (await createClient()).rpc("save_floor_plan", { p_area: areaId, p_tables: parsed.data });
  if (error) {
    return {
      ok: false,
      error: /dining_tables_name_idx/.test(error.message)
        ? "That table number is already used in another area of this branch."
        : clean(error.message),
    };
  }
  return done(slug);
}
