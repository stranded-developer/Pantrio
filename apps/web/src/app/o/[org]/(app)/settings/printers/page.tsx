import { requireManagerPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { getOutlets, tenantBase } from "@/lib/tenant";
import { PrinterManager, type DeviceRow } from "./printer-manager";

export default async function PrintersPage({ params }: PageProps<"/o/[org]/settings/printers">) {
  const { org: slug } = await params;
  const { org } = await requireManagerPage(slug, await tenantBase(slug));
  const supabase = await createClient();
  const [{ data }, outlets] = await Promise.all([
    supabase
      .from("print_devices")
      .select("id, name, outlet_id, token_prefix, last_seen_at, revoked_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    getOutlets(org.id),
  ]);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));
  const devices: DeviceRow[] = (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    outlet: outletName.get(d.outlet_id) ?? "",
    tokenPrefix: d.token_prefix,
    lastSeen: d.last_seen_at,
    revoked: d.revoked_at !== null,
  }));
  const { url, key } = supabaseEnv();
  return (
    <PrinterManager
      devices={devices}
      outlets={outlets.filter((o) => o.active)}
      supabaseUrl={url}
      publishableKey={key}
    />
  );
}
