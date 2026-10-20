import { getCurrentUser, requireOwnerPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";
import { tenantBase } from "@/lib/tenant";
import { StaffManager, type StaffRow } from "./staff-manager";

export default async function StaffPage({ params }: PageProps<"/o/[org]/settings/staff">) {
  const { org: slug } = await params;
  const { org } = await requireOwnerPage(slug, await tenantBase(slug));
  const me = await getCurrentUser();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role, active, created_at")
    .eq("org_id", org.id)
    .order("created_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, emails] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    hasServiceKey()
      ? createServiceClient().rpc("admin_user_emails", { p_ids: ids }).then((r) => r.data ?? [])
      : Promise.resolve([] as { id: string; email: string }[]),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const emailOf = new Map(emails.map((e) => [e.id, e.email]));

  const rows: StaffRow[] = (members ?? []).map((m) => ({
    userId: m.user_id,
    name: names.get(m.user_id) ?? "—",
    email: emailOf.get(m.user_id) ?? null,
    role: m.role,
    active: m.active,
    isMe: m.user_id === me?.id,
  }));

  return (
    <>
      {!hasServiceKey() && (
        <p className="max-w-3xl rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Creating logins needs the server key (SUPABASE_SECRET_KEY). Roles and deactivation still work.
        </p>
      )}
      <StaffManager rows={rows} canCreate={hasServiceKey()} />
    </>
  );
}
