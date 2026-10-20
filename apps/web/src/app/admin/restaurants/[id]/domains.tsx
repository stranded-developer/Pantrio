"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDomain, removeDomain } from "../../actions";

export type DomainRow = {
  id: string;
  hostname: string;
  dns: string;
  status: { verified: boolean; misconfigured: boolean | null; note?: string } | null;
};

export function Domains({ orgId, rows, vercel }: { orgId: string; rows: DomainRow[]; vercel: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-neutral-900">Custom domains</h2>
      <p className="text-sm text-neutral-500">
        The restaurant&apos;s POS at its own address, e.g. <code>pos.myresto.com</code>.{" "}
        {vercel
          ? "Added to the Vercel project automatically."
          : "Vercel API not configured — also add the domain in Vercel → Project → Settings → Domains."}
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-neutral-100">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium text-neutral-900">{d.hostname}</p>
              <p className="text-sm text-neutral-500">DNS: {d.dns}</p>
              {d.status && (
                <p className={`text-sm ${d.status.verified && d.status.misconfigured === false ? "text-green-700" : "text-amber-700"}`}>
                  {d.status.verified && d.status.misconfigured === false
                    ? "Live"
                    : d.status.note ?? (d.status.misconfigured ? "Waiting for DNS" : "Waiting for verification")}
                </p>
              )}
            </div>
            <button
              disabled={pending}
              onClick={() =>
                window.confirm(`Disconnect ${d.hostname}?`) &&
                startTransition(async () => {
                  await removeDomain(orgId, d.id);
                  router.refresh();
                })
              }
              className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            const result = await addDomain(orgId, String(fd.get("hostname") ?? ""));
            if (!result.ok) setError(result.error);
            router.refresh();
          })
        }
        className="flex gap-2"
      >
        <input
          name="hostname"
          placeholder="pos.myresto.com"
          required
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
        />
        <button disabled={pending} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40">
          Connect
        </button>
      </form>
    </section>
  );
}
