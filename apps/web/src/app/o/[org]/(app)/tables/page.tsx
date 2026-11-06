import Link from "next/link";
import { can, requirePermPage } from "@/lib/auth";
import { getFloor } from "@/lib/queries/tables";
import { getCurrentOutlet, tenantBase } from "@/lib/tenant";
import { FloorView } from "./floor-view";

export default async function TablesPage({ params }: PageProps<"/o/[org]/tables">) {
  const { org: slug } = await params;
  const base = await tenantBase(slug);
  const m = await requirePermPage(slug, base, "pos.sell");
  const outlet = await getCurrentOutlet(m.org.id);
  if (!outlet) return null;
  if (!outlet.table_service) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
        Table service is off at this branch.{" "}
        {can(m, "settings.manage") && (
          <Link href={`${base}/settings/tables`} className="underline">
            Turn it on in Settings → Tables.
          </Link>
        )}
      </p>
    );
  }
  const { areas, tables, bills } = await getFloor(m.org.id, outlet.id);
  if (tables.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
        No tables yet.{" "}
        {can(m, "settings.manage") ? (
          <Link href={`${base}/settings/tables`} className="underline">
            Draw your floor plan in Settings → Tables.
          </Link>
        ) : (
          "Ask a manager to set up the floor plan."
        )}
      </p>
    );
  }
  return <FloorView areas={areas} tables={tables} bills={bills} />;
}
