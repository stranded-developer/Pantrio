"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";

// Invite-only (P19). The owner creates a login with a password and hands it
// over — no email delivery needed. An email that already has an account is
// linked as-is: its password is never changed from here, because that
// person may work for another restaurant too.

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/** "owner", or the id of one of this restaurant's roles. */
const roleRef = z.union([z.literal("owner"), z.uuid("Pick a role.")]);
const membershipFor = (ref: z.infer<typeof roleRef>) =>
  ref === "owner" ? { role: "owner" as const, role_id: null } : { role: "cashier" as const, role_id: ref };

const newStaff = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: roleRef,
});

export async function addStaff(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  if (!hasServiceKey()) return { ok: false, error: "Account creation isn't configured (SUPABASE_SECRET_KEY missing)." };
  const parsed = newStaff.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { name, email, password } = parsed.data;

  const admin = createServiceClient();
  const { data: existingId } = await admin.rpc("admin_user_id_by_email", { p_email: email });
  let userId = existingId;
  let message: string | undefined;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create the account." };
    userId = data.user.id;
  } else {
    message = "This email already had an account, so it was linked with its existing password.";
  }

  // Membership as the owner, through RLS ("owners manage memberships").
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .upsert({ org_id: org.id, user_id: userId, ...membershipFor(parsed.data.role), active: true });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true, message };
}

export async function updateMember(
  slug: string,
  userId: string,
  changes: { role?: string; active?: boolean }
): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const parsedRole = changes.role === undefined ? undefined : roleRef.parse(changes.role);
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({
      ...(parsedRole ? membershipFor(parsedRole) : {}),
      ...(changes.active === undefined ? {} : { active: changes.active }),
    })
    .eq("org_id", org.id)
    .eq("user_id", userId);
  // The database refuses to remove the last active owner.
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true };
}

export async function resetPassword(slug: string, userId: string, password: string): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  if (!hasServiceKey()) return { ok: false, error: "Not configured (SUPABASE_SECRET_KEY missing)." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const me = await getCurrentUser();
  if (me?.id === userId) return { ok: false, error: "Change your own password under your account." };

  const admin = createServiceClient();
  // Only for people who work for this restaurant alone — never reset a
  // login another restaurant also relies on.
  const { data: memberships } = await admin.from("org_members").select("org_id").eq("user_id", userId);
  if (!memberships?.length || memberships.some((m) => m.org_id !== org.id)) {
    return { ok: false, error: "This person also works elsewhere; they must change their password themselves." };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  return error ? { ok: false, error: error.message } : { ok: true, message: "Password changed." };
}

/** Correct a staff member's name (shown on receipts). Owner only; SQL refuses people who also work elsewhere. */
export async function renameMember(slug: string, userId: string, name: string): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_rename_member", { p_org: org.id, p_user: userId, p_name: name });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*(?=[A-Z])/, "") };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
