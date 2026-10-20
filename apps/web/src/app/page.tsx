import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Pantrio</h1>
      <p className="text-lg text-neutral-600">
        A cashier POS for cafés and restaurants — with the real cost and margin of every dish built in.
      </p>
      <div>
        <Link href="/login" className="rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white">
          Staff sign in
        </Link>
      </div>
    </main>
  );
}
