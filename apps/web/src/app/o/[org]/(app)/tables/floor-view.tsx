"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRupiah } from "@pantrio/core";
import { createClient } from "@/lib/supabase/client";
import type { DiningTable, FloorArea, OpenBill } from "@/lib/queries/tables";
import { useTenant } from "../tenant-context";
import { FloorCanvas, shapeClass } from "./floor-canvas";

// Realtime is the trigger, the timer the guarantee (as the kitchen board).
const SAFETY_REFRESH_MS = 20_000;

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

/** Live floor plan: free, busy (total, minutes seated), bill printed. */
export function FloorView({ areas, tables, bills }: { areas: FloorArea[]; tables: DiningTable[]; bills: OpenBill[] }) {
  const router = useRouter();
  const { base, outletId } = useTenant();
  const [areaId, setAreaId] = useState(() => areas.find((a) => tables.some((t) => t.area_id === a.id))?.id ?? areas[0]?.id);
  const [now, setNow] = useState(() => Date.now());
  const billOf = new Map(bills.map((b) => [b.table_id, b]));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`floor-${outletId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_rounds", filter: `outlet_id=eq.${outletId}` }, () => router.refresh())
      .subscribe();
    const safety = setInterval(() => router.refresh(), SAFETY_REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(safety);
      clearInterval(clock);
    };
  }, [router, outletId]);

  const inArea = tables.filter((t) => t.area_id === areaId);
  const tone = (t: DiningTable) => {
    const bill = billOf.get(t.id);
    if (!bill) return "border-2 border-neutral-300 bg-white text-neutral-700";
    if (bill.bill_printed_at) return "border-2 border-amber-500 bg-amber-100 text-amber-900";
    return "border-2 border-neutral-900 bg-neutral-900 text-white";
  };
  const busy = bills.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {areas.length > 1 &&
          areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaId(a.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${a.id === areaId ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 shadow-sm"}`}
            >
              {a.name}
              <span className="ml-2 text-xs opacity-70">{bills.filter((b) => tables.find((t) => t.id === b.table_id)?.area_id === a.id).length}</span>
            </button>
          ))}
        <p className="ml-auto text-sm text-neutral-500">
          {busy} of {tables.length} tables seated ·{" "}
          <Link href={`${base}/pos`} className="underline">
            Takeaway on POS
          </Link>
        </p>
      </div>

      {/* Phones: a list of big buttons. Bigger screens: the drawn plan. */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        {inArea.map((t) => {
          const bill = billOf.get(t.id);
          return (
            <Link key={t.id} href={`${base}/tables/${t.id}`} className={`flex min-h-20 flex-col items-center justify-center p-2 ${shapeClass(t.shape === "round" ? "round" : "square")} ${tone(t)}`}>
              <span className="text-xl font-bold">{t.name}</span>
              {bill ? (
                <span className="text-xs">
                  {formatRupiah(bill.grand_total)} · {minutesSince(bill.opened_at, now)}m
                </span>
              ) : (
                <span className="text-xs opacity-60">{t.seats} seats</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <FloorCanvas
          tables={inArea}
          onTableClick={(t) => router.push(`${base}/tables/${t.id}`)}
          render={(t) => {
            const bill = billOf.get(t.id);
            return {
              className: `transition active:scale-95 ${tone(t)}`,
              content: (
                <>
                  <span className="text-lg font-bold lg:text-2xl">{t.name}</span>
                  {bill ? (
                    <>
                      <span className="text-xs lg:text-sm">{formatRupiah(bill.grand_total)}</span>
                      <span className="text-xs opacity-80">
                        {minutesSince(bill.opened_at, now)} min{bill.bill_printed_at ? " · bill" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs opacity-60">{t.seats} seats</span>
                  )}
                </>
              ),
            };
          }}
        />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border-2 border-neutral-300 bg-white" /> Free</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-neutral-900" /> Seated</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border-2 border-amber-500 bg-amber-100" /> Bill printed</span>
      </div>
    </div>
  );
}
