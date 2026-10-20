"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBps, formatRupiah, Q } from "@pantrio/core";
import type { MenuCategory, MenuItem } from "@/lib/queries/pos";
import { useTenant } from "../tenant-context";
import {
  setMenuCategoryActive,
  setMenuItemActive,
  upsertMenuCategory,
  upsertMenuItem,
} from "./actions";

type Props = { categories: MenuCategory[]; items: MenuItem[]; priceMode: "exclusive" | "inclusive" };

/** Food cost % of the menu price, when the dish has a costed recipe. */
function costLabel(item: MenuItem): string | null {
  if (item.unit_cost === null || item.price === 0) return null;
  return `cost ${formatRupiah(item.unit_cost)} (${formatBps(Q.of(item.unit_cost).div(Q.of(item.price)).toBps())})`;
}

export function MenuManager({ categories, items, priceMode }: Props) {
  const router = useRouter();
  const { slug } = useTenant();
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleActive(item: MenuItem) {
    startTransition(async () => {
      const result = await setMenuItemActive(slug, item.id, !item.active);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Menu</h1>
          <p className="text-sm text-neutral-500">
            Price changes apply to new orders only — past receipts keep their
            original prices. Prices {priceMode === "inclusive" ? "include" : "exclude"} tax and
            service (Settings).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAddingCategory(true)}
            className="rounded-xl border border-neutral-300 px-4 py-3 font-medium text-neutral-700"
          >
            Add category
          </button>
          <button
            onClick={() => setEditing("new")}
            className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white"
          >
            Add item
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {addingCategory && (
        <CategoryForm
          onClose={() => setAddingCategory(false)}
          onSaved={() => {
            setAddingCategory(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      {editing && (
        <ItemForm
          item={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      {categories.map((category) => {
        const categoryItems = items.filter((item) => item.category_id === category.id);

        return (
          <section key={category.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-neutral-800">
                {category.name}
                {!category.active && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">hidden</span>
                )}
              </h2>
              <button
                onClick={() =>
                  startTransition(async () => {
                    const result = await setMenuCategoryActive(slug, category.id, !category.active);
                    if (!result.ok) setError(result.error);
                    else router.refresh();
                  })
                }
                disabled={pending}
                className="text-xs text-neutral-500 underline disabled:opacity-40"
              >
                {category.active ? "Hide category" : "Show category"}
              </button>
            </div>

            {categoryItems.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm">
                No items in this category.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white shadow-sm">
                {categoryItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p
                        className={`font-medium ${
                          item.active ? "text-neutral-900" : "text-neutral-400"
                        }`}
                      >
                        {item.name}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {formatRupiah(item.price)}
                        {costLabel(item) && ` · ${costLabel(item)}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setEditing(item)}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(item)}
                        disabled={pending}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                      >
                        {item.active ? "Hide" : "Show"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ItemForm({
  item,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  item: MenuItem | null;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { slug } = useTenant();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await upsertMenuItem(slug, formData);
          if (!result.ok) onError(result.error);
          else onSaved();
        })
      }
      className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
    >
      <h2 className="font-semibold text-neutral-900">
        {item ? `Edit ${item.name}` : "New item"}
      </h2>

      <input type="hidden" name="id" value={item?.id ?? ""} />

      <Field label="Name">
        <input
          name="name"
          defaultValue={item?.name}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
        />
      </Field>

      <Field label="Price (rupiah)">
        <input
          name="price"
          type="number"
          min="0"
          step="1"
          defaultValue={item?.price}
          required
          placeholder="25000"
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 tabular-nums outline-none focus:border-neutral-900"
        />
      </Field>

      <Field label="Category">
        <select
          name="category_id"
          defaultValue={item?.category_id ?? categories[0]?.id}
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-neutral-300 py-3 font-medium text-neutral-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function CategoryForm({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { slug } = useTenant();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await upsertMenuCategory(slug, formData);
          if (!result.ok) onError(result.error);
          else onSaved();
        })
      }
      className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
    >
      <h2 className="font-semibold text-neutral-900">New category</h2>
      <input type="hidden" name="id" value="" />

      <Field label="Name">
        <input
          name="name"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
        />
      </Field>

      <Field label="Sort order">
        <input
          name="sort"
          type="number"
          step="1"
          defaultValue={0}
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-neutral-300 py-3 font-medium text-neutral-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
