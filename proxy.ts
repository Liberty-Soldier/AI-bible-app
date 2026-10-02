import type { NextRequest } from "next/server";

import { updateSupabaseSession } from "@/app/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|scripture|data|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
