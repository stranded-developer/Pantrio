import { requireMembershipPage } from "@/lib/auth";
import { tenantBase } from "@/lib/tenant";

export default async function NoAccess({ params }: PageProps<"/o/[org]/no-access">) {
  const { org } = await params;
  const m = await requireMembershipPage(org, await tenantBase(org));
  return (
    <div className="mx-auto max-w-md space-y-2 rounded-2xl bg-white p-8 text-center shadow-sm">
      <p className="font-medium text-neutral-900">Your role has no screens yet</p>
      <p className="text-sm text-neutral-500">
        You&apos;re signed in to {m.org.name} as <span className="font-medium">{m.roleName}</span>, which doesn&apos;t
        open any screen. Ask the owner to tick some permissions for this role under Settings → Roles.
      </p>
    </div>
  );
}
