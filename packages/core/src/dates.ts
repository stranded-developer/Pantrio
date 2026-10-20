// Business dates and recap periods. Ported from FOKAS src/lib/sales/period.ts
// and businessDateToday(), generalised to each org's timezone and cutover.
// Dates are YYYY-MM-DD strings; arithmetic is in UTC so the server's own
// timezone can never shift a day. Weeks run Monday–Sunday.

/**
 * The business date at `now` in `timeZone`, with the day starting at
 * `cutoverHour` (FOKAS D3: 05:00, so a late shift stays in one day).
 * Mirrors business_date(ts, tz, cutover) in SQL.
 */
export function businessDate(now: Date, timeZone: string, cutoverHour: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour));
  return new Date(local - cutoverHour * 3_600_000).toISOString().slice(0, 10);
}

export type Period = "day" | "week" | "month";

export type PeriodRange = { period: Period; from: string; to: string; label: string; prev: string; next: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = toUtc(value);
  return !Number.isNaN(parsed.getTime()) && fromUtc(parsed) === value;
}

export function isPeriod(value: unknown): value is Period {
  return value === "day" || value === "week" || value === "month";
}

export function periodRange(period: Period, anchor: string): PeriodRange {
  const day = toUtc(anchor);
  if (period === "day") {
    return {
      period,
      from: anchor,
      to: anchor,
      label: formatDay(day),
      prev: fromUtc(addDays(day, -1)),
      next: fromUtc(addDays(day, 1)),
    };
  }
  if (period === "week") {
    const monday = addDays(day, -((day.getUTCDay() + 6) % 7));
    const sunday = addDays(monday, 6);
    return {
      period,
      from: fromUtc(monday),
      to: fromUtc(sunday),
      label: `${formatDay(monday)} – ${formatDay(sunday)}`,
      prev: fromUtc(addDays(monday, -7)),
      next: fromUtc(addDays(monday, 7)),
    };
  }
  const first = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
  return {
    period,
    from: fromUtc(first),
    to: fromUtc(last),
    label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: fromUtc(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1))),
    next: fromUtc(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1))),
  };
}

export function shiftDay(date: string, days: number): string {
  return fromUtc(addDays(toUtc(date), days));
}

export function formatDay(date: Date | string): string {
  const value = typeof date === "string" ? toUtc(date) : date;
  return value.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
