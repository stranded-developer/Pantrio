"use client";

import { useActionState, useState } from "react";
import { createRestaurant, type Result } from "../../actions";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function NewRestaurantForm() {
  const [state, action, pending] = useActionState<Result | null, FormData>(createRestaurant, null);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <form action={action} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-neutral-700">Restaurant name</span>
          <input name="name" required className={input} onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-neutral-700">Address (/o/…)</span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(e.target.value);
            }}
            className={input}
          />
        </label>
      </div>
      <p className="pt-2 text-sm font-medium text-neutral-700">Owner login</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="ownerName" placeholder="Owner name" required className={input} />
        <input name="ownerEmail" type="email" placeholder="Owner email" required className={input} />
        <input name="ownerPassword" type="text" placeholder="Starting password" className={input} />
      </div>
      <p className="text-xs text-neutral-500">
        If the email already has a Pantrio login, it is linked and the password field is ignored. A default “Main”
        branch, PB1 10% tax settings and a receipt header are created.
      </p>
      {state && !state.ok && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-neutral-900 py-4 font-medium text-white disabled:opacity-40">
        {pending ? "Creating…" : "Create restaurant"}
      </button>
    </form>
  );
}
