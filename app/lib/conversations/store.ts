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
