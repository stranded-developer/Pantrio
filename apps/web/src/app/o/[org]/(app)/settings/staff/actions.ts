"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hiddenStaffEmail, isHiddenEmail, randomPassword, soleOrgMembers, switchOffPassword } from "@/lib/staff-logins";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";

// Invite-only (P19). People in a role that may sign in away from the till
// (owners; roles with "allow_password") get an email + password the owner
// hands over. Everyone else is PIN-only (P26): a hidden address and a random
// password nobody knows. An email that already has an account is linked
// as-is: its password is never changed from here, because that person may
// work for another restaurant too.

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/** "owner", or the id of one of this restaurant's roles. */
const roleRef = z.union([z.literal("owner"), z.uuid("Pick a role.")]);
const membershipFor = (ref: z.infer<typeof roleRef>) =>
  ref === "owner" ? { role: "owner" as const, role_id: null } : { role: "cashier" as const, role_id: ref };
const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "");

/** May people with this role sign in with email + password? */
async function roleAllowsPassword(orgId: string, ref: z.infer<typeof roleRef>): Promise<boolean> {
  if (ref === "owner") return true;
  const supabase = await createClient();
  const { data } = await supabase.from("org_roles").select("allow_password").eq("org_id", orgId).eq("id", ref).single();
  return data?.allow_password ?? false;
}

const newStaff = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  role: roleRef,
  pin: z.union([z.literal(""), z.string().regex(/^\d{4,6}$/, "A PIN is 4 to 6 digits.")]),
  email: z.union([z.literal(""), z.email("Enter a valid email.")]),
  password: z.string(),
});

export async function addStaff(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  if (!hasServiceKey()) return { ok: false, error: "Account creation isn't configured (SUPABASE_SECRET_KEY missing)." };
  const parsed = newStaff.safeParse({ email: "", password: "", pin: "", ...Object.fromEntries(formData) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { name, role, pin } = parsed.data;
  const withPassword = await roleAllowsPassword(org.id, role);
  if (withPassword && !parsed.data.email) return { ok: false, error: "This role signs in away from the till: enter their email." };
  if (!withPassword && !pin) return { ok: false, error: "Give them a PIN — it is how they sign in on the till." };

  const admin = createServiceClient();
  let userId: string | null = null;
  let created = false;
  let message: string | undefined;

  if (withPassword) {
    const { data: existingId } = await admin.rpc("admin_user_id_by_email", { p_email: parsed.data.email });
    userId = existingId;
    if (userId) {
      message = "This email already had an account, so it was linked with its existing password.";
    } else {
      if (parsed.data.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
      const { data, error } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create the account." };
      userId = data.user.id;
      created = true;
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: hiddenStaffEmail(slug),
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: { pantrio_password_off: true },
    });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create the account." };
    userId = data.user.id;
    created = true;
  }

  // Membership and PIN as the owner, through RLS and set_member_pin().
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .upsert({ org_id: org.id, user_id: userId, ...membershipFor(role), active: true });
  if (error) return { ok: false, error: error.message };
  if (pin) {
    const { error: pinError } = await supabase.rpc("set_member_pin", { p_org: org.id, p_user: userId, p_pin: pin });
    if (pinError) {
      // Don't leave a PIN-only person nobody can sign in as.
      if (created && !withPassword) {
        await supabase.from("org_members").delete().eq("org_id", org.id).eq("user_id", userId);
        await admin.auth.admin.deleteUser(userId);
        return { ok: false, error: clean(pinError.message) };
      }
      message = `Saved, but the PIN was not: ${clean(pinError.message)}`;
    }
  }

  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true, message: message ?? (withPassword ? undefined : `${name} signs in with their PIN on the till.`) };
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

  let message: string | undefined;
  // Onto a PIN-only role: their password stops working (P26).
  if (parsedRole && hasServiceKey() && !(await roleAllowsPassword(org.id, parsedRole))) {
    const off = await switchOffIfOurs(org.id, userId);
    if (off) message = off;
  }
  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true, message };
}

/** Switch off a PIN-only member's password, if their login is only ours. Returns a note for the owner. */
async function switchOffIfOurs(orgId: string, userId: string): Promise<string | undefined> {
  const me = await getCurrentUser();
  if (me?.id === userId) return undefined;
  const admin = createServiceClient();
  const { data } = await admin.rpc("admin_user_logins", { p_ids: [userId] });
  if (data?.[0]?.password_off) return undefined;
  if (!(await soleOrgMembers(orgId, [userId])).has(userId)) {
    return "They also work for another restaurant, so their password still works there and here.";
  }
  const error = await switchOffPassword(userId);
  return error ? `Could not switch off their password: ${error}` : "Their password is switched off; they sign in with their PIN on the till.";
}

/** For a PIN-only role member who still has a password (e.g. staff from before P26). */
export async function switchOffMemberPassword(slug: string, userId: string): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  if (!hasServiceKey()) return { ok: false, error: "Not configured (SUPABASE_SECRET_KEY missing)." };
  const note = await switchOffIfOurs(org.id, userId);
  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true, message: note };
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
  const { data: memberships } = await admin.from("org_members").select("org_id, role, role_id").eq("user_id", userId);
  if (!memberships?.length || memberships.some((m) => m.org_id !== org.id)) {
    return { ok: false, error: "This person also works elsewhere; they must change their password themselves." };
  }
  const m = memberships[0]!;
  if (!(await roleAllowsPassword(org.id, m.role === "owner" ? "owner" : (m.role_id ?? "")))) {
    return { ok: false, error: "Their role is PIN-only. Tick “can sign in away from the till” on the role first." };
  }
  const { data: login } = await admin.rpc("admin_user_logins", { p_ids: [userId] });
  if (isHiddenEmail(login?.[0]?.email)) {
    return { ok: false, error: "This person has no email login. Add them again with an email if they need one." };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { pantrio_password_off: false },
  });
  return error ? { ok: false, error: error.message } : { ok: true, message: "Password changed." };
}

/** Set (or clear, with null) the PIN used on terminals. Owner only; unique per restaurant (P25). */
export async function setPin(slug: string, userId: string, pin: string | null): Promise<Result> {
  const { org } = await requireMembership(slug, "owner");
  if (pin !== null && !/^\d{4,6}$/.test(pin)) return { ok: false, error: "A PIN is 4 to 6 digits." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_pin", {
    p_org: org.id,
    p_user: userId,
    // null clears; the generated type doesn't know the argument is nullable.
    p_pin: pin as string,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*(?=[A-Z])/, "") };
  revalidatePath(`/o/${slug}/settings/staff`);
  return { ok: true, message: pin ? "PIN saved. Tell them in person." : "PIN removed." };
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
