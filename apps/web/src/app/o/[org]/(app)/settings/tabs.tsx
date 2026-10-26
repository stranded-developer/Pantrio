"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import { useTenant } from "../tenant-context";

const TABS: { path: string; label: string; need: Permission | "owner" }[] = [
  { path: "/settings", label: "General", need: "settings.manage" },
  { path: "/settings/staff", label: "Staff", need: "owner" },
  { path: "/settings/roles", label: "Roles", need: "owner" },
  { path: "/settings/printers", label: "Printers", need: "printers.manage" },
  { path: "/settings/branches", label: "Branches", need: "owner" },
];

export function SettingsTabs({ permissions, isOwner }: { permissions: Permission[]; isOwner: boolean }) {
  const pathname = usePathname();
  const { base } = useTenant();
  const tabs = TABS.filter((t) => isOwner || (t.need !== "owner" && permissions.includes(t.need)));
  if (tabs.length < 2) return null;
  return (
    <div className="flex w-fit flex-wrap rounded-lg bg-neutral-200 p-1">
      {tabs.map((tab) => {
        const href = `${base}${tab.path}`;
        const active = tab.path === "/settings" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={tab.path}
            href={href}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
