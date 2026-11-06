"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/tenant";
import { zonedLocalToIso } from "./time";

// Corrections to the time clock (P25). SQL requires a reason, refuses a
// manager editing their own hours (owners may), and writes the audit log.

export type Result = { ok: true } | { ok: false; error: string };

const clean = (m: string) => m.replace(/^.*?:\s*(?=[A-Z])/, "");
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.");

export async function editEntry(slug: string, entryId: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "timesheets.manage");
  const parsed = z
    .object({ in: local, out: local.or(z.literal("")), note: z.string().trim().min(1, "Give a reason.").max(300) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { timezone } = await getOrgSettings(org.id);
  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_time_entry", {
    p_entry: entryId,
    p_in: zonedLocalToIso(parsed.data.in, timezone),
    // Empty = still no clock-out; the generated type doesn't know it is nullable.
    p_out: (parsed.data.out ? zonedLocalToIso(parsed.data.out, timezone) : null) as string,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/timesheets`);
  return { ok: true };
}

export async function addEntry(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "timesheets.manage");
  const parsed = z
    .object({
      user: z.uuid("Pick a person."),
      outlet: z.uuid("Pick a branch."),
      in: local,
      out: local,
      note: z.string().trim().min(1, "Give a reason.").max(300),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { timezone } = await getOrgSettings(org.id);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_time_entry", {
    p_org: org.id,
    p_outlet: parsed.data.outlet,
    p_user: parsed.data.user,
    p_in: zonedLocalToIso(parsed.data.in, timezone),
    p_out: zonedLocalToIso(parsed.data.out, timezone),
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/timesheets`);
  return { ok: true };
}

/** Remove a mistaken entry (P28). SQL keeps the whole row in the audit log. */
export async function deleteEntry(slug: string, entryId: string, reason: string): Promise<Result> {
  await requireMembership(slug, "timesheets.manage");
  const note = z.string().trim().min(1, "Give a reason.").max(300).safeParse(reason);
  if (!note.success) return { ok: false, error: note.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_time_entry", { p_entry: entryId, p_note: note.data });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath(`/o/${slug}/timesheets`);
  return { ok: true };
}
