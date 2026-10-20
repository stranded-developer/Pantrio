import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { requirePlatformAdminPage } from "@/lib/auth";

async function Gate({ children }: { children: ReactNode }) {
  await requirePlatformAdminPage();
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <Link href="/admin" className="text-lg font-bold tracking-tight text-neutral-900">
          Pantrio <span className="text-sm font-normal text-neutral-500">Backoffice</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-neutral-600 hover:underline">
            My restaurants
          </Link>
          <SignOutButton to="/login" className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />}>
          <Gate>{children}</Gate>
        </Suspense>
      </main>
    </div>
  );
}
