"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { addProjectDomain, removeProjectDomain } from "@/lib/vercel-domains";

// Backoffice. Platform admins only; runs with the service key because it
// creates logins and acts across restaurants. Every action re-checks.

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const RESERVED = new Set(["admin", "api", "app", "www", "login", "dashboard", "account", "auth", "o"]);

const restaurant = z.object({
  name: z.string().trim().min(2, "Restaurant name is too short.").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](-?[a-z0-9])*$/, "Address: lowercase letters, numbers and single dashes.")
    .max(40)
    .refine((s) => !RESERVED.has(s), "That address is reserved."),
  ownerName: z.string().trim().min(1, "Owner name is required.").max(100),
  ownerEmail: z.email("Owner email is invalid."),
  ownerPassword: z.union([z.literal(""), z.string().min(8, "Starting password must be 8+ characters.")]),
});

export async function createRestaurant(_: Result | null, formData: FormData): Promise<Result> {
  await requirePlatformAdmin();
  const parsed = restaurant.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const p = parsed.data;
  const admin = createServiceClient();

  let { data: ownerId } = await admin.rpc("admin_user_id_by_email", { p_email: p.ownerEmail });
  if (!ownerId) {
    if (!p.ownerPassword) return { ok: false, error: "New owner: set a starting password." };
    const { data, error } = await admin.auth.admin.createUser({
      email: p.ownerEmail,
      password: p.ownerPassword,
      email_confirm: true,
      user_metadata: { full_name: p.ownerName },
    });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create the owner login." };
    ownerId = data.user.id;
  }

  const { data: org, error } = await admin.rpc("admin_create_organization", {
    p_name: p.name,
    p_slug: p.slug,
    p_owner: ownerId,
  });
  if (error || !org) {
    return { ok: false, error: error?.code === "23505" ? "That address is taken." : (error?.message ?? "Failed.") };
  }
  revalidatePath("/admin");
  redirect(`/admin/restaurants/${org.id}`);
}

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Enter a domain like pos.myresto.com");

export async function addDomain(orgId: string, raw: string): Promise<Result> {
  await requirePlatformAdmin();
  const parsed = hostname.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (parsed.data.endsWith(".vercel.app")) return { ok: false, error: "vercel.app addresses are the platform's own." };

  const admin = createServiceClient();
  const { error } = await admin.from("org_domains").insert({ org_id: orgId, hostname: parsed.data });
  if (error) return { ok: false, error: error.code === "23505" ? "That domain is already connected." : error.message };

  const vercel = await addProjectDomain(parsed.data);
  if (!vercel.ok) {
    await admin.from("org_domains").delete().eq("hostname", parsed.data);
    return { ok: false, error: `Vercel: ${vercel.error}` };
  }
  revalidatePath(`/admin/restaurants/${orgId}`);
  return { ok: true };
}

export async function removeDomain(orgId: string, domainId: string): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createServiceClient();
  const { data } = await admin.from("org_domains").delete().eq("id", domainId).eq("org_id", orgId).select("hostname").single();
  if (data) await removeProjectDomain(data.hostname);
  revalidatePath(`/admin/restaurants/${orgId}`);
  return { ok: true };
}
