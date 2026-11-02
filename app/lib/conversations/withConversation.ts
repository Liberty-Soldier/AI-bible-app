import "server-only";
import { saveSimplePublication } from "./simplePublication";
import { getVerifiedSupabaseUserId } from "../supabase/server";
import { conversationStore, isUuid, privateResponse } from "./store";
export async function withConversation(request: Request, generate: (r: Request) => Promise<Response>): Promise<Response> {
    const input = await request.clone().json().catch(() => null);
    if (input?.persistConversation !== true) {
        const response = await generate(request);
        if (response.status !== 200)
            return response;
        const body = await response.clone().json().catch(() => null);
        if (body?.source !== 'simple-model')
            return response;
        const owner = await getVerifiedSupabaseUserId();
        if (!owner)
            return response;
        try {
            const id = await saveSimplePublication(owner, input.question, body);
            return id ? Response.json({ ...body, shareStudyId: id }, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } }) : response;
        }
        catch {
            return response;
        }
    }
    const owner = await getVerifiedSupabaseUserId();
    const headers = { "Cache-Control": "private, no-store" };
    const fail = (status: string, code: number) => Response.json({ status }, { status: code, headers });
    if (!owner)
        return fail('authentication-required', 401);
    if (!isUuid(input.conversationId) || !isUuid(input.requestId) || typeof input.question !== 'string' || !input.question.trim() || input.question.length > 800)
        return fail('invalid-request', 400);
    if (JSON.stringify(input.context || null).length > 16_000) return fail("invalid-request", 400);
    const db = conversationStore();
    if (!db)
        return fail('history-unavailable', 503);
    const args = { p_owner: owner, p_conversation: input.conversationId, p_request: input.requestId };
    const { data, error } = await db.rpc('emet_begin_turn', { ...args, p_question: input.question, p_context: input.context || null, p_revision: Number.isSafeInteger(input.conversationRevision) ? input.conversationRevision : 0 });
    if (error)
        return fail('history-unavailable', 503);
    if (data?.status === 'complete')
        return Response.json(data.response, { status: data.httpStatus, headers });
    if (data?.status !== 'created')
        return fail(data?.status === 'not-found' ? 'conversation-deleted' : 'conversation-busy', data?.status === 'not-found' ? 410 : 409);
    let response: Response;
    try {
        response = await generate(request);
    }
    catch {
        response = fail('answer-unavailable', 503);
    }
    const body = await response.clone().json().catch(() => ({ status: 'answer-unavailable' }));
    if (response.status === 200)
        try {
            const id = await saveSimplePublication(owner, input.question, body);
            if (id)
                body.shareStudyId = id;
        }
        catch { /* Publication availability must not discard an answer. */ }
    let saved = false;
    for (let attempt = 0; attempt < 2 && !saved; attempt++) {
        const result = await db.rpc('emet_finish_turn', { ...args, p_response: privateResponse(body), p_http: response.status });
        saved = !result.error && result.data === true;
    }
    // Preserve the delivered answer even if persistence fails; never repeat AI to save it.
    return Response.json({ ...body, historySave: saved ? 'saved' : 'failed' }, { status: response.status, headers });
}
