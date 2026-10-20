"use client";

import { useActionState, useEffect } from "react";
import { signIn, type AuthState } from "@/app/login/actions";

// FOKAS staff login, generalised: dark card, large touch targets (iPad).
export function LoginForm({
  title,
  subtitle,
  logoUrl,
  next,
  fallback,
}: {
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  next?: string;
  fallback: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  // A full navigation, so the request passes through proxy.ts (see actions).
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <form action={action} className="w-full max-w-sm space-y-5 rounded-2xl bg-neutral-900 p-8 shadow-xl">
        <input type="hidden" name="next" value={next ?? ""} />
        <input type="hidden" name="fallback" value={fallback} />
        <div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded, any host
            <img src={logoUrl} alt={title} className="mb-4 h-10 w-auto" />
          ) : (
            <p className="mb-4 text-2xl font-bold tracking-tight text-neutral-50">{title}</p>
          )}
          <h1 className="text-xl font-semibold text-neutral-50">Staff Login</h1>
          <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
        </div>

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
