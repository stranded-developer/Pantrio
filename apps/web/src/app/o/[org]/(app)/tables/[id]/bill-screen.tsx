"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { bestDiscount, calculateChange, formatRupiah, suggestedTenders, type PosDiscount } from "@pantrio/core";
import type { MenuCategory, MenuItem } from "@/lib/queries/pos";
import type { Bill, BillLine, BillRound } from "@/lib/queries/tables";
import { newRequestId } from "@/lib/request-id";
import { SALE_DONE_EVENT } from "@/lib/terminal-activity";
import { useTenant } from "../../tenant-context";
import { cancelBill, moveBill, printBill, sendRound, settleBill, voidBillItem, type Result } from "../actions";

type Draft = { menuItemId: string; qty: number; note?: string };
type Props = {
  table: { id: string; name: string; seats: number };
  bill: Bill | null;
  rounds: (BillRound & { by: string | null })[];
  lines: BillLine[];
  categories: MenuCategory[];
  items: MenuItem[];
  discounts: PosDiscount[];
  businessDay: string;
  freeTables: { id: string; name: string }[];
  canVoid: boolean;
};

const draftKey = (tableId: string) => `pantrio.table.draft.${tableId}`;

function readDraft(key: string): Draft[] {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as Draft[]) : [];
  } catch {
    return [];
  }
}

function noteOf(modifiers: unknown): string | null {
  if (!Array.isArray(modifiers)) return null;
  const notes = modifiers.map((m) => (m as { note?: unknown })?.note).filter((n): n is string => typeof n === "string" && n.length > 0);
  return notes.length ? notes.join(", ") : null;
}

/**
 * One table: what's on its bill (by round), the next round being put
 * together, and paying the whole bill. Works on a waiter's phone (Menu /
 * Bill tabs) and side by side on a tablet or the till.
 */
