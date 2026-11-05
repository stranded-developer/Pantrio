"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { lockTerminal } from "../login/terminal-actions";
import { markTerminalActivity, readTerminalActivity, SALE_DONE_EVENT } from "@/lib/terminal-activity";

// On a registered terminal (P25): lock after N idle minutes — also across a
// reload or the laptop being shut, since the last touch is remembered — and
// optionally after every sale. Locking signs the person out; the PIN pad
// comes back. Off a terminal this component isn't rendered.

export function TerminalLock({
  slug,
  idleMinutes,
  lockAfterSale,
}: {
  slug: string;
  idleMinutes: number;
  lockAfterSale: boolean;
}) {
  const locking = useRef(false);
  const lock = useCallback(async () => {
    if (locking.current) return;
    locking.current = true;
    // Full navigation through proxy.ts (P20).
    window.location.assign(await lockTerminal(slug));
  }, [slug]);

  useEffect(() => {
    const idleMs = idleMinutes * 60_000;
    const last = readTerminalActivity();
    if (last !== null && Date.now() - last > idleMs) {
      void lock();
      return;
    }
    markTerminalActivity();

    let lastWrite = Date.now();
    const onActivity = () => {
      if (Date.now() - lastWrite < 5_000) return;
      lastWrite = Date.now();
      markTerminalActivity();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    const timer = window.setInterval(() => {
      const seen = readTerminalActivity() ?? lastWrite;
      if (Date.now() - Math.max(seen, lastWrite) > idleMs) void lock();
    }, 15_000);
    const onSale = () => {
      if (lockAfterSale) void lock();
    };
    window.addEventListener(SALE_DONE_EVENT, onSale);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      window.clearInterval(timer);
      window.removeEventListener(SALE_DONE_EVENT, onSale);
    };
  }, [idleMinutes, lockAfterSale, lock]);

  return null;
}

export function LockButton({ slug, className }: { slug: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => window.location.assign(await lockTerminal(slug)))}
      className={className}
    >
      {pending ? "Locking…" : "Lock"}
    </button>
  );
}
