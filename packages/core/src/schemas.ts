import { z } from "zod";
import { UNIT_CODES, type UnitCode } from "./units";

// Wire formats shared by the web app, the public API and @pantrio/sdk.
// One schema validates the form, the Server Action and the API (plan §2).

export const unitCode = z.enum(UNIT_CODES as [UnitCode, ...UnitCode[]]);

/** Integer rupiah, never a float (P5). */
export const rupiah = z.number().int().nonnegative();

export const bps = z.number().int().min(0).max(10_000);

export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

export const taxSettings = z.object({
  priceMode: z.enum(["exclusive", "inclusive"]),
  pb1Bps: bps,
  serviceBps: bps,
  pb1OnService: z.boolean(),
  serviceIsRevenue: z.boolean(),
  incomeTaxMode: z.enum(["pph_final_umkm", "custom", "none"]),
  incomeTaxBps: bps,
  incomeTaxFreeAnnualTurnover: rupiah,
});

/** PUT /v1/menu-items — the POS owns name and price (P3). */
export const menuItemPush = z.object({
  externalId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  sellingPrice: rupiah,
  active: z.boolean().default(true),
  category: z.string().max(200).optional(),
});
export const menuItemsPush = z.object({ items: z.array(menuItemPush).max(1000) });

/** A menu item's current cost as Pantrio reports it. */
export const menuItemCost = z.object({
  externalId: z.string(),
  name: z.string(),
  sellingPrice: rupiah,
  /** null = unknown (no recipe, or a price is missing). Never 0 by default (P7). */
  unitCost: rupiah.nullable(),
  complete: z.boolean(),
  marginBeforeTaxBps: z.number().int().nullable(),
  marginAfterTaxBps: z.number().int().nullable(),
  computedAt: z.iso.datetime(),
});

/** Outbound webhook: menu_item.cost_changed */
export const costChangedEvent = z.object({
  id: z.string(),
  type: z.literal("menu_item.cost_changed"),
  createdAt: z.iso.datetime(),
  data: menuItemCost,
});

export type MenuItemPush = z.infer<typeof menuItemPush>;
export type MenuItemCost = z.infer<typeof menuItemCost>;
export type CostChangedEvent = z.infer<typeof costChangedEvent>;
