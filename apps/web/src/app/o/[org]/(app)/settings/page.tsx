import { requireManagerPage } from "@/lib/auth";
import { getOrgSettings, getTaxSettings, tenantBase } from "@/lib/tenant";
import { BusinessForm, ReceiptForm, TaxForm } from "./forms";

export default async function SettingsPage({ params }: PageProps<"/o/[org]/settings">) {
  const { org: slug } = await params;
  const { org } = await requireManagerPage(slug, await tenantBase(slug));
  const [tax, settings] = await Promise.all([getTaxSettings(org.id), getOrgSettings(org.id)]);

  return (
    <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
      <TaxForm values={tax} />
      <div className="space-y-6">
        <BusinessForm timezone={settings.timezone} cutover={settings.dayCutoverHour} logoUrl={settings.logoUrl} />
        <ReceiptForm header={settings.receiptHeader} footer={settings.receiptFooter} />
      </div>
    </div>
  );
}
