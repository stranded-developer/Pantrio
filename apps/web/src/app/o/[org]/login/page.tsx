import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { tenantBase } from "@/lib/tenant";

async function TenantLogin({ params, searchParams }: PageProps<"/o/[org]/login">) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_public_info", { p_slug: org });
  const tenant = data?.[0];
  if (!tenant) notFound();
  const base = await tenantBase(org);
  return (
    <LoginForm
      title={tenant.name}
      subtitle="Cafe POS"
      logoUrl={tenant.logo_url}
      next={typeof sp.next === "string" ? sp.next : undefined}
      fallback={`${base}/pos`}
    />
  );
}

export default function Page(props: PageProps<"/o/[org]/login">) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-950" />}>
      <TenantLogin {...props} />
    </Suspense>
  );
}
