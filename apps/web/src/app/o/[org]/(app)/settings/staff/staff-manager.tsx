"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTenant } from "../../tenant-context";
import Link from "next/link";
import { addStaff, renameMember, resetPassword, setPin, switchOffMemberPassword, updateMember, type Result } from "./actions";

export type StaffRow = {
  userId: string;
  name: string;
  email: string | null;
  /** "owner" or a role id */
  roleRef: string;
  active: boolean;
  /** Has a PIN for terminals (P25). */
  hasPin: boolean;
  /** Created without an email login (P26). */
  pinOnly: boolean;
  /** Owner, or a role ticked "can sign in away from the till". */
  roleAllowsPassword: boolean;
  passwordOff: boolean;
  /** Works for this restaurant only — their login is ours to change. */
  soleOrg: boolean;
  isMe: boolean;
};

const input = "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

export function StaffManager({
  rows,
  roles,
  canCreate,
}: {
  rows: StaffRow[];
  roles: { id: string; name: string; allowPassword: boolean }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const { slug, base } = useTenant();
  const roleOptions = (
    <>
      <option value="owner">Owner — everything</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </>
  );
  const [adding, setAdding] = useState(false);
  const defaultRole = roles.find((r) => r.name === "Cashier")?.id ?? roles[0]?.id ?? "owner";
  const [newRole, setNewRole] = useState(defaultRole);
  const newWithPassword = newRole === "owner" || (roles.find((r) => r.id === newRole)?.allowPassword ?? false);
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
            Owners can do everything. What everyone else can open is set by their role —{" "}
            <Link href={`${base}/settings/roles`} className="underline">
              edit roles
            </Link>
            . Deactivate rather than delete; names stay on past orders.
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
          onSubmit={(e) => {
            // Not `action=`: React would clear the fields when a save is refused.
            e.preventDefault();
            run(addStaff(slug, new FormData(e.currentTarget)), () => setAdding(false));
          }}
          className="space-y-3 rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2 className="font-semibold text-neutral-900">New staff</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" placeholder="Name (shown on receipts)" required className={input} />
            <select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value)} className={input}>
              {roleOptions}
            </select>
            <input
              name="pin"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              maxLength={6}
              required={!newWithPassword}
              placeholder={newWithPassword ? "Till PIN, 4–6 digits (optional)" : "Till PIN, 4–6 digits"}
              className={input}
            />
            {newWithPassword && (
              <>
                <input name="email" type="email" placeholder="Email (their username)" required className={input} />
                <input name="password" type="text" minLength={8} placeholder="Starting password (8+ characters)" className={input} />
              </>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            {newWithPassword
              ? "This role can also sign in away from the till: give them the email and password (an email that already has a login keeps its password)."
              : "PIN only: they sign in on a registered terminal with their PIN. No email or password — nothing to log in with from home. Tell them the PIN in person."}
          </p>
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
              <p className="text-sm text-neutral-500">{row.pinOnly ? "PIN only — no email login" : row.email}</p>
              <p className="text-xs text-neutral-400">{row.hasPin ? "PIN set" : "No PIN — can't use terminals"}</p>
              {!row.roleAllowsPassword && !row.pinOnly && !row.passwordOff && (
                <p className="text-xs text-amber-700">
                  {row.soleOrg
                    ? "Still has a password from before — switch it off once their PIN works."
                    : "Also works elsewhere, so their password stays."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={row.roleRef}
                disabled={pending}
                onChange={(e) => run(updateMember(slug, row.userId, { role: e.target.value }))}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {roleOptions}
              </select>
              <button
                disabled={pending}
                onClick={() => {
                  const name = window.prompt("Name (shown on receipts)", row.name);
                  if (name && name.trim() !== row.name) run(renameMember(slug, row.userId, name.trim()));
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
              >
                Rename
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  const pin = window.prompt(`${row.hasPin ? "New" : "Set a"} terminal PIN for ${row.name} (4–6 digits). Leave empty to remove it.`);
                  if (pin === null) return;
                  if (pin.trim() === "") {
                    if (row.hasPin) run(setPin(slug, row.userId, null));
                  } else run(setPin(slug, row.userId, pin.trim()));
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
              >
                {row.hasPin ? "Change PIN" : "Set PIN"}
              </button>
              {!row.isMe && canCreate && !row.roleAllowsPassword && !row.pinOnly && !row.passwordOff && row.soleOrg && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Switch off ${row.name}'s password? They will only sign in with their PIN on a terminal.`)) return;
                    run(switchOffMemberPassword(slug, row.userId));
                  }}
                  className="rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-800 disabled:opacity-40"
                >
                  Switch off password
                </button>
              )}
              {!row.isMe && canCreate && row.roleAllowsPassword && !row.pinOnly && (
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
