import { EscPos, toPrintable } from "./escpos.mjs";

/**
 * Customer receipt layout. Pure: order data in, printer bytes out, so it can
 * be tested without a printer (receipt.test.mjs) and previewed with
 * `renderText()`.
 *
 * 58mm paper fits 32 characters; 80mm fits 48. Set RECEIPT_WIDTH to match.
 */
export function buildReceipt(data, { width = 32, reprint = false, logo = null } = {}) {
  const p = new EscPos().init();

  if (logo) p.align("center").image(logo).line("");

  for (const block of layout(data, { width, reprint, logo })) {
    p.align(block.align ?? "left").bold(Boolean(block.bold)).size(block.size ?? 1);
    for (const text of block.lines) p.line(text);
  }

  return p.size(1).bold(false).align("left").feed(4).cut().bytes();
}

/** The same receipt as plain text, for logs and the dry-run printer. */
export function renderText(data, options) {
  const blocks = layout(data, { width: 32, reprint: false, ...options });
  if (options?.logo) blocks.unshift({ align: "center", lines: ["[ logo ]"] });

  return blocks
    .flatMap((block) => block.lines.map((text) => align(text, block, options?.width ?? 32)))
    .join("\n");
}

function align(text, block, width) {
  // Double-size text takes two columns per character.
  const cols = Math.floor(width / (block.size ?? 1));
  if (block.align === "center") {
    return " ".repeat(Math.max(0, Math.floor((cols - text.length) / 2))) + text;
  }
  return text;
}

function layout(data, { width, reprint, logo }) {
  const { order, items, payment, settings } = data;
  const rule = "-".repeat(width);
  const [title, ...subtitle] = splitLines(settings.receipt_header);
  const blocks = [];

  // With a logo, the logo *is* the title — the first header line would only
  // repeat the shop name underneath it.
  if (title && !logo) {
    blocks.push({ align: "center", bold: true, size: 2, lines: fit([title], width / 2) });
  }
  if (subtitle.length) blocks.push({ align: "center", lines: fit(subtitle, width) });

  if (order.queue_no != null) {
    blocks.push({ align: "center", lines: ["", "NOMOR ANDA"] });
    blocks.push({ align: "center", bold: true, size: 3, lines: [String(order.queue_no)] });
  }

  const notices = [];
  if (reprint) notices.push("** SALINAN / REPRINT **");
  if (order.status === "voided") notices.push("*** DIBATALKAN / VOID ***");
  if (notices.length) blocks.push({ align: "center", bold: true, lines: notices });

  blocks.push({
    lines: [
      "",
      formatDateTime(order.opened_at, settings.timezone),
      `Order #${order.order_no}`,
      ...(order.cashier ? [`Kasir: ${order.cashier}`] : []),
      rule,
    ],
  });

  const itemLines = [];
  for (const item of items.filter((line) => !line.voided)) {
    itemLines.push(...wrap(item.name_snapshot, width));
    itemLines.push(
      columns(`  ${item.qty} x ${money(item.unit_price)}`, money(item.line_subtotal), width)
    );
    for (const note of notesOf(item)) {
      itemLines.push(...wrap(`- ${note}`, width - 2).map((text) => `  ${text}`));
    }
  }
  itemLines.push(rule);
  blocks.push({ lines: itemLines });

  if (order.price_mode === "inclusive") {
    // Menu prices already include tax: the total first, then what's inside it.
    blocks.push({ bold: true, lines: [columns("TOTAL", `Rp ${money(order.grand_total)}`, width)] });
    const included = [];
    if (order.service_total > 0) included.push(columns("Termasuk service", money(order.service_total), width));
    if (order.tax_total > 0) included.push(columns("Termasuk pajak", money(order.tax_total), width));
    if (included.length) blocks.push({ lines: included });
  } else {
    const totals = [columns("Subtotal", money(order.subtotal), width)];
    if (order.service_total > 0) totals.push(columns("Service", money(order.service_total), width));
    if (order.tax_total > 0) totals.push(columns("Pajak", money(order.tax_total), width));
    blocks.push({ lines: totals });
    blocks.push({ bold: true, lines: [columns("TOTAL", `Rp ${money(order.grand_total)}`, width)] });
  }

  if (payment?.method === "cash" && payment.amount_tendered != null) {
    blocks.push({
      lines: [
        columns("Tunai", money(payment.amount_tendered), width),
        columns("Kembali", money(payment.change_given ?? 0), width),
      ],
    });
  }

  const footer = splitLines(settings.receipt_footer);
  blocks.push({ lines: [rule] });
  if (footer.length) blocks.push({ align: "center", lines: fit(footer, width) });

  return blocks;
}

/** Rupiah with dot grouping and no symbol: 25000 → "25.000". */
export function money(amount) {
  const value = Math.round(Number(amount) || 0);
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Left text and right text on one line; wraps the left side if needed. */
export function columns(left, right, width) {
  left = toPrintable(left);
  right = toPrintable(right);
  const room = width - right.length - 1;

  if (left.length <= room) {
    return left + " ".repeat(width - left.length - right.length) + right;
  }

  // Rare: a very long label. Put the amount on its own right-aligned line.
  return [...wrap(left, width), right.padStart(width)].join("\n");
}

export function wrap(text, width) {
  const words = toPrintable(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += " " + word;
    else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function fit(lines, width) {
  return lines.flatMap((line) => wrap(line, Math.floor(width)));
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** create_order stores a line note as [{ "note": "…" }]. */
function notesOf(item) {
  if (!Array.isArray(item.modifiers_json)) return [];
  return item.modifiers_json
    .map((entry) => entry?.note)
    .filter((note) => typeof note === "string" && note.length > 0);
}

function formatDateTime(iso, timeZone = "Asia/Jakarta") {
  return new Date(iso)
    .toLocaleString("en-GB", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
}
