"use client";

import { useState } from "react";

/** A link plus a Copy button — for sending a restaurant its login address. */
export function CopyLink({ href, label }: { href: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {label && <span className="text-neutral-500">{label}</span>}
      <a href={href} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-neutral-900 underline-offset-2 hover:underline">
        {href.replace(/^https?:\/\//, "")}
      </a>
      <button
        type="button"
        onClick={async (e) => {
          e.preventDefault();
          await navigator.clipboard.writeText(href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
