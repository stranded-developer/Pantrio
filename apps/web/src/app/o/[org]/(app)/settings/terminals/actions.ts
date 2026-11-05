"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clearTerminalCookie, getTerminal, setTerminalCookie } from "@/lib/terminal";

// Terminals (P25): the browser that registers itself gets the token as an
// httpOnly cookie — it is never shown, so it can't be copied to a phone.

export type Result = { ok: true } | { ok: false; error: string };

const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "");

export async function registerThisDevice(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "timesheets.manage");
  const parsed = z
    .object({ outlet: z.uuid("Pick a branch."), name: z.string().trim().min(1, "Name this terminal.").max(60) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const previous = await getTerminal(slug);
  const { data: token, error } = await supabase.rpc("create_terminal", {
    p_org: org.id,
    p_outlet: parsed.data.outlet,
    p_name: parsed.data.name,
  });
  if (error || !token) return { ok: false, error: clean(error?.message ?? "Could not register.") };
  // Re-registering replaces this device's old terminal.
  if (previous) await supabase.rpc("revoke_terminal", { p_terminal: previous.id });
  await setTerminalCookie(token);
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export async function revokeTerminal(slug: string, terminalId: string): Promise<Result> {
  await requireMembership(slug, "timesheets.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_terminal", { p_terminal: terminalId });
  if (error) return { ok: false, error: clean(error.message) };
  if ((await getTerminal(slug))?.id === terminalId) await clearTerminalCookie();
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

const options = z.object({
  idle: z.coerce.number().int().min(1, "1 to 120 minutes.").max(120, "1 to 120 minutes."),
  lock_after_sale: z.literal("on").optional().transform(Boolean),
});

export async function saveTerminalOptions(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "timesheets.manage");
  const parsed = options.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_terminal_options", {
    p_org: org.id,
    p_idle_minutes: parsed.data.idle,
    p_lock_after_sale: parsed.data.lock_after_sale,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
