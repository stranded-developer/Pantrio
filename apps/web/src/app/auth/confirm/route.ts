import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceKey } from "@/lib/supabase/service";

// Email confirmation link target (Supabase "token_hash" flow).
// A password-reset link (type=recovery) also unlocks the terminals of every
// restaurant this person owns (P26): opening it proves they hold the
// owner's inbox. Then /account asks for the new password.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (type === "recovery" && data.user && hasServiceKey()) {
        await createServiceClient().rpc("admin_unlock_owner_terminals", { p_user: data.user.id });
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
