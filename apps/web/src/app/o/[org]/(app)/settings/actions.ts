"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Settings apply to new orders only: each order snapshots the tax rules it
// was sold under (price_mode, service_bps, tax_bps), so a change here never
// restates a past receipt (FOKAS D13 + snapshot rule).

export type Result = { ok: true } | { ok: false; error: string };

const pct = (label: string) =>
  z.coerce
    .number()
    .min(0, `${label} must be between 0 and 99.99.`)
    .max(99.99, `${label} must be between 0 and 99.99.`)
    .transform((v) => Math.round(v * 100)); // % → bps

const tax = z.object({
  price_mode: z.enum(["exclusive", "inclusive"]),
  service_bps: pct("Service charge"),
  pb1_bps: pct("Tax / PB1"),
  pb1_on_service: z.literal("on").optional().transform(Boolean),
  service_is_revenue: z.literal("on").optional().transform(Boolean),
  income_tax_mode: z.enum(["pph_final_umkm", "custom", "none"]),
  income_tax_bps: pct("Income tax"),
  income_tax_free_annual_turnover: z.coerce.number().int("Whole rupiah only.").min(0),
});

export async function updateTaxSettings(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const parsed = tax.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.from("tax_settings").update(parsed.data).eq("org_id", org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

const business = z.object({
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Kuala_Lumpur"]),
  day_cutover_hour: z.coerce.number().int().min(0).max(23),
});

export async function updateBusinessSettings(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const parsed = business.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update(parsed.data)
    .eq("org_id", org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

const MAX_LINES = 6;
const MAX_CHARS = 200;

function clean(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Receipt header/footer. The bridge reads these at print time (FOKAS D36). */
export async function updateReceiptText(slug: string, formData: FormData): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  const header = clean(formData.get("receipt_header"));
  const footer = clean(formData.get("receipt_footer"));
  if (!header) return { ok: false, error: "The header needs at least the shop name." };
  for (const [label, text] of [
    ["Header", header],
    ["Footer", footer],
  ] as const) {
    if (text.length > MAX_CHARS || text.split("\n").length > MAX_LINES) {
      return { ok: false, error: `${label} is too long — keep it to ${MAX_LINES} short lines.` };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({ receipt_header: header, receipt_footer: footer })
    .eq("org_id", org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}

export type LogoKind = "logo_url" | "logo_on_dark_url" | "receipt_logo_url";

/**
 * Point a logo slot at a file the browser just uploaded to Storage (or clear
 * it). Only files in this restaurant's own folder of the `logos` bucket are
 * accepted — the Storage policy already limits who can write there.
 */
export async function saveLogo(slug: string, kind: LogoKind, url: string | null): Promise<Result> {
  const { org } = await requireMembership(slug, "settings.manage");
  if (!["logo_url", "logo_on_dark_url", "receipt_logo_url"].includes(kind)) return { ok: false, error: "Invalid." };
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${org.id}/`;
  if (url !== null && (!url.startsWith(prefix) || url.includes(".."))) return { ok: false, error: "Invalid logo file." };
  const supabase = await createClient();
  const patch =
    kind === "logo_url" ? { logo_url: url } : kind === "logo_on_dark_url" ? { logo_on_dark_url: url } : { receipt_logo_url: url };
  const { error } = await supabase.from("org_settings").update(patch).eq("org_id", org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/o/${slug}`, "layout");
  return { ok: true };
}
