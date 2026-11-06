import { requirePermPage } from "@/lib/auth";
import { getFloor } from "@/lib/queries/tables";
import { getCurrentOutlet, getOutlets, tenantBase } from "@/lib/tenant";
import { FloorEditor } from "./floor-editor";

export default async function TablesSettingsPage({ params }: PageProps<"/o/[org]/settings/tables">) {
  const { org: slug } = await params;
  const { org } = await requirePermPage(slug, await tenantBase(slug), "settings.manage");
  const [outlet, outlets] = await Promise.all([getCurrentOutlet(org.id), getOutlets(org.id)]);
  if (!outlet) return null;
  const { areas, tables, bills } = await getFloor(org.id, outlet.id);
  return (
    <FloorEditor
      // Remount after a save so the editor starts from what was stored.
      key={JSON.stringify(tables.map((t) => [t.id, t.x, t.y, t.w, t.h, t.name, t.seats, t.shape]))}
      branchName={outlets.filter((o) => o.active).length > 1 ? outlet.name : null}
      on={outlet.table_service}
      areas={areas}
      tables={tables}
      busyTableIds={bills.map((b) => b.table_id)}
    />
  );
}
