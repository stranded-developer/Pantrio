import Link from "next/link";
import type { PosTaxRules } from "@pantrio/core";
import { can, requirePermPage } from "@/lib/auth";
import { getPosMenu } from "@/lib/queries/pos";
import { getTaxSettings, tenantBase } from "@/lib/tenant";
import { PosClient } from "./pos-client";

export default async function PosPage({ params }: PageProps<"/o/[org]/pos">) {
  const { org: slug } = await params;
  const base = await tenantBase(slug);
  const m = await requirePermPage(slug, base, "pos.sell");
  const { org } = m;
  const [{ categories, items }, tax] = await Promise.all([getPosMenu(org.id), getTaxSettings(org.id)]);

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
  return <PosClient categories={categories} items={items} rules={rules} />;
}
