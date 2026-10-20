import { requireManagerPage } from "@/lib/auth";
import { getFullMenu } from "@/lib/queries/pos";
import { getTaxSettings, tenantBase } from "@/lib/tenant";
import { MenuManager } from "./menu-manager";

export default async function MenuPage({ params }: PageProps<"/o/[org]/menu">) {
  const { org: slug } = await params;
  const { org } = await requireManagerPage(slug, await tenantBase(slug));
  const [{ categories, items }, tax] = await Promise.all([getFullMenu(org.id), getTaxSettings(org.id)]);
  return <MenuManager categories={categories} items={items} priceMode={tax.price_mode} />;
}
