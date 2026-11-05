// Wall-clock ↔ instant in a restaurant's timezone, for <input type=
// "datetime-local"> (which has no zone). Shared by server and client.

function parts(ms: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** ISO instant → "YYYY-MM-DDTHH:mm" on the restaurant's clock. */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const p = parts(Date.parse(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:mm" on the restaurant's clock → ISO instant. */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const asUtc = Date.parse(`${local}:00Z`);
  const p = parts(asUtc, timeZone);
  const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  // offset = shown − actual; the zones served have no DST, one pass is exact.
  return new Date(asUtc - (shown - asUtc)).toISOString();
}

/** "7h 05m" */
export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
