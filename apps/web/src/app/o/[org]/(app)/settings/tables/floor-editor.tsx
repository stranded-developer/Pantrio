"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { DiningTable, FloorArea, TableShape } from "@/lib/queries/tables";
import { useTenant } from "../../tenant-context";
import { COLS, FloorCanvas, ROWS } from "../../tables/floor-canvas";
import { addArea, removeArea, renameArea, saveFloorPlan, setTableService, type Result } from "./actions";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";
const SIZE: Record<TableShape, { w: number; h: number }> = {
  square: { w: 2, h: 2 },
  round: { w: 2, h: 2 },
  long: { w: 4, h: 2 },
};

let tempId = 0;

export function FloorEditor({
  branchName,
  on,
  areas,
  tables: saved,
  busyTableIds,
}: {
  branchName: string | null;
  on: boolean;
  areas: FloorArea[];
  tables: DiningTable[];
  busyTableIds: string[];
}) {
  const router = useRouter();
  const { slug } = useTenant();
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [tables, setTables] = useState<DiningTable[]>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const area = areas.find((a) => a.id === areaId);
  const inArea = tables.filter((t) => t.area_id === areaId);
  const current = tables.find((t) => t.id === selected) ?? null;

  function run(promise: Promise<Result>, ok?: string, onOk?: () => void) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await promise;
      if (!result.ok) setError(result.error);
      else {
        if (ok) setNotice(ok);
        onOk?.();
        router.refresh();
      }
    });
  }

  function update(id: string, patch: Partial<DiningTable>) {
    setTables((all) =>
      all.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        // Keep it on the plan.
        next.w = Math.min(Math.max(next.w, 1), 8);
        next.h = Math.min(Math.max(next.h, 1), 8);
        next.x = Math.min(Math.max(next.x, 0), COLS - next.w);
        next.y = Math.min(Math.max(next.y, 0), ROWS - next.h);
        return next;
      })
    );
    setDirty(true);
  }

  function cellAt(event: { clientX: number; clientY: number }) {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * COLS),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * ROWS),
    };
  }

  function onPointerDown(table: DiningTable, event: React.PointerEvent<HTMLButtonElement>) {
    const cell = cellAt(event);
    drag.current = { id: table.id, dx: cell.x - table.x, dy: cell.y - table.y, moved: false };
    setSelected(table.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.currentTarget;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const c = cellAt(e);
      d.moved = true;
      update(d.id, { x: c.x - d.dx, y: c.y - d.dy });
    };
    const up = () => {
      drag.current = null;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function addTable(shape: TableShape) {
    const { w, h } = SIZE[shape];
    // First free spot, scanning rows.
    const taken = (x: number, y: number) =>
      inArea.some((t) => x < t.x + t.w + 1 && x + w + 1 > t.x && y < t.y + t.h + 1 && y + h + 1 > t.y);
    let spot = { x: 0, y: 0 };
    search: for (let y = 0; y <= ROWS - h; y++) {
      for (let x = 0; x <= COLS - w; x++) {
        if (!taken(x, y)) {
          spot = { x, y };
          break search;
        }
      }
    }
    const numbers = tables.map((t) => Number(t.name)).filter(Number.isFinite);
    const id = `new-${++tempId}`;
    setTables((all) => [
      ...all,
      {
        id,
        area_id: areaId,
        name: String((numbers.length ? Math.max(...numbers) : 0) + 1),
        seats: shape === "long" ? 6 : shape === "round" ? 2 : 4,
        shape,
        ...spot,
        w,
        h,
      },
    ]);
    setSelected(id);
    setDirty(true);
  }

  function removeTable(id: string) {
    if (busyTableIds.includes(id)) {
      setError("This table has an open bill. Pay or move it first.");
      return;
    }
    setTables((all) => all.filter((t) => t.id !== id));
    setSelected(null);
    setDirty(true);
  }

  function save() {
    run(
      saveFloorPlan(
        slug,
        areaId,
        inArea.map(({ id, name, seats, shape, x, y, w, h }) => ({ id: id.startsWith("new-") ? "" : id, name, seats, shape, x, y, w, h }))
      ),
      "Floor plan saved.",
      () => setDirty(false)
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900">Table service{branchName && ` · ${branchName}`}</h2>
            <p className="text-sm text-neutral-500">
              {on
                ? "On: staff open a bill on a table, send rounds to the kitchen, and the guests pay at the end. Takeaway still pays at once on POS."
                : "Off: every sale is paid at once on POS (counter service). Turn on for seated guests who pay at the end."}
            </p>
          </div>
          <button
            disabled={pending}
            onClick={() => run(setTableService(slug, !on))}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${on ? "border border-neutral-300 text-neutral-700" : "bg-neutral-900 text-white"}`}
          >
            {on ? "Turn off" : "Turn on table service"}
          </button>
        </div>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      {areas.length > 0 && (
        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  if (dirty && !confirm("Leave this area without saving?")) return;
                  setTables(saved);
                  setDirty(false);
                  setSelected(null);
                  setAreaId(a.id);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${a.id === areaId ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
              >
                {a.name}
              </button>
            ))}
            <button
              onClick={() => {
                const name = prompt("New area name (e.g. Terrace, Upstairs)");
                if (name) run(addArea(slug, name));
              }}
              className="rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-600"
            >
              + Area
            </button>
            {area && (
              <span className="ml-auto flex gap-3 text-xs">
                <button
                  className="text-neutral-500 underline"
                  onClick={() => {
                    const name = prompt("Rename area", area.name);
                    if (name) run(renameArea(slug, area.id, name));
                  }}
                >
                  Rename
                </button>
                {areas.length > 1 && (
                  <button className="text-red-600 underline" onClick={() => run(removeArea(slug, area.id))}>
                    Remove area
                  </button>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm text-neutral-500">Add a table:</span>
            {(["square", "round", "long"] as const).map((shape) => (
              <button key={shape} onClick={() => addTable(shape)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm capitalize text-neutral-700">
                + {shape}
              </button>
            ))}
          </div>

          <FloorCanvas
            canvasRef={canvas}
            showGrid
            tables={inArea}
            onTablePointerDown={onPointerDown}
            render={(t) => ({
              className: `cursor-move border-2 text-xs sm:text-sm ${t.id === selected ? "border-neutral-900 bg-amber-100" : "border-neutral-300 bg-neutral-100"}`,
              content: (
                <>
                  <span className="font-semibold">{t.name}</span>
                  <span className="hidden text-neutral-500 sm:inline">{t.seats} seats</span>
                </>
              ),
            })}
          />
          <p className="text-xs text-neutral-500">Drag tables to where they stand. Tap one to change its number, seats or size.</p>

          {current && (
            <div className="grid gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-6">
              <label className="space-y-1 text-sm text-neutral-700 sm:col-span-2">
                Number / name
                <input value={current.name} maxLength={12} onChange={(e) => update(current.id, { name: e.target.value })} className={input} />
              </label>
              <label className="space-y-1 text-sm text-neutral-700">
                Seats
                <input type="number" min={1} max={50} value={current.seats} onChange={(e) => update(current.id, { seats: Number(e.target.value) || 1 })} className={input} />
              </label>
              <label className="space-y-1 text-sm text-neutral-700">
                Shape
                <select value={current.shape} onChange={(e) => update(current.id, { shape: e.target.value as TableShape })} className={input}>
                  <option value="square">Square</option>
                  <option value="round">Round</option>
                  <option value="long">Long</option>
                </select>
              </label>
              <label className="space-y-1 text-sm text-neutral-700">
                Width
                <input type="number" min={1} max={8} value={current.w} onChange={(e) => update(current.id, { w: Number(e.target.value) || 1 })} className={input} />
              </label>
              <label className="space-y-1 text-sm text-neutral-700">
                Depth
                <input type="number" min={1} max={8} value={current.h} onChange={(e) => update(current.id, { h: Number(e.target.value) || 1 })} className={input} />
              </label>
              <button onClick={() => removeTable(current.id)} className="text-left text-sm text-red-600 underline sm:col-span-6">
                Remove table {current.name}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              disabled={pending || !dirty}
              onClick={save}
              className="rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save floor plan"}
            </button>
            {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
          </div>
        </section>
      )}
    </div>
  );
}
