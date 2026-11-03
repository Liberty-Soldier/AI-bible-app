import "server-only";
import { publicAnswerResponse } from "../emet/answerPrivacy";
import { createSupabaseAdminClient } from "../supabase/admin";
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function conversationStore() { return createSupabaseAdminClient(); }
export async function ownedConversation(owner: string, id: string) {
    const db = conversationStore();
    if (!db)
        return null;
    const { data, error } = await db.from("emet_conversations").select("id,title,revision,updated_at").eq("id", id).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
    if (error)
        throw new Error("History unavailable");
    return data;
}
// Do not persist owner debugging or transport usage details with conversation text.
export function privateResponse(body: Record<string, unknown>) {
    const { usage: _usage, ...safe } = publicAnswerResponse(body);
    void _usage;
    return safe;
}
export function sameOrigin(request: Request) {
    const origin = request.headers.get("origin");
    return !origin || origin === new URL(request.url).origin;
}

// Freeze the two previously deployed import serializers for identity lookup only.
// Display cleanup must not change an existing browser-import deduplication key.
// These payloads are hashed, never returned or persisted; writes use privateResponse.
export function legacyImportPayloads(turns: Array<{ question: string; response: Record<string, unknown> }>) {
    const oldPrivateNote = (note: string) => /owner\s*(?:diagnostic|inspection)|owner[- ]only|citation-resolution|inline-citation-unverified|quotation-unverified/i.test(note)
        || (/^\s*[\[{]/.test(note) && /"(?:diagnostics?|debug|claimId|authority|unresolvedReferences)"\s*:/i.test(note));
    const keys = new Set(['diagnostics', 'diagnostic', 'unresolvedreferences', 'ownerdiagnostics', 'debug', 'debugrecords', 'authoritymetadata']);
    function v1(value: unknown): unknown {
        if (Array.isArray(value)) return value.map(v1);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => keys.has(key.replace(/[_-]/g, '').toLowerCase()) ? []
            : [[key, key === 'limitations' || key === 'qualifications'
                ? (Array.isArray(item) ? item.filter(note => typeof note === 'string' && !oldPrivateNote(note) && note !== 'The model reported insufficient evidence. This explanation is unverified.') : []) : v1(item)]]));
    }
    return [0, 1].map(version => turns.map(turn => {
        const body = version ? v1(turn.response) as Record<string, unknown> : { ...turn.response };
        const { diagnostics: _diagnostics, usage: _usage, ...response } = body;
        void _diagnostics; void _usage;
        if (!version && response.answer && typeof response.answer === 'object') {
            const { unresolvedReferences: _unresolved, ...answer } = response.answer as Record<string, unknown>;
            void _unresolved; response.answer = answer;
        }
        return { question: turn.question, response };
    }));
}
