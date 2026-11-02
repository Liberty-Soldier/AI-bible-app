import { isUuid, sameOrigin } from "@/app/lib/conversations/store";
import { NextResponse } from "next/server";

import { publishSharedStudy, getOwnedSharedStudyState, revokeSharedStudy } from "@/app/lib/emet/EmetSharedStudy";
import { getVerifiedSupabaseUserId } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ status: "origin-denied" }, { status: 403 });
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

export async function GET(request: Request) {
  const userId = await getVerifiedSupabaseUserId();
  const headers = { "Cache-Control": "private, no-store" };
  if (!userId) return NextResponse.json({ status: "authentication-required" }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ status: "invalid-request" }, { status: 400, headers });
  const state = await getOwnedSharedStudyState(userId, id);
  return NextResponse.json(state || { status: "not-found" }, { status: state ? 200 : 404, headers });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ status: "origin-denied" }, { status: 403 });
  const userId = await getVerifiedSupabaseUserId();
  const headers = { "Cache-Control": "private, no-store" };
  if (!userId) return NextResponse.json({ status: "authentication-required" }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!isUuid(body?.studyId)) return NextResponse.json({ status: "invalid-request" }, { status: 400, headers });
  const id = await revokeSharedStudy(userId, body.studyId);
  return NextResponse.json(id ? { status: "revoked" } : { status: "not-found" }, { status: id ? 200 : 404, headers });
}
