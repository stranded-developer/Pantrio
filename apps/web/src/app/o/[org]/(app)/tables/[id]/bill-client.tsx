"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { BillScreen as Screen } from "./bill-screen";

// The draft round is kept in localStorage (a waiter's phone may reload);
// reading it during render can't be server-rendered (FOKAS D9).
const BillScreen = dynamic(() => import("./bill-screen").then((mod) => mod.BillScreen), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center text-neutral-400">Loading table…</div>,
});

export function BillClient(props: ComponentProps<typeof Screen>) {
  return <BillScreen {...props} />;
}
