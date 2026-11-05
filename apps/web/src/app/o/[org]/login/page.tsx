import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { findMembership, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTerminal, personStatus } from "@/lib/terminal";
import { tenantBase } from "@/lib/tenant";
import { TerminalLogin } from "./pin-pad";

async function TenantLogin({ params, searchParams }: PageProps<"/o/[org]/login">) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_public_info", { p_slug: org });
  const tenant = data?.[0];
  if (!tenant) notFound();
  const base = await tenantBase(org);

  // A registered terminal always shows its own screen — PIN pad, never an
  // email form (P26). Checked before the redirect below: a PIN sign-in
  // re-renders this page signed in, and must stay on the clock screen.
  const terminal = await getTerminal(org);
  if (terminal) {
    // Signed in already (e.g. Clock out in the header): their own screen.
    const me = await getCurrentUser();
    const current = me && !terminal.hardLocked && (await findMembership(org)) ? await personStatus(supabase, org, terminal.orgId, me.id) : null;
    return (
      <TerminalLogin
        slug={org}
        title={tenant.name}
        terminalName={terminal.name}
        logoUrl={tenant.logo_url}
        logoOnDarkUrl={tenant.logo_on_dark_url}
        hardLocked={terminal.hardLocked}
        current={current}
        start={sp.clock === "out" ? "clock-out" : "welcome"}
      />
    );
  }

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
