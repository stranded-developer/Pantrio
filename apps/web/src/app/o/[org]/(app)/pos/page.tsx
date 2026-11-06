import Link from "next/link";
import { discountAppliesOn, type PosTaxRules } from "@pantrio/core";
import { can, requirePermPage } from "@/lib/auth";
import { getDiscounts } from "@/lib/queries/discounts";
import { getPosMenu } from "@/lib/queries/pos";
import { businessDateToday, getTaxSettings, tenantBase } from "@/lib/tenant";
import { PosClient } from "./pos-client";

export default async function PosPage({ params }: PageProps<"/o/[org]/pos">) {
  const { org: slug } = await params;
  const base = await tenantBase(slug);
  const m = await requirePermPage(slug, base, "pos.sell");
  const { org } = m;
  const [{ categories, items }, tax, discounts, today] = await Promise.all([
    getPosMenu(org.id),
    getTaxSettings(org.id),
    getDiscounts(org.id),
    businessDateToday(org.id),
  ]);

  if (categories.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
        No menu categories yet.{" "}
        {can(m, "menu.manage") ? (
          <Link href={`${base}/menu`} className="underline">
            Add some under Menu first.
          </Link>
        ) : (
          "Ask a manager to set up the menu."
        )}
      </p>
    );
  }

  const rules: PosTaxRules = {
    priceMode: tax.price_mode,
    serviceBps: tax.service_bps,
    pb1Bps: tax.pb1_bps,
    pb1OnService: tax.pb1_on_service,
  };
  // Only today's discounts; create_order decides again at the moment of sale.
  return (
    <PosClient
      categories={categories}
      items={items}
      rules={rules}
      discounts={discounts.filter((d) => discountAppliesOn(d, today))}
      businessDay={today}
    />
  );
}
