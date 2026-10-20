"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTenant } from "../../tenant-context";
import { saveOutlet, setOutletActive, type Result } from "./actions";

export function BranchManager({ outlets, isOwner }: { outlets: { id: string; name: string; active: boolean }[]; isOwner: boolean }) {
  const router = useRouter();
  const { slug } = useTenant();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (p: Promise<Result>) =>
    startTransition(async () => {
      const r = await p;
      setError(r.ok ? null : r.error);
      router.refresh();
    });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Branches</h1>
        <p className="text-sm text-neutral-500">
          Each branch has its own orders, customer numbers, kitchen screen and printers. The menu and prices are
          shared. With one branch, nothing about it shows on the till.
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {outlets.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 p-4">
            <span className={o.active ? "font-medium text-neutral-900" : "text-neutral-400 line-through"}>{o.name}</span>
            {isOwner && (
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => {
                    const name = window.prompt("Branch name", o.name);
                    if (name) run(saveOutlet(slug, o.id, name));
                  }}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
                >
                  Rename
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(setOutletActive(slug, o.id, !o.active))}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
                >
                  {o.active ? "Close" : "Reopen"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <button
          disabled={pending}
          onClick={() => {
            const name = window.prompt("New branch name");
            if (name) run(saveOutlet(slug, null, name));
          }}
          className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40"
        >
          Add branch
        </button>
      )}
    </div>
  );
}
