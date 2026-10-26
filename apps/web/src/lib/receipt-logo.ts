// Turns any logo image into the 1-bit PBM (P4) a thermal printer can print —
// done in the browser at upload, so the print bridge needs no image library.
// Same format as FOKAS's bridge/logo.pbm (parsePbm in bridge/escpos.mjs).

/** 58mm heads are 384 dots wide; keep a margin. */
export const RECEIPT_LOGO_MAX_WIDTH = 320;

export type ReceiptLogo = { pbm: Uint8Array; width: number; height: number; previewUrl: string };

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Scale to ≤ maxWidth, flatten transparency onto white, threshold to black /
 * white (logos are flat colours — dithering would make them fuzzy), trim the
 * blank rows above and below so no paper is wasted.
 * `threshold` 0–255: higher = more ink.
 */
export function imageToPbm(img: HTMLImageElement, threshold = 160, maxWidth = RECEIPT_LOGO_MAX_WIDTH): ReceiptLogo {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h0 = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h0;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h0);
  ctx.drawImage(img, 0, 0, w, h0);
  const px = ctx.getImageData(0, 0, w, h0).data;

  const ink = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    return lum < threshold;
  };
  const rowHasInk = (y: number) => {
    for (let x = 0; x < w; x++) if (ink(x, y)) return true;
    return false;
  };
  let top = 0;
  while (top < h0 - 1 && !rowHasInk(top)) top++;
  let bottom = h0 - 1;
  while (bottom > top && !rowHasInk(bottom)) bottom--;
  const h = bottom - top + 1;

  const rowBytes = Math.ceil(w / 8);
  const bits = new Uint8Array(rowBytes * h);
  const preview = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const black = ink(x, y + top);
      if (black) bits[y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
      const o = (y * w + x) * 4;
      const v = black ? 0 : 255;
      preview.data[o] = v;
      preview.data[o + 1] = v;
      preview.data[o + 2] = v;
      preview.data[o + 3] = 255;
    }
  }
  const header = new TextEncoder().encode(`P4\n${w} ${h}\n`);
  const pbm = new Uint8Array(header.length + bits.length);
  pbm.set(header);
  pbm.set(bits, header.length);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.putImageData(preview, 0, 0);
  return { pbm, width: w, height: h, previewUrl: out.toDataURL("image/png") };
}
