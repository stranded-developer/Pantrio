"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { soleOrgMembers, switchOffPassword } from "@/lib/staff-logins";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";

// Roles are owner-only (RLS "owners manage roles", P24): anyone who could
// edit roles could grant themselves anything.

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const input = z.object({
  name: z.string().trim().min(1, "Name the role.").max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
  /** May sign in away from the till with email + password (P26). */
  allowPassword: z.boolean(),
});

export async function saveRole(slug: string, roleId: string | null, raw: z.input<typeof input>): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const supabase = await createClient();
  const values = { name: p.data.name, permissions: [...new Set(p.data.permissions)], allow_password: p.data.allowPassword };
  const { data: before } = roleId
    ? await supabase.from("org_roles").select("allow_password").eq("id", roleId).eq("org_id", org.id).single()
    : { data: null };
  const { error } = roleId
    ? await supabase.from("org_roles").update(values).eq("id", roleId).eq("org_id", org.id)
    : await supabase.from("org_roles").insert({ ...values, org_id: org.id });
  if (error) return { ok: false, error: error.code === "23505" ? "A role with that name already exists." : error.message };

  // Unticked: everyone in this role becomes PIN-only (their own login only).
  let message: string | undefined;
  if (roleId && before?.allow_password && !p.data.allowPassword && hasServiceKey()) {
    const { data: members } = await supabase.from("org_members").select("user_id").eq("org_id", org.id).eq("role_id", roleId);
    const ids = (members ?? []).map((m) => m.user_id);
    const ours = await soleOrgMembers(org.id, ids);
    const { data: logins } = await createServiceClient().rpc("admin_user_logins", { p_ids: [...ours] });
    let n = 0;
    for (const l of logins ?? []) if (!l.password_off && !(await switchOffPassword(l.id))) n += 1;
    const shared = ids.length - ours.size;
    message = `${n} password${n === 1 ? "" : "s"} switched off${shared ? `; ${shared} who also work elsewhere keep theirs` : ""}.`;
  }
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true, message };
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
