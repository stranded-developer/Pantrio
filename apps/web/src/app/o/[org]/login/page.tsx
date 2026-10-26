import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { findMembership, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tenantBase } from "@/lib/tenant";

async function TenantLogin({ params }: PageProps<"/o/[org]/login">) {
  const { org } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_public_info", { p_slug: org });
  const tenant = data?.[0];
  if (!tenant) notFound();
  const base = await tenantBase(org);

  // Already staff here → the till. Signed in as someone else → the form, so
  // they can switch account (signing in replaces the session).
  const user = await getCurrentUser();
  if (user && (await findMembership(org))) redirect(base || "/");
  const notice = user
    ? `You're signed in as ${user.email ?? "another account"}, which isn't a staff account at ${tenant.name}. Sign in with a ${tenant.name} account below.`
    : undefined;

  return (
    <LoginForm
      notice={notice}
      title={tenant.name}
      subtitle="Cafe POS"
      logoUrl={tenant.logo_url}
      logoOnDarkUrl={tenant.logo_on_dark_url}
      fallback={base || "/"}
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
