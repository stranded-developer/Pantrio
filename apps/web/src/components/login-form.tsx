"use client";

import { useActionState, useEffect } from "react";
import { signIn, type AuthState } from "@/app/login/actions";
import { LogoOnDark } from "./tenant-logo";

// FOKAS staff login, generalised: dark card, large touch targets (iPad).
export function LoginForm({
  title,
  subtitle,
  logoUrl,
  logoOnDarkUrl,
  fallback,
  notice,
}: {
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  logoOnDarkUrl?: string | null;
  fallback: string;
  /** e.g. "You're signed in as … which isn't staff here." */
  notice?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  // A full navigation, so the request passes through proxy.ts (see actions).
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  // ?next= is read in the browser at submit time. Reading it on the server
  // meant a Suspense fallback form that was swapped for the real one —
  // wiping whatever the cashier had already typed.
  const submit = (formData: FormData) => {
    formData.set("next", new URLSearchParams(window.location.search).get("next") ?? "");
    action(formData);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <form action={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-neutral-900 p-8 shadow-xl">
        <input type="hidden" name="fallback" value={fallback} />
        <div>
          <div className="mb-4">
            <LogoOnDark name={title} logoUrl={logoUrl ?? null} logoOnDarkUrl={logoOnDarkUrl ?? null} />
          </div>
          <h1 className="text-xl font-semibold text-neutral-50">Staff Login</h1>
          <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
        </div>

        {notice && <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-200">{notice}</p>}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-neutral-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-3 text-base text-neutral-50 outline-none focus:border-neutral-400"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-neutral-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-3 text-base text-neutral-50 outline-none focus:border-neutral-400"
          />
        </div>

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending || Boolean(state.redirectTo)}
          className="w-full rounded-lg bg-neutral-50 py-3 text-base font-medium text-neutral-900 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
