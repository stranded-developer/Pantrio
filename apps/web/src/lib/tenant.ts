import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { businessDate } from "@pantrio/core";
import { createClient } from "@/lib/supabase/server";

// Tenancy helpers. On the platform host a restaurant lives at /o/<slug>/…;
// on its own domain proxy.ts rewrites to the same routes and sets
// x-pantrio-tenant, so links drop the /o/<slug> prefix (P17).

export const TENANT_HEADER = "x-pantrio-tenant";

/** Path prefix for links inside a tenant: "" on its own domain, "/o/<slug>" otherwise. */
export async function tenantBase(slug: string): Promise<string> {
  const h = await headers();
  return h.get(TENANT_HEADER) === slug ? "" : `/o/${slug}`;
}

export function outletCookie(orgId: string) {
  return `pantrio-outlet-${orgId}`;
}

export type OrgSettings = {
  timezone: string;
  dayCutoverHour: number;
  receiptHeader: string;
  receiptFooter: string;
  logoUrl: string | null;
};

export const getOrgSettings = cache(async (orgId: string): Promise<OrgSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("org_settings").select("*").eq("org_id", orgId).single();
  if (error || !data) throw new Error(`Could not load settings: ${error?.message ?? "missing"}`);
  return {
    timezone: data.timezone,
    dayCutoverHour: data.day_cutover_hour,
    receiptHeader: data.receipt_header,
    receiptFooter: data.receipt_footer,
    logoUrl: data.logo_url,
  };
});

export const getTaxSettings = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tax_settings").select("*").eq("org_id", orgId).single();
  if (error || !data) throw new Error(`Could not load tax settings: ${error?.message ?? "missing"}`);
  return data;
});

export const getOutlets = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlets")
    .select("id, name, active")
    .eq("org_id", orgId)
    .order("created_at");
  return data ?? [];
});

/** The outlet this device is working in: its saved choice, else the first active one. */
export const getCurrentOutlet = cache(async (orgId: string) => {
  const outlets = (await getOutlets(orgId)).filter((o) => o.active);
  const saved = (await cookies()).get(outletCookie(orgId))?.value;
  return outlets.find((o) => o.id === saved) ?? outlets[0] ?? null;
});

export async function businessDateToday(orgId: string): Promise<string> {
  await connection();
  const s = await getOrgSettings(orgId);
  return businessDate(new Date(), s.timezone, s.dayCutoverHour);
}

/** https://<this deployment's host>, for links the backoffice hands out. */
export async function platformOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
