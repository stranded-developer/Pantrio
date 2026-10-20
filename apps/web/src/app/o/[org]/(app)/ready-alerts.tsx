"use client";

import { useEffect, useRef, useState } from "react";
import { playChime, unlockChime } from "@/lib/chime";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "./tenant-context";

// FOKAS ready alerts, scoped to this restaurant's outlet. Realtime triggers a
// check; a timer runs the same check in case an event was lost to a blip.
const SAFETY_CHECK_MS = 20_000;

type Ready = { key: string; queueNo: number };

/**
 * "Order 12 is ready" on every till screen the moment the kitchen taps Done.
 * The cursor is a server timestamp, so a till whose clock is off neither
 * misses nor repeats alerts.
 */
export function ReadyAlerts() {
  const { orgId, outletId } = useTenant();
  const [alerts, setAlerts] = useState<Ready[]>([]);
  const cursor = useRef<string | null>(null);
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    cursor.current = null;

    async function check() {
      // First run only sets the cursor: alerts are for what happens while
      // this screen is open, not a replay of the whole shift.
      if (cursor.current === null) {
        const { data } = await supabase
          .from("orders")
          .select("kitchen_done_at")
          .eq("org_id", orgId)
          .eq("outlet_id", outletId)
          .not("kitchen_done_at", "is", null)
          .order("kitchen_done_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        cursor.current = data?.[0]?.kitchen_done_at ?? new Date(0).toISOString();
        return;
      }

      const { data } = await supabase
        .from("orders")
        .select("id, queue_no, kitchen_done_at")
        .eq("org_id", orgId)
        .eq("outlet_id", outletId)
        .not("queue_no", "is", null)
        .eq("status", "paid")
        .gt("kitchen_done_at", cursor.current)
        .order("kitchen_done_at", { ascending: true });

      if (cancelled || !data || data.length === 0) return;

      const fresh: Ready[] = [];
      for (const row of data) {
        const key = `${row.id}:${row.kitchen_done_at}`;
        if (announced.current.has(key) || row.queue_no === null) continue;
        announced.current.add(key);
        fresh.push({ key, queueNo: row.queue_no });
      }
      cursor.current = data[data.length - 1]!.kitchen_done_at;

      if (fresh.length > 0) {
        setAlerts((current) => [...current, ...fresh]);
        playChime();
      }
    }

    void check();

    const channel = supabase
      .channel(`ready-${outletId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` },
        () => void check()
      )
      .subscribe();

    const safety = setInterval(() => void check(), SAFETY_CHECK_MS);

    // iOS keeps audio muted until the page is tapped; every till interaction
    // is a tap, so unlock on the first one.
    const unlock = () => unlockChime();
    window.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      clearInterval(safety);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [orgId, outletId]);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-3 px-4">
      {alerts.map((alert) => (
        <div
          key={alert.key}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-2xl bg-green-600 p-5 text-white shadow-xl"
        >
          <div>
            <p className="text-sm uppercase tracking-wide text-green-100">Ready to serve</p>
            <p className="text-3xl font-bold">Order {alert.queueNo}</p>
          </div>
          <button
            onClick={() => setAlerts((current) => current.filter((item) => item.key !== alert.key))}
            className="rounded-xl bg-white px-5 py-3 font-semibold text-green-700"
          >
            OK
          </button>
        </div>
      ))}
    </div>
  );
}
