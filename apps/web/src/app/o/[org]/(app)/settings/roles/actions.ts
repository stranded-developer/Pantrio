"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

// Roles are owner-only (RLS "owners manage roles", P24): anyone who could
// edit roles could grant themselves anything.

export type Result = { ok: true } | { ok: false; error: string };

const input = z.object({
  name: z.string().trim().min(1, "Name the role.").max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
});

export async function saveRole(slug: string, roleId: string | null, raw: z.input<typeof input>): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const supabase = await createClient();
  const values = { name: p.data.name, permissions: [...new Set(p.data.permissions)] };
  const { error } = roleId
    ? await supabase.from("org_roles").update(values).eq("id", roleId).eq("org_id", org.id)
    : await supabase.from("org_roles").insert({ ...values, org_id: org.id });
  if (error) return { ok: false, error: error.code === "23505" ? "A role with that name already exists." : error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function deleteRole(slug: string, roleId: string): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("org_roles").delete().eq("id", roleId).eq("org_id", org.id);
  if (error) {
    return {
      ok: false,
      error: error.code === "23503" ? "Someone still has this role — give them another role first (Staff)." : error.message,
    };
  }
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
