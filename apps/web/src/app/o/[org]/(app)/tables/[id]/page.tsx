import { notFound } from "next/navigation";
import { discountAppliesOn } from "@pantrio/core";
import { can, requirePermPage } from "@/lib/auth";
import { getDiscounts } from "@/lib/queries/discounts";
import { getNames, getPosMenu } from "@/lib/queries/pos";
import { getFloor, getTableBill } from "@/lib/queries/tables";
import { businessDateToday, getCurrentOutlet, tenantBase } from "@/lib/tenant";
import { BillClient } from "./bill-client";

export default async function TableBillPage({ params }: PageProps<"/o/[org]/tables/[id]">) {
  const { org: slug, id } = await params;
  const base = await tenantBase(slug);
  const m = await requirePermPage(slug, base, "pos.sell");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, outlet] = await Promise.all([getTableBill(m.org.id, id), getCurrentOutlet(m.org.id)]);
  if (!data || !outlet || data.table.outlet_id !== outlet.id || !outlet.table_service) notFound();

  const [{ categories, items }, discounts, today, floor] = await Promise.all([
    getPosMenu(m.org.id),
    getDiscounts(m.org.id),
    businessDateToday(m.org.id),
    getFloor(m.org.id, outlet.id),
  ]);
  const names = await getNames(data.rounds.map((r) => r.created_by));
  const busy = new Set(floor.bills.map((b) => b.table_id));

  return (
    <BillClient
      table={{ id: data.table.id, name: data.table.name, seats: data.table.seats }}
      bill={data.bill}
      rounds={data.rounds.map((r) => ({ ...r, by: names.get(r.created_by) ?? null }))}
      lines={data.lines}
      categories={categories}
      items={items}
      // Only today's; send_round decides again when the round is sent.
      discounts={discounts.filter((d) => discountAppliesOn(d, today))}
      businessDay={today}
      freeTables={floor.tables.filter((t) => !busy.has(t.id) && t.id !== id).map((t) => ({ id: t.id, name: t.name }))}
      canVoid={can(m, "orders.void")}
    />
  );
}
