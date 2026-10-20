"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reprintReceipt } from "../../pos/actions";
import { useTenant } from "../../tenant-context";

type LastPrint = {
  kind: string;
  status: string;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
} | null;

export function ReprintButton({
  orderId,
  lastPrint,
}: {
  orderId: string;
  lastPrint: LastPrint;
}) {
  const router = useRouter();
  const { slug, timezone } = useTenant();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The status line follows the bridge live: queued → printed (or failed).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`print-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs", filter: `order_id=eq.${orderId}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, router]);

  const status = describe(lastPrint, timezone);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="min-w-0 text-sm">
        <p className={`font-medium ${status.tone}`}>{status.label}</p>
        {status.detail && <p className="truncate text-neutral-500">{status.detail}</p>}
        {error && <p className="text-red-700">{error}</p>}
      </div>

      <button
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await reprintReceipt(slug, orderId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
        disabled={pending}
        className="shrink-0 rounded-xl border border-neutral-300 px-5 py-3 font-medium text-neutral-800 disabled:opacity-40"
      >
        {pending ? "Queuing…" : "Reprint receipt"}
      </button>
    </div>
  );
}

function describe(job: LastPrint, timeZone: string): { label: string; detail?: string; tone: string } {
  if (!job) return { label: "No receipt printed", tone: "text-neutral-500" };

  const what = job.kind === "reprint" ? "Reprint" : "Receipt";

  switch (job.status) {
    case "printed":
      return { label: `${what} printed ${time(job.printed_at, timeZone)}`, tone: "text-green-700" };
    case "failed":
      return {
        label: `${what} did not print`,
        detail: job.last_error ?? undefined,
        tone: "text-red-700",
      };
    default:
      return { label: `${what} waiting for printer…`, tone: "text-amber-700" };
  }
}

function time(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}
