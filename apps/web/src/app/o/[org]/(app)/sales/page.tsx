import Link from "next/link";
import { formatBps, formatDay, formatRupiah, isDate, isPeriod, periodRange, Q, type Period } from "@pantrio/core";
import { requirePermPage } from "@/lib/auth";
import { getSalesSummary, type SalesSummary } from "@/lib/queries/sales";
import { businessDateToday, getCurrentOutlet, getOutlets, tenantBase } from "@/lib/tenant";
import { DateNav } from "../date-nav";
import { BarChart, type Bar } from "./bar-chart";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default async function SalesPage({ params: routeParams, searchParams }: PageProps<"/o/[org]/sales">) {
  const [{ org: slug }, params] = await Promise.all([routeParams, searchParams]);
  const base = await tenantBase(slug);
  const { org } = await requirePermPage(slug, base, "sales.view");

  const [today, outlet, outlets] = await Promise.all([
    businessDateToday(org.id),
    getCurrentOutlet(org.id),
    getOutlets(org.id),
  ]);
  const period: Period = isPeriod(params.period) ? params.period : "day";
  const anchor = isDate(params.date) && params.date <= today ? params.date : today;

  // With one branch the recap is the restaurant; with several, this branch.
  const range = periodRange(period, anchor);
  const summary = await getSalesSummary(
    org.id,
    range.from,
    range.to,
    outlets.length > 1 ? outlet?.id : undefined
  );
  const { totals, voided } = summary;
  const average = totals.orders > 0 ? Math.round(totals.gross / totals.orders) : 0;
  // Margin only over orders whose every line had a cost (P7): unknown ≠ 0.
  const coverageBps =
    totals.subtotal > 0 ? Q.of(totals.costed_subtotal).div(Q.of(totals.subtotal)).toBps() : 0;
  const marginBps =
    totals.costed_subtotal > 0
      ? Q.of(totals.costed_subtotal - totals.cogs).div(Q.of(totals.costed_subtotal)).toBps()
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Sales</h1>
            <p className="text-sm text-neutral-500">
              {range.label} · voided orders excluded from takings
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-neutral-200 p-1">
              {PERIODS.map((option) => (
                <Link
                  key={option.value}
                  href={`${base}/sales?period=${option.value}&date=${anchor}`}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    option.value === period
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <DateNav
              basePath={`${base}/sales`}
              date={anchor}
              // Step by whole periods; never past the period containing today.
              prev={range.prev}
              next={range.next > today ? today : range.next}
              today={today}
              extraParams={{ period }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Takings" value={formatRupiah(totals.gross)} emphasis />
        <Tile label="Orders" value={totals.orders.toLocaleString("id-ID")} />
        <Tile label="Average order" value={formatRupiah(average)} />
        <Tile
          label="Voided"
          value={formatRupiah(voided.amount)}
          note={`${voided.orders} order${voided.orders === 1 ? "" : "s"}`}
        />
      </div>

      {marginBps !== null && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Ingredient cost" value={formatRupiah(totals.cogs)} note="costed orders only" />
          <Tile label="Gross margin" value={formatBps(marginBps)} emphasis />
          <Tile
            label="Cost coverage"
            value={formatBps(coverageBps)}
            note={coverageBps < 10_000 ? "of sales have recipes with prices" : "every sale costed"}
          />
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <BarChart
          title={period === "day" ? "Takings by hour" : "Takings by day"}
          bars={period === "day" ? hourBars(summary) : dayBars(summary, period)}
        />

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-neutral-500">Show as table</summary>
          <BreakdownTable summary={{ ...summary, base }} period={period} />
        </details>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-900">Top items</h2>
          {summary.top_items.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing sold.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                  <th className="pb-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {summary.top_items.map((item) => (
                  <tr key={item.name}>
                    <td className="py-2 text-neutral-800">{item.name}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-600">{item.qty}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-800">
                      {formatRupiah(item.revenue)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {item.cost !== null && item.revenue > 0
                        ? formatBps(Q.of(item.revenue - item.cost).div(Q.of(item.revenue)).toBps())
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <h2 className="mb-3 font-semibold text-neutral-900">Breakdown</h2>
            <dl className="space-y-1 text-sm">
              <Line label="Items (subtotal)" value={totals.subtotal} />
              {totals.discount > 0 && <Line label="Discounts" value={-totals.discount} />}
              <Line label="Service charge" value={totals.service} />
              <Line label="Tax / PB1" value={totals.tax} />
              <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
                <dt>Takings</dt>
                <dd className="tabular-nums">{formatRupiah(totals.gross)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="mb-3 font-semibold text-neutral-900">Payment methods</h2>
            {summary.by_method.length === 0 ? (
              <p className="text-sm text-neutral-400">No payments.</p>
            ) : (
              <dl className="space-y-1 text-sm">
                {summary.by_method.map((method) => (
                  <div key={method.method} className="flex justify-between text-neutral-600">
                    <dt className="capitalize">
                      {method.method}{" "}
                      <span className="text-neutral-400">· {method.orders}</span>
                    </dt>
                    <dd className="tabular-nums text-neutral-800">{formatRupiah(method.amount)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p
        className={`mt-1 tabular-nums text-neutral-900 ${
          emphasis ? "text-2xl font-semibold" : "text-xl font-medium"
        }`}
      >
        {value}
      </p>
      {note && <p className="text-xs text-neutral-400">{note}</p>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatRupiah(value)}</dd>
    </div>
  );
}

/** Contiguous hours from the first to the last with a sale, gaps as zero. */
function hourBars(summary: SalesSummary): Bar[] {
  if (summary.by_hour.length === 0) return [];

  const byHour = new Map(summary.by_hour.map((row) => [row.hour, row]));
  const first = summary.by_hour[0]!.hour;
  const last = summary.by_hour[summary.by_hour.length - 1]!.hour;
  const bars: Bar[] = [];

  for (let hour = first; hour <= last; hour++) {
    const row = byHour.get(hour);
    const hh = String(hour).padStart(2, "0");
    bars.push({
      key: hh,
      label: `${hh}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`,
      tick: hh,
      value: row?.gross ?? 0,
      orders: row?.orders ?? 0,
    });
  }

  return bars;
}

function dayBars(summary: SalesSummary, period: Period): Bar[] {
  return summary.by_day.map((row, index) => {
    const day = new Date(`${row.date}T00:00:00Z`);
    const dayOfMonth = day.getUTCDate();
    return {
      key: row.date,
      label: formatDay(row.date),
      tick:
        period === "week"
          ? day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
          : // A month has ~30 bars: label the 1st and every 5th so ticks never collide.
            index === 0 || dayOfMonth % 5 === 0
            ? String(dayOfMonth)
            : "",
      value: row.gross,
      orders: row.orders,
    };
  });
}

function BreakdownTable({ summary, period }: { summary: SalesSummary & { base: string }; period: Period }) {
  const rows =
    period === "day"
      ? hourBars(summary)
      : dayBars(summary, period).filter((bar) => period === "week" || bar.value > 0);
  const base = summary.base;

  if (rows.length === 0) return <p className="mt-2 text-neutral-400">No sales.</p>;

  return (
    <table className="mt-2 w-full">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
          <th className="pb-2 font-medium">{period === "day" ? "Hour" : "Day"}</th>
          <th className="pb-2 text-right font-medium">Orders</th>
          <th className="pb-2 text-right font-medium">Takings</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="py-1.5 text-neutral-700">
              {period === "day" ? (
                row.label
              ) : (
                <Link href={`${base}/orders?date=${row.key}`} className="hover:underline">
                  {row.label}
                </Link>
              )}
            </td>
            <td className="py-1.5 text-right tabular-nums text-neutral-600">{row.orders}</td>
            <td className="py-1.5 text-right tabular-nums text-neutral-800">
              {formatRupiah(row.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
