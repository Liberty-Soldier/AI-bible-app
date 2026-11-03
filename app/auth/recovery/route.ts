import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";
import { clearRecoveryGrant, issueRecoveryGrant, recoveryOrigin } from "@/app/lib/supabase/recovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let valid = false;
  await clearRecoveryGrant();
  try {
    const params = request.nextUrl.searchParams;
    const code = params.get("code");
    const token = params.get("token_hash");
    const client = await createSupabaseServerClient();
    if (client && !params.has("error") && !params.has("error_code")) {
      if (code && code.length <= 2048 && !token) {
        const flowId = params.get("sb_flow_id");
        const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        if (!error && data.user && "redirectType" in data && data.redirectType === "recovery") {
          valid = await issueRecoveryGrant(data.user.id);
        }
      } else if (token && token.length <= 2048 && !code && params.get("type") === "recovery") {
        const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: "recovery" });
        if (!error && data.user) valid = await issueRecoveryGrant(data.user.id);
      }
    }
  } catch { /* Never expose provider errors, codes or tokens. */ }
  // Fixed destinations only; immediately remove recovery credentials from the URL.
  const response = NextResponse.redirect(new URL(valid ? "/auth/reset-password" : "/auth/reset-password?expired=1", recoveryOrigin(request.nextUrl.origin)));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
