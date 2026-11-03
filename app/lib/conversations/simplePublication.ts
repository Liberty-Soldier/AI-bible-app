import "server-only";
import { publicAnswerNotes } from "../emet/answerPrivacy";
import { createHash } from "node:crypto";
import { conversationStore } from "./store";
import { resolveSimpleReference } from "../emet/experimental/SimpleEmetScripture";
export function eligibleSimpleSources(value: unknown) {
    if (!Array.isArray(value) || !value.length || value.length > 80)
        return false;
    return value.every(c => {
        if (!c || typeof c.reference !== 'string' || !['web', 'kjv', 'brenton'].includes(c.translation) || typeof c.text !== 'string' || c.verification !== 'locked-corpus-text')
            return false;
        const resolved = resolveSimpleReference(c.reference, c.translation);
        return resolved?.length === 1 && resolved[0].text === c.text && resolved[0].reference === c.reference;
    });
}
export async function saveSimplePublication(owner: string, question: string, body: Record<string, unknown>) {
    const a = body.answer as Record<string, unknown> | undefined;
    if (body.status !== 'complete' || body.source !== 'simple-model' || a?.verificationStatus !== 'references-verified' || typeof a.answer !== 'string' || !a.answer || a.answer.length > 50000 || !eligibleSimpleSources(a.citations))
        return null;
    const db = conversationStore();
    if (!db)
        return null;
    const snapshot = { question, answer: a.answer, citations: a.citations, qualifications: publicAnswerNotes(a.limitations) };
    const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const { data, error } = await db.from('emet_shared_studies').upsert({ owner_user_id: owner, snapshot_hash: `simple:${hash}`, question, answer: a.answer, citations: (a.citations as Array<{
            reference: string;
            translation: string;
        }>).map(c => ({ reference: c.reference, translation: c.translation })), source_kind: 'simple', qualifications: snapshot.qualifications, source_passages: a.citations }, { onConflict: 'owner_user_id,snapshot_hash' }).select('id').single();
    return error ? null : data.id as string;
}
