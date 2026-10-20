// Supabase's current key format (sb_publishable_ / sb_secret_). The legacy
// JWT anon/service_role keys are deprecated at the end of 2026 (FOKAS D17).
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — copy .env.example to .env.local"
    );
  }
  return { url, key };
}
