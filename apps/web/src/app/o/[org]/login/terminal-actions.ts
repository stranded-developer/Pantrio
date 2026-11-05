"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { getTerminal, personStatus, setTerminalCookie, terminalToken, type Person } from "@/lib/terminal";
import { platformOrigin, tenantBase } from "@/lib/tenant";

// PIN sign-in on a registered terminal (P25). SQL checks the terminal token
// and the PIN (and counts wrong guesses); only then does the server mint a
// normal session for that person with the auth admin API — a magic-link
// token verified on the spot, no email sent. From there on everything runs
// as that person through RLS and the money functions, exactly like a
// password sign-in (P22).

export type PinResult = ({ ok: true } & Person) | { ok: false; error: string; locked?: boolean };

type SignInRow =
  | { ok: true; user_id: string; email: string; name: string | null; org_id: string }
  | { ok: false; reason: "terminal" | "locked" | "wrong"; left?: number };

export async function pinSignIn(slug: string, pin: string): Promise<PinResult> {
  const token = await terminalToken();
  if (!token) return { ok: false, error: "This device isn't a registered terminal." };
  if (!hasServiceKey()) return { ok: false, error: "PIN sign-in isn't configured (SUPABASE_SECRET_KEY missing)." };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "Wrong PIN." };

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("terminal_pin_sign_in", { p_token: token, p_pin: pin });
  if (error || !data) return { ok: false, error: "Could not check the PIN. Try again." };
  const row = data as SignInRow;
  if (!row.ok) {
    if (row.reason === "terminal") return { ok: false, error: "This terminal was revoked. Ask the owner to set it up again." };
    if (row.reason === "locked") return { ok: false, locked: true, error: "Locked after 5 wrong PINs." };
    const left = row.left ?? 0;
    return { ok: false, error: left <= 2 ? `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left before the till locks.` : "Wrong PIN." };
  }
  // The token belongs to another restaurant than the page — never cross over.
  const terminal = await getTerminal(slug);
  if (!terminal || terminal.orgId !== row.org_id) return { ok: false, error: "This terminal is for another restaurant." };

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: row.email });
  if (linkError || !link.properties?.hashed_token) return { ok: false, error: "Could not sign in. Try again." };

  const supabase = await createClient();
  // End whoever was signed in here (revokes their refresh token) first.
  await supabase.auth.signOut({ scope: "local" });
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) {
    return {
      ok: false,
      error: /rate limit/i.test(verifyError.message)
        ? "Too many sign-ins right now. Wait a minute and try again."
        : "Could not sign in. Try again.",
    };
  }
  await setTerminalCookie(token); // keep the 400-day clock running

  return { ok: true, ...(await personStatus(supabase, slug, row.org_id, row.user_id)) };
}

/**
 * Locked screen: email the owners a password-reset link. Opening it unlocks
 * this restaurant's terminals (app/auth/confirm); then they pick a new
 * password. At most every 10 minutes (SQL), and only while locked.
 */
export async function sendOwnerReset(slug: string): Promise<{ ok: boolean; message: string }> {
  const token = await terminalToken();
  const terminal = await getTerminal(slug);
  if (!token || !terminal?.hardLocked || !hasServiceKey()) return { ok: false, message: "This terminal isn't locked." };
  const { data: targets } = await createServiceClient().rpc("terminal_reset_targets", { p_token: token });
  if (!targets?.length) return { ok: false, message: "A reset email was sent less than 10 minutes ago. Check the owner's inbox." };
  const { url, key } = supabaseEnv();
  // Plain client: the link is opened on the owner's phone, not this browser.
  const mailer = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const origin = await platformOrigin();
  let sent = 0;
  for (const { email } of targets) {
    const { error } = await mailer.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/account?reset=1` });
    if (!error) sent += 1;
  }
  if (!sent) return { ok: false, message: "Could not send the email. Ask Pantrio support to reset the owner's password." };
  const masked = targets.map(({ email }) => email.replace(/^(.).*?(@.*)$/, "$1•••$2")).join(", ");
  return { ok: true, message: `Reset email sent to ${masked}. Opening the link unlocks this till.` };
}

export type ClockResult = { ok: true; at: string } | { ok: false; error: string };

const photoFile = z
  .instanceof(File)
  .refine((f) => f.size > 0 && f.size <= 512 * 1024 && f.type === "image/jpeg", "Photo must be a JPEG under 512 KB.");

/** Clock in or out on this terminal, with the webcam photo if there is one. */
export async function clock(slug: string, kind: "in" | "out", formData: FormData): Promise<ClockResult> {
  const token = await terminalToken();
  const terminal = await getTerminal(slug);
  if (!token || !terminal) return { ok: false, error: "Clock in and out on a registered terminal." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Enter your PIN first." };

  const supabase = await createClient();
  let photoPath: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const parsed = photoFile.safeParse(photo);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const path = `${terminal.orgId}/${user.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}.jpg`;
    const { error } = await supabase.storage.from("clock-photos").upload(path, parsed.data, { contentType: "image/jpeg" });
    // A failed upload must not stop someone clocking in; the entry shows "no photo".
    if (!error) photoPath = path;
  }

  const { data, error } = await supabase.rpc(kind === "in" ? "clock_in" : "clock_out", {
    p_token: token,
    p_photo: photoPath,
  });
  if (error || !data) return { ok: false, error: error?.message.replace(/^.*?:\s*(?=[A-Z])/, "") ?? "Could not clock." };
  return { ok: true, at: kind === "in" ? data.clock_in_at : (data.clock_out_at ?? data.clock_in_at) };
}

/** Lock the terminal: sign the current person out; the PIN pad comes back. */
export async function lockTerminal(slug: string): Promise<string> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return `${await tenantBase(slug)}/login`;
}
