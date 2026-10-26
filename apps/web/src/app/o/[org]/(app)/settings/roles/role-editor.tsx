"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { useTenant } from "../../tenant-context";
import { deleteRole, saveRole, type Result } from "./actions";

export type RoleRow = { id: string; name: string; permissions: Permission[]; members: number };

const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

export function RoleEditor({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const { slug } = useTenant();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const run = (p: Promise<Result>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const r = await p;
      setMessage(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Roles</h1>
          <p className="max-w-2xl text-sm text-neutral-500">
            Tick what each role can open. Changes apply on the staff member&apos;s next page load. Owners always have
            everything, and only owners manage staff, roles and branches.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white">
          New role
        </button>
      </div>

      {message && (
        <p className={`rounded-xl p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}

      {adding && (
        <RoleCard
          role={{ id: "", name: "", permissions: [], members: 0 }}
          pending={pending}
          onSave={(name, perms) => run(saveRole(slug, null, { name, permissions: perms }), `Role “${name}” created.`, () => setAdding(false))}
          onCancel={() => setAdding(false)}
        />
      )}

      {roles.map((role) => (
        <RoleCard
          key={role.id}
          role={role}
          pending={pending}
          onSave={(name, perms) => run(saveRole(slug, role.id, { name, permissions: perms }), `Role “${name}” saved.`)}
          onDelete={() => window.confirm(`Delete the role “${role.name}”?`) && run(deleteRole(slug, role.id), "Role deleted.")}
        />
      ))}
    </div>
  );
}

function RoleCard({
  role,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  role: RoleRow;
  pending: boolean;
  onSave: (name: string, perms: Permission[]) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role.permissions));
  const dirty = name !== role.name || perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));

  const toggle = (p: Permission) =>
    setPerms((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name, e.g. Barista"
          autoFocus={!role.id}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-lg font-semibold outline-none focus:border-neutral-900"
        />
        <span className="text-sm text-neutral-500">
          {role.id ? `${role.members} ${role.members === 1 ? "person" : "people"}` : "New role"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PERMISSIONS.map((p) => (
          <label
            key={p.key}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${perms.has(p.key) ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
          >
            <input type="checkbox" checked={perms.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-5 w-5" />
            <span>
              <span className="block font-medium text-neutral-900">{p.label}</span>
              <span className="block text-xs text-neutral-500">{p.detail}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => setPerms(new Set(PERMISSIONS.map((p) => p.key)))} className={btn}>
            Tick all
          </button>
          <button type="button" onClick={() => setPerms(new Set())} className={btn}>
            Clear
          </button>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className={btn}>
              Cancel
            </button>
          )}
          {onDelete && (
            <button type="button" disabled={pending} onClick={onDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-40">
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={pending || !name.trim() || (!dirty && !!role.id)}
            onClick={() => onSave(name.trim(), [...perms])}
            className="rounded-xl bg-neutral-900 px-5 py-2 font-medium text-white disabled:opacity-40"
          >
            {role.id ? (dirty ? "Save" : "Saved") : "Create role"}
          </button>
        </div>
      </div>
    </section>
  );
}
