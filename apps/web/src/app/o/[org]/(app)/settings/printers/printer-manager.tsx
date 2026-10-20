"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTenant } from "../../tenant-context";
import { issuePrinterToken, revokePrinter } from "./actions";

export type DeviceRow = {
  id: string;
  name: string;
  outlet: string;
  tokenPrefix: string;
  lastSeen: string | null;
  revoked: boolean;
};

const input = "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

export function PrinterManager({
  devices,
  outlets,
  supabaseUrl,
  publishableKey,
}: {
  devices: DeviceRow[];
  outlets: { id: string; name: string }[];
  supabaseUrl: string;
  publishableKey: string;
}) {
  const router = useRouter();
  const { slug, outletId, timezone } = useTenant();
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const envFile = issued
    ? `PANTRIO_SUPABASE_URL=${supabaseUrl}\nPANTRIO_PUBLISHABLE_KEY=${publishableKey}\nPRINT_DEVICE_TOKEN=${issued.token}\nPRINTER=usb:/dev/usb/lp0\nRECEIPT_WIDTH=32`
    : "";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Printers</h1>
        <p className="text-sm text-neutral-500">
          Each receipt printer box (STB / Raspberry Pi running the Pantrio bridge) gets its own key. It can only
          print this branch&apos;s receipts — it can&apos;t read orders, menus or staff. Lost a box? Revoke its key.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {issued ? (
        <div className="space-y-3 rounded-2xl border-2 border-amber-400 bg-white p-6 shadow-sm">
          <p className="font-semibold text-neutral-900">Key for “{issued.name}” — copy it now</p>
          <p className="text-sm text-neutral-600">
            It is shown once. Put these lines in <code>/etc/pantrio-bridge.env</code> on the printer box, then
            restart the bridge.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">{envFile}</pre>
          <div className="flex gap-2">
            <button
              onClick={() => void navigator.clipboard.writeText(envFile)}
              className="flex-1 rounded-lg border border-neutral-300 py-3 font-medium text-neutral-700"
            >
              Copy
            </button>
            <button onClick={() => setIssued(null)} className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white">
              Done, I saved it
            </button>
          </div>
        </div>
      ) : (
        <form
          action={(fd) =>
            startTransition(async () => {
              setError(null);
              const name = String(fd.get("name") ?? "");
              const result = await issuePrinterToken(slug, String(fd.get("outlet") ?? outletId), name);
              if (!result.ok) setError(result.error);
              else {
                setIssued({ name, token: result.token });
                router.refresh();
              }
            })
          }
          className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-6 shadow-sm"
        >
          <label className="min-w-48 flex-1 space-y-1">
            <span className="text-sm font-medium text-neutral-700">Printer name</span>
            <input name="name" required placeholder="Counter printer" className={input} />
          </label>
          {outlets.length > 1 && (
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
          )}
          <button disabled={pending} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40">
            {pending ? "Creating…" : "Add printer"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {devices.length === 0 && <li className="p-4 text-sm text-neutral-400">No printers yet.</li>}
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className={`font-medium ${d.revoked ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{d.name}</p>
              <p className="text-sm text-neutral-500">
                {outlets.length > 1 && `${d.outlet} · `}
                <code>{d.tokenPrefix}…</code> ·{" "}
                {d.revoked
                  ? "revoked"
                  : d.lastSeen
                    ? `last seen ${new Date(d.lastSeen).toLocaleString("en-GB", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })}`
                    : "never connected"}
              </p>
            </div>
            {!d.revoked && (
              <button
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Revoke “${d.name}”? That box stops printing until it gets a new key.`)) return;
                  startTransition(async () => {
                    const result = await revokePrinter(slug, d.id);
                    if (!result.ok) setError(result.error ?? "Could not revoke.");
                    router.refresh();
                  });
                }}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-40"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