export function BillScreen({ table, bill, rounds, lines, categories, items, discounts, businessDay, freeTables, canVoid }: Props) {
  const router = useRouter();
  const { slug, base, outletId, timezone } = useTenant();
  const key = draftKey(table.id);
  const [draft, setDraft] = useState<Draft[]>(() => readDraft(key));
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [tab, setTab] = useState<"menu" | "bill">(bill ? "bill" : "menu");
  const [guests, setGuests] = useState("");
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<"bill" | "pay" | "paid">("bill");
  const [tendered, setTendered] = useState("");
  const [paid, setPaid] = useState<{ total: number; change: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Private mode / quota: the draft just isn't kept across a reload.
    }
  }, [draft, key]);

  const menu = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Priced from the menu as loaded now; send_round prices it again.
  const priced = draft.flatMap((d) => {
    const item = menu.get(d.menuItemId);
    if (!item) return [];
    const best = bestDiscount(item.id, item.price, d.qty, discounts, businessDay);
    return [{ ...d, name: item.name, price: item.price, discount: best?.amount ?? 0 }];
  });
  const draftTotal = priced.reduce((sum, l) => sum + l.price * l.qty - l.discount, 0);
  const draftCount = priced.reduce((sum, l) => sum + l.qty, 0);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });

  function add(item: MenuItem) {
    setNotice(null);
    setDraft((cur) => {
      const found = cur.find((d) => d.menuItemId === item.id && !d.note);
      return found ? cur.map((d) => (d === found ? { ...d, qty: d.qty + 1 } : d)) : [...cur, { menuItemId: item.id, qty: 1 }];
    });
  }
  const changeQty = (i: number, delta: number) =>
    setDraft((cur) => cur.map((d, j) => (j === i ? { ...d, qty: d.qty + delta } : d)).filter((d) => d.qty > 0));

  async function act(promise: Promise<Result>, ok: string, after?: () => void) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await promise;
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      // Someone else changed this table meanwhile: show the real state.
      if (/Reopen the table|already closed|already has a bill/.test(result.error)) router.refresh();
      return false;
    }
    setNotice(ok);
    after?.();
    router.refresh();
    return true;
  }

  async function send() {
    const sent = await act(
      sendRound({
        slug,
        outletId,
        tableId: table.id,
        orderId: bill?.id ?? null,
        clientRequestId: requestId,
        guests: guests ? Number(guests) : null,
        items: draft.map((d) => ({ menuItemId: d.menuItemId, qty: d.qty, note: d.note })),
      }),
      "Sent to the kitchen."
    );
    if (sent) {
      setDraft([]);
      setGuests("");
      setRequestId(newRequestId());
      setTab("bill");
      // One device, many waiters: "lock after sale" also locks after a round (P25).
      window.dispatchEvent(new Event(SALE_DONE_EVENT));
    }
  }

  async function pay() {
    if (!bill) return;
    setPending(true);
    setError(null);
    const amount = Number(tendered.replace(/\D/g, "")) || 0;
    const result = await settleBill(slug, bill.id, amount);
    setPending(false);
    if (!result.ok) {
      setError(/less than the total/i.test(result.error) ? "The bill changed (a round or a removed item). Check the new total." : result.error);
      router.refresh();
      return;
    }
    setPaid({ total: result.grandTotal, change: result.changeGiven });
    setStage("paid");
    window.dispatchEvent(new Event(SALE_DONE_EVENT));
  }

  if (stage === "paid" && paid) {
    return (
      <div className="mx-auto max-w-sm space-y-6 rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">✓</div>
        <h2 className="text-2xl font-semibold text-neutral-900">Table {table.name} paid</h2>
        <div className="space-y-2 rounded-xl bg-neutral-50 p-4 text-left">
          <div className="flex justify-between">
            <span className="text-neutral-600">Total</span>
            <span className="font-medium">{formatRupiah(paid.total)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <span>Change</span>
            <span>{formatRupiah(paid.change)}</span>
          </div>
        </div>
        <Link href={`${base}/tables`} className="block w-full rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white">
          Back to tables
        </Link>
      </div>
    );
  }

  const live = lines.filter((l) => !l.voided);
  const minutes = bill ? Math.max(0, Math.floor((now - Date.parse(bill.opened_at)) / 60_000)) : 0;
  const due = bill?.grand_total ?? 0;
  const tenderedAmount = Number(tendered.replace(/\D/g, "")) || 0;
  const change = calculateChange(due, tenderedAmount);

  const menuPanel = (
    <section className={`flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm lg:flex ${tab === "menu" ? "flex" : "hidden"}`}>
      <div className="flex gap-2 overflow-x-auto border-b border-neutral-200 p-3">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`shrink-0 rounded-xl px-4 py-2.5 font-medium ${category === c.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
        {items
          .filter((i) => i.category_id === category)
          .map((item) => {
            const after = item.price - (bestDiscount(item.id, item.price, 1, discounts, businessDay)?.amount ?? 0);
            const inDraft = draft.filter((d) => d.menuItemId === item.id).reduce((s, d) => s + d.qty, 0);
            return (
              <button
                key={item.id}
                onClick={() => add(item)}
                className="relative flex min-h-20 flex-col justify-between rounded-xl border border-neutral-200 p-3 text-left active:scale-95 active:bg-neutral-100"
              >
                <span className="font-medium leading-tight text-neutral-900">{item.name}</span>
                <span className={`mt-1 text-sm ${after < item.price ? "text-green-700" : "text-neutral-500"}`}>{formatRupiah(after)}</span>
                {inDraft > 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-neutral-900 px-2 text-xs font-bold text-white">{inDraft}</span>
                )}
              </button>
            );
          })}
      </div>
    </section>
  );

  const billPanel = (
    <aside className={`w-full shrink-0 flex-col rounded-2xl bg-white shadow-sm lg:flex lg:w-[26rem] ${tab === "bill" ? "flex" : "hidden"}`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {rounds.length === 0 && draft.length === 0 && (
          <p className="py-8 text-center text-neutral-400">Free table. Add items from the menu, then send them to the kitchen.</p>
        )}

        {rounds.map((r) => {
          const roundLines = lines.filter((l) => l.round_id === r.id);
          return (
            <div key={r.id} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Round {r.round_no} · {time(r.created_at)}
                {r.by && ` · ${r.by}`}
                {r.kitchen_done_at && <span className="ml-1 text-green-700">· ready</span>}
              </p>
              <ul className="divide-y divide-neutral-100 rounded-xl bg-neutral-50">
                {roundLines.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className={l.voided ? "text-neutral-400 line-through" : "text-neutral-900"}>
                      <span className="font-medium tabular-nums">{l.qty}×</span> {l.name_snapshot}
                      {noteOf(l.modifiers_json) && <p className="text-xs text-amber-700">↳ {noteOf(l.modifiers_json)}</p>}
                      {l.line_discount > 0 && !l.voided && (
                        <p className="text-xs text-green-700">
                          {l.discount_name} −{formatRupiah(l.line_discount)}
                        </p>
                      )}
                      {l.voided && l.void_reason && <p className="text-xs no-underline">removed: {l.void_reason}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`tabular-nums text-sm ${l.voided ? "text-neutral-400 line-through" : "text-neutral-700"}`}>
                        {formatRupiah(l.line_subtotal)}
                      </span>
                      {canVoid && !l.voided && (
                        <button
                          disabled={pending}
                          aria-label={`Remove ${l.name_snapshot}`}
                          onClick={() => {
                            const reason = prompt(`Remove ${l.qty}× ${l.name_snapshot} from the bill? Reason:`);
                            if (reason?.trim()) void act(voidBillItem(slug, l.id, reason), "Item removed.");
                          }}
                          className="px-2 text-neutral-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {priced.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">New — not sent yet</p>
            <ul className="space-y-2">
              {priced.map((l, i) => (
                <li key={`${l.menuItemId}-${i}`} className="rounded-xl border border-amber-300 bg-amber-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-neutral-900">{l.name}</span>
                    <span className="text-sm tabular-nums text-neutral-700">{formatRupiah(l.price * l.qty - l.discount)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => changeQty(i, -1)} aria-label={`Fewer ${l.name}`} className="h-8 w-8 rounded-lg bg-white font-medium shadow-sm">
                      −
                    </button>
                    <span className="w-6 text-center font-medium">{l.qty}</span>
                    <button onClick={() => changeQty(i, 1)} aria-label={`More ${l.name}`} className="h-8 w-8 rounded-lg bg-white font-medium shadow-sm">
                      +
                    </button>
                    <button
                      onClick={() => {
                        const note = prompt("Note for the kitchen", l.note ?? "");
                        if (note !== null) setDraft((cur) => cur.map((d, j) => (j === i ? { ...d, note: note.trim() || undefined } : d)));
                      }}
                      className="ml-auto text-xs text-neutral-600 underline"
                    >
                      {l.note ? `↳ ${l.note}` : "Add note"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-neutral-200 p-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

        {bill && (
          <div className="space-y-1 text-sm">
            {bill.discount_total > 0 && <Row label="Discount" value={-bill.discount_total} />}
            {bill.price_mode === "exclusive" && <Row label="Subtotal" value={bill.subtotal} />}
            {bill.service_total > 0 && <Row label={bill.price_mode === "inclusive" ? "incl. service" : "Service"} value={bill.service_total} />}
            {bill.tax_total > 0 && <Row label={bill.price_mode === "inclusive" ? "incl. tax" : "Tax"} value={bill.tax_total} />}
            <div className="flex justify-between pt-1 text-lg font-semibold">
              <span>Bill total</span>
              <span>{formatRupiah(due)}</span>
            </div>
          </div>
        )}

        {draft.length > 0 ? (
          <>
            {!bill && (
              <label className="flex items-center gap-3 text-sm text-neutral-700">
                Guests
                <input
                  inputMode="numeric"
                  value={guests}
                  onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder={String(table.seats)}
                  className="w-20 rounded-lg border border-neutral-300 px-3 py-2"
                />
              </label>
            )}
            <button
              onClick={send}
              disabled={pending}
              className="w-full rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white disabled:opacity-40"
            >
              {pending ? "Sending…" : `Send ${draftCount} to kitchen · ${formatRupiah(draftTotal)}`}
            </button>
            <button onClick={() => setDraft([])} disabled={pending} className="w-full text-sm text-neutral-500 underline">
              Clear new items
            </button>
          </>
        ) : stage === "pay" && bill ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-neutral-700">Cash received</label>
            <input
              inputMode="numeric"
              autoFocus
              value={tendered}
              onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-right text-2xl tabular-nums outline-none focus:border-neutral-900"
            />
            <div className="grid grid-cols-4 gap-2">
              {suggestedTenders(due).map((amount) => (
                <button key={amount} onClick={() => setTendered(String(amount))} className="rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700">
                  {amount === due ? "Exact" : (amount / 1000).toLocaleString("id-ID") + "k"}
                </button>
              ))}
            </div>
            {tenderedAmount > 0 && (
              <div className={`flex justify-between rounded-xl p-3 text-lg font-semibold ${change >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                <span>{change >= 0 ? "Change" : "Short by"}</span>
                <span>{formatRupiah(Math.abs(change))}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStage("bill")} disabled={pending} className="flex-1 rounded-xl border border-neutral-300 py-4 font-medium text-neutral-700">
                Back
              </button>
              <button
                onClick={pay}
                disabled={pending || tenderedAmount < due}
                className="flex-[2] rounded-xl bg-green-700 py-4 font-medium text-white disabled:opacity-40"
              >
                {pending ? "Saving…" : "Confirm payment"}
              </button>
            </div>
          </div>
        ) : bill ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void act(printBill(slug, bill.id), "Bill sent to the printer.")}
              disabled={pending || live.length === 0}
              className="rounded-xl border border-neutral-300 py-3 font-medium text-neutral-800 disabled:opacity-40"
            >
              {bill.bill_printed_at ? "Print bill again" : "Print bill"}
            </button>
            <button
              onClick={() => {
                setTendered("");
                setStage("pay");
              }}
              disabled={pending}
              className="rounded-xl bg-green-700 py-3 font-medium text-white disabled:opacity-40"
            >
              Pay {formatRupiah(due)}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${base}/tables`} className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm">
          ← Tables
        </Link>
        <h1 className="text-xl font-semibold text-neutral-900">Table {table.name}</h1>
        {bill && (
          <p className="text-sm text-neutral-500">
            #{bill.order_no} · {minutes} min{bill.guests ? ` · ${bill.guests} guests` : ""}
            {bill.bill_printed_at && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">bill printed</span>}
          </p>
        )}
        {bill && (
          <div className="ml-auto flex gap-2">
            {moving ? (
              <select
                autoFocus
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void act(moveBill(slug, bill.id, e.target.value), "Moved.", () => router.push(`${base}/tables/${e.target.value}`));
                  setMoving(false);
                }}
                onBlur={() => setMoving(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <button onClick={() => setMoving(true)} disabled={freeTables.length === 0} className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm disabled:opacity-40">
                Move table
              </button>
            )}
            {canVoid && (
              <button
                onClick={() => {
                  const reason = prompt(`Cancel the whole bill for table ${table.name}? Reason:`);
                  if (reason?.trim()) void act(cancelBill(slug, bill.id, reason), "Bill cancelled.", () => router.push(`${base}/tables`));
                }}
                className="rounded-lg bg-white px-3 py-2 text-sm text-red-600 shadow-sm"
              >
                Cancel bill
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phones: Menu / Bill tabs. lg and up: side by side. */}
      <div className="flex gap-2 lg:hidden">
        <button onClick={() => setTab("menu")} className={`flex-1 rounded-xl py-3 font-medium ${tab === "menu" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 shadow-sm"}`}>
          Menu
        </button>
        <button onClick={() => setTab("bill")} className={`flex-1 rounded-xl py-3 font-medium ${tab === "bill" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 shadow-sm"}`}>
          Bill{draftCount > 0 ? ` · ${draftCount} new` : ""}
        </button>
      </div>

      <div className="flex gap-4 lg:h-[calc(100vh-11rem)]">
        {menuPanel}
        {billPanel}
      </div>

      {/* Phones on the menu tab: always show how many are waiting to be sent. */}
      {tab === "menu" && draftCount > 0 && (
        <button onClick={() => setTab("bill")} className="fixed inset-x-3 bottom-3 rounded-xl bg-neutral-900 py-4 text-lg font-medium text-white shadow-lg lg:hidden">
          Review {draftCount} new · {formatRupiah(draftTotal)}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <span>{label}</span>
      <span>{value < 0 ? `−${formatRupiah(-value)}` : formatRupiah(value)}</span>
    </div>
  );
}
