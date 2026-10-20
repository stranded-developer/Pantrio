"use client";

import dynamic from "next/dynamic";
import type { PosTaxRules } from "@pantrio/core";
import type { MenuCategory, MenuItem } from "@/lib/queries/pos";

// The terminal restores an in-progress cart from localStorage during render;
// server-rendering it would be a hydration mismatch (FOKAS D9).
const PosTerminal = dynamic(() => import("./pos-terminal").then((mod) => mod.PosTerminal), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center text-neutral-400">Loading terminal…</div>
  ),
});

export function PosClient(props: { categories: MenuCategory[]; items: MenuItem[]; rules: PosTaxRules }) {
  return <PosTerminal {...props} />;
}
