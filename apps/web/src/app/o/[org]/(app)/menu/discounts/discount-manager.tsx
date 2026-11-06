"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discountAppliesOn, formatDay, formatRupiah, type PosDiscount } from "@pantrio/core";
import type { MenuCategory, MenuItem } from "@/lib/queries/pos";
import { useTenant } from "../../tenant-context";
import { deleteDiscount, saveDiscount, type Result } from "./actions";

// Menu discounts (P27): % or Rp off each unit, on ticked items or all, in a
// date window and optionally only on some weekdays. The till applies them
// automatically; the cashier never chooses.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

function describe(d: PosDiscount): string {
  return d.kind === "percent" ? `${(d.value / 100).toLocaleString("id-ID")}% off` : `${formatRupiah(d.value)} off each`;
}

function status(d: PosDiscount, today: string): { label: string; tone: string } {
  if (!d.active) return { label: "Off", tone: "bg-neutral-100 text-neutral-600" };
  if (d.endsOn && d.endsOn < today) return { label: "Ended", tone: "bg-neutral-100 text-neutral-600" };
  if (d.startsOn > today) return { label: "Scheduled", tone: "bg-blue-50 text-blue-800" };
  if (discountAppliesOn(d, today)) return { label: "Running today", tone: "bg-green-50 text-green-800" };
  return { label: "Not today", tone: "bg-amber-50 text-amber-800" };
}

