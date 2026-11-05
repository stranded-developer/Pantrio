import { requirePermPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTerminal } from "@/lib/terminal";
import { getOutlets, tenantBase } from "@/lib/tenant";
import { TerminalManager, type TerminalRow } from "./terminal-manager";

export default async function TerminalsPage({ params }: PageProps<"/o/[org]/settings/terminals">) {
  const { org: slug } = await params;
  const { org } = await requirePermPage(slug, await tenantBase(slug), "timesheets.manage");
  const supabase = await createClient();
  const [{ data }, { data: settings }, outlets, thisDevice] = await Promise.all([
    supabase
      .from("terminals")
      .select("id, name, outlet_id, token_prefix, last_seen_at, revoked_at, hard_locked_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("org_settings")
      .select("terminal_idle_minutes, terminal_lock_after_sale")
      .eq("org_id", org.id)
      .single(),
    getOutlets(org.id),
    getTerminal(slug),
  ]);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));
  const rows: TerminalRow[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    outlet: outletName.get(t.outlet_id) ?? "",
    tokenPrefix: t.token_prefix,
    lastSeen: t.last_seen_at,
    revoked: t.revoked_at !== null,
    lockedAt: t.hard_locked_at,
    isThisDevice: t.id === thisDevice?.id,
  }));
  return (
    <TerminalManager
      rows={rows}
      outlets={outlets.filter((o) => o.active)}
      idleMinutes={settings?.terminal_idle_minutes ?? 5}
      lockAfterSale={settings?.terminal_lock_after_sale ?? false}
      thisDevice={thisDevice ? { name: thisDevice.name, outlet: thisDevice.outletName } : null}
    />
  );
}
