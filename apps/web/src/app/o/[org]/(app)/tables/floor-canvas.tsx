"use client";

import type { ReactNode } from "react";
import type { DiningTable, TableShape } from "@/lib/queries/tables";

// The floor plan grid (migration 13 checks x < 24, y < 16). Positions are
// cells, drawn as percentages, so one plan fits a phone and a big screen.
export const COLS = 24;
export const ROWS = 16;

export function shapeClass(shape: TableShape): string {
  return shape === "round" ? "rounded-full" : "rounded-xl";
}

/** Tables placed on the grid. `render` fills each one; `onPointerDown` lets the editor drag. */
export function FloorCanvas({
  tables,
  render,
  onTableClick,
  onTablePointerDown,
  canvasRef,
  showGrid = false,
}: {
  tables: DiningTable[];
  render: (table: DiningTable) => { className: string; content: ReactNode };
  onTableClick?: (table: DiningTable) => void;
  onTablePointerDown?: (table: DiningTable, event: React.PointerEvent<HTMLButtonElement>) => void;
  canvasRef?: React.Ref<HTMLDivElement>;
  showGrid?: boolean;
}) {
  return (
    <div
      ref={canvasRef}
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      style={{
        aspectRatio: `${COLS} / ${ROWS}`,
        backgroundImage: showGrid
          ? "linear-gradient(to right, rgb(0 0 0 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.05) 1px, transparent 1px)"
          : undefined,
        backgroundSize: showGrid ? `${100 / COLS}% ${100 / ROWS}%` : undefined,
      }}
    >
      {tables.map((table) => {
        const { className, content } = render(table);
        return (
          <button
            key={table.id}
            type="button"
            onClick={onTableClick ? () => onTableClick(table) : undefined}
            onPointerDown={onTablePointerDown ? (e) => onTablePointerDown(table, e) : undefined}
            className={`absolute flex flex-col items-center justify-center overflow-hidden p-1 text-center leading-tight ${shapeClass(table.shape)} ${className}`}
            style={{
              left: `${(table.x / COLS) * 100}%`,
              top: `${(table.y / ROWS) * 100}%`,
              width: `${(table.w / COLS) * 100}%`,
              height: `${(table.h / ROWS) * 100}%`,
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
