"use client";

import { useState } from "react";
import { formatRupiah } from "@pantrio/core";

export type Bar = {
  key: string;
  /** Full label for the tooltip, e.g. "Mon 13 Oct" or "19:00–20:00". */
  label: string;
  /** Axis label, kept short. Empty string to skip this tick. */
  tick: string;
  value: number;
  orders: number;
};

const HEIGHT = 200;

/**
 * Takings over time — one series, so one ink colour and no legend; the
 * heading names it. Each bar is a button: tap (iPad) or hover shows the
 * exact figure, so values never depend on reading bar height.
 */
export function BarChart({ bars, title }: { bars: Bar[]; title: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  const top = niceCeiling(max);
  const shown = bars.find((bar) => bar.key === active) ?? null;

  if (max === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
        No sales in this period.
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-neutral-700">{title}</span>
        <span className="min-h-5 text-sm tabular-nums text-neutral-600" aria-live="polite">
          {shown
            ? `${shown.label}: ${formatRupiah(shown.value)} · ${shown.orders} order${shown.orders === 1 ? "" : "s"}`
            : "Tap a bar for the exact amount"}
        </span>
      </figcaption>

      <div className="flex gap-2">
        {/* Recessive y-axis: the top and the baseline only. */}
        <div
          className="flex shrink-0 flex-col justify-between text-right text-xs tabular-nums text-neutral-400"
          style={{ height: HEIGHT }}
        >
          <span>{compactRupiah(top)}</span>
          <span>{compactRupiah(top / 2)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative flex items-end gap-0.5 border-b border-neutral-300"
            style={{ height: HEIGHT }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-neutral-200" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200" />

            {bars.map((bar) => {
              const isActive = bar.key === active;
              return (
                <button
                  key={bar.key}
                  type="button"
                  onClick={() => setActive(isActive ? null : bar.key)}
                  onMouseEnter={() => setActive(bar.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(bar.key)}
                  aria-label={`${bar.label}: ${formatRupiah(bar.value)}, ${bar.orders} orders`}
                  // The hit target is the full column, larger than the mark.
                  className="group relative flex h-full min-w-0 flex-1 items-end outline-none"
                >
                  <span
                    className={`block w-full rounded-t ${
                      isActive ? "bg-neutral-900" : "bg-neutral-700 group-hover:bg-neutral-900"
                    } ${active && !isActive ? "opacity-40" : ""}`}
                    style={{ height: bar.value === 0 ? 0 : `max(2px, ${(bar.value / top) * 100}%)` }}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-1 flex gap-0.5">
            {bars.map((bar) => (
              <span
                key={bar.key}
                className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] tabular-nums text-neutral-500"
              >
                {bar.tick}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Round the axis top up to 1, 2 or 5 × a power of ten. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Axis-only shorthand: 1.500.000 → "1,5 jt", 350.000 → "350 rb". */
function compactRupiah(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)} rb`;
  return String(Math.round(value));
}
