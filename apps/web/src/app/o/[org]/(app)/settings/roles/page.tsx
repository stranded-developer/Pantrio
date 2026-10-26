import { requireOwnerPage } from "@/lib/auth";
import { isPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { tenantBase } from "@/lib/tenant";
import { RoleEditor, type RoleRow } from "./role-editor";

export default async function RolesPage({ params }: PageProps<"/o/[org]/settings/roles">) {
  const { org: slug } = await params;
  const { org } = await requireOwnerPage(slug, await tenantBase(slug));
  const supabase = await createClient();
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from("org_roles").select("id, name, permissions").eq("org_id", org.id).order("name"),
    supabase.from("org_members").select("role_id").eq("org_id", org.id).eq("active", true),
  ]);
  const rows: RoleRow[] = (roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    permissions: r.permissions.filter(isPermission),
    members: (members ?? []).filter((m) => m.role_id === r.id).length,
  }));
  return <RoleEditor roles={rows} />;
}
