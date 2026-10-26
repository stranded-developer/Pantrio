import { Suspense } from "react";
import { requireMembershipPage } from "@/lib/auth";
import { tenantBase } from "@/lib/tenant";
import { SettingsTabs } from "./tabs";

async function Tabs({ slug }: { slug: string }) {
  const m = await requireMembershipPage(slug, await tenantBase(slug));
  return <SettingsTabs permissions={m.permissions} isOwner={m.isOwner} />;
}

export default function SettingsLayout({ children, params }: LayoutProps<"/o/[org]/settings">) {
  return (
    <div className="space-y-6">
      <Suspense>{params.then(({ org }) => <Tabs slug={org} />)}</Suspense>
      {children}
    </div>
  );
}
