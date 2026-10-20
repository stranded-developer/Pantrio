"use client";

import { useActionState } from "react";
import { updateAccount, type AccountState } from "./actions";

const input =
  "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

export function AccountForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateAccount, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-500">{email}</p>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutral-700">Name (shown on receipts)</span>
        <input name="name" defaultValue={name} required className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutral-700">New password</span>
        <input name="password" type="password" autoComplete="new-password" placeholder="Leave blank to keep" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutral-700">Confirm new password</span>
        <input name="confirm" type="password" autoComplete="new-password" className={input} />
      </label>
      {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-neutral-900 py-4 font-medium text-white disabled:opacity-40">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
