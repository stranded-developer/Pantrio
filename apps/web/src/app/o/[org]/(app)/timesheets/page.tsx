import Link from "next/link";
import { isDate, periodRange } from "@pantrio/core";
import { requirePermPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessDateToday, getOutlets, tenantBase } from "@/lib/tenant";
import { formatDuration } from "./time";
import { TimesheetView, type EntryRow } from "./timesheet-view";

// Time clock for managers (P25): one week of shifts, photos, totals per
// person, and corrections. Stale open shifts are marked "missing clock-out"
// before reading, so a forgotten clock-out never counts as hours.

export default async function TimesheetsPage({ params, searchParams }: PageProps<"/o/[org]/timesheets">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const base = await tenantBase(slug);
  const m = await requirePermPage(slug, base, "timesheets.manage");
  const { org } = m;
  const today = await businessDateToday(org.id);
  const anchor = typeof sp.date === "string" && isDate(sp.date) && sp.date <= today ? sp.date : today;
  const week = periodRange("week", anchor);

  const supabase = await createClient();
  await supabase.rpc("refresh_time_entries", { p_org: org.id });
  const [{ data: entries }, { data: members }, outlets, { data: me }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, user_id, outlet_id, business_date, clock_in_at, clock_out_at, status, in_photo, out_photo, note, edited_at, terminal_id")
      .eq("org_id", org.id)
      .gte("business_date", week.from)
      .lte("business_date", week.to)
      .order("clock_in_at", { ascending: false }),
    supabase.from("org_members").select("user_id, active").eq("org_id", org.id),
    getOutlets(org.id),
    supabase.auth.getClaims(),
  ]);
  const ids = (members ?? []).map((x) => x.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const photoPaths = (entries ?? []).flatMap((e) => [e.in_photo, e.out_photo]).filter((p): p is string => Boolean(p));
  const { data: signed } = photoPaths.length
    ? await supabase.storage.from("clock-photos").createSignedUrls(photoPaths, 60 * 60)
    : { data: [] };
  const photoUrl = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));
  const myId = me?.claims?.sub ?? null;

  const rows: EntryRow[] = (entries ?? []).map((e) => ({
    id: e.id,
    userId: e.user_id,
    name: names.get(e.user_id) ?? "—",
    outlet: outletName.get(e.outlet_id) ?? "",
    businessDate: e.business_date,
    clockIn: e.clock_in_at,
    clockOut: e.clock_out_at,
    status: e.status,
    inPhoto: e.in_photo ? (photoUrl.get(e.in_photo) ?? null) : null,
    outPhoto: e.out_photo ? (photoUrl.get(e.out_photo) ?? null) : null,
    edited: e.edited_at !== null,
    // Typed in by a manager: there was never a photo to take.
    manual: e.terminal_id === null,
    note: e.note,
    canEdit: m.isOwner || e.user_id !== myId,
  }));

  // Totals per person: closed shifts only — missing clock-outs are unknown.
  const totals = new Map<string, { name: string; ms: number; shifts: number; missing: number }>();
  for (const r of rows) {
    const t = totals.get(r.userId) ?? { name: r.name, ms: 0, shifts: 0, missing: 0 };
    t.shifts += 1;
    if (r.status === "closed" && r.clockOut) t.ms += Date.parse(r.clockOut) - Date.parse(r.clockIn);
    if (r.status === "missing_out") t.missing += 1;
    totals.set(r.userId, t);
  }
  const href = (date: string) => `${base}/timesheets?date=${date}`;

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Timesheets</h1>
          <p className="text-sm text-neutral-500">
            {week.label} · clocked on{" "}
            <Link href={`${base}/settings/terminals`} className="underline">
              terminals
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={href(week.prev)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700">
            ‹ Week
          </Link>
          {week.to < today ? (
            <Link href={href(week.next)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700">
              Week ›
            </Link>
          ) : (
            <span className="rounded-lg border border-neutral-200 px-4 py-2 text-neutral-300">Week ›</span>
          )}
        </div>
      </div>

      {totals.size > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...totals.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <li key={t.name} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="font-medium text-neutral-900">{t.name}</p>
                <p className="text-2xl font-semibold text-neutral-900">{formatDuration(t.ms)}</p>
                <p className="text-sm text-neutral-500">
                  {t.shifts} shift{t.shifts === 1 ? "" : "s"}
                  {t.missing > 0 && <span className="text-amber-700"> · {t.missing} missing clock-out (not counted)</span>}
                </p>
              </li>
            ))}
        </ul>
      )}

      <TimesheetView
        rows={rows}
        members={(members ?? [])
          .filter((x) => x.active && (m.isOwner || x.user_id !== myId))
          .map((x) => ({ id: x.user_id, name: names.get(x.user_id) ?? "—" }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        outlets={outlets.filter((o) => o.active)}
      />
    </div>
  );
}
