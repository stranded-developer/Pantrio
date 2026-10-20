/**
 * The handful of ESC/POS commands a receipt needs. Hand-rolled rather than a
 * library: it is ~40 lines, has no native dependencies to build on ARM, and
 * every cheap thermal printer (Panda, Xprinter, Epson) speaks this subset.
 */

const ESC = 0x1b;
const GS = 0x1d;

export class EscPos {
  #chunks = [];

  init() {
    return this.#raw(ESC, 0x40);
  }

  align(where) {
    return this.#raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[where]);
  }

  bold(on) {
    return this.#raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Character size multiplier, 1–8 in each direction. */
  size(width, height = width) {
    return this.#raw(GS, 0x21, ((width - 1) << 4) | (height - 1));
  }

  line(text = "") {
    this.#chunks.push(Buffer.from(toPrintable(text) + "\n", "latin1"));
    return this;
  }

  /**
   * A 1-bit image, as parsed by parsePbm(): GS v 0 raster, MSB first,
   * 1 = black. Width must fit the print head (384 dots on 58mm).
   */
  image({ width, height, data }) {
    const bytesPerRow = Math.ceil(width / 8);
    this.#raw(GS, 0x76, 0x30, 0, bytesPerRow & 0xff, bytesPerRow >> 8, height & 0xff, height >> 8);
    this.#chunks.push(data);
    return this;
  }

  feed(lines) {
    return this.#raw(ESC, 0x64, lines);
  }

  /** Partial cut. A printer without a cutter ignores it. */
  cut() {
    return this.#raw(GS, 0x56, 66, 0);
  }

  bytes() {
    return Buffer.concat(this.#chunks);
  }

  #raw(...values) {
    this.#chunks.push(Buffer.from(values));
    return this;
  }
}

/**
 * Binary PBM (P4) — the logo format, because its row packing is exactly
 * what GS v 0 expects, so no image library is needed on the box.
 */
export function parsePbm(buffer) {
  const header = buffer.subarray(0, 64).toString("latin1");
  const match = /^P4\s+(\d+)\s+(\d+)\s/.exec(header);
  if (!match) throw new Error("Logo is not a binary PBM (P4) file");

  const width = Number(match[1]);
  const height = Number(match[2]);
  const data = buffer.subarray(match[0].length, match[0].length + Math.ceil(width / 8) * height);

  if (data.length !== Math.ceil(width / 8) * height) throw new Error("Logo file is truncated");
  return { width, height, data };
}

/**
 * Thermal printers default to code page 437, which has no reliable mapping
 * for most non-ASCII text. Strip accents ("Café" → "Cafe") and replace
 * anything else, rather than let the printer render garbage.
 */
export function toPrintable(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}
