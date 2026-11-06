"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDay } from "@pantrio/core";
import { useTenant } from "../tenant-context";
import { addEntry, deleteEntry, editEntry, type Result } from "./actions";
import { formatDuration, isoToZonedLocal } from "./time";

export type EntryRow = {
  id: string;
  userId: string;
  name: string;
  outlet: string;
  businessDate: string;
  clockIn: string;
  clockOut: string | null;
  status: "open" | "closed" | "missing_out";
  inPhoto: string | null;
  outPhoto: string | null;
  edited: boolean;
  manual: boolean;
  note: string | null;
  canEdit: boolean;
};

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

export function TimesheetView({
  rows,
  members,
  outlets,
}: {
  rows: EntryRow[];
  members: { id: string; name: string }[];
  outlets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { slug, timezone, outletId } = useTenant();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });

  function run(promise: Promise<Result>, onOk: () => void) {
    startTransition(async () => {
      setError(null);
      const result = await promise;
      if (!result.ok) setError(result.error);
      else {
        onOk();
        router.refresh();
      }
    });
  }

  const days = [...new Set(rows.map((r) => r.businessDate))];

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {adding ? (
        <form
          onSubmit={(e) => {
            // Not `action=`: React resets the fields after an action, and a
            // refused save (e.g. a time in the future) should keep the input.
            e.preventDefault();
            run(addEntry(slug, new FormData(e.currentTarget)), () => setAdding(false));
          }}
          className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2 className="font-semibold text-neutral-900">Add a shift someone forgot to clock</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="user" required className={input} defaultValue="">
              <option value="" disabled>
                Who
              </option>
              {members.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {outlets.length > 1 ? (
              <select name="outlet" defaultValue={outletId} className={input}>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="outlet" value={outlets[0]?.id ?? outletId} />
            )}
            <label className="space-y-1 text-sm text-neutral-700">
              In
              <input name="in" type="datetime-local" required className={input} />
            </label>
            <label className="space-y-1 text-sm text-neutral-700">
              Out
              <input name="out" type="datetime-local" required className={input} />
            </label>
          </div>
          <input name="note" required maxLength={300} placeholder="Reason (kept in the audit log)" className={input} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-neutral-300 py-3 text-neutral-700">
              Cancel
            </button>
            <button disabled={pending} className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white disabled:opacity-40">
              {pending ? "Saving…" : "Add shift"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700">
          Add a missed shift
        </button>
      )}

      {rows.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">No clock-ins this week.</p>
      )}

      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{formatDay(day)}</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {rows
              .filter((r) => r.businessDate === day)
              .map((r) => (
                <li key={r.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Photo url={r.inPhoto} label="in" missing={!r.manual} />
                      <Photo url={r.outPhoto} label="out" missing={!r.manual && r.status === "closed"} />
                      <div>
                        <p className="font-medium text-neutral-900">{r.name}</p>
                        <p className="text-sm text-neutral-500">
                          {time(r.clockIn)} – {r.clockOut ? time(r.clockOut) : "…"}
                          {r.clockOut && ` · ${formatDuration(Date.parse(r.clockOut) - Date.parse(r.clockIn))}`}
                          {outlets.length > 1 && ` · ${r.outlet}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "open" && <Badge tone="green">On shift</Badge>}
                      {r.status === "missing_out" && <Badge tone="amber">Missing clock-out</Badge>}
                      {r.manual && <Badge tone="neutral">Added by manager</Badge>}
                      {r.edited && !r.manual && <Badge tone="neutral">Corrected</Badge>}
                      {r.canEdit && editing !== r.id && (
                        <button
                          onClick={() => setEditing(r.id)}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
                        >
                          {r.status === "missing_out" ? "Fix" : "Edit"}
                        </button>
                      )}
                    </div>
                  </div>
                  {r.note && <p className="text-xs text-neutral-500">Note: {r.note}</p>}
                  {editing === r.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(editEntry(slug, r.id, new FormData(e.currentTarget)), () => setEditing(null));
                      }}
                      className="grid gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2"
                    >
                      <label className="space-y-1 text-sm text-neutral-700">
                        In
                        <input name="in" type="datetime-local" required defaultValue={isoToZonedLocal(r.clockIn, timezone)} className={input} />
                      </label>
                      <label className="space-y-1 text-sm text-neutral-700">
                        Out {r.status === "open" && "(empty = still on shift)"}
                        <input
                          name="out"
                          type="datetime-local"
                          required={r.status !== "open"}
                          defaultValue={r.clockOut ? isoToZonedLocal(r.clockOut, timezone) : ""}
                          className={input}
                        />
                      </label>
                      <input name="note" required maxLength={300} placeholder="Reason (kept in the audit log)" className={`${input} sm:col-span-2`} />
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-neutral-700">
                          Cancel
                        </button>
                        <button disabled={pending} className="flex-1 rounded-lg bg-neutral-900 py-2 font-medium text-white disabled:opacity-40">
                          {pending ? "Saving…" : "Save"}
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={(e) => {
                          // Same reason box as Save; the whole entry stays in the audit log.
                          const reason = new FormData(e.currentTarget.form!).get("note")?.toString() ?? "";
                          if (!reason.trim()) return setError("Give a reason for deleting it.");
                          if (!confirm(`Delete ${r.name}'s shift? It stays in the audit log.`)) return;
                          run(deleteEntry(slug, r.id, reason), () => setEditing(null));
                        }}
                        className="text-left text-sm text-red-600 underline disabled:opacity-40 sm:col-span-2"
                      >
                        Delete this entry
                      </button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Photo({ url, label, missing }: { url: string | null; label: string; missing: boolean }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={`Clock-${label} photo`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img src={url} alt={`Clock-${label}`} className="h-12 w-12 rounded-lg object-cover" />
      </a>
    );
  }
  return (
    <span
      title={missing ? `No clock-${label} photo` : undefined}
      className={`flex h-12 w-12 items-center justify-center rounded-lg text-[10px] ${missing ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-400"}`}
    >
      {missing ? "no photo" : label}
    </span>
  );
}

function Badge({ tone, children }: { tone: "green" | "amber" | "neutral"; children: React.ReactNode }) {
  const tones = {
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
    neutral: "bg-neutral-100 text-neutral-600",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
