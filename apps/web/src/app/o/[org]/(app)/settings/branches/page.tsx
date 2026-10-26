import { requireOwnerPage } from "@/lib/auth";
import { getOutlets, tenantBase } from "@/lib/tenant";
import { BranchManager } from "./branch-manager";

export default async function BranchesPage({ params }: PageProps<"/o/[org]/settings/branches">) {
  const { org: slug } = await params;
  const { org } = await requireOwnerPage(slug, await tenantBase(slug));
  return <BranchManager outlets={await getOutlets(org.id)} isOwner />;
}
