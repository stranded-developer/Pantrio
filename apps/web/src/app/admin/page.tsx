import Link from "next/link";
import { connection } from "next/server";
import { requirePlatformAdminPage } from "@/lib/auth";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";
import { platformOrigin } from "@/lib/tenant";
import { CopyLink } from "./copy-link";

export default async function AdminHome() {
  // Live data across all restaurants: never prerender at build time.
  await connection();
  // Checked here, not only in the layout: pages render in parallel with
  // layouts, so a layout-only gate would still run this page's queries.
  await requirePlatformAdminPage();
  if (!hasServiceKey()) {
    return (
      <p className="rounded-2xl bg-amber-50 p-6 text-amber-900">
        Set <code>SUPABASE_SECRET_KEY</code> (Supabase → Project Settings → API Keys → secret) in the environment to
        use the backoffice.
      </p>
    );
  }
  const admin = createServiceClient();
  const origin = await platformOrigin();
  const [{ data: orgs }, { data: domains }, { data: members }] = await Promise.all([
    admin.from("organizations").select("id, name, slug, created_at").order("created_at", { ascending: false }),
    admin.from("org_domains").select("org_id, hostname"),
    admin.from("org_members").select("org_id").eq("active", true),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Restaurants</h1>
        <Link href="/admin/restaurants/new" className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white">
          New restaurant
        </Link>
      </div>
      {!orgs?.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">No restaurants yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {orgs.map((o) => (
            <li key={o.id} className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-4">
                <Link href={`/admin/restaurants/${o.id}`} className="font-medium text-neutral-900 hover:underline">
                  {o.name} →
                </Link>
                <span className="text-sm text-neutral-500">
                  {members?.filter((m) => m.org_id === o.id).length ?? 0} staff
                </span>
              </div>
              <div className="text-sm">
                <CopyLink label="Login" href={`${origin}/o/${o.slug}/login`} />
              </div>
              {domains
                ?.filter((d) => d.org_id === o.id)
                .map((d) => (
                  <div key={d.hostname} className="text-sm">
                    <CopyLink label="Own domain" href={`https://${d.hostname}/login`} />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
