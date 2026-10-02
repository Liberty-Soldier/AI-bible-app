import { NextResponse, type NextRequest } from "next/server";

import { authPageHref, normalizeAuthNextPath } from "@/app/lib/authPaths";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = normalizeAuthNextPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const failure = authPageHref({
    mode: "signin",
    next,
    messageType: "error",
    message: "The confirmation link is invalid or has expired. Please try again.",
  });
  return NextResponse.redirect(new URL(failure, request.url));
}
