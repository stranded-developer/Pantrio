import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Secret-key client — BYPASSES RLS. Used only where the signed-in user's own
// rights cannot reach (P14): creating login accounts (auth admin API) and
// the platform backoffice. Never on the POS money path — that runs as the
// user through create_order() and friends.

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function hasServiceKey(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createServiceClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SECRET_KEY is not set — add it to .env.local / Vercel to manage accounts.");
  }
  client = createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
