import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRupiah } from "@pantrio/core";
import { isManager, requireMembershipPage } from "@/lib/auth";
import { getNames, getOrderDetail, noteOf } from "@/lib/queries/pos";
import { businessDateToday, getOrgSettings, tenantBase } from "@/lib/tenant";
import { ReprintButton } from "./reprint-button";
import { VoidButton } from "./void-button";

export default async function OrderDetailPage({ params }: PageProps<"/o/[org]/orders/[id]">) {
  const { org: slug, id } = await params;
  const base = await tenantBase(slug);
  const { org, role } = await requireMembershipPage(slug, base);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ order, items, payment, lastPrint }, today, settings] = await Promise.all([
    getOrderDetail(org.id, id),
    businessDateToday(org.id),
    getOrgSettings(org.id),
  ]);
  if (!order) notFound();
  const cashier = (await getNames([order.opened_by])).get(order.opened_by);

  const voided = order.status === "voided";
  const canManage = isManager(role);
  const sameBusinessDay = order.business_date === today;
  const canVoid = canManage && order.status === "paid" && sameBusinessDay;
  const inclusive = order.price_mode === "inclusive";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`${base}/orders?date=${order.business_date}`} className="text-sm text-neutral-500 hover:underline">
        ← Orders for {sameBusinessDay ? "today" : order.business_date}
      </Link>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              Order #{order.order_no}
              {order.queue_no !== null && (
                <span className="ml-2 font-normal text-neutral-500">· Customer no. {order.queue_no}</span>
              )}
            </h1>
            <p className="text-sm text-neutral-500">
              {new Date(order.opened_at).toLocaleString("en-GB", {
                timeZone: settings.timezone,
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {cashier && ` · ${cashier}`}
            </p>
          </div>
          {voided && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">VOIDED</span>}
        </div>

        {voided && order.void_reason && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Voided: {order.void_reason}</p>
        )}

        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between py-3">
              <div>
                <span className="text-neutral-900">{item.name_snapshot}</span>
                <span className="ml-2 text-neutral-500">×{item.qty}</span>
                <p className="text-xs text-neutral-400">{formatRupiah(item.unit_price)} each</p>
                {noteOf(item.modifiers_json) && <p className="text-xs text-amber-700">↳ {noteOf(item.modifiers_json)}</p>}
              </div>
              <span className="tabular-nums text-neutral-700">{formatRupiah(item.line_subtotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 text-sm">
          <Row label={inclusive ? "Before tax" : "Subtotal"} value={order.subtotal} />
          {order.service_total > 0 && <Row label={inclusive ? "incl. service" : "Service"} value={order.service_total} />}
          {order.tax_total > 0 && <Row label={inclusive ? "incl. tax" : "Tax"} value={order.tax_total} />}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-semibold text-neutral-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatRupiah(order.grand_total)}</dd>
          </div>
          {canManage && order.cost_total !== null && (
            <div className="flex justify-between pt-1 text-neutral-500">
              <dt>Ingredient cost</dt>
              <dd className="tabular-nums">{formatRupiah(order.cost_total)}</dd>
            </div>
          )}
        </dl>

        {payment && (
          <div className="space-y-1 rounded-xl bg-neutral-50 p-4 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Paid by</span>
              <span className="capitalize">{payment.method}</span>
            </div>
            {payment.amount_tendered != null && (
              <>
                <Row label="Received" value={payment.amount_tendered} />
                <Row label="Change" value={payment.change_given ?? 0} />
              </>
            )}
            {payment.status === "refunded" && <p className="pt-1 text-red-700">Payment reversed</p>}
          </div>
        )}
      </div>

      <ReprintButton orderId={order.id} lastPrint={lastPrint} />

      {canVoid && <VoidButton orderId={order.id} />}

      {canManage && order.status === "paid" && !sameBusinessDay && (
        <p className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-600">
          This order is from a previous business day and can no longer be voided. Same-day only, so closed periods
          stay fixed.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatRupiah(value)}</dd>
    </div>
  );
}
