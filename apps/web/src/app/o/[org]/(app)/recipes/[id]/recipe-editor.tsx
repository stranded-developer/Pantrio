"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  costRecipe,
  dimensionOf,
  BASE_UNIT,
  dishMargin,
  formatBps,
  formatRupiah,
  Q,
  RecipeCycleError,
  UNIT_CODES,
  type RecipeCost,
  type TaxSettings,
  type UnitCode,
} from "@pantrio/core";
import { buildCatalog, fmtQty, fmtRupiahQ, productLabel, type CostingData, type LineRow, type RecipeRow } from "@/lib/costing-model";
import { useTenant } from "../../tenant-context";
import { deleteRecipe, saveRecipe } from "../actions";

type Draft = { key: string; ref: string; qty: string; unit: UnitCode; wastePct: string };

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-neutral-900";
const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

let nextKey = 0;
const key = () => `l${nextKey++}`;

function toNumber(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function RecipeEditor({
  data,
  recipe,
  menuItem,
  tax,
}: {
  data: CostingData;
  recipe: RecipeRow;
  menuItem: { id: string; name: string; price: number } | null;
  tax: TaxSettings;
}) {
  const router = useRouter();
  const { slug, base } = useTenant();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isDish = recipe.kind === "menu_item";

  const [name, setName] = useState(recipe.name);
  const [yieldQty, setYieldQty] = useState(String(recipe.yield_qty));
  const [yieldUnit, setYieldUnit] = useState<UnitCode>(recipe.yield_unit);
  const [lines, setLines] = useState<Draft[]>(() =>
    data.lines
      .filter((l) => l.recipe_id === recipe.id)
      .sort((a, b) => a.sort - b.sort)
      .map((l) => ({
        key: key(),
        ref: l.product_id ? `p:${l.product_id}` : `r:${l.sub_recipe_id}`,
        qty: String(l.qty),
        unit: l.unit,
        wastePct: String(l.waste_bps / 100),
      }))
  );
  const [dirty, setDirty] = useState(false);
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setMessage(null);
  };

  const ingredientName = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i.name])), [data.ingredients]);
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const recipeById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);

  // Lines that are complete enough to cost, with their position in the draft.
  const valid = lines
    .map((l, i) => ({ l, i, qty: toNumber(l.qty), waste: toNumber(l.wastePct || "0") }))
    .filter((x) => x.l.ref && x.qty > 0 && x.waste >= 0 && x.waste <= 100);
  const draftRows: LineRow[] = valid.map((x, sort) => ({
    recipe_id: recipe.id,
    sort,
    product_id: x.l.ref.startsWith("p:") ? x.l.ref.slice(2) : null,
    sub_recipe_id: x.l.ref.startsWith("r:") ? x.l.ref.slice(2) : null,
    qty: x.qty,
    unit: x.l.unit,
    waste_bps: Math.round(x.waste * 100),
  }));
  const yieldNum = toNumber(yieldQty);

  let cost: RecipeCost | null = null;
  let cycle = false;
  try {
    const catalog = buildCatalog(
      {
        ...data,
        recipes: data.recipes.map((r) =>
          r.id === recipe.id ? { ...r, yield_qty: yieldNum > 0 ? yieldNum : 1, yield_unit: isDish ? "pcs" : yieldUnit } : r
        ),
      },
      { recipeId: recipe.id, lines: draftRows }
    );
    cost = costRecipe(recipe.id, catalog);
  } catch (e) {
    if (e instanceof RecipeCycleError) cycle = true;
    else throw e;
  }
  const lineCost = new Map<number, Q | null>(valid.map((x, j) => [x.i, cost?.lines[j]?.cost ?? null]));
  const perPortion = cost?.perYieldUnit ?? null;
  const portionCost = perPortion ? perPortion.round() : null;
  const margin = isDish && menuItem && portionCost !== null ? dishMargin(menuItem.price, portionCost, tax) : null;

  function pickRef(i: number, ref: string) {
    setLines((cur) =>
      cur.map((l, j) => {
        if (j !== i) return l;
        // Default the unit to something that fits the chosen ingredient.
        let unit = l.unit;
        const target = ref.startsWith("p:") ? productById.get(ref.slice(2))?.pack_unit : recipeById.get(ref.slice(2))?.yield_unit;
        if (target && dimensionOf(target) !== dimensionOf(unit)) unit = BASE_UNIT[dimensionOf(target)];
        return { ...l, ref, unit };
      })
    );
    setDirty(true);
  }
  const update = (i: number, patch: Partial<Draft>) => {
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  function save() {
    const bad = lines.find((l) => !l.ref || !(toNumber(l.qty) > 0));
    if (bad) return setMessage({ ok: false, text: "Every line needs an ingredient and an amount above 0 (or remove it)." });
    if (!(yieldNum > 0)) return setMessage({ ok: false, text: "The batch size must be more than 0." });
    startTransition(async () => {
      const r = await saveRecipe(slug, recipe.id, {
        name,
        yieldQty: yieldNum,
        yieldUnit: isDish ? "pcs" : yieldUnit,
        lines: draftRows.map((d) => ({
          productId: d.product_id,
          subRecipeId: d.sub_recipe_id,
          qty: d.qty,
          unit: d.unit,
          wasteBps: d.waste_bps,
        })),
      });
      if (!r.ok) setMessage({ ok: false, text: r.error });
      else {
        setDirty(false);
        setMessage({ ok: true, text: isDish ? "Saved — the till now uses this cost for new sales." : "Saved." });
        router.refresh();
      }
    });
  }

  const products = data.products.filter((p) => p.active || lines.some((l) => l.ref === `p:${p.id}`));
  const groups = data.ingredients
    .map((ing) => ({ ing, items: products.filter((p) => p.ingredient_id === ing.id) }))
    .filter((g) => g.items.length > 0);
  const preps = data.recipes.filter((r) => r.kind === "prep" && r.id !== recipe.id);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`${base}/recipes`} className="text-sm text-neutral-500 hover:underline">
        ← Recipes
      </Link>

      <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-64 flex-1 space-y-1">
            <span className="text-sm font-medium text-neutral-700">{isDish ? "Dish" : "Prep recipe"}</span>
            <input value={name} onChange={(e) => edit(setName)(e.target.value)} className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-neutral-700">{isDish ? "This recipe makes (portions)" : "Batch makes"}</span>
            <div className="flex gap-2">
              <input value={yieldQty} onChange={(e) => edit(setYieldQty)(e.target.value)} inputMode="decimal" className={`${input} w-24`} />
              {!isDish && (
                <select value={yieldUnit} onChange={(e) => edit(setYieldUnit)(e.target.value as UnitCode)} className={`${input} w-24`}>
                  {UNIT_CODES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>
        </div>
        {isDish && menuItem && (
          <p className="text-sm text-neutral-500">
            Linked to menu item <span className="font-medium text-neutral-800">{menuItem.name}</span> · menu price{" "}
            {formatRupiah(menuItem.price)}. Usually 1 portion; enter a larger number if you write the recipe per batch
            (e.g. a cake = 12 slices).
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="p-3 font-medium">Ingredient (brand you use)</th>
              <th className="w-28 p-3 font-medium">Amount</th>
              <th className="w-28 p-3 font-medium">Unit</th>
              <th className="w-24 p-3 font-medium">Waste %</th>
              <th className="w-32 p-3 text-right font-medium">Cost</th>
              <th className="w-10 p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-neutral-400">
                  Add the ingredients that go into {isDish ? "one portion (or one batch)" : "one batch"}.
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const c = lineCost.get(i);
              return (
                <tr key={l.key}>
                  <td className="p-3">
                    <select value={l.ref} onChange={(e) => pickRef(i, e.target.value)} className={input}>
                      <option value="">Choose…</option>
                      {groups.map((g) => (
                        <optgroup key={g.ing.id} label={g.ing.name}>
                          {g.items.map((p) => (
                            <option key={p.id} value={`p:${p.id}`}>
                              {productLabel(p, ingredientName.get(p.ingredient_id))}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {preps.length > 0 && (
                        <optgroup label="Prep recipes">
                          {preps.map((r) => (
                            <option key={r.id} value={`r:${r.id}`}>
                              {r.name} (makes {fmtQty(r.yield_qty)} {r.yield_unit})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>
                  <td className="p-3">
                    <input value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} inputMode="decimal" placeholder="120" className={input} />
                  </td>
                  <td className="p-3">
                    <select value={l.unit} onChange={(e) => update(i, { unit: e.target.value as UnitCode })} className={input}>
                      {UNIT_CODES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input value={l.wastePct} onChange={(e) => update(i, { wastePct: e.target.value })} inputMode="decimal" placeholder="0" className={input} />
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {c ? fmtRupiahQ(c) : l.ref && toNumber(l.qty) > 0 ? <span className="text-amber-700">unknown</span> : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      aria-label="Remove line"
                      onClick={() => {
                        setLines((cur) => cur.filter((_, j) => j !== i));
                        setDirty(true);
                      }}
                      className="text-neutral-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 p-3">
          <button
            onClick={() => {
              setLines((cur) => [...cur, { key: key(), ref: "", qty: "", unit: "g", wastePct: "0" }]);
              setDirty(true);
            }}
            className={btn}
          >
            + Add ingredient
          </button>
          <p className="text-xs text-neutral-500">
            Missing an ingredient? Add it under{" "}
            <Link href={`${base}/ingredients`} className="underline">
              Ingredients
            </Link>{" "}
            first. Waste % = spillage / over-pouring on this line.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl bg-white p-6 shadow-sm text-sm">
          <h2 className="font-semibold text-neutral-900">Cost</h2>
          {cycle ? (
            <p className="text-red-700">This recipe would contain itself through a prep recipe.</p>
          ) : (
            <>
              <Row label="Whole batch" value={cost ? (cost.complete ? fmtRupiahQ(cost.knownBatchCost) : `at least ${fmtRupiahQ(cost.knownBatchCost)}`) : "—"} />
              <Row
                label={isDish ? "Per portion" : `Per ${yieldUnit}`}
                value={perPortion ? (isDish ? formatRupiah(portionCost!) : fmtRupiahQ(perPortion)) : "unknown"}
                strong
              />
              {cost && cost.missing.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
                  {cost.missing.map((m, j) => (
                    <li key={j}>{m.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {isDish && menuItem && (
          <div className="space-y-2 rounded-2xl bg-white p-6 shadow-sm text-sm">
            <h2 className="font-semibold text-neutral-900">Margin</h2>
            {margin ? (
              <>
                <Row label="Menu price" value={formatRupiah(menuItem.price)} />
                {tax.priceMode === "inclusive" && <Row label="Price without PB1 / service" value={formatRupiah(margin.netSales)} />}
                <Row label="Ingredient cost" value={formatRupiah(margin.cost)} />
                <Row label="Food cost %" value={formatBps(margin.foodCostBps)} />
                <Row label="Gross profit per portion" value={formatRupiah(margin.grossProfit)} strong />
                <Row label="Margin before tax" value={formatBps(margin.marginBeforeTaxBps)} strong />
                <Row label={`After income tax (−${formatRupiah(margin.incomeTax)})`} value={formatBps(margin.marginAfterTaxBps)} />
                <p className="pt-1 text-xs text-neutral-500">
                  Staff wages, rent and electricity are monthly fixed costs, not per dish — they come off in the
                  monthly profit report.
                </p>
              </>
            ) : (
              <p className="text-neutral-500">Shown once every ingredient has a price.</p>
            )}
          </div>
        )}
      </section>

      {message && (
        <p className={`rounded-xl p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <button
          disabled={pending}
          onClick={() => {
            if (!window.confirm(isDish ? "Delete this recipe? The menu item stays; its cost becomes unknown." : "Delete this prep recipe?")) return;
            startTransition(async () => {
              const r = await deleteRecipe(slug, recipe.id);
              if (!r.ok) setMessage({ ok: false, text: r.error });
              else router.push(`${base}/recipes`);
            });
          }}
          className="rounded-xl border border-red-300 px-5 py-3 text-sm font-medium text-red-700 disabled:opacity-40"
        >
          Delete recipe
        </button>
        <button disabled={pending || cycle} onClick={save} className="rounded-xl bg-neutral-900 px-8 py-3 font-medium text-white disabled:opacity-40">
          {pending ? "Saving…" : dirty ? "Save recipe" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-neutral-900" : "text-neutral-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
