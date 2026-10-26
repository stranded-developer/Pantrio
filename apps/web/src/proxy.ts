import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

// 1. Tenancy (P17). One deployment, many domains. The platform host serves
//    /, /login, /admin and /o/<slug>/…; any other host is looked up in
//    org_domains and rewritten onto /o/<slug>/… with x-pantrio-tenant set.
// 2. Auth. Refreshes the Supabase session cookie and does the *optimistic*
//    redirect to a login page. Not the security boundary — RLS and the SQL
//    functions are.

const TENANT_HEADER = "x-pantrio-tenant";
const HOST_TTL_MS = 60_000;
const hostCache = new Map<string, { slug: string | null; until: number }>();

function isPlatformHost(host: string): boolean {
  const name = host.split(":")[0]!.toLowerCase();
  const configured = (process.env.PLATFORM_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return (
    configured.includes(name) ||
    name === "localhost" ||
    name === "127.0.0.1" ||
    // The production *.vercel.app domain and every preview deployment.
    name.endsWith(".vercel.app")
  );
}

async function slugForHost(host: string, url: string, key: string): Promise<string | null> {
  const cached = hostCache.get(host);
  if (cached && cached.until > Date.now()) return cached.slug;
  const res = await fetch(`${url}/rest/v1/rpc/resolve_tenant_host`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ p_host: host }),
  });
  const slug = res.ok ? ((await res.json()) as string | null) : null;
  hostCache.set(host, { slug, until: Date.now() + HOST_TTL_MS });
  return slug;
}

export async function proxy(request: NextRequest) {
  const { url, key } = supabaseEnv();
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  // Never trust an incoming tenant header: only this proxy sets it.
  const forwarded = new Headers(request.headers);
  forwarded.delete(TENANT_HEADER);

  let rewriteTo: URL | null = null;
  let tenantSlug: string | null = null;

  if (!isPlatformHost(host)) {
    tenantSlug = await slugForHost(host, url, key);
    if (!tenantSlug) {
      return new NextResponse("This domain is not connected to a restaurant.", { status: 404 });
    }
    forwarded.set(TENANT_HEADER, tenantSlug);
    const alreadyPrefixed = pathname === `/o/${tenantSlug}` || pathname.startsWith(`/o/${tenantSlug}/`);
    if (!alreadyPrefixed && !pathname.startsWith("/auth/") && !pathname.startsWith("/account")) {
      rewriteTo = request.nextUrl.clone();
      // "/" is the restaurant's home, which sends each role to its first screen.
      rewriteTo.pathname = `/o/${tenantSlug}${pathname === "/" ? "" : pathname}`;
    }
  }

  const next = () =>
    rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request: { headers: forwarded } })
      : NextResponse.next({ request: { headers: forwarded } });

  let response = next();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() (network) once per request: refreshes the cookie and notices a
  // user disabled server-side. The DAL uses getClaims() (FOKAS D25).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (path: string, nextPath?: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    const res = NextResponse.redirect(target);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (tenantSlug) {
    // Restaurant's own domain: everything but /login needs a session.
    if (!user && pathname !== "/login" && !pathname.startsWith("/auth/")) return redirectTo("/login", pathname);
    // A signed-in user on /login is handled by the page: straight to the
    // till if they are staff here, otherwise the form with a note — they may
    // be signed in with another restaurant's (or the admin's) account.
    return response;
  }

  const tenantPath = /^\/o\/([^/]+)(\/.*)?$/.exec(pathname);
  if (tenantPath) {
    const isLogin = tenantPath[2] === "/login";
    if (!user && !isLogin) return redirectTo(`/o/${tenantPath[1]}/login`, pathname);
    return response;
  }

  if (!user && (pathname.startsWith("/admin") || pathname === "/dashboard" || pathname.startsWith("/account"))) {
    return redirectTo("/login", pathname);
  }
  if (user && pathname === "/login") return redirectTo("/dashboard");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
