// Permission vocabulary — mirrors permission_keys() in
// supabase/migrations/00000000000008_roles_permissions.sql (the boundary).
// Owners have every permission and alone manage staff, roles and branches.

export const PERMISSIONS = [
  { key: "pos.sell", label: "POS", detail: "Take orders and cash payments", path: "/pos" },
  { key: "orders.view", label: "Orders", detail: "See orders by day, reprint receipts", path: "/orders" },
  { key: "orders.void", label: "Void orders", detail: "Cancel a paid order the same business day", path: null },
  { key: "kitchen.view", label: "Kitchen", detail: "Kitchen screen; mark orders done", path: "/kitchen" },
  { key: "sales.view", label: "Sales", detail: "Takings, top items, margins; ingredient cost on orders", path: "/sales" },
  { key: "profit.manage", label: "Profit", detail: "Monthly profit, staff wages, rent and bills", path: "/profit" },
  { key: "menu.manage", label: "Menu", detail: "Menu items, prices and categories", path: "/menu" },
  { key: "recipes.manage", label: "Recipes", detail: "Recipes and prep recipes", path: "/recipes" },
  { key: "ingredients.manage", label: "Ingredients", detail: "Ingredients, brands, prices, suppliers", path: "/ingredients" },
  { key: "settings.manage", label: "Settings", detail: "Tax & service, receipt, logo, business day", path: "/settings" },
  { key: "printers.manage", label: "Printers", detail: "Add and revoke receipt printer keys", path: "/settings/printers" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export function isPermission(v: string): v is Permission {
  return (ALL_PERMISSIONS as string[]).includes(v);
}

/** Where to send someone after sign-in: the first screen their role opens. */
export function firstAllowedPath(perms: readonly Permission[], isOwner: boolean): string | null {
  if (isOwner) return "/pos";
  for (const p of PERMISSIONS) if (p.path && perms.includes(p.key)) return p.path;
  return null;
}
