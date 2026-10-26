"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "./tenant-context";

type NavItem = { path: string; label: string; managerOnly?: boolean };

const ITEMS: NavItem[] = [
  { path: "/pos", label: "POS" },
  { path: "/orders", label: "Orders" },
  { path: "/kitchen", label: "Kitchen" },
  { path: "/sales", label: "Sales", managerOnly: true },
  { path: "/menu", label: "Menu", managerOnly: true },
  { path: "/recipes", label: "Recipes", managerOnly: true },
  { path: "/ingredients", label: "Ingredients", managerOnly: true },
  { path: "/settings", label: "Settings", managerOnly: true },
];

export function Nav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();
  const { base } = useTenant();

  // Hiding a link is convenience only — every page, action and SQL function
  // re-checks the role (FOKAS D14).
  return (
    <nav className="flex flex-wrap gap-1">
      {ITEMS.filter((item) => !item.managerOnly || isManager).map((item) => {
        const href = `${base}${item.path}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.path}
            href={href}
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
