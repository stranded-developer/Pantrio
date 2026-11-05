import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { tenantBase } from "@/lib/tenant";

// Registered terminals (P25). A terminal is this browser, registered by a
// manager for one branch: a random token in an httpOnly cookie (only its
// hash is in the database). The token alone opens nothing but the PIN pad;
// a correct PIN mints an ordinary session for that person.
//
// One cookie per browser: a device is a terminal for one restaurant. Cookies
// are per host, so register on the address staff will actually use (the
// restaurant's own domain, or the platform host) — and on an iPad, inside
// the home-screen app if that is what runs the till.

export const TERMINAL_COOKIE = "pantrio-terminal";
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days

export type Terminal = {
  id: string;
  orgId: string;
  slug: string;
  outletId: string;
  outletName: string;
  name: string;
  tokenPrefix: string;
  idleMinutes: number;
  lockAfterSale: boolean;
  /** 5 wrong PINs in a row: locked until an owner's password is reset (P26). */
  hardLocked: boolean;
};

export async function terminalToken(): Promise<string | null> {
  return (await cookies()).get(TERMINAL_COOKIE)?.value ?? null;
}

/** This browser's terminal, if it is one for `slug` and not revoked. */
export const getTerminal = cache(async (slug: string): Promise<Terminal | null> => {
  const token = await terminalToken();
  if (!token) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("terminal_info", { p_token: token });
  const t = data?.[0];
  if (!t || t.slug !== slug) return null;
  return {
    id: t.terminal_id,
    orgId: t.org_id,
    slug: t.slug,
    outletId: t.outlet_id,
    outletName: t.outlet_name,
    name: t.terminal_name,
    tokenPrefix: t.token_prefix,
    idleMinutes: t.idle_minutes,
    lockAfterSale: t.lock_after_sale,
    hardLocked: t.hard_locked,
  };
});

export type Person = {
  name: string;
  /** "Owner", or the role's name. */
  role: string;
  clockedInAt: string | null;
  missingOutOn: string | null;
  home: string;
};

/**
 * Name, role and shift status of the signed-in person, for the screen after
 * a PIN (or Clock out from the header). Takes the client that signed them
 * in, so it never depends on cookies written earlier in the same request.
 */
export async function personStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
  orgId: string,
  userId: string
): Promise<Person> {
  const [{ data: status }, { data: m }, { data: profile }] = await Promise.all([
    supabase.rpc("my_clock_status", { p_org: orgId }),
    supabase
      .from("org_members")
      .select("role, org_role:org_roles!org_members_role_fk(name)")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const s = (status ?? {}) as { clocked_in_at?: string | null; missing_out_on?: string | null };
  const base = await tenantBase(slug);
  return {
    name: profile?.full_name ?? "",
    role: m?.role === "owner" ? "Owner" : (m?.org_role?.name ?? ""),
    clockedInAt: s.clocked_in_at ?? null,
    missingOutOn: s.missing_out_on ?? null,
    home: base || "/",
  };
}

/** Server Actions only (cookies are read-only while rendering). */
export async function setTerminalCookie(token: string) {
  (await cookies()).set(TERMINAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearTerminalCookie() {
  (await cookies()).delete(TERMINAL_COOKIE);
}
