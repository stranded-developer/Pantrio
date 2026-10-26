import { Suspense } from "react";
import { getProfileName, requireMembershipPage, requireUser } from "@/lib/auth";
import { getKitchenOrders } from "@/lib/queries/kitchen";
import { getCurrentOutlet, getOrgSettings, getOutlets, tenantBase } from "@/lib/tenant";
import { KitchenBoard } from "./kitchen-board";

// Outside the (app) group on purpose (FOKAS): the kitchen screen is its own
// device doing one job, so it gets no nav bar to wander off through.
async function Kitchen({ slug }: { slug: string }) {
  const base = await tenantBase(slug);
  const { org } = await requireMembershipPage(slug, base);
  const user = await requireUser();
  const [outlet, outlets, settings, name] = await Promise.all([
    getCurrentOutlet(org.id),
    getOutlets(org.id),
    getOrgSettings(org.id),
    getProfileName(user.id),
  ]);
  if (!outlet) return <p className="p-8 text-white">No active branch.</p>;
  const { pending, done } = await getKitchenOrders(org.id, outlet.id);
  return (
    <KitchenBoard
      pending={pending}
      done={done}
      staffName={name ?? user.email ?? ""}
      title={outlets.filter((o) => o.active).length > 1 ? `${org.name} · ${outlet.name}` : org.name}
      logoUrl={settings.logoUrl}
      logoOnDarkUrl={settings.logoOnDarkUrl}
      slug={slug}
      base={base}
      outletId={outlet.id}
      timezone={settings.timezone}
    />
  );
}

export default function KitchenPage({ params }: PageProps<"/o/[org]/kitchen">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-900" />}>
      {params.then(({ org }) => (
        <Kitchen slug={org} />
      ))}
    </Suspense>
  );
}
