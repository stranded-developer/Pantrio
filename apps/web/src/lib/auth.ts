import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer: the single place a session is verified (FOKAS D25:
// getClaims() here, local JWT verify; getUser() only in proxy.ts).
//
// Pages call the *Page variants, which redirect; Server Actions call the
// throwing variants (FOKAS D29) — a POST that bypassed the UI has no sensible
// redirect target. Every money function re-checks in SQL, which is the
// actual boundary (FOKAS D14).

export type OrgRole = "owner" | "manager" | "cashier";
export type Membership = { role: OrgRole; org: { id: string; name: string; slug: string } };

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export const getProfileName = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name ?? null;
});

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("role, org:organizations!inner(id, name, slug)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at");
  if (error) throw new Error(`Could not load restaurants: ${error.message}`);
  return (data ?? []) as unknown as Membership[];
});

/** The membership for a slug, or null. Never reveals whether the org exists. */
export const findMembership = cache(async (slug: string): Promise<Membership | null> => {
  return (await getMemberships()).find((m) => m.org.slug === slug) ?? null;
});

/**
 * For pages under /o/[org]. Not signed in, or signed in with an account that
 * isn't staff here (another restaurant's, or the platform admin's) → that
 * restaurant's login page, which says which account is signed in. The login
 * page 404s for a restaurant that doesn't exist, so nothing leaks.
 */
export async function requireMembershipPage(slug: string, base: string): Promise<Membership> {
  const user = await getCurrentUser();
  if (!user) redirect(`${base}/login`);
  const membership = await findMembership(slug);
  if (!membership) redirect(`${base}/login`);
  return membership;
}

/** Manager pages: a cashier lands on the POS, not a crash screen (FOKAS D29). */
export async function requireManagerPage(slug: string, base: string): Promise<Membership> {
  const m = await requireMembershipPage(slug, base);
  if (!isManager(m.role)) redirect(`${base}/pos`);
  return m;
}

export async function requireOwnerPage(slug: string, base: string): Promise<Membership> {
  const m = await requireMembershipPage(slug, base);
  if (m.role !== "owner") redirect(`${base}/pos`);
  return m;
}

/** For Server Actions. Throws. */
export async function requireMembership(slug: string, roles?: OrgRole[]): Promise<Membership> {
  const membership = await findMembership(slug);
  if (!membership) throw new Error("Not signed in to this restaurant.");
  if (roles && !roles.includes(membership.role)) throw new Error("You don't have permission to do this.");
  return membership;
}

export function isManager(role: OrgRole) {
  return role === "owner" || role === "manager";
}

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});

export async function requirePlatformAdminPage() {
  const user = await requireUser();
  if (!(await isPlatformAdmin())) notFound();
  return user;
}

export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user || !(await isPlatformAdmin())) throw new Error("Platform admins only.");
  return user;
}
