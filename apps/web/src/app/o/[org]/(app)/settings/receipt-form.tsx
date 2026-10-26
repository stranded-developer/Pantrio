"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateOrderTotals, type PosTaxRules } from "@pantrio/core";
import { receiptBlocks, type ReceiptData } from "@pantrio/print-bridge/receipt";
import { updateReceiptText } from "./actions";
import { Field, input, SettingsCard } from "./forms";

// Sample order for the preview. Totals use this restaurant's tax rules, so
// the preview shows exactly what its printer will print.
const SAMPLE = [
  { name: "Kopi Susu Gula Aren", qty: 2, price: 25_000, note: "less sugar" },
  { name: "Croissant", qty: 1, price: 18_000 },
];

export function ReceiptForm({
  header,
  footer,
  rules,
  receiptLogoUrl,
  timezone,
  cashier,
}: {
  header: string;
  footer: string;
  rules: PosTaxRules;
  receiptLogoUrl: string | null;
  timezone: string;
  cashier: string;
}) {
  const [h, setH] = useState(header);
  const [f, setF] = useState(footer);
  const [width, setWidth] = useState<32 | 48>(32);
  const [reprint, setReprint] = useState(false);

  const preview = useMemo(() => {
    const totals = calculateOrderTotals(SAMPLE.map((i) => ({ unitPrice: i.price, qty: i.qty })), rules);
    const tendered = Math.ceil(totals.grandTotal / 50_000) * 50_000;
    const data: ReceiptData = {
      order: {
        order_no: 128,
        queue_no: 12,
        status: "paid",
        opened_at: new Date().toISOString(),
        price_mode: rules.priceMode,
        subtotal: totals.subtotal,
        service_total: totals.serviceTotal,
        tax_total: totals.taxTotal,
        grand_total: totals.grandTotal,
        cashier,
      },
      items: SAMPLE.map((i) => ({
        name_snapshot: i.name,
        qty: i.qty,
        unit_price: i.price,
        line_subtotal: i.price * i.qty,
        voided: false,
        modifiers_json: i.note ? [{ note: i.note }] : [],
      })),
      payment: { method: "cash", amount_tendered: tendered, change_given: tendered - totals.grandTotal },
      settings: { receipt_header: h, receipt_footer: f, timezone },
    };
    // Same layout code the printer box runs (bridge/receipt.mjs). With a
    // logo set, the first header line is left out — the logo replaces it.
    return receiptBlocks(data, { width, reprint, logo: receiptLogoUrl ? {} : null });
  }, [h, f, width, reprint, rules, receiptLogoUrl, timezone, cashier]);

  return (
    <SettingsCard
      title="Receipt"
      intro="You type the header and footer; everything in between comes from each order. The preview uses the printer's own layout."
      action={updateReceiptText}
      submitLabel="Save receipt text"
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Field label="Header" hint="Shop name, then address and phone. With a receipt logo, the logo replaces the first line.">
            <textarea
              name="receipt_header"
              value={h}
              onChange={(e) => setH(e.target.value)}
              rows={4}
              placeholder={"NAMA TOKO\nJl. ...\n0812-...."}
              className={`${input} font-mono text-sm`}
            />
          </Field>
          <Field label="Footer" hint="Thank-you line, Instagram, wifi password…">
            <textarea
              name="receipt_footer"
              value={f}
              onChange={(e) => setF(e.target.value)}
              rows={3}
              placeholder={"Terima kasih!\nIG @..."}
              className={`${input} font-mono text-sm`}
            />
          </Field>
          <div className="flex flex-wrap gap-4 text-sm text-neutral-700">
            <label className="flex items-center gap-2">
              Paper
              <select value={width} onChange={(e) => setWidth(Number(e.target.value) as 32 | 48)} className="rounded-lg border border-neutral-300 px-2 py-1">
                <option value={32}>58mm</option>
                <option value={48}>80mm</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} />
              Show as a reprint
            </label>
          </div>
        </div>

        <div className="mx-auto w-fit">
          <p className="mb-1 text-center text-xs uppercase tracking-wide text-neutral-400">Preview</p>
          <div className="rounded-sm bg-white px-3 py-4 shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
            {receiptLogoUrl && (
              <div className="mb-1 flex justify-center">
                {/* The receipt logo is a 1-bit PBM — browsers can't show it, so draw it. */}
                <PbmImage url={receiptLogoUrl} widthChars={width} />
              </div>
            )}
            <div className="font-mono text-[11px] leading-[1.35] text-neutral-900" style={{ width: `${width}ch` }}>
              {preview.map((block, i) => (
                // Size n prints n× wider and taller: n× the font over width/n columns.
                <div
                  key={i}
                  style={{ fontSize: `${block.size ?? 1}em`, textAlign: block.align === "center" ? "center" : "left" }}
                  className={block.bold ? "font-bold" : ""}
                >
                  {block.lines.flatMap((l) => l.split("\n")).map((line, j) => (
                    <div key={j} className="whitespace-pre">
                      {line || "\u00a0"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

/** Renders a P4 PBM (the receipt logo file), sized as it prints on the paper. */
function PbmImage({ url, widthChars }: { url: string; widthChars: number }) {
  const [img, setImg] = useState<{ src: string; dots: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        const head = new TextDecoder().decode(bytes.slice(0, 64)).match(/^P4\s+(\d+)\s+(\d+)\s/);
        if (!head) throw new Error("not a PBM");
        const [w, h] = [Number(head[1]), Number(head[2])];
        const data = bytes.slice(head[0].length);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        const out = ctx.createImageData(w, h);
        const rowBytes = Math.ceil(w / 8);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const black = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
            const o = (y * w + x) * 4;
            out.data[o] = out.data[o + 1] = out.data[o + 2] = black ? 0 : 255;
            out.data[o + 3] = 255;
          }
        ctx.putImageData(out, 0, 0);
        if (!cancelled) setImg({ src: canvas.toDataURL(), dots: w });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) return <span className="font-mono text-[11px] text-neutral-400">[ logo ]</span>;
  if (!img) return <span className="font-mono text-[11px] text-neutral-300">…</span>;
  // The print head is 384 dots (58mm) or 576 (80mm) across the full line.
  const headDots = widthChars === 32 ? 384 : 576;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated preview
    <img
      src={img.src}
      alt="Receipt logo"
      style={{ width: `${(img.dots / headDots) * widthChars}ch`, imageRendering: "pixelated" }}
      className="h-auto font-mono text-[11px]"
    />
  );
}
