"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTenant } from "../../tenant-context";
import { addStaff, resetPassword, updateMember, type Result } from "./actions";

export type StaffRow = {
  userId: string;
  name: string;
  email: string | null;
  role: "owner" | "manager" | "cashier";
  active: boolean;
  isMe: boolean;
};

const input = "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

export function StaffManager({ rows, canCreate }: { rows: StaffRow[]; canCreate: boolean }) {
  const router = useRouter();
  const { slug } = useTenant();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(promise: Promise<Result>, onOk?: () => void) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) setNotice({ tone: "error", text: result.error });
      else {
        setNotice(result.message ? { tone: "ok", text: result.message } : null);
        onOk?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Staff</h1>
          <p className="text-sm text-neutral-500">
            Owners manage everything; managers run menu, sales and settings; cashiers sell. Deactivate rather than
            delete — names stay on past orders.
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setAdding(true)} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white">
            Add staff
          </button>
        )}
      </div>

      {notice && (
        <p className={`rounded-xl p-3 text-sm ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {notice.text}
        </p>
      )}

      {adding && (
        <form
          action={(fd) => run(addStaff(slug, fd), () => setAdding(false))}
          className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2 className="font-semibold text-neutral-900">New staff login</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" placeholder="Name (shown on receipts)" required className={input} />
            <input name="email" type="email" placeholder="Email (their username)" required className={input} />
            <input name="password" type="text" minLength={8} placeholder="Starting password (8+ characters)" required className={input} />
            <select name="role" defaultValue="cashier" className={input}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <p className="text-xs text-neutral-500">Give them the email and password; they can change it under their account.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-neutral-300 py-3 font-medium text-neutral-700">
              Cancel
            </button>
            <button disabled={pending} className="flex-1 rounded-lg bg-neutral-900 py-3 font-medium text-white disabled:opacity-40">
              {pending ? "Saving…" : "Create login"}
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {rows.map((row) => (
          <li key={row.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className={`font-medium ${row.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
                {row.name} {row.isMe && <span className="text-xs font-normal text-neutral-400">(you)</span>}
              </p>
              {row.email && <p className="text-sm text-neutral-500">{row.email}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={row.role}
                disabled={pending}
                onChange={(e) => run(updateMember(slug, row.userId, { role: e.target.value as StaffRow["role"] }))}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
              {!row.isMe && canCreate && (
                <button
                  disabled={pending}
                  onClick={() => {
                    const password = window.prompt(`New password for ${row.name} (8+ characters)`);
                    if (password) run(resetPassword(slug, row.userId, password));
                  }}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                >
                  Reset password
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => run(updateMember(slug, row.userId, { active: !row.active }))}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
              >
                {row.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
