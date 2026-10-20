import Link from "next/link";

/**
 * ‹ date › stepper plus a date picker. Plain links and a GET form — no
 * client JavaScript, so every position is a shareable, bookmarkable URL.
 */
export function DateNav({
  basePath,
  date,
  prev,
  next,
  today,
  extraParams = {},
}: {
  basePath: string;
  date: string;
  prev: string;
  next: string;
  today: string;
  extraParams?: Record<string, string>;
}) {
  const href = (target: string) =>
    `${basePath}?${new URLSearchParams({ ...extraParams, date: target })}`;
  const atToday = date >= today;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={href(prev)}
        aria-label="Previous"
        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700"
      >
        ‹
      </Link>

      <form action={basePath} className="flex items-center gap-2">
        {Object.entries(extraParams).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-neutral-900"
        />
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Go
        </button>
      </form>

      {atToday ? (
        <span className="rounded-lg border border-neutral-200 px-4 py-2 text-neutral-300">›</span>
      ) : (
        <Link
          href={href(next)}
          aria-label="Next"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-700"
        >
          ›
        </Link>
      )}

      {!atToday && (
        <Link
          href={href(today)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
        >
          Today
        </Link>
      )}
    </div>
  );
}
