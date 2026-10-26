"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { formatRupiah, UNIT_CODES } from "@pantrio/core";
import { fmtQty, fmtRupiahQ, unitPrice, type CostingData, type ProductRow } from "@/lib/costing-model";
import { useTenant } from "../tenant-context";
import {
  addConversion,
  recordPrice,
  removeConversion,
  saveIngredient,
  saveProduct,
  saveSupplier,
  setActive,
  type Result,
} from "./actions";

type History = { id: string; product_id: string; price: number; effective_from: string; note: string | null }[];
type Supplier = { id: string; name: string; phone: string | null; notes: string | null; active: boolean };

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-neutral-900";
const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";
const primary = "rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40";

const UNIT_LABEL: Record<string, string> = {
  mg: "mg",
  g: "g",
  ons: "ons (100 g)",
  kg: "kg",
  ml: "ml",
  l: "L",
  pcs: "pcs",
  lusin: "lusin (12)",
};

function UnitSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? "g"} className={input}>
      {UNIT_CODES.map((u) => (
        <option key={u} value={u}>
          {UNIT_LABEL[u] ?? u}
        </option>
      ))}
    </select>
  );
}

export function IngredientManager({
  data,
  history,
  suppliers,
  today,
}: {
  data: CostingData;
  history: History;
  suppliers: Supplier[];
  today: string;
}) {
  const router = useRouter();
  const { slug } = useTenant();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // which inline form is open
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const run = (p: Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const r = await p;
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });
  const submit = (action: (slug: string, fd: FormData) => Promise<Result>) => (fd: FormData) =>
    run(action(slug, fd), () => setOpen(null));

  const priceOf = useMemo(() => new Map(data.prices.map((p) => [p.product_id, p])), [data.prices]);
  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const visible = data.ingredients.filter(
    (i) => (showHidden || i.active) && i.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Ingredients</h1>
          <p className="max-w-2xl text-sm text-neutral-500">
            Raw materials and the exact brands you buy. Change a price any time — dish costs update straight away,
            and past sales keep the cost they were sold at.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen(open === "suppliers" ? null : "suppliers")} className={btn}>
            Suppliers ({suppliers.filter((s) => s.active).length})
          </button>
          <button onClick={() => setOpen("new-ingredient")} className={primary}>
            Add ingredient
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {open === "suppliers" && (
        <Card>
          <h2 className="font-semibold text-neutral-900">Suppliers</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span className={s.active ? "" : "text-neutral-400 line-through"}>
                  {s.name}
                  {s.phone && <span className="text-neutral-500"> · {s.phone}</span>}
                  {s.notes && <span className="text-neutral-400"> · {s.notes}</span>}
                </span>
                <button disabled={pending} onClick={() => run(setActive(slug, "suppliers", s.id, !s.active))} className={btn}>
                  {s.active ? "Hide" : "Show"}
                </button>
              </li>
            ))}
          </ul>
          <form action={submit(saveSupplier)} className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="id" value="" />
            <input name="name" placeholder="Supplier name" required className={input} />
            <input name="phone" placeholder="Phone / WhatsApp" className={input} />
            <input name="notes" placeholder="Notes (e.g. Pasar Senen, Shopee)" className={input} />
            <button disabled={pending} className={primary}>
              Add supplier
            </button>
          </form>
        </Card>
      )}

      {open === "new-ingredient" && (
        <Card>
          <form action={submit(saveIngredient)} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto_auto]">
            <input type="hidden" name="id" value="" />
            <input name="name" placeholder="Ingredient, e.g. Tepung terigu" required autoFocus className={input} />
            <input name="category" placeholder="Category (optional)" className={input} />
            <button type="button" onClick={() => setOpen(null)} className={btn}>
              Cancel
            </button>
            <button disabled={pending} className={primary}>
              Add
            </button>
          </form>
          <p className="text-xs text-neutral-500">
            An ingredient is the generic material. Next you add the brands/packs you actually buy, each with its
            price.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingredients"
          className="w-64 rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-neutral-900"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show hidden
        </label>
      </div>

      {data.ingredients.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
          No ingredients yet. Start with the things your best sellers use most.
        </p>
      )}

      {visible.map((ing) => {
        const products = data.products.filter((p) => p.ingredient_id === ing.id && (showHidden || p.active));
        const conversions = data.conversions.filter((c) => c.ingredient_id === ing.id);
        return (
          <Card key={ing.id} muted={!ing.active}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              {open === `edit-${ing.id}` ? (
                <form action={submit(saveIngredient)} className="flex flex-1 flex-wrap gap-2">
                  <input type="hidden" name="id" value={ing.id} />
                  <input name="name" defaultValue={ing.name} required className={`${input} max-w-xs`} />
                  <input name="category" defaultValue={ing.category ?? ""} placeholder="Category" className={`${input} max-w-48`} />
                  <button disabled={pending} className={btn}>
                    Save
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className={btn}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div>
                  <h2 className={`text-lg font-semibold ${ing.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
                    {ing.name}
                  </h2>
                  {ing.category && <p className="text-xs uppercase tracking-wide text-neutral-400">{ing.category}</p>}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setOpen(`edit-${ing.id}`)} className={btn}>
                  Rename
                </button>
                <button disabled={pending} onClick={() => run(setActive(slug, "ingredients", ing.id, !ing.active))} className={btn}>
                  {ing.active ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <ul className="divide-y divide-neutral-100">
              {products.length === 0 && (
                <li className="py-2 text-sm text-neutral-400">No brand yet — add the one you buy.</li>
              )}
              {products.map((p) => (
                <ProductItem
                  key={p.id}
                  product={p}
                  current={priceOf.get(p.id)}
                  history={history.filter((h) => h.product_id === p.id)}
                  supplier={p.supplier_id ? supplierName.get(p.supplier_id) : undefined}
                  open={open}
                  setOpen={setOpen}
                  pending={pending}
                  today={today}
                  onPrice={submit(recordPrice)}
                  onEdit={submit(saveProduct)}
                  onToggle={() => run(setActive(slug, "ingredient_products", p.id, !p.active))}
                  suppliers={suppliers}
                />
              ))}
            </ul>

            {open === `new-product-${ing.id}` ? (
              <ProductForm ingredientId={ing.id} suppliers={suppliers} pending={pending} onSubmit={submit(saveProduct)} onCancel={() => setOpen(null)} />
            ) : (
              <button onClick={() => setOpen(`new-product-${ing.id}`)} className={btn}>
                + Add brand / pack
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 text-sm">
              <span className="text-neutral-500">Conversions:</span>
              {conversions.length === 0 && <span className="text-neutral-400">none</span>}
              {conversions.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1">
                  {fmtQty(c.qty)} {c.unit} = {fmtQty(c.equals_qty)} {c.equals_unit}
                  <button
                    aria-label="Remove conversion"
                    disabled={pending}
                    onClick={() => run(removeConversion(slug, c.id))}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {open === `conv-${ing.id}` ? (
                <form action={submit(addConversion)} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="ingredient_id" value={ing.id} />
                  <input name="qty" defaultValue="1" inputMode="decimal" className={`${input} w-20`} />
                  <div className="w-32"><UnitSelect name="unit" defaultValue="pcs" /></div>
                  <span>=</span>
                  <input name="equals_qty" placeholder="55" inputMode="decimal" required className={`${input} w-24`} />
                  <div className="w-32"><UnitSelect name="equals_unit" defaultValue="g" /></div>
                  <button disabled={pending} className={btn}>
                    Add
                  </button>
                </form>
              ) : (
                <button onClick={() => setOpen(`conv-${ing.id}`)} className="text-sm text-neutral-600 underline">
                  + add (e.g. 1 pcs = 55 g)
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ProductItem({
  product: p,
  current,
  history,
  supplier,
  suppliers,
  open,
  setOpen,
  pending,
  today,
  onPrice,
  onEdit,
  onToggle,
}: {
  product: ProductRow;
  current?: { price: number; effective_from: string };
  history: History;
  supplier?: string;
  suppliers: Supplier[];
  open: string | null;
  setOpen: (v: string | null) => void;
  pending: boolean;
  today: string;
  onPrice: (fd: FormData) => void;
  onEdit: (fd: FormData) => void;
  onToggle: () => void;
}) {
  const per = current ? unitPrice(current.price, p.pack_qty, p.pack_unit) : null;
  if (open === `edit-product-${p.id}`) {
    return (
      <li className="py-3">
        <ProductForm product={p} ingredientId={p.ingredient_id} suppliers={suppliers} pending={pending} onSubmit={onEdit} onCancel={() => setOpen(null)} />
      </li>
    );
  }
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${p.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
            {p.brand && <span>{p.brand} · </span>}
            {p.name} <span className="font-normal text-neutral-500">({fmtQty(p.pack_qty)} {p.pack_unit})</span>
          </p>
          <p className="text-sm text-neutral-500">
            {current ? (
              <>
                <span className="font-medium text-neutral-800">{formatRupiah(current.price)}</span>
                {per && ` · ${fmtRupiahQ(per.value)}/${per.per}`} · since {current.effective_from}
              </>
            ) : (
              <span className="text-amber-700">No price yet — dishes using it show “cost unknown”</span>
            )}
            {p.yield_bps < 10_000 && ` · ${p.yield_bps / 100}% usable`}
            {supplier && ` · ${supplier}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpen(`price-${p.id}`)} className={btn}>
            New price
          </button>
          <button onClick={() => setOpen(open === `history-${p.id}` ? null : `history-${p.id}`)} className={btn}>
            History ({history.length})
          </button>
          <button onClick={() => setOpen(`edit-product-${p.id}`)} className={btn}>
            Edit
          </button>
          <button disabled={pending} onClick={onToggle} className={btn}>
            {p.active ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {open === `price-${p.id}` && (
        <form action={onPrice} className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3">
          <input type="hidden" name="product_id" value={p.id} />
          <span className="text-sm text-neutral-600">Rp</span>
          <input name="price" type="number" min="0" step="1" required autoFocus placeholder="14500" className={`${input} w-36`} />
          <span className="text-sm text-neutral-600">per {fmtQty(p.pack_qty)} {p.pack_unit}, from</span>
          <input name="effective_from" type="date" defaultValue={today} required className={`${input} w-44`} />
          <input name="note" placeholder="Note (optional)" className={`${input} w-48`} />
          <button disabled={pending} className={btn}>
            Save price
          </button>
          <button type="button" onClick={() => setOpen(null)} className={btn}>
            Cancel
          </button>
        </form>
      )}

      {open === `history-${p.id}` && (
        <ul className="rounded-xl bg-neutral-50 p-3 text-sm">
          {history.length === 0 && <li className="text-neutral-400">No prices recorded.</li>}
          {history.map((h) => (
            <li key={h.id} className="flex justify-between gap-3 py-0.5">
              <span className="text-neutral-600">
                {h.effective_from}
                {h.effective_from > today && " (upcoming)"}
                {h.note && <span className="text-neutral-400"> · {h.note}</span>}
              </span>
              <span className="tabular-nums text-neutral-800">{formatRupiah(h.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ProductForm({
  product,
  ingredientId,
  suppliers,
  pending,
  onSubmit,
  onCancel,
}: {
  product?: ProductRow;
  ingredientId: string;
  suppliers: Supplier[];
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSubmit} className="space-y-3 rounded-xl border border-neutral-200 p-4">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <input type="hidden" name="ingredient_id" value={ingredientId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand">
          <input name="brand" defaultValue={product?.brand ?? ""} placeholder="Segitiga Biru" className={input} />
        </Field>
        <Field label="Product">
          <input name="name" defaultValue={product?.name ?? ""} required placeholder="Protein sedang" className={input} />
        </Field>
        <Field label="Pack size">
          <div className="flex gap-2">
            <input name="pack_qty" defaultValue={product?.pack_qty ?? ""} required inputMode="decimal" placeholder="1" className={input} />
            <UnitSelect name="pack_unit" defaultValue={product?.pack_unit ?? "kg"} />
          </div>
        </Field>
        <Field label="Usable % after trimming / peeling" hint="100 for flour or sugar; e.g. 75 for whole chicken">
          <input name="yield_pct" type="number" min="1" max="100" step="0.01" defaultValue={product ? product.yield_bps / 100 : 100} className={input} />
        </Field>
        <Field label="Supplier">
          <select name="supplier_id" defaultValue={product?.supplier_id ?? ""} className={input}>
            <option value="">—</option>
            {suppliers
              .filter((s) => s.active || s.id === product?.supplier_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        {!product && (
          <Field label="Price for this pack (Rp)" hint="Leave empty if you don't know it yet">
            <input name="price" type="number" min="0" step="1" placeholder="14500" className={input} />
          </Field>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={btn}>
          Cancel
        </button>
        <button disabled={pending} className={primary}>
          {product ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

function Card({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <section className={`space-y-3 rounded-2xl bg-white p-5 shadow-sm ${muted ? "opacity-70" : ""}`}>{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}
