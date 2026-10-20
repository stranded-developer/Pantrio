"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Print bridges authenticate with per-device tokens (P18). The token is
// generated in SQL, returned once, and only its hash is stored.

export type IssueResult = { ok: true; token: string } | { ok: false; error: string };

export async function issuePrinterToken(slug: string, outletId: string, name: string): Promise<IssueResult> {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  const parsed = z.object({ outletId: z.uuid(), name: z.string().trim().min(1, "Name the printer.").max(60) }).safeParse({ outletId, name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_print_device", {
    p_org: org.id,
    p_outlet: parsed.data.outletId,
    p_name: parsed.data.name,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the printer." };
  revalidatePath(`/o/${slug}/settings/printers`);
  return { ok: true, token: data };
}

export async function revokePrinter(slug: string, deviceId: string): Promise<{ ok: boolean; error?: string }> {
  await requireMembership(slug, ["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_print_device", { p_device: deviceId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}/settings/printers`);
  return { ok: true };
}
