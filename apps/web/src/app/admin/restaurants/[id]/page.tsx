import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdminPage } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { dnsInstructions, domainStatus, vercelConfigured } from "@/lib/vercel-domains";
import { Domains, type DomainRow } from "./domains";

export default async function RestaurantPage({ params }: PageProps<"/admin/restaurants/[id]">) {
  const { id } = await params;
  await requirePlatformAdminPage(); // not only in the layout — see admin/page.tsx
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createServiceClient();
  const { data: org } = await admin.from("organizations").select("id, name, slug, created_at").eq("id", id).maybeSingle();
  if (!org) notFound();

  const [{ data: domains }, { data: members }, { data: outlets }, { count: orders }] = await Promise.all([
    admin.from("org_domains").select("id, hostname").eq("org_id", id).order("created_at"),
    admin.from("org_members").select("user_id, role, active").eq("org_id", id),
    admin.from("outlets").select("id, name, active").eq("org_id", id),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("org_id", id),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, { data: emails }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", ids),
    admin.rpc("admin_user_emails", { p_ids: ids }),
  ]);
  const rows: DomainRow[] = await Promise.all(
    (domains ?? []).map(async (d) => ({
      id: d.id,
      hostname: d.hostname,
      dns: dnsInstructions(d.hostname),
      status: await domainStatus(d.hostname).catch(() => null),
    }))
  );

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">
        ← Restaurants
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{org.name}</h1>
          <p className="text-sm text-neutral-500">
            /o/{org.slug} · {orders ?? 0} orders · since {new Date(org.created_at).toLocaleDateString("en-GB")}
          </p>
        </div>
        <Link href={`/o/${org.slug}/login`} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700">
          Open login page
        </Link>
      </div>

      <Domains orgId={org.id} rows={rows} vercel={vercelConfigured()} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-900">Staff</h2>
          <ul className="space-y-1 text-sm">
            {(members ?? []).map((m) => (
              <li key={m.user_id} className={`flex justify-between ${m.active ? "" : "text-neutral-400 line-through"}`}>
                <span>
                  {profiles?.find((p) => p.id === m.user_id)?.full_name ?? "—"}{" "}
                  <span className="text-neutral-400">{emails?.find((e) => e.id === m.user_id)?.email}</span>
                </span>
                <span className="capitalize text-neutral-500">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">The owner adds and manages staff in their Settings → Staff.</p>
        </section>
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-900">Branches</h2>
          <ul className="space-y-1 text-sm">
            {(outlets ?? []).map((o) => (
              <li key={o.id} className={o.active ? "" : "text-neutral-400 line-through"}>
                {o.name}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
