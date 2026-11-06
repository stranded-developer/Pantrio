import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { getProfileName, requireMembershipPage, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTerminal } from "@/lib/terminal";
import { getCurrentOutlet, getOrgSettings, getOutlets, tenantBase } from "@/lib/tenant";
import { Nav } from "./nav";
import { OutletSwitcher } from "./outlet-switcher";
import { ReadyAlerts } from "./ready-alerts";
import { LockButton, TerminalLock } from "./terminal-lock";
import { TenantProvider } from "./tenant-context";

// FOKAS admin shell, per restaurant. Everything that reads the session sits
// inside <Suspense> (Cache Components).
async function Shell({ slug, children }: { slug: string; children: ReactNode }) {
  const base = await tenantBase(slug);
  const m = await requireMembershipPage(slug, base);
  const { org } = m;
  const user = await requireUser();
  const [settings, outlet, outlets, name, terminal] = await Promise.all([
    getOrgSettings(org.id),
    getCurrentOutlet(org.id),
    getOutlets(org.id),
    getProfileName(user.id),
    getTerminal(slug),
  ]);

  // On a terminal: Lock (hand over, stay on shift) and, while on shift,
  // Clock out (ends the shift with a photo, then locks) — P26.
  const onShift = terminal
    ? Boolean(
        ((await (await createClient()).rpc("my_clock_status", { p_org: org.id })).data as { clocked_in_at?: string } | null)
          ?.clocked_in_at
      )
    : false;

  if (!outlet) {
    return <p className="p-8 text-neutral-600">This restaurant has no active branch. Ask the owner to add one.</p>;
  }
  const activeOutlets = outlets.filter((o) => o.active);

  return (
    <TenantProvider
      tenant={{ slug, base, orgId: org.id, outletId: outlet.id, timezone: settings.timezone }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-6">
          <Link href={base || "/"}>
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant logo, any host
              <img src={settings.logoUrl} alt={org.name} className="h-7 w-auto" />
            ) : (
              <p className="text-lg font-bold tracking-tight text-neutral-900">{org.name}</p>
            )}
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Cafe POS{activeOutlets.length > 1 ? ` · ${outlet.name}` : ""}
            </p>
          </Link>
          <Nav permissions={m.permissions} isOwner={m.isOwner} tableService={outlet.table_service} />
        </div>
        <div className="flex items-center gap-4">
          {activeOutlets.length > 1 && <OutletSwitcher outlets={activeOutlets} />}
          <Link href="/account" className="text-right">
            <p className="text-sm font-medium text-neutral-900">{name ?? user.email}</p>
            <p className="text-xs text-neutral-500">{m.roleName}</p>
          </Link>
          {terminal ? (
            <div className="flex gap-2">
              {onShift && (
                // A full navigation: the lock screen takes it from here.
                <a
                  href={`${base}/login?clock=out`}
                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Clock out
                </a>
              )}
              <LockButton
                slug={slug}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              />
            </div>
          ) : (
            <SignOutButton
              to={`${base}/login`}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            />
          )}
        </div>
      </header>
      <main className="flex-1 p-3 sm:p-6">{children}</main>
      <ReadyAlerts />
      {terminal && (
        <TerminalLock slug={slug} idleMinutes={terminal.idleMinutes} lockAfterSale={terminal.lockAfterSale} />
      )}
    </TenantProvider>
  );
}

export default function TenantLayout({ children, params }: LayoutProps<"/o/[org]">) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <Suspense fallback={<div className="h-[73px] border-b border-neutral-200 bg-white" />}>
        {params.then(({ org }) => (
          <Shell slug={org}>{children}</Shell>
        ))}
      </Suspense>
    </div>
  );
}
