"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateChange,
  calculateOrderTotals,
  formatRupiah,
  suggestedTenders,
  type PosTaxRules,
} from "@pantrio/core";
import type { MenuCategory, MenuItem } from "@/lib/queries/pos";
import { useTenant } from "../tenant-context";
import { reprintReceipt, submitCashOrder } from "./actions";

type CartLine = { menuItemId: string; name: string; unitPrice: number; qty: number; note?: string };

/**
 * Idempotency key for a checkout (FOKAS D10). crypto.randomUUID only exists
 * on HTTPS/localhost; getRandomValues works everywhere (e.g. a LAN test over
 * plain http), so build a v4 UUID from it when needed.
 */
function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Per restaurant and branch, so one browser can serve two tenants safely. */
const cartKey = (outletId: string) => `pantrio.pos.cart.${outletId}`;

/** Recovers an in-progress cart after an accidental refresh or tab reload. */
function readStoredCart(key: string): CartLine[] {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as CartLine[]) : [];
  } catch {
    // Corrupt JSON or private-mode storage is not worth failing the POS over.
    return [];
  }
}

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  rules: PosTaxRules;
};

type Stage = "ordering" | "checkout" | "paid";

type PaidInfo = {
  orderId: string;
  queueNo: number;
  grandTotal: number;
  changeGiven: number;
  priority: boolean;
};

