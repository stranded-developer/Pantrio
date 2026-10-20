"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { chooseOutlet } from "./actions";
import { useTenant } from "./tenant-context";

export function OutletSwitcher({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const { slug, outletId } = useTenant();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Branch"
      value={outletId}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await chooseOutlet(slug, e.target.value);
          router.refresh();
        })
      }
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
    >
      {outlets.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
