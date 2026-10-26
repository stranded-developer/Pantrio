"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { formatBps, formatRupiah, type FixedCostLine, type Pnl } from "@pantrio/core";
import { useTenant } from "../tenant-context";
import { addFixedCost, addStaffWage, setActual, setFixedRate, setStaffEnd, setWage, type Result } from "./actions";

type StaffRow = {
  id: string;
  name: string;
  role: string | null;
  endMonth: string | null;
  line: FixedCostLine | null;
  history: { monthlyWage: number; effectiveFrom: string }[];
};
type CostRow = {
  id: string;
  name: string;
  category: string;
  line: FixedCostLine | null;
  hasActual: boolean;
  history: { amount: number; period: string; effectiveFrom: string }[];
};

const CATEGORY: Record<string, string> = {
  rent: "Rent",
  electricity: "Electricity (PLN)",
  water: "Water (PDAM)",
  gas: "Gas / LPG",
  internet: "Internet & phone",
  other: "Other",
};

const input = "rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-neutral-900";
const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";
const primary = "rounded-xl bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40";

function monthLabel(m: string) {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
function shift(m: string, by: number) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
}

export function ProfitView({
  month,
  thisMonth,
  partial,
  pnl,
  orders,
  coverageBps,
  staff,
  costs,
}: {
  month: string;
  thisMonth: string;
  partial: boolean;
  pnl: Pnl;
  orders: number;
  coverageBps: number;
  lines: FixedCostLine[];
  staff: StaffRow[];
  costs: CostRow[];
}) {
  const router = useRouter();
  const { slug, base } = useTenant();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = (p: Promise<Result>) =>
    startTransition(async () => {
      const r = await p;
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setOpen(null);
        router.refresh();
      }
    });

  const wages = staff.reduce((s, r) => s + (r.line?.amount ?? 0), 0);
  const others = pnl.fixedCosts - wages;
  const href = (m: string) => `${base}/profit?month=${m}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Profit</h1>
          <p className="text-sm text-neutral-500">
            {monthLabel(month)}
            {partial && " so far"} · {orders} orders. Ingredient cost comes from recipes; wages, rent and bills are
            monthly fixed costs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(shift(month, -1))} aria-label="Previous month" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700">
            ‹
          </Link>
          <span className="min-w-36 text-center font-medium text-neutral-900">{monthLabel(month)}</span>
          {month < thisMonth ? (
            <Link href={href(shift(month, 1))} aria-label="Next month" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700">
              ›
            </Link>
          ) : (
            <span className="rounded-lg border border-neutral-200 px-4 py-2 text-neutral-300">›</span>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Net sales" value={formatRupiah(pnl.netSales)} note="excl. PB1" />
        <Tile label="Gross profit" value={formatRupiah(pnl.grossProfit)} note={`${formatBps(pnl.grossMarginBps)} after ingredients`} />
        <Tile
          label="Profit before tax"
          value={formatRupiah(pnl.operatingProfit)}
          note={formatBps(pnl.marginBeforeTaxBps)}
          tone={pnl.operatingProfit < 0 ? "bad" : "good"}
        />
        <Tile
          label="Profit after tax"
          value={formatRupiah(pnl.netProfit)}
          note={formatBps(pnl.marginAfterTaxBps)}
          tone={pnl.netProfit < 0 ? "bad" : "good"}
          emphasis
        />
      </div>

      {coverageBps < 10_000 && pnl.netSales > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Only {formatBps(coverageBps)} of this month&apos;s sales had a costed recipe, so ingredient cost is
          understated and profit looks better than it is.{" "}
          <Link href={`${base}/recipes`} className="underline">
            Finish the recipes
          </Link>{" "}
          to fix it.
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 rounded-2xl bg-white p-6 text-sm shadow-sm">
          <h2 className="mb-2 font-semibold text-neutral-900">Profit &amp; loss</h2>
          <Line label="Net sales" value={pnl.netSales} />
          <Line label="− Ingredient cost (HPP)" value={pnl.cogs} deduct />
          <Line label="= Gross profit" value={pnl.grossProfit} strong />
          <Line label="− Wages" value={wages} deduct />
          <Line label="− Rent, bills & other" value={others} deduct />
          <Line label="= Profit before tax" value={pnl.operatingProfit} strong />
          <Line label="− Income tax" value={pnl.incomeTax} deduct />
          <Line label="= Profit after tax" value={pnl.netProfit} strong />
        </div>
        <div className="space-y-2 rounded-2xl bg-white p-6 text-sm shadow-sm">
          <h2 className="font-semibold text-neutral-900">Break-even</h2>
          {pnl.breakEvenSales !== null ? (
            <>
              <p className="text-2xl font-semibold tabular-nums text-neutral-900">{formatRupiah(pnl.breakEvenSales)}</p>
              <p className="text-neutral-500">
                Net sales needed this month to cover {formatRupiah(pnl.fixedCosts)} of fixed costs at a{" "}
                {formatBps(pnl.grossMarginBps)} gross margin.
                {pnl.netSales >= pnl.breakEvenSales
                  ? " You're past it."
                  : ` ${formatRupiah(pnl.breakEvenSales - pnl.netSales)} to go.`}
              </p>
            </>
          ) : (
            <p className="text-neutral-500">Shown once there are sales with costed recipes.</p>
          )}
        </div>
      </section>

      {/* ── Wages ── */}
      <Section
        title="Staff wages"
        subtitle="Monthly pay per person (wage + allowances). A raise applies from the month you choose; earlier months keep the old wage."
        total={wages}
        action={<button onClick={() => setOpen("add-staff")} className={btn}>Add person</button>}
      >
        {open === "add-staff" && (
          <form action={(fd) => run(addStaffWage(slug, fd))} className="flex flex-wrap gap-2 rounded-xl bg-neutral-50 p-3">
            <input name="name" required placeholder="Name" className={`${input} flex-1`} />
            <input name="role" placeholder="Role (barista, cook…)" className={`${input} w-44`} />
            <input name="wage" type="number" min="0" step="1" required placeholder="Monthly wage" className={`${input} w-40`} />
            <MonthInput defaultValue={month} />
            <button disabled={pending} className={primary}>Add</button>
          </form>
        )}
        <ul className="divide-y divide-neutral-100">
          {staff.length === 0 && <li className="py-3 text-sm text-neutral-400">No one yet.</li>}
          {staff.map((s) => (
            <li key={s.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`font-medium ${s.line ? "text-neutral-900" : "text-neutral-400"}`}>
                    {s.name} {s.role && <span className="font-normal text-neutral-500">· {s.role}</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {s.history.map((h) => `${formatRupiah(h.monthlyWage)} from ${monthLabel(h.effectiveFrom)}`).join(" · ")}
                    {s.endMonth && ` · left after ${monthLabel(s.endMonth)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-28 text-right font-medium tabular-nums">{s.line ? formatRupiah(s.line.amount) : "—"}</span>
                  <button onClick={() => setOpen(`wage-${s.id}`)} className={btn}>Change wage</button>
                  {s.endMonth ? (
                    <button disabled={pending} onClick={() => run(setStaffEnd(slug, s.id, null))} className={btn}>Rehire</button>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => window.confirm(`${s.name} left — last paid month ${monthLabel(month)}?`) && run(setStaffEnd(slug, s.id, month))}
                      className={btn}
                    >
                      Left
                    </button>
                  )}
                </div>
              </div>
              {open === `wage-${s.id}` && (
                <form action={(fd) => run(setWage(slug, s.id, fd))} className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3">
                  <input name="wage" type="number" min="0" step="1" required placeholder="New monthly wage" className={`${input} w-44`} />
                  <span className="text-sm text-neutral-600">from</span>
                  <MonthInput defaultValue={month} />
                  <button disabled={pending} className={primary}>Save</button>
                  <button type="button" onClick={() => setOpen(null)} className={btn}>Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Other fixed costs ── */}
      <Section
        title="Rent, bills & other fixed costs"
        subtitle="Set a usual monthly amount (or yearly, e.g. rent). If a month's real bill differs, enter the actual for that month only."
        total={others}
        action={<button onClick={() => setOpen("add-cost")} className={btn}>Add cost</button>}
      >
        {open === "add-cost" && (
          <form action={(fd) => run(addFixedCost(slug, fd))} className="flex flex-wrap gap-2 rounded-xl bg-neutral-50 p-3">
            <input name="name" required placeholder="Name, e.g. Sewa ruko" className={`${input} flex-1`} />
            <select name="category" defaultValue="rent" className={input}>
              {Object.entries(CATEGORY).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input name="amount" type="number" min="0" step="1" required placeholder="Amount" className={`${input} w-36`} />
            <select name="period" defaultValue="monthly" className={input}>
              <option value="monthly">per month</option>
              <option value="yearly">per year</option>
            </select>
            <MonthInput defaultValue={month} />
            <button disabled={pending} className={primary}>Add</button>
          </form>
        )}
        <ul className="divide-y divide-neutral-100">
          {costs.length === 0 && <li className="py-3 text-sm text-neutral-400">None yet — start with rent and electricity.</li>}
          {costs.map((c) => (
            <li key={c.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">
                    {c.name} <span className="font-normal text-neutral-500">· {CATEGORY[c.category] ?? c.category}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {c.history
                      .map((h) => `${h.amount === 0 ? "stopped" : `${formatRupiah(h.amount)}/${h.period === "yearly" ? "year" : "month"}`} from ${monthLabel(h.effectiveFrom)}`)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-28 text-right tabular-nums">
                    <span className="font-medium">{c.line ? formatRupiah(c.line.amount) : "—"}</span>
                    {c.line && (
                      <span className={`ml-1 text-xs ${c.hasActual ? "text-green-700" : "text-neutral-400"}`}>
                        {c.hasActual ? "actual" : "usual"}
                      </span>
                    )}
                  </span>
                  <button onClick={() => setOpen(`actual-${c.id}`)} className={btn}>
                    {c.hasActual ? "Edit actual" : "Enter actual"}
                  </button>
                  <button onClick={() => setOpen(`rate-${c.id}`)} className={btn}>Change usual</button>
                </div>
              </div>
              {open === `actual-${c.id}` && (
                <form
                  action={(fd) => run(setActual(slug, c.id, month, Number(fd.get("amount"))))}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3"
                >
                  <span className="text-sm text-neutral-600">Real bill for {monthLabel(month)}: Rp</span>
                  <input name="amount" type="number" min="0" step="1" required autoFocus className={`${input} w-40`} />
                  <button disabled={pending} className={primary}>Save</button>
                  {c.hasActual && (
                    <button type="button" disabled={pending} onClick={() => run(setActual(slug, c.id, month, null))} className={btn}>
                      Use usual amount
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(null)} className={btn}>Cancel</button>
                </form>
              )}
              {open === `rate-${c.id}` && (
                <form action={(fd) => run(setFixedRate(slug, c.id, fd))} className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3">
                  <span className="text-sm text-neutral-600">New usual amount Rp</span>
                  <input name="amount" type="number" min="0" step="1" required className={`${input} w-36`} />
                  <select name="period" defaultValue={c.history[0]?.period ?? "monthly"} className={input}>
                    <option value="monthly">per month</option>
                    <option value="yearly">per year</option>
                  </select>
                  <span className="text-sm text-neutral-600">from</span>
                  <MonthInput defaultValue={month} />
                  <button disabled={pending} className={primary}>Save</button>
                  <button type="button" onClick={() => setOpen(null)} className={btn}>Cancel</button>
                  <span className="w-full text-xs text-neutral-500">Enter 0 to stop this cost from that month. Earlier months are not changed.</span>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function MonthInput({ defaultValue }: { defaultValue: string }) {
  return <input name="from" type="month" defaultValue={defaultValue} required className={input} />;
}

function Section({ title, subtitle, total, action, children }: { title: string; subtitle: string; total: number; action: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900">
            {title} <span className="font-normal tabular-nums text-neutral-500">· {formatRupiah(total)}</span>
          </h2>
          <p className="text-sm text-neutral-500">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, note, tone, emphasis }: { label: string; value: string; note?: string; tone?: "good" | "bad"; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 tabular-nums ${emphasis ? "text-2xl font-semibold" : "text-xl font-medium"} ${tone === "bad" ? "text-red-700" : "text-neutral-900"}`}>
        {value.replace("Rp -", "−Rp ")}
      </p>
      {note && <p className="text-xs text-neutral-400">{note}</p>}
    </div>
  );
}

/** Deductions show as plain amounts — the label already says "−". Totals keep their sign. */
function Line({ label, value, strong, deduct }: { label: string; value: number; strong?: boolean; deduct?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-neutral-100 pt-1 font-semibold text-neutral-900" : "text-neutral-600"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${value < 0 && strong ? "text-red-700" : ""}`}>
        {value < 0 && !deduct ? `−${formatRupiah(-value)}` : formatRupiah(Math.abs(value))}
      </span>
    </div>
  );
}
