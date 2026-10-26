import { getProfileName, requireManagerPage, requireUser } from "@/lib/auth";
import { getOrgSettings, getTaxSettings, tenantBase } from "@/lib/tenant";
import { BusinessForm, TaxForm } from "./forms";
import { ReceiptForm } from "./receipt-form";
import { LogoForm } from "./logo-form";

export default async function SettingsPage({ params }: PageProps<"/o/[org]/settings">) {
  const { org: slug } = await params;
  const { org } = await requireManagerPage(slug, await tenantBase(slug));
  const user = await requireUser();
  const [tax, settings, name] = await Promise.all([getTaxSettings(org.id), getOrgSettings(org.id), getProfileName(user.id)]);

  return (
    <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
      <TaxForm values={tax} />
      <div className="space-y-6">
        <LogoForm
          orgId={org.id}
          logoUrl={settings.logoUrl}
          logoOnDarkUrl={settings.logoOnDarkUrl}
          receiptLogoUrl={settings.receiptLogoUrl}
        />
        <BusinessForm timezone={settings.timezone} cutover={settings.dayCutoverHour} />
      </div>
      <div className="lg:col-span-2">
        <ReceiptForm
          header={settings.receiptHeader}
          footer={settings.receiptFooter}
          rules={{ priceMode: tax.price_mode, serviceBps: tax.service_bps, pb1Bps: tax.pb1_bps, pb1OnService: tax.pb1_on_service }}
          receiptLogoUrl={settings.receiptLogoUrl}
          timezone={settings.timezone}
          cashier={name ?? "Kasir"}
        />
      </div>
    </div>
  );
}
