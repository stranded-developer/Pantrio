import { redirect } from "next/navigation";
import { homePath, requireMembershipPage } from "@/lib/auth";
import { tenantBase } from "@/lib/tenant";

/** A restaurant's home: the first screen this member's role opens. */
export default async function TenantHome({ params }: PageProps<"/o/[org]">) {
  const { org } = await params;
  const base = await tenantBase(org);
  redirect(homePath(await requireMembershipPage(org, base), base));
}
