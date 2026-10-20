import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { getMemberships, isPlatformAdmin, requireUser } from "@/lib/auth";

// After a platform-host sign-in: one restaurant → straight to its till;
// several → pick; platform admin with none → the backoffice.
async function Chooser() {
  await requireUser();
  const [memberships, admin] = await Promise.all([getMemberships(), isPlatformAdmin()]);
  if (memberships.length === 1 && !admin) redirect(`/o/${memberships[0]!.org.slug}/pos`);
  if (memberships.length === 0 && admin) redirect("/admin");

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Choose a restaurant</h1>
      {memberships.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-neutral-600 shadow-sm">
          Your account isn&apos;t linked to a restaurant yet. Ask the owner to add you under Settings → Staff.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {memberships.map((m) => (
            <li key={m.org.id}>
              <Link href={`/o/${m.org.slug}/pos`} className="flex justify-between p-4 hover:bg-neutral-50">
                <span className="font-medium text-neutral-900">{m.org.name}</span>
                <span className="text-sm capitalize text-neutral-500">{m.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3 text-sm">
        {admin && (
          <Link href="/admin" className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700">
            Backoffice
          </Link>
        )}
        <Link href="/account" className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700">
          Account
        </Link>
        <SignOutButton to="/login" className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700" />
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <Suspense fallback={<p className="p-8 text-neutral-400">Loading…</p>}>
        <Chooser />
      </Suspense>
    </div>
  );
}
