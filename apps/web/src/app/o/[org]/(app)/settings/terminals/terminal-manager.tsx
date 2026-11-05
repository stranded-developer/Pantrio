"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTenant } from "../../tenant-context";
import { Field, input, SettingsCard } from "../forms";
import { registerThisDevice, revokeTerminal, saveTerminalOptions, type Result } from "./actions";

export type TerminalRow = {
  id: string;
  name: string;
  outlet: string;
  tokenPrefix: string;
  lastSeen: string | null;
  revoked: boolean;
  lockedUntil: string | null;
  isThisDevice: boolean;
};

export function TerminalManager({
  rows,
  outlets,
  idleMinutes,
  lockAfterSale,
  thisDevice,
}: {
  rows: TerminalRow[];
  outlets: { id: string; name: string }[];
  idleMinutes: number;
  lockAfterSale: boolean;
  thisDevice: { name: string; outlet: string } | null;
}) {
  const router = useRouter();
  const { slug, outletId, timezone } = useTenant();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: timezone, dateStyle: "short", timeStyle: "short" });

  function run(promise: Promise<Result>) {
    startTransition(async () => {
      setError(null);
      const result = await promise;
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Terminals</h1>
        <p className="text-sm text-neutral-500">
          A terminal is a laptop or iPad at the counter. On a terminal, staff sign in with their PIN, clock in and
          out (with a photo), and the screen locks itself when nobody is using it. Clocking in only works on a
          terminal — not from a phone or from home. Lost or replaced a device? Revoke it.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {thisDevice ? (
        <p className="rounded-2xl border-2 border-green-500 bg-white p-4 text-sm text-neutral-700">
          <span className="font-semibold text-neutral-900">This device is a terminal:</span> {thisDevice.name}
          {outlets.length > 1 && ` · ${thisDevice.outlet}`}. Use <b>Lock</b> (top right) to hand over to the next person.
        </p>
      ) : (
        <form
          action={(fd) => run(registerThisDevice(slug, fd))}
          className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-neutral-900">Register this device</h2>
            <p className="text-sm text-neutral-500">
              Do this on the counter laptop or iPad itself, at the address staff use every day. On an iPad that runs
              Pantrio from the home screen, open it from the home screen first — it keeps its own sign-in.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 space-y-1">
              <span className="text-sm font-medium text-neutral-700">Terminal name</span>
              <input name="name" required maxLength={60} placeholder="Counter iPad" className={input} />
            </label>
            {outlets.length > 1 ? (
              <label className="space-y-1">
                <span className="text-sm font-medium text-neutral-700">Branch</span>
                <select name="outlet" defaultValue={outletId} className={input}>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="outlet" value={outlets[0]?.id ?? outletId} />
            )}
            <button disabled={pending} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40">
              {pending ? "Registering…" : "Make this a terminal"}
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {rows.length === 0 && <li className="p-4 text-sm text-neutral-400">No terminals yet.</li>}
        {rows.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className={`font-medium ${t.revoked ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
                {t.name} {t.isThisDevice && <span className="text-xs font-normal text-green-700">(this device)</span>}
              </p>
              <p className="text-sm text-neutral-500">
                {outlets.length > 1 && `${t.outlet} · `}
                <code>{t.tokenPrefix}…</code> ·{" "}
                {t.revoked ? "revoked" : t.lastSeen ? `last used ${when(t.lastSeen)}` : "not used yet"}
                {!t.revoked && t.lockedUntil && Date.parse(t.lockedUntil) > Date.now() && (
                  <span className="text-red-700"> · locked after wrong PINs until {when(t.lockedUntil)}</span>
                )}
              </p>
            </div>
            {!t.revoked && (
              <button
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Revoke “${t.name}”? It goes back to an ordinary browser: no PIN pad, no clocking.`)) return;
                  run(revokeTerminal(slug, t.id));
                }}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-40"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>

      <SettingsCard
        title="Auto-lock"
        intro="On terminals only. Locking signs the person out; the next one enters their PIN."
        action={saveTerminalOptions}
        submitLabel="Save auto-lock"
      >
        <Field label="Lock after this many idle minutes" hint="Also counts while the device was shut or asleep.">
          <input name="idle" type="number" min={1} max={120} defaultValue={idleMinutes} className={input} />
        </Field>
        <label className="flex items-center gap-3 text-sm text-neutral-700">
          <input type="checkbox" name="lock_after_sale" defaultChecked={lockAfterSale} className="h-5 w-5" />
          Also lock after every sale (several cashiers sharing one till)
        </label>
      </SettingsCard>
    </div>
  );
}
