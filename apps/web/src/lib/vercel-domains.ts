import "server-only";

// Custom domains on the one Vercel project (P17). Optional: without
// VERCEL_TOKEN + VERCEL_PROJECT_ID the backoffice still records the domain
// and shows the DNS to set, and you add it in the Vercel dashboard instead.

const API = "https://api.vercel.com";

function config() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  const team = process.env.VERCEL_TEAM_ID;
  return { token, project, qs: team ? `?teamId=${encodeURIComponent(team)}` : "" };
}

export function vercelConfigured(): boolean {
  return config() !== null;
}

async function call(path: string, init: RequestInit = {}) {
  const c = config();
  if (!c) throw new Error("Vercel API not configured");
  const res = await fetch(`${API}${path}${c.qs}`, {
    ...init,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: string };
  };
  return { ok: res.ok, status: res.status, body };
}

export async function addProjectDomain(hostname: string): Promise<{ ok: boolean; error?: string }> {
  const c = config();
  if (!c) return { ok: true };
  const r = await call(`/v10/projects/${encodeURIComponent(c.project)}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: hostname }),
  });
  // Already on this project counts as success.
  if (r.ok || r.body.error?.code === "domain_already_in_use_by_project") return { ok: true };
  return { ok: false, error: r.body.error?.message ?? `Vercel returned ${r.status}` };
}

export async function removeProjectDomain(hostname: string): Promise<void> {
  const c = config();
  if (!c) return;
  await call(`/v9/projects/${encodeURIComponent(c.project)}/domains/${encodeURIComponent(hostname)}`, {
    method: "DELETE",
  });
}

export type DomainStatus = { verified: boolean; misconfigured: boolean | null; note?: string };

export async function domainStatus(hostname: string): Promise<DomainStatus | null> {
  const c = config();
  if (!c) return null;
  const [project, dns] = await Promise.all([
    call(`/v9/projects/${encodeURIComponent(c.project)}/domains/${encodeURIComponent(hostname)}`),
    call(`/v6/domains/${encodeURIComponent(hostname)}/config`),
  ]);
  if (!project.ok) return { verified: false, misconfigured: null, note: project.body.error?.message };
  return {
    verified: project.body.verified === true,
    misconfigured: dns.ok ? dns.body.misconfigured === true : null,
  };
}

/** What the restaurant (or you) set at their DNS provider. */
export function dnsInstructions(hostname: string): string {
  const labels = hostname.split(".");
  const apex = labels.length === 2 || (labels.length === 3 && /^(co|or|ac|go|web|my|biz|sch)\.id$/.test(labels.slice(1).join(".")));
  return apex
    ? `A record: ${hostname} → 76.76.21.21`
    : `CNAME record: ${labels[0]} → cname.vercel-dns.com`;
}
