import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-white p-8 text-center shadow-sm">
      <p className="font-medium text-neutral-900">Not found</p>
      <p className="text-sm text-neutral-500">It may have been removed, or your account can&apos;t open it.</p>
      <Link href="/dashboard" className="text-sm text-neutral-700 underline">
        Back
      </Link>
    </div>
  );
}
