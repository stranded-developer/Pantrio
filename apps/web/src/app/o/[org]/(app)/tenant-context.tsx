"use client";

import { createContext, use, type ReactNode } from "react";

export type Tenant = {
  slug: string;
  /** "" on the restaurant's own domain, "/o/<slug>" on the platform host. */
  base: string;
  orgId: string;
  outletId: string;
  timezone: string;
};

const TenantContext = createContext<Tenant | null>(null);

export function TenantProvider({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
  return <TenantContext value={tenant}>{children}</TenantContext>;
}

export function useTenant(): Tenant {
  const tenant = use(TenantContext);
  if (!tenant) throw new Error("useTenant must be used inside TenantProvider");
  return tenant;
}
