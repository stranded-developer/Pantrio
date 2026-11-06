"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import { useTenant } from "./tenant-context";

// One tab per screen; shown only if the role may open it. Hiding a link is
// convenience only — pages, actions and SQL check again (FOKAS D14, P24).
const ITEMS: { path: string; label: string; perm: Permission | Permission[] | "owner"; tables?: true }[] = [
  { path: "/tables", label: "Tables", perm: "pos.sell", tables: true },
  { path: "/pos", label: "POS", perm: "pos.sell" },
  { path: "/orders", label: "Orders", perm: "orders.view" },
  { path: "/kitchen", label: "Kitchen", perm: "kitchen.view" },
  { path: "/sales", label: "Sales", perm: "sales.view" },
  { path: "/profit", label: "Profit", perm: "profit.manage" },
  { path: "/menu", label: "Menu", perm: "menu.manage" },
  { path: "/recipes", label: "Recipes", perm: "recipes.manage" },
  { path: "/ingredients", label: "Ingredients", perm: "ingredients.manage" },
  { path: "/timesheets", label: "Timesheets", perm: "timesheets.manage" },
];

export function settingsPath(perms: readonly Permission[], isOwner: boolean): string | null {
  if (isOwner || perms.includes("settings.manage")) return "/settings";
  if (perms.includes("printers.manage")) return "/settings/printers";
  if (perms.includes("timesheets.manage")) return "/settings/terminals";
  return null;
}

export function Nav({
  permissions,
  isOwner,
  tableService,
}: {
  permissions: Permission[];
  isOwner: boolean;
  /** This branch serves tables (P29): show the floor plan tab. */
  tableService: boolean;
}) {
  const pathname = usePathname();
  const { base } = useTenant();
  const allowed = (perm: Permission | Permission[] | "owner") =>
    isOwner || (perm !== "owner" && (Array.isArray(perm) ? perm : [perm]).some((p) => permissions.includes(p)));
  const settings = settingsPath(permissions, isOwner);
  const items = [
    ...ITEMS.filter((i) => allowed(i.perm) && (!i.tables || tableService)).map((i) => ({ href: `${base}${i.path}`, label: i.label, match: `${base}${i.path}` })),
    ...(settings ? [{ href: `${base}${settings}`, label: "Settings", match: `${base}/settings` }] : []),
  ];

  return (
    <nav className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = pathname.startsWith(item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
