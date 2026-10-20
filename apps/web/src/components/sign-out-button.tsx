"use client";

import { useTransition } from "react";
import { signOut } from "@/app/login/actions";

export function SignOutButton({ to, className }: { to: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Full navigation through proxy.ts — see app/login/actions.ts.
          window.location.assign(await signOut(to));
        })
      }
      className={className}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
