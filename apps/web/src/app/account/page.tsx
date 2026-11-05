import Link from "next/link";
import { Suspense } from "react";
import { getProfileName, requireUser } from "@/lib/auth";
import { AccountForm } from "./account-form";

export const metadata = { title: "Account · Pantrio" };

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = await requireUser();
  const name = (await getProfileName(user.id)) ?? "";
  // Arrived from a password-reset email (P26): that already unlocked any
  // locked terminals of the restaurants this person owns.
  const reset = (await searchParams).reset === "1";
  return (
    <>
      {reset && (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
          Email confirmed — any locked tills of your restaurants are unlocked. Now set a new password below.
        </p>
      )}
      <AccountForm name={name} email={user.email ?? ""} />
    </>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">Your account</h1>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />}>
          <Account searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
