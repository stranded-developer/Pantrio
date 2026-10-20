import Link from "next/link";
import { formatDay, formatRupiah, isDate, shiftDay } from "@pantrio/core";
import { requireMembershipPage } from "@/lib/auth";
import { getNames, getOrdersForDate } from "@/lib/queries/pos";
import { businessDateToday, getCurrentOutlet, getOrgSettings, tenantBase } from "@/lib/tenant";
import { DateNav } from "../date-nav";

export default async function OrdersPage({ params, searchParams }: PageProps<"/o/[org]/orders">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const base = await tenantBase(slug);
  const { org } = await requireMembershipPage(slug, base);
  const [today, outlet, settings] = await Promise.all([
    businessDateToday(org.id),
    getCurrentOutlet(org.id),
    getOrgSettings(org.id),
  ]);
  if (!outlet) return null;

  const requested = typeof sp.date === "string" ? sp.date : undefined;
  // A future date has no orders by definition; clamp rather than show "none".
  const date = isDate(requested) && requested <= today ? requested : today;
  const isToday = date === today;

  const orders = await getOrdersForDate(org.id, outlet.id, date);
  const names = await getNames(orders.map((o) => o.opened_by));
  const paid = orders.filter((order) => order.status === "paid");
  const takings = paid.reduce((sum, order) => sum + order.grand_total, 0);
  const cutover = String(settings.dayCutoverHour).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">{isToday ? "Today’s orders" : "Orders"}</h1>
            <p className="text-sm text-neutral-500">
              {formatDay(date)} · business day runs {cutover}:00 to {cutover}:00
            </p>
          </div>
          <DateNav basePath={`${base}/orders`} date={date} prev={shiftDay(date, -1)} next={shiftDay(date, 1)} today={today} />
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-500">{paid.length} orders · takings (excl. voided)</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatRupiah(takings)}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
          {isToday ? "No orders yet today." : "No orders on this day."}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl bg-white shadow-sm">
          {orders.map((order) => {
            const voided = order.status === "voided";
            const cashier = names.get(order.opened_by);
            return (
              <li key={order.id}>
                <Link href={`${base}/orders/${order.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-neutral-50">
                  <div className="min-w-0">
                    <p className={`font-medium ${voided ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
                      {order.queue_no !== null && (
                        <span className="mr-2 rounded-md bg-neutral-900 px-2 py-0.5 text-sm text-white">No. {order.queue_no}</span>
                      )}
                      #{order.order_no}
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {new Date(order.opened_at).toLocaleTimeString("en-GB", {
                        timeZone: settings.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {cashier && ` · ${cashier}`}
                      {voided && order.void_reason && ` · ${order.void_reason}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {voided && (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">VOIDED</span>
                    )}
                    <span className={`font-medium tabular-nums ${voided ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
                      {formatRupiah(order.grand_total)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
