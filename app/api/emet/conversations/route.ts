import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getVerifiedSupabaseUserId } from "@/app/lib/supabase/server";
import { conversationStore, isUuid, ownedConversation, privateResponse, sameOrigin, legacyImportPayloads } from "@/app/lib/conversations/store";
export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
    const owner = await getVerifiedSupabaseUserId();
    if (!owner)
        return reply({ status: "authentication-required" }, 401);
    const db = conversationStore();
    if (!db)
        return reply({ status: "history-unavailable" }, 503);
    try {
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
            if (!isUuid(id))
                return reply({ status: "invalid-request" }, 400);
            const after = Number(new URL(request.url).searchParams.get("after") || 0);
            if (!Number.isSafeInteger(after) || after < 0)
                return reply({ status: "invalid-request" }, 400);
            const conversation = await ownedConversation(owner, id);
            if (!conversation)
                return reply({ status: "not-found" }, 404);
            const { data, error } = await db.from("emet_conversation_turns").select("request_id,sequence,question,context,state,response,http_status,imported,created_at").eq("conversation_id", id).gt("sequence", after).order("sequence").limit(200);
            if (error)
                throw error;
            return reply({ userId: owner, conversation, turns: data?.map(turn => ({ ...turn, response: turn.response ? privateResponse(turn.response) : turn.response })) });
        }
        const cursor = new URL(request.url).searchParams.get("cursor");
        let query = db.from("emet_conversations").select("id,title,revision,updated_at").eq("owner_user_id", owner).is("deleted_at", null).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(100);
        if (cursor) {
            const [time, id] = cursor.split("|");
            if (!isUuid(id) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+]00:00)$/.test(time) || !Number.isFinite(Date.parse(time)))
                return reply({ status: "invalid-request" }, 400);
            query = query.or(`updated_at.lt.${time},and(updated_at.eq.${time},id.lt.${id})`);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        const last = data?.at(-1);
        return reply({ userId: owner, conversations: data, nextCursor: data?.length === 100 && last ? `${last.updated_at}|${last.id}` : null });
    }
    catch {
        return reply({ status: "history-unavailable" }, 503);
    }
}
export async function PATCH(request: Request) {
    if (!sameOrigin(request))
        return reply({ status: "origin-denied" }, 403);
    const owner = await getVerifiedSupabaseUserId();
    if (!owner)
        return reply({ status: "authentication-required" }, 401);
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.id) || !Number.isSafeInteger(body?.revision) || body.revision < 0 || !(body.delete === true || (typeof body.title === 'string' && body.title.trim().length > 0 && body.title.length <= 120)))
        return reply({ status: "invalid-request" }, 400);
    const db = conversationStore();
    if (!db)
        return reply({ status: "history-unavailable" }, 503);
    const { data, error } = await db.rpc("emet_edit_conversation", { p_owner: owner, p_id: body.id, p_revision: body.revision, p_title: body.delete ? null : body.title.trim(), p_delete: body.delete === true });
    return error ? reply({ status: "history-unavailable" }, 503) : reply({ status: data }, data === 'saved' ? 200 : data === 'conflict' ? 409 : 404);
}
export async function POST(request: Request) {
    if (!sameOrigin(request))
        return reply({ status: "origin-denied" }, 403);
    const owner = await getVerifiedSupabaseUserId();
    if (!owner)
        return reply({ status: "authentication-required" }, 401);
    const text = await request.text();
    if (text.length > 2000000)
        return reply({ status: "invalid-request" }, 413);
    let body;
    try {
        body = JSON.parse(text);
    }
    catch {
        return reply({ status: "invalid-request" }, 400);
    }
    if (body?.confirmOwnership !== true || !Array.isArray(body.turns) || !body.turns.length || body.turns.length > 100 || body.turns.some((t: Record<string, unknown>) => !t || typeof t.question !== 'string' || !t.question.trim() || t.question.length > 800 || !t.response || typeof t.response !== 'object'))
        return reply({ status: "invalid-request" }, 400);
    const turns = body.turns.map((t: {
        question: string;
        response: Record<string, unknown>;
    }) => ({ question: t.question, response: privateResponse(t.response) }));
    // Imported records preserve original data but can never become share candidates.
    const keys = legacyImportPayloads(body.turns).map(payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
    const key = keys[0];
    const db = conversationStore();
    if (!db)
        return reply({ status: "history-unavailable" }, 503);
    const existing = await db.from('emet_conversations').select('id').eq('owner_user_id', owner)
        .in('legacy_key', keys).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (existing.error) return reply({ status: 'history-unavailable' }, 503);
    if (existing.data) return reply({ id: existing.data.id });
    const { data, error } = await db.rpc('emet_import_conversation', { p_owner: owner, p_id: randomUUID(), p_key: key, p_turns: turns });
    return error ? reply({ status: "history-unavailable" }, 503) : reply({ id: data });
}
