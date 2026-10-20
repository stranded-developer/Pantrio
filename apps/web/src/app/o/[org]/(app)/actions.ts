"use server";

import { cookies } from "next/headers";
import { requireMembership } from "@/lib/auth";
import { getOutlets, outletCookie } from "@/lib/tenant";

/** Which branch this device works in. Remembered per device, per restaurant. */
export async function chooseOutlet(slug: string, outletId: string) {
  const { org } = await requireMembership(slug);
  const outlets = await getOutlets(org.id);
  if (!outlets.some((o) => o.id === outletId && o.active)) throw new Error("Unknown branch.");
  (await cookies()).set(outletCookie(org.id), outletId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
