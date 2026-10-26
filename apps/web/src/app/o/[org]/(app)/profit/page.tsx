import {
  computePnl,
  monthFixedCosts,
  Q,
  type FixedCost,
  type FixedCostCategory,
  type StaffMember,
} from "@pantrio/core";
import { requirePermPage } from "@/lib/auth";
import { toTaxSettings } from "@/lib/costing-model";
import { getSalesSummary } from "@/lib/queries/sales";
import { createClient } from "@/lib/supabase/server";
import { businessDateToday, getTaxSettings, tenantBase } from "@/lib/tenant";
import { ProfitView } from "./profit-view";

const ym = (d: string) => d.slice(0, 7);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthEnd(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}
function shiftMonth(m: string, by: number): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export default async function ProfitPage({ params, searchParams }: PageProps<"/o/[org]/profit">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const { org } = await requirePermPage(slug, await tenantBase(slug), "profit.manage");
  const today = await businessDateToday(org.id);
  const thisMonth = ym(today);
  const month = typeof sp.month === "string" && MONTH.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const from = `${month}-01`;
  const to = month === thisMonth ? today : monthEnd(month);
  const yearStart = `${month.slice(0, 4)}-01-01`;

  const supabase = await createClient();
  const [taxRow, sales, ytd, staffRes, wagesRes, costsRes, ratesRes, actualsRes] = await Promise.all([
    getTaxSettings(org.id),
    getSalesSummary(org.id, from, to),
    from > yearStart ? getSalesSummary(org.id, yearStart, monthEnd(shiftMonth(month, -1))) : Promise.resolve(null),
    supabase.from("staff_members").select("id, name, role, end_month").eq("org_id", org.id).order("created_at"),
    supabase.from("staff_wages").select("staff_id, monthly_wage, effective_from").eq("org_id", org.id),
    supabase.from("fixed_costs").select("id, name, category").eq("org_id", org.id).order("created_at"),
    supabase.from("fixed_cost_rates").select("fixed_cost_id, amount, period, effective_from").eq("org_id", org.id),
    supabase.from("fixed_cost_actuals").select("fixed_cost_id, month, amount").eq("org_id", org.id),
  ]);
  const tax = toTaxSettings(taxRow);

  const staff: StaffMember[] = (staffRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role ?? undefined,
    endMonth: s.end_month ? ym(s.end_month) : undefined,
    wages: (wagesRes.data ?? [])
      .filter((w) => w.staff_id === s.id)
      .map((w) => ({ monthlyWage: w.monthly_wage, effectiveFrom: ym(w.effective_from) })),
  }));
  const costs: FixedCost[] = (costsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category as FixedCostCategory,
    rates: (ratesRes.data ?? [])
      .filter((r) => r.fixed_cost_id === c.id)
      .map((r) => ({ amount: r.amount, period: r.period, effectiveFrom: ym(r.effective_from) })),
    actuals: (actualsRes.data ?? [])
      .filter((a) => a.fixed_cost_id === c.id)
      .map((a) => ({ month: ym(a.month), amount: a.amount })),
  }));

  const fixed = monthFixedCosts(month, staff, costs);
  const net = (t: { subtotal: number; service: number }) => t.subtotal + (tax.serviceIsRevenue ? t.service : 0);
  const netSales = net(sales.totals);
  const pnl = computePnl({
    netSales,
    cogs: sales.totals.cogs,
    fixedCosts: fixed.total,
    tax,
    ytdTurnoverBefore: ytd ? net(ytd.totals) : 0,
  });
  const coverageBps =
    sales.totals.subtotal > 0 ? Q.of(sales.totals.costed_subtotal).div(Q.of(sales.totals.subtotal)).toBps() : 10_000;

  return (
    <ProfitView
      month={month}
      thisMonth={thisMonth}
      partial={month === thisMonth}
      pnl={pnl}
      orders={sales.totals.orders}
      coverageBps={coverageBps}
      lines={fixed.lines}
      staff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role ?? null,
        endMonth: s.endMonth ?? null,
        line: fixed.lines.find((l) => l.kind === "staff" && l.id === s.id) ?? null,
        history: [...s.wages].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
      }))}
      costs={costs.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        line: fixed.lines.find((l) => l.kind === "fixed" && l.id === c.id) ?? null,
        hasActual: (c.actuals ?? []).some((a) => a.month === month),
        history: [...c.rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
      }))}
    />
  );
}