export function DiscountManager({
  discounts,
  categories,
  items,
  today,
}: {
  discounts: PosDiscount[];
  categories: MenuCategory[];
  items: MenuItem[];
  today: string;
}) {
  const router = useRouter();
  const { slug, base } = useTenant();
  const [editing, setEditing] = useState<PosDiscount | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  function run(p: Promise<Result>, after?: () => void) {
    startTransition(async () => {
      setError(null);
      const r = await p;
      if (!r.ok) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <Link href={`${base}/menu`} className="text-sm text-neutral-500 hover:underline">
        ← Menu
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Discounts</h1>
          <p className="max-w-2xl text-sm text-neutral-500">
            Applied automatically at the till on the days they run — the cashier doesn&apos;t choose. If two discounts
            cover the same item, the customer gets the bigger one (they don&apos;t add up). Service and tax are on the
            price after discount.
          </p>
        </div>
        {editing === null && (
          <button onClick={() => setEditing("new")} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white">
            New discount
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {editing !== null && (
        <DiscountForm
          key={editing === "new" ? "new" : editing.id}
          discount={editing === "new" ? null : editing}
          categories={categories}
          items={items}
          today={today}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(values) => run(saveDiscount(slug, values), () => setEditing(null))}
        />
      )}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {discounts.length === 0 && <li className="p-6 text-center text-sm text-neutral-400">No discounts yet.</li>}
        {discounts.map((d) => {
          const st = status(d, today);
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">
                  {d.name} <span className="font-normal text-neutral-500">· {describe(d)}</span>
                </p>
                <p className="text-sm text-neutral-500">
                  {d.allItems
                    ? "All menu items"
                    : d.menuItemIds.map((id) => itemName.get(id) ?? "(hidden item)").join(", ")}
                </p>
                <p className="text-xs text-neutral-400">
                  {formatDay(d.startsOn)}
                  {d.endsOn ? ` – ${formatDay(d.endsOn)}` : " onwards"}
                  {d.weekdays ? ` · ${d.weekdays.map((w) => WEEKDAYS[w - 1]).join(", ")} only` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.tone}`}>{st.label}</span>
                <button
                  disabled={pending}
                  onClick={() => setEditing(d)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                >
                  Edit
                </button>
                <button
                  disabled={pending}
                  onClick={() =>
                    run(
                      saveDiscount(slug, {
                        id: d.id,
                        name: d.name,
                        kind: d.kind,
                        value: d.kind === "percent" ? d.value / 100 : d.value,
                        allItems: d.allItems,
                        items: [...d.menuItemIds],
                        startsOn: d.startsOn,
                        endsOn: d.endsOn,
                        weekdays: d.weekdays ? [...d.weekdays] : [],
                        active: !d.active,
                      })
                    )
                  }
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                >
                  {d.active ? "Turn off" : "Turn on"}
                </button>
                <button
                  disabled={pending}
                  onClick={() => window.confirm(`Delete “${d.name}”? Past receipts keep it.`) && run(deleteDiscount(slug, d.id))}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type FormValues = Parameters<typeof saveDiscount>[1];

function DiscountForm({
  discount,
  categories,
  items,
  today,
  pending,
  onCancel,
  onSave,
}: {
  discount: PosDiscount | null;
  categories: MenuCategory[];
  items: MenuItem[];
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (v: FormValues) => void;
}) {
  const [name, setName] = useState(discount?.name ?? "");
  const [kind, setKind] = useState<"percent" | "amount">(discount?.kind ?? "percent");
  const [value, setValue] = useState(
    discount ? String(discount.kind === "percent" ? discount.value / 100 : discount.value) : ""
  );
  const [allItems, setAllItems] = useState(discount?.allItems ?? false);
  const [picked, setPicked] = useState<Set<string>>(new Set(discount?.menuItemIds ?? []));
  const [startsOn, setStartsOn] = useState(discount?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(discount?.endsOn ?? "");
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set(discount?.weekdays ?? [1, 2, 3, 4, 5, 6, 7]));
  const [active, setActive] = useState(discount?.active ?? true);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: discount?.id ?? null,
          name,
          kind,
          value: Number(value.replace(",", ".")),
          allItems,
          items: [...picked],
          startsOn,
          endsOn: endsOn || null,
          weekdays: [...weekdays],
          active,
        });
      }}
      className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"
    >
      <h2 className="font-semibold text-neutral-900">{discount ? "Edit discount" : "New discount"}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm text-neutral-700 sm:col-span-1">
          Name (on the receipt)
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Coffee Tuesday" className={input} />
        </label>
        <div className="space-y-1 text-sm text-neutral-700">
          Type
          <div className="flex rounded-lg bg-neutral-100 p-1">
            {(["percent", "amount"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium ${kind === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
              >
                {k === "percent" ? "% off" : "Rp off each"}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1 text-sm text-neutral-700">
          {kind === "percent" ? "Percent off" : "Rupiah off each item"}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            inputMode="decimal"
            placeholder={kind === "percent" ? "20" : "5000"}
            className={input}
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 rounded-xl border border-neutral-900 bg-neutral-50 p-3 text-sm font-medium text-neutral-900">
          <input type="checkbox" checked={allItems} onChange={(e) => setAllItems(e.target.checked)} className="h-5 w-5" />
          All menu items
        </label>
        {!allItems &&
          categories.map((c) => {
            const inCat = items.filter((i) => i.category_id === c.id);
            if (inCat.length === 0) return null;
            const allPicked = inCat.every((i) => picked.has(i.id));
            return (
              <div key={c.id} className="rounded-xl border border-neutral-200 p-3">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                  <input
                    type="checkbox"
                    checked={allPicked}
                    onChange={() =>
                      setPicked((cur) => {
                        const next = new Set(cur);
                        for (const i of inCat) {
                          if (allPicked) next.delete(i.id);
                          else next.add(i.id);
                        }
                        return next;
                      })
                    }
                    className="h-4 w-4"
                  />
                  {c.name}
                </label>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {inCat.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={picked.has(i.id)} onChange={() => setPicked((cur) => toggle(cur, i.id))} className="h-4 w-4" />
                      {i.name} <span className="text-neutral-400">{formatRupiah(i.price)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-neutral-700">
          From
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required className={input} />
        </label>
        <label className="space-y-1 text-sm text-neutral-700">
          Until (empty = no end)
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={input} />
        </label>
      </div>

      <div className="space-y-1 text-sm text-neutral-700">
        On these days
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, i) => (
            <label
              key={label}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${weekdays.has(i + 1) ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
            >
              <input type="checkbox" checked={weekdays.has(i + 1)} onChange={() => setWeekdays((cur) => toggle(cur, i + 1))} className="h-4 w-4" />
              {label}
            </label>
          ))}
        </div>
        {weekdays.size === 0 && <p className="text-xs text-red-700">Tick at least one day.</p>}
      </div>

      <label className="flex items-center gap-3 text-sm text-neutral-700">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
        On
      </label>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-neutral-300 py-3 font-medium text-neutral-700">
          Cancel
        </button>
        <button
          disabled={pending || weekdays.size === 0}
          className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save discount"}
        </button>
      </div>
    </form>
  );
}
