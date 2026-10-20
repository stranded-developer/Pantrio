import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, columns, money, renderText, wrap } from "./receipt.mjs";
import { readFileSync } from "node:fs";
import { parsePbm, toPrintable } from "./escpos.mjs";

const sample = {
  order: {
    order_no: 1534,
    queue_no: 12,
    status: "paid",
    opened_at: "2026-10-18T12:03:00Z",
    subtotal: 61000,
    service_total: 3050,
    tax_total: 6405,
    grand_total: 70455,
    cashier: "Kayleen",
  },
  items: [
    { name_snapshot: "Iced Caramel Macchiato with Extra Shot", qty: 2, unit_price: 28000, line_subtotal: 56000, voided: false, modifiers_json: [{ note: "less sugar" }] },
    { name_snapshot: "Mineral Water", qty: 1, unit_price: 5000, line_subtotal: 5000, voided: false, modifiers_json: [] },
    { name_snapshot: "Voided Cake", qty: 1, unit_price: 30000, line_subtotal: 30000, voided: true, modifiers_json: [] },
  ],
  payment: { method: "cash", amount_tendered: 100000, change_given: 29545 },
  settings: { receipt_header: "FOKAS\nJl. Contoh No. 1", receipt_footer: "Terima kasih!\nIG @fokas", timezone: "Asia/Jakarta" },
};

test("money groups thousands with dots", () => {
  assert.equal(money(0), "0");
  assert.equal(money(5000), "5.000");
  assert.equal(money(1234567), "1.234.567");
});

test("columns right-aligns the amount to the exact width", () => {
  const line = columns("TOTAL", "Rp 70.455", 32);
  assert.equal(line.length, 32);
  assert.ok(line.startsWith("TOTAL") && line.endsWith("Rp 70.455"));
});

test("wrap never exceeds the width, even for one long word", () => {
  for (const line of wrap("Supercalifragilisticexpialidocious latte deluxe", 10)) {
    assert.ok(line.length <= 10, line);
  }
});

test("no plain-text line exceeds 32 columns on 58mm paper", () => {
  const text = renderText(sample, { width: 32 });
  for (const line of text.split("\n")) assert.ok(line.length <= 32, `"${line}"`);
});

test("receipt shows the customer number, totals and change; skips voided lines", () => {
  const text = renderText(sample, { width: 32 });
  assert.match(text, /NOMOR ANDA/);
  assert.match(text, /^\s*12$/m);
  assert.match(text, /TOTAL\s+Rp 70\.455/);
  assert.match(text, /Kembali\s+29\.545/);
  assert.match(text, /- less sugar/);
  assert.doesNotMatch(text, /Voided Cake/);
});

test("reprints and voided orders are labelled", () => {
  assert.match(renderText(sample, { reprint: true }), /SALINAN/);
  assert.match(renderText({ ...sample, order: { ...sample.order, status: "voided" } }), /VOID/);
});

test("printer bytes start with init and end with a cut", () => {
  const bytes = buildReceipt(sample);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 66, 0]);
});

test("a logo fits the 58mm head and prints as a GS v 0 raster", () => {
  const logo = parsePbm(readFileSync(new URL("./test-logo.pbm", import.meta.url)));
  assert.ok(logo.width <= 384, `logo is ${logo.width} dots wide`);

  const bytes = buildReceipt(sample, { logo });
  const at = bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0]));
  assert.ok(at > 0, "raster command present");
  assert.equal(bytes[at + 4] | (bytes[at + 5] << 8), Math.ceil(logo.width / 8));
  assert.equal(bytes[at + 6] | (bytes[at + 7] << 8), logo.height);
});

test("with a logo, the first header line is not printed again as text", () => {
  const logo = { width: 8, height: 1, data: Buffer.from([0xff]) };
  const text = renderText(sample, { logo });
  assert.match(text, /\[ logo \]/);
  assert.doesNotMatch(text, /^\s*FOKAS$/m);
  assert.match(text, /Jl\. Contoh No\. 1/);
});

test("non-ASCII text is made printable", () => {
  assert.equal(toPrintable("Café ☕"), "Cafe ?");
});

test("inclusive prices: total first, then the tax inside it", () => {
  const inclusive = {
    ...sample,
    order: { ...sample.order, price_mode: "inclusive", subtotal: 50000, service_total: 2500, tax_total: 5250, grand_total: 57750 },
  };
  const text = renderText(inclusive, { width: 32 });
  assert.match(text, /TOTAL\s+Rp 57\.750/);
  assert.match(text, /Termasuk pajak\s+5\.250/);
  assert.doesNotMatch(text, /Subtotal/);
});

test("prints the time in the restaurant's timezone", () => {
  // 12:03Z = 19:03 WIB = 20:03 WITA
  assert.match(renderText(sample, { width: 32 }), /18\/10\/2026 19:03/);
  const wita = { ...sample, settings: { ...sample.settings, timezone: "Asia/Makassar" } };
  assert.match(renderText(wita, { width: 32 }), /18\/10\/2026 20:03/);
});
