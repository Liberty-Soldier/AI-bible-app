import "server-only";

import { createHash } from "node:crypto";

import type { EmetAiAnswer, EmetAiEvidencePacket } from "./EmetAiContract";
import { createSupabaseAdminClient } from "../supabase/admin";

export type SharedStudyCitation = {
  reference: string;
  translation: string;
};

export type SharedStudySnapshot = {
  id: string;
  question: string;
  answer: string;
  citations: SharedStudyCitation[];
  publishedAt: string | null;
};

function snapshotHash(question: string, answer: EmetAiAnswer) {
  return createHash("sha256")
    .update(JSON.stringify({ question, answer }))
    .digest("hex");
}

function publicCitations(packet: EmetAiEvidencePacket, answer: EmetAiAnswer) {
  const evidenceById = new Map(packet.evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return answer.citations.flatMap((citation) => {
    const evidence = evidenceById.get(citation.evidenceId);
    const reference = citation.reference || evidence?.reference;
    if (!reference || evidence?.kind !== "scripture") return [];
    const translation = /^scripture:(web|kjv|brenton):/i.exec(evidence.id)?.[1]?.toLowerCase() || evidence.corpus;
    const key = `${reference}|${translation}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ reference, translation }];
  });
}

export async function saveSharedStudyCandidate({
  userId,
  question,
  packet,
  answer,
}: {
  userId: string;
  question: string;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
}) {
  if (answer.status !== "complete") return null;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const hash = snapshotHash(question, answer);
  const { data, error } = await supabase
    .from("emet_shared_studies")
    .upsert(
      {
        owner_user_id: userId,
        snapshot_hash: hash,
        question,
        answer: answer.answer,
        citations: publicCitations(packet, answer),
      },
      { onConflict: "owner_user_id,snapshot_hash" },
    )
    .select("id")
    .single();
  return error ? null : (data.id as string);
}

export async function publishSharedStudy(userId: string, id: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const publishedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("emet_shared_studies")
    .update({ published_at: publishedAt })
    .eq("id", id)
    .eq("owner_user_id", userId)
    .select("id")
    .maybeSingle();
  return error || !data ? null : (data.id as string);
}

export async function getPublishedSharedStudy(id: string): Promise<SharedStudySnapshot | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("emet_shared_studies")
    .select("id, question, answer, citations, published_at")
    .eq("id", id)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    question: data.question as string,
    answer: data.answer as string,
    citations: Array.isArray(data.citations) ? data.citations as SharedStudyCitation[] : [],
    publishedAt: data.published_at as string,
  };
}
