"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok: true } | { ok: false; error: string };

export async function saveOutlet(slug: string, id: string | null, name: string): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const parsed = z.string().trim().min(1, "Name the branch.").max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("outlets").update({ name: parsed.data }).eq("id", id).eq("org_id", org.id)
    : await supabase.from("outlets").insert({ org_id: org.id, name: parsed.data });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function setOutletActive(slug: string, id: string, active: boolean): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const supabase = await createClient();
  if (!active) {
    const { count } = await supabase
      .from("outlets")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("active", true);
    if ((count ?? 0) <= 1) return { ok: false, error: "Keep at least one active branch." };
  }
  const { error } = await supabase.from("outlets").update({ active }).eq("id", id).eq("org_id", org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
