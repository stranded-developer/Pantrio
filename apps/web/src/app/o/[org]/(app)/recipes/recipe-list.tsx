"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatBps, formatRupiah, UNIT_CODES } from "@pantrio/core";
import { fmtQty } from "@/lib/costing-model";
import { useTenant } from "../tenant-context";
import { createMenuRecipe, createPrepRecipe } from "./actions";

export type DishRow = { id: string; name: string; category: string; price: number; recipeId: string | null } & (
  | { status: "none" | "empty" }
  | { status: "incomplete"; missing: number; knownCost: number }
  | { status: "costed"; cost: number; foodCostBps: number; marginBeforeTaxBps: number; marginAfterTaxBps: number }
);

export type PrepRow = {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  batchCost: number | null;
  perUnit: { value: number; per: string } | null;
  usedIn: number;
};

const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";
const input = "rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-neutral-900";

/** Food cost above ~35% of the price is the usual warning line for cafés. */
function tone(foodCostBps: number) {
  return foodCostBps > 4000 ? "text-red-700" : foodCostBps > 3500 ? "text-amber-700" : "text-green-700";
}

export function RecipeList({ dishes, preps, priceMode }: { dishes: DishRow[]; preps: PrepRow[]; priceMode: string }) {
  const router = useRouter();
  const { slug, base } = useTenant();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newPrep, setNewPrep] = useState(false);

  const open = (menuItemId: string) =>
    startTransition(async () => {
      const r = await createMenuRecipe(slug, menuItemId);
      if (!r.ok) setError(r.error);
      else router.push(`${base}/recipes/${r.value}`);
    });

  const costed = dishes.filter((d) => d.status === "costed").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Recipes</h1>
        <p className="max-w-2xl text-sm text-neutral-500">
          What goes into each dish → its exact cost per portion and margin. {costed} of {dishes.length} menu items
          costed. Margins use the menu price {priceMode === "inclusive" ? "with tax taken out" : "before tax"}; PB1 is
          never counted as revenue.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="p-4 font-medium">Menu item</th>
              <th className="p-4 text-right font-medium">Price</th>
              <th className="p-4 text-right font-medium">Cost / portion</th>
              <th className="p-4 text-right font-medium">Food cost</th>
              <th className="p-4 text-right font-medium">Margin</th>
              <th className="p-4 text-right font-medium">After tax</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {dishes.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-neutral-400">
                  No menu items yet — add them under Menu.
                </td>
              </tr>
            )}
            {dishes.map((d) => (
              <tr key={d.id}>
                <td className="p-4">
                  <p className="font-medium text-neutral-900">{d.name}</p>
                  <p className="text-xs text-neutral-400">{d.category}</p>
                </td>
                <td className="p-4 text-right tabular-nums">{formatRupiah(d.price)}</td>
                {d.status === "costed" ? (
                  <>
                    <td className="p-4 text-right tabular-nums">{formatRupiah(d.cost)}</td>
                    <td className={`p-4 text-right font-medium tabular-nums ${tone(d.foodCostBps)}`}>{formatBps(d.foodCostBps)}</td>
                    <td className="p-4 text-right tabular-nums">{formatBps(d.marginBeforeTaxBps)}</td>
                    <td className="p-4 text-right tabular-nums text-neutral-500">{formatBps(d.marginAfterTaxBps)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="p-4 text-right text-sm text-neutral-400">
                    {d.status === "none" && "No recipe"}
                    {d.status === "empty" && "Recipe has no ingredients"}
                    {d.status === "incomplete" &&
                      `Cost unknown — ${d.missing} missing price${d.missing === 1 ? "" : "s"}/conversion${d.missing === 1 ? "" : "s"} (at least ${formatRupiah(d.knownCost)})`}
                  </td>
                )}
                <td className="p-4 text-right">
                  {d.recipeId ? (
                    <Link href={`${base}/recipes/${d.recipeId}`} className={btn}>
                      Edit recipe
                    </Link>
                  ) : (
                    <button disabled={pending} onClick={() => open(d.id)} className={btn}>
                      Create recipe
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Prep recipes</h2>
            <p className="text-sm text-neutral-500">
              Things you make in batches and use inside dishes — dough, sauce, syrup, cold brew.
            </p>
          </div>
          <button onClick={() => setNewPrep(true)} className={btn}>
            New prep recipe
          </button>
        </div>
        {newPrep && (
          <form
            action={(fd) =>
              startTransition(async () => {
                const r = await createPrepRecipe(slug, fd);
                if (!r.ok) setError(r.error);
                else router.push(`${base}/recipes/${r.value}`);
              })
            }
            className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"
          >
            <input name="name" required autoFocus placeholder="Name, e.g. Gula aren syrup" className={`${input} flex-1`} />
            <span className="text-sm text-neutral-600">makes</span>
            <input name="yield_qty" required inputMode="decimal" placeholder="1" className={`${input} w-24`} />
            <select name="yield_unit" defaultValue="l" className={input}>
              {UNIT_CODES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button disabled={pending} className="rounded-xl bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40">
              Create
            </button>
            <button type="button" onClick={() => setNewPrep(false)} className={btn}>
              Cancel
            </button>
          </form>
        )}
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {preps.length === 0 && <li className="p-4 text-sm text-neutral-400">None yet.</li>}
          {preps.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-neutral-900">{p.name}</p>
                <p className="text-sm text-neutral-500">
                  Makes {fmtQty(p.yieldQty)} {p.yieldUnit} ·{" "}
                  {p.batchCost !== null ? (
                    <>
                      batch {formatRupiah(p.batchCost)}
                      {p.perUnit && ` · Rp ${p.perUnit.value.toLocaleString("id-ID")}/${p.perUnit.per}`}
                    </>
                  ) : (
                    <span className="text-amber-700">cost unknown</span>
                  )}{" "}
                  · used in {p.usedIn} recipe{p.usedIn === 1 ? "" : "s"}
                </p>
              </div>
              <Link href={`${base}/recipes/${p.id}`} className={btn}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
