"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidOrder } from "../../pos/actions";
import { useTenant } from "../../tenant-context";

export function VoidButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { slug } = useTenant();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleVoid() {
    setPending(true);
    setError(null);

    const result = await voidOrder(slug, orderId, reason);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-red-300 px-5 py-3 font-medium text-red-700 hover:bg-red-50"
      >
        Void order
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <div>
        <p className="font-medium text-red-900">Void this order?</p>
        <p className="mt-1 text-sm text-red-700">
          The order stays in the records marked as voided, and the payment is
          reversed. This is written to the audit log.
        </p>
      </div>

      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required)"
        autoFocus
        className="w-full rounded-lg border border-red-300 bg-white px-3 py-3 outline-none focus:border-red-500"
      />

      {error && <p className="text-sm font-medium text-red-800">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="flex-1 rounded-lg border border-neutral-300 bg-white py-3 font-medium text-neutral-700 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleVoid}
          disabled={pending || reason.trim().length === 0}
          className="flex-1 rounded-lg bg-red-700 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Voiding…" : "Confirm void"}
        </button>
      </div>
    </div>
  );
}
