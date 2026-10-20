import { redirect } from "next/navigation";
import { tenantBase } from "@/lib/tenant";

export default async function TenantHome({ params }: PageProps<"/o/[org]">) {
  const { org } = await params;
  redirect(`${await tenantBase(org)}/pos`);
}
