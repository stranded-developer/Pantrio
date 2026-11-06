import { requirePermPage } from "@/lib/auth";
import { getDiscounts } from "@/lib/queries/discounts";
import { getFullMenu } from "@/lib/queries/pos";
import { businessDateToday, tenantBase } from "@/lib/tenant";
import { DiscountManager } from "./discount-manager";

export default async function DiscountsPage({ params }: PageProps<"/o/[org]/menu/discounts">) {
  const { org: slug } = await params;
  const { org } = await requirePermPage(slug, await tenantBase(slug), "menu.manage");
  const [discounts, { categories, items }, today] = await Promise.all([
    getDiscounts(org.id),
    getFullMenu(org.id),
    businessDateToday(org.id),
  ]);
  return (
    <DiscountManager
      discounts={discounts}
      categories={categories.filter((c) => c.active)}
      items={items.filter((i) => i.active)}
      today={today}
    />
  );
}
