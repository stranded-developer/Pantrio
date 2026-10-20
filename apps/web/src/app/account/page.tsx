import Link from "next/link";
import { Suspense } from "react";
import { getProfileName, requireUser } from "@/lib/auth";
import { AccountForm } from "./account-form";

export const metadata = { title: "Account · Pantrio" };

async function Account() {
  const user = await requireUser();
  const name = (await getProfileName(user.id)) ?? "";
  return <AccountForm name={name} email={user.email ?? ""} />;
}

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">Your account</h1>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />}>
          <Account />
        </Suspense>
      </div>
    </main>
  );
}