export function PosTerminal({ categories, items, rules }: Props) {
  const { slug, outletId } = useTenant();
  const storageKey = cartKey(outletId);
  // Restored during render, not in an effect. This component is never
  // server-rendered (see pos-client.tsx), so reading storage here is safe
  // and avoids a cascading re-render on every mount.
  const [cart, setCart] = useState<CartLine[]>(() => readStoredCart(storageKey));
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const [stage, setStage] = useState<Stage>("ordering");
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [paid, setPaid] = useState<PaidInfo | null>(null);
  const [online, setOnline] = useState(true);
  const [priority, setPriority] = useState(false);

  // A checkout attempt keeps one id until it succeeds, so a retry after a
  // network failure resolves to the same order instead of charging twice.
  const [requestId, setRequestId] = useState<string>(() => newRequestId());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [cart, storageKey]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const totals = useMemo(() => calculateOrderTotals(cart, rules), [cart, rules]);
  const inclusive = rules.priceMode === "inclusive";
  const visibleItems = items.filter((item) => item.category_id === activeCategory);
  const tenderedAmount = Number(tendered.replace(/\D/g, "")) || 0;
  const change = calculateChange(totals.grandTotal, tenderedAmount);

  function addItem(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.id);
      if (existing) {
        return current.map((line) =>
          line.menuItemId === item.id ? { ...line, qty: line.qty + 1 } : line
        );
      }
      return [
        ...current,
        { menuItemId: item.id, name: item.name, unitPrice: item.price, qty: 1 },
      ];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId ? { ...line, qty: line.qty + delta } : line
        )
        .filter((line) => line.qty > 0)
    );
  }

  function removeLine(menuItemId: string) {
    setCart((current) => current.filter((line) => line.menuItemId !== menuItemId));
  }

  function resetOrder() {
    setCart([]);
    setTendered("");
    setError(null);
    setPaid(null);
    setPriority(false);
    setStage("ordering");
    setRequestId(newRequestId());
  }

  async function handleCharge() {
    setError(null);
    setPending(true);

    const result = await submitCashOrder({
      slug,
      outletId,
      items: cart.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty, note: line.note })),
      amountTendered: tenderedAmount,
      clientRequestId: requestId,
      priority,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPaid({
      orderId: result.orderId,
      queueNo: result.queueNo,
      grandTotal: result.grandTotal,
      changeGiven: result.changeGiven,
      priority,
    });
    setStage("paid");
  }

  if (stage === "paid" && paid) {
    return <PaidScreen slug={slug} paid={paid} onNewOrder={resetOrder} />;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex gap-2 overflow-x-auto border-b border-neutral-200 p-3">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`shrink-0 rounded-xl px-5 py-3 text-base font-medium transition ${
                activeCategory === category.id
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => addItem(item)}
              className="flex min-h-24 flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 text-left transition active:scale-95 active:bg-neutral-100"
            >
              <span className="font-medium leading-tight text-neutral-900">{item.name}</span>
              <span className="mt-2 text-sm text-neutral-500">
                {formatRupiah(item.price)}
              </span>
            </button>
          ))}

          {visibleItems.length === 0 && (
            <p className="col-span-full p-6 text-center text-neutral-500">
              No items in this category yet.
            </p>
          )}
        </div>
      </section>

      <aside className="flex w-96 shrink-0 flex-col rounded-2xl bg-white shadow-sm">
        <div className="border-b border-neutral-200 p-4">
          <h2 className="font-semibold text-neutral-900">Current order</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <p className="py-12 text-center text-neutral-400">
              Tap an item to start an order
            </p>
          ) : (
            <ul className="space-y-3">
              {cart.map((line) => (
                <li key={line.menuItemId} className="rounded-xl bg-neutral-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-neutral-900">{line.name}</span>
                    <button
                      onClick={() => removeLine(line.menuItemId)}
                      aria-label={`Remove ${line.name}`}
                      className="px-2 text-neutral-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQty(line.menuItemId, -1)}
                        aria-label={`Decrease ${line.name}`}
                        className="h-9 w-9 rounded-lg bg-white text-lg font-medium shadow-sm"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-medium">{line.qty}</span>
                      <button
                        onClick={() => changeQty(line.menuItemId, 1)}
                        aria-label={`Increase ${line.name}`}
                        className="h-9 w-9 rounded-lg bg-white text-lg font-medium shadow-sm"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-neutral-700">
                      {formatRupiah(line.unitPrice * line.qty)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-neutral-200 p-4">
          <div className="space-y-1 text-sm">
            {inclusive ? (
              <>
                {/* Prices already include service and PB1; show what's inside. */}
                {totals.serviceTotal > 0 && <Row label="incl. service" value={totals.serviceTotal} />}
                {totals.taxTotal > 0 && <Row label="incl. tax" value={totals.taxTotal} />}
              </>
            ) : (
              <>
                <Row label="Subtotal" value={totals.subtotal} />
                {/* Hidden entirely at 0% — a row reading "Tax: Rp 0" just adds noise. */}
                {totals.serviceTotal > 0 && <Row label="Service" value={totals.serviceTotal} />}
                {totals.taxTotal > 0 && <Row label="Tax" value={totals.taxTotal} />}
              </>
            )}
          </div>

          <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg font-semibold">
            <span>Total</span>
            <span>{formatRupiah(totals.grandTotal)}</span>
          </div>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
              priority ? "border-red-500 bg-red-50" : "border-neutral-200"
            }`}
          >
            <input
              type="checkbox"
              checked={priority}
              onChange={(event) => setPriority(event.target.checked)}
              disabled={pending}
              className="h-5 w-5 accent-red-600"
            />
            <span className={`font-medium ${priority ? "text-red-700" : "text-neutral-700"}`}>
              Priority — kitchen makes this first
            </span>
          </label>

          {!online && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              No connection. Payment is disabled until it returns — your cart is safe.
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          {stage === "ordering" ? (
            <button
              onClick={() => setStage("checkout")}
              disabled={cart.length === 0 || !online}
              className="w-full rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white disabled:opacity-40"
            >
              Charge {cart.length > 0 && formatRupiah(totals.grandTotal)}
            </button>
          ) : (
            <CheckoutPanel
              grandTotal={totals.grandTotal}
              tendered={tendered}
              tenderedAmount={tenderedAmount}
              change={change}
              pending={pending}
              online={online}
              onTenderedChange={setTendered}
              onBack={() => {
                setStage("ordering");
                setError(null);
              }}
              onConfirm={handleCharge}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <span>{label}</span>
      <span>{formatRupiah(value)}</span>
    </div>
  );
}

function CheckoutPanel({
  grandTotal,
  tendered,
  tenderedAmount,
  change,
  pending,
  online,
  onTenderedChange,
  onBack,
  onConfirm,
}: {
  grandTotal: number;
  tendered: string;
  tenderedAmount: number;
  change: number;
  pending: boolean;
  online: boolean;
  onTenderedChange: (value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = tenderedAmount >= grandTotal && !pending && online;

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-neutral-700">Cash received</label>

      <input
        inputMode="numeric"
        autoFocus
        value={tendered}
        onChange={(event) => onTenderedChange(event.target.value.replace(/\D/g, ""))}
        placeholder="0"
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-right text-2xl tabular-nums outline-none focus:border-neutral-900"
      />

      <div className="grid grid-cols-4 gap-2">
        {suggestedTenders(grandTotal).map((amount) => (
          <button
            key={amount}
            onClick={() => onTenderedChange(String(amount))}
            className="rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700"
          >
            {amount === grandTotal ? "Exact" : (amount / 1000).toLocaleString("id-ID") + "k"}
          </button>
        ))}
      </div>

      {tenderedAmount > 0 && (
        <div
          className={`flex justify-between rounded-xl p-3 text-lg font-semibold ${
            change >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          <span>{change >= 0 ? "Change" : "Short by"}</span>
          <span>{formatRupiah(Math.abs(change))}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={pending}
          className="flex-1 rounded-xl border border-neutral-300 py-4 font-medium text-neutral-700 disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className="flex-[2] rounded-xl bg-green-700 py-4 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Confirm payment"}
        </button>
      </div>
    </div>
  );
}

function PaidScreen({ slug, paid, onNewOrder }: { slug: string; paid: PaidInfo; onNewOrder: () => void }) {
  // The receipt already printed automatically when the order was saved; this
  // is for a second copy. It prints marked "SALINAN / REPRINT".
  const [copyState, setCopyState] = useState<"idle" | "sending" | "sent" | string>("idle");

  async function printCopy() {
    setCopyState("sending");
    const result = await reprintReceipt(slug, paid.orderId);
    setCopyState(result.ok ? "sent" : result.error);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">✓</div>

        <div>
          <h2 className="text-2xl font-semibold text-neutral-900">Paid</h2>
          <p className="mt-4 text-sm uppercase tracking-wide text-neutral-500">
            Customer number
          </p>
          <p className="text-7xl font-bold tabular-nums text-neutral-900">{paid.queueNo}</p>
          {paid.priority && (
            <span className="mt-2 inline-block rounded-lg bg-red-600 px-3 py-1 text-sm font-bold uppercase text-white">
              Priority
            </span>
          )}
        </div>

        <div className="space-y-2 rounded-xl bg-neutral-50 p-4 text-left">
          <div className="flex justify-between">
            <span className="text-neutral-600">Total</span>
            <span className="font-medium">{formatRupiah(paid.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <span>Change</span>
            <span>{formatRupiah(paid.changeGiven)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={printCopy}
            disabled={copyState === "sending"}
            className="w-full rounded-xl border border-neutral-300 py-3 font-medium text-neutral-800 disabled:opacity-40"
          >
            {copyState === "sending"
              ? "Sending…"
              : copyState === "sent"
                ? "Copy sent — print another"
                : "Print another copy"}
          </button>
          {copyState !== "idle" && copyState !== "sending" && copyState !== "sent" && (
            <p className="text-sm text-red-700">{copyState}</p>
          )}
        </div>

        <button
          onClick={onNewOrder}
          className="w-full rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white"
        >
          New order
        </button>
      </div>
    </div>
  );
}
