import { getCurrentUser, requireOwnerPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHiddenEmail, soleOrgMembers } from "@/lib/staff-logins";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";
import { tenantBase } from "@/lib/tenant";
import { StaffManager, type StaffRow } from "./staff-manager";

export default async function StaffPage({ params }: PageProps<"/o/[org]/settings/staff">) {
  const { org: slug } = await params;
  const { org } = await requireOwnerPage(slug, await tenantBase(slug));
  const me = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: members }, { data: roles }, { data: pinHolders }] = await Promise.all([
    supabase.from("org_members").select("user_id, role, role_id, active, created_at").eq("org_id", org.id).order("created_at"),
    supabase.from("org_roles").select("id, name, allow_password").eq("org_id", org.id).order("name"),
    supabase.rpc("org_pin_holders", { p_org: org.id }),
  ]);
  const hasPin = new Set((pinHolders ?? []) as string[]);
  const ids = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, logins, soleOrg] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    hasServiceKey()
      ? createServiceClient().rpc("admin_user_logins", { p_ids: ids }).then((r) => r.data ?? [])
      : Promise.resolve([] as { id: string; email: string; password_off: boolean }[]),
    hasServiceKey() ? soleOrgMembers(org.id, ids) : Promise.resolve(new Set<string>()),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const loginOf = new Map(logins.map((l) => [l.id, l]));
  const passwordRole = new Map((roles ?? []).map((r) => [r.id, r.allow_password]));

  const rows: StaffRow[] = (members ?? []).map((m) => ({
    userId: m.user_id,
    name: names.get(m.user_id) ?? "—",
    email: isHiddenEmail(loginOf.get(m.user_id)?.email) ? null : (loginOf.get(m.user_id)?.email ?? null),
    pinOnly: isHiddenEmail(loginOf.get(m.user_id)?.email),
    roleAllowsPassword: m.role === "owner" || (passwordRole.get(m.role_id ?? "") ?? false),
    passwordOff: loginOf.get(m.user_id)?.password_off ?? false,
    soleOrg: soleOrg.has(m.user_id),
    roleRef: m.role === "owner" ? "owner" : (m.role_id ?? ""),
    active: m.active,
    hasPin: hasPin.has(m.user_id),
    isMe: m.user_id === me?.id,
  }));

  return (
    <>
      {!hasServiceKey() && (
        <p className="max-w-3xl rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Creating logins needs the server key (SUPABASE_SECRET_KEY). Roles and deactivation still work.
        </p>
      )}
      <StaffManager
        rows={rows}
        roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name, allowPassword: r.allow_password }))}
        canCreate={hasServiceKey()}
      />
    </>
  );
}
