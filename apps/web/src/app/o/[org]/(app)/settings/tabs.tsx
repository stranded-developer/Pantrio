"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "../tenant-context";

const TABS = [
  { path: "/settings", label: "General" },
  { path: "/settings/staff", label: "Staff" },
  { path: "/settings/printers", label: "Printers" },
  { path: "/settings/branches", label: "Branches" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { base } = useTenant();
  return (
    <div className="flex w-fit rounded-lg bg-neutral-200 p-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.path}`;
        const active = tab.path === "/settings" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={tab.path}
            href={href}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${
              active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
