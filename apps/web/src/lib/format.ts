/** "Rp 61.000" — Indonesian thousands separator. */
export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

/** 1050 bps → "10,5%" */
export function formatBps(bps: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}
