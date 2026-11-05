import "server-only";
import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

// PIN-only staff (P26). Supabase needs an email per account, so till staff
// get an address that can never receive mail and a random password nobody
// sees; they sign in only with their PIN on a registered terminal.

const HIDDEN_DOMAIN = "staff.pantrio.invalid";

export function hiddenStaffEmail(slug: string): string {
  return `${slug}-${randomBytes(6).toString("hex")}@${HIDDEN_DOMAIN}`;
}

export function isHiddenEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(`@${HIDDEN_DOMAIN}`));
}

export function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Replace someone's password with one nobody knows and sign them out
 * everywhere. Callers make sure they work for this restaurant alone — a
 * login shared with another restaurant is never changed from here.
 */
export async function switchOffPassword(userId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: randomPassword(),
    app_metadata: { pantrio_password_off: true },
  });
  if (error) return error.message;
  await admin.rpc("admin_end_sessions", { p_user: userId });
  return null;
}

/** People who work for `orgId` and nowhere else (their login is ours to change). */
export async function soleOrgMembers(orgId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const admin = createServiceClient();
  const { data } = await admin.from("org_members").select("user_id, org_id").in("user_id", userIds);
  const elsewhere = new Set((data ?? []).filter((m) => m.org_id !== orgId).map((m) => m.user_id));
  return new Set(userIds.filter((id) => !elsewhere.has(id)));
}
