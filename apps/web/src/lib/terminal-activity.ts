// Browser-side bookkeeping for a terminal's idle lock (P25). The last touch
// is kept in localStorage so a reload, or opening the laptop the next
// morning, still counts the idle time. Storage can be unavailable (private
// mode); then the lock just counts from page load.

const KEY = "pantrio-terminal-activity";

/** Fired by the POS when a sale is finished ("New order"). */
export const SALE_DONE_EVENT = "pantrio:sale-done";

export function markTerminalActivity() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** The lock screen is showing: whoever signs in next starts a fresh idle clock. */
export function clearTerminalActivity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function readTerminalActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
