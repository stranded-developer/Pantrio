"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { playChime, unlockChime } from "@/lib/chime";
import type { KitchenItem, KitchenOrder } from "@/lib/queries/kitchen";
import { setKitchenDone } from "./actions";

// Realtime is the trigger, this is the guarantee: Realtime does not replay
// events missed during a wifi blip, so the board also re-reads on a timer.
const SAFETY_REFRESH_MS = 20_000;

// A ticket waiting longer than this turns amber.
const SLOW_MINUTES = 10;

type Tab = "pending" | "done";

export function KitchenBoard({
  pending,
  done,
  staffName,
  title,
  logoUrl,
  slug,
  base,
  outletId,
  timezone,
}: {
  pending: KitchenOrder[];
  done: KitchenOrder[];
  staffName: string;
  title: string;
  logoUrl: string | null;
  slug: string;
  base: string;
  outletId: string;
  timezone: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [soundOn, setSoundOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`kitchen-${outletId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` },
        () => router.refresh()
      )
      .subscribe();

    const safety = setInterval(() => router.refresh(), SAFETY_REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(safety);
      clearInterval(clock);
    };
  }, [router, outletId]);

  // Chime when a ticket appears that this screen has not shown before. The
  // first render seeds the set, so opening the page does not beep for the
  // whole existing queue.
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(pending.map((order) => order.id));
      return;
    }

    const fresh = pending.filter((order) => !seen.current!.has(order.id));
    for (const order of fresh) seen.current.add(order.id);

    if (fresh.length > 0) playChime();
  }, [pending]);

  function enableSound() {
    if (unlockChime()) {
      setSoundOn(true);
      playChime();
    }
  }

  async function toggle(order: KitchenOrder, markDone: boolean) {
    setError(null);
    setBusyId(order.id);

    const result = await setKitchenDone(slug, order.id, markDone);

    setBusyId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    startTransition(() => router.refresh());
  }

  const orders = tab === "pending" ? pending : done;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-900 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- tenant logo, any host
                <img src={logoUrl} alt={title} className="h-6 w-auto" />
              ) : (
                <span>{title} ·</span>
              )}
              Kitchen
            </p>
            <p className="text-xs text-neutral-400">{staffName}</p>
          </div>

          <div className="flex gap-2">
            <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
              To cook
              <Count value={pending.length} highlight={pending.length > 0} />
            </TabButton>
            <TabButton active={tab === "done"} onClick={() => setTab("done")}>
              Done
              <Count value={done.length} />
            </TabButton>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!soundOn && (
            <button
              onClick={enableSound}
              className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-neutral-900"
            >
              🔔 Tap to turn on sound
            </button>
          )}
          <Link
            href={`${base}/pos`}
            className="rounded-xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300"
          >
            POS
          </Link>
        </div>
      </header>

      {error && (
        <p className="mx-6 mt-4 rounded-xl bg-red-900/60 p-4 text-red-100">{error}</p>
      )}

      <main className="flex-1 p-6">
        {orders.length === 0 ? (
          <p className="pt-24 text-center text-xl text-neutral-500">
            {tab === "pending" ? "Nothing to cook right now." : "Nothing done yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orders.map((order) => (
              <Ticket
                key={order.id}
                order={order}
                now={now}
                tab={tab}
                timezone={timezone}
                busy={busyId === order.id}
                onToggle={toggle}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Ticket({
  order,
  now,
  tab,
  timezone,
  busy,
  onToggle,
}: {
  order: KitchenOrder;
  now: number;
  tab: Tab;
  timezone: string;
  busy: boolean;
  onToggle: (order: KitchenOrder, markDone: boolean) => void;
}) {
  const items = order.order_items.filter((item) => !item.voided);
  const waitedMinutes = Math.max(
    0,
    Math.floor((now - Date.parse(order.opened_at)) / 60_000)
  );
  const slow = tab === "pending" && waitedMinutes >= SLOW_MINUTES;

  const frame = order.priority
    ? "border-red-500 bg-red-950"
    : slow
      ? "border-amber-500 bg-neutral-800"
      : "border-neutral-700 bg-neutral-800";

  return (
    <article className={`flex flex-col rounded-2xl border-2 ${frame}`}>
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <p className="text-5xl font-bold tabular-nums leading-none">{order.queue_no}</p>
        <div className="text-right">
          {order.priority && (
            <span className="inline-block rounded-lg bg-red-600 px-3 py-1 text-sm font-bold uppercase tracking-wide">
              Priority
            </span>
          )}
          <p className={`mt-1 text-sm ${slow ? "text-amber-400" : "text-neutral-400"}`}>
            {tab === "pending"
              ? `${waitedMinutes} min`
              : `done ${timeOfDay(order.kitchen_done_at, timezone)}`}
          </p>
        </div>
      </div>

      <ul className="flex-1 space-y-2 px-4 pb-4 text-lg">
        {items.map((item) => (
          <li key={item.id}>
            <span className="font-semibold tabular-nums">{item.qty}×</span>{" "}
            {item.name_snapshot}
            {noteOf(item) && (
              <p className="ml-7 text-base text-amber-300">↳ {noteOf(item)}</p>
            )}
          </li>
        ))}
      </ul>

      {tab === "pending" ? (
        <button
          onClick={() => onToggle(order, true)}
          disabled={busy}
          className="m-3 mt-0 rounded-xl bg-green-600 py-4 text-xl font-semibold disabled:opacity-50"
        >
          {busy ? "…" : "Done"}
        </button>
      ) : (
        <button
          onClick={() => onToggle(order, false)}
          disabled={busy}
          className="m-3 mt-0 rounded-xl border border-neutral-600 py-3 text-neutral-300 disabled:opacity-50"
        >
          {busy ? "…" : "Undo — back to cook"}
        </button>
      )}
    </article>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-5 py-3 text-base font-medium ${
        active ? "bg-white text-neutral-900" : "bg-neutral-800 text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ value, highlight = false }: { value: number; highlight?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 text-sm tabular-nums ${
        highlight ? "bg-red-600 text-white" : "bg-neutral-300 text-neutral-800"
      }`}
    >
      {value}
    </span>
  );
}

/** create_cafe_order stores a line note as [{ "note": "…" }]. */
function noteOf(item: KitchenItem): string | null {
  if (!Array.isArray(item.modifiers_json)) return null;

  const notes = item.modifiers_json
    .map((entry) => (entry as { note?: unknown })?.note)
    .filter((note): note is string => typeof note === "string" && note.length > 0);

  return notes.length > 0 ? notes.join(", ") : null;
}

function timeOfDay(iso: string | null, timeZone: string): string {
  if (!iso) return "";

  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}
