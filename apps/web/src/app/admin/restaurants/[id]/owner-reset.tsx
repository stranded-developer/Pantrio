"use client";

import { useState, useTransition } from "react";
import { resetOwnerPassword } from "../../actions";

// Backoffice: unlock a restaurant's tills by resetting an owner's password (P26).
export function OwnerReset({
  orgId,
  owners,
  locked,
}: {
  orgId: string;
  owners: { id: string; label: string }[];
  locked: { id: string; name: string; at: string }[];
}) {
  const [owner, setOwner] = useState(owners[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-neutral-900">Locked tills</h2>
      {locked.length === 0 ? (
        <p className="text-sm text-neutral-500">No till is locked.</p>
      ) : (
        <ul className="text-sm text-red-700">
          {locked.map((t) => (
            <li key={t.id}>
              {t.name} — locked {new Date(t.at).toLocaleString("en-GB")} after 5 wrong PINs
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-neutral-500">
        Resetting an owner&apos;s password signs them out everywhere and unlocks every locked till here. Only do it after
        confirming who is asking.
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="text"
          minLength={8}
          placeholder="New password (8+)"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          disabled={pending || !owner || password.length < 8}
          onClick={() =>
            startTransition(async () => {
              const r = await resetOwnerPassword(orgId, owner, password);
              setNote(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
              if (r.ok) setPassword("");
            })
          }
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Resetting…" : "Reset password & unlock"}
        </button>
      </div>
      {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</p>}
    </section>
  );
}
