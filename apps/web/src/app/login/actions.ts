"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; redirectTo?: string };

const credentials = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/** Same-site relative paths only — never an open redirect. */
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// Invite-only (P19): there is no sign-up. Accounts are created by a
// restaurant owner (Settings → Staff) or by a platform admin.
//
// Both actions hand the destination back to the browser instead of calling
// redirect(): a Server Action redirect is rendered internally, *without*
// passing through proxy.ts, so on a restaurant's own domain "/" would render
// the platform's page instead of being rewritten to that restaurant.
export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Invalid email or password." };
  return { redirectTo: safeNext(formData.get("next"), String(formData.get("fallback") ?? "/dashboard")) };
}

export async function signOut(to: string): Promise<string> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return safeNext(to, "/login");
}
