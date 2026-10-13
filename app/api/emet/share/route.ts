import { NextResponse } from "next/server";

import { publishSharedStudy } from "@/app/lib/emet/EmetSharedStudy";
import { getVerifiedSupabaseUserId } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getVerifiedSupabaseUserId();
  if (!userId) return NextResponse.json({ status: "authentication-required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { studyId?: unknown } | null;
  const studyId = typeof body?.studyId === "string" ? body.studyId : "";
  if (!/^[0-9a-f-]{36}$/i.test(studyId)) {
    return NextResponse.json({ status: "invalid-request" }, { status: 400 });
  }
  const id = await publishSharedStudy(userId, studyId);
  if (!id) return NextResponse.json({ status: "not-found" }, { status: 404 });
  return NextResponse.json({ status: "published", path: `/shared/${id}` });
}
