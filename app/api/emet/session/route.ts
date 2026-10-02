import { NextResponse } from "next/server";

import { getEmetAiUsageSummary } from "@/app/lib/emet/EmetAiQuota";
import { getVerifiedSupabaseUserId } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  if (!(await getVerifiedSupabaseUserId())) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      usage: await getEmetAiUsageSummary(),
    },
    { headers },
  );
}
