import "server-only";

import type { EmetAiAnswerStore } from "./EmetAiCache";
import {
  EMET_AI_PROMPT_VERSION,
  parseEmetAiAnswer,
  validateEmetAiAnswer,
  validateEmetAiEvidencePacket,
  type EmetAiAnswer,
  type EmetAiEvidencePacket,
} from "./EmetAiContract";
import { createSupabaseAdminClient } from "../supabase/admin";

export function createSupabaseEmetAiAnswerStore(
  packet: EmetAiEvidencePacket,
): EmetAiAnswerStore | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async get(key) {
      const { data, error } = await supabase
        .from("emet_verified_answers")
        .select("answer, created_at, model")
        .eq("cache_key", key)
        .maybeSingle();

      if (error || !data) return null;

      return {
        answer: data.answer,
        createdAt: data.created_at,
        model: data.model,
      };
    },

    async set(key, value) {
      const { error } = await supabase.from("emet_verified_answers").upsert({
        cache_key: key,
        schema_version: value.answer.schemaVersion,
        prompt_version: EMET_AI_PROMPT_VERSION,
        evidence_version: packet.provenance.evidenceVersion,
        canonical_entity_id:
          packet.identity.canonicalEntityId || null,
        answer: value.answer,
        model: value.model,
        created_at: value.createdAt,
        updated_at: value.createdAt,
      });

      if (error) {
        throw new Error("Verified EMET answer storage failed.");
      }
    },
  };
}

const REQUEST_CACHE_SCHEMA = "emet-ai-request-cache@2" as const;

type EmetAiRequestCacheRecord = {
  schemaVersion: typeof REQUEST_CACHE_SCHEMA;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
};

function parseRequestCacheRecord(value: unknown): EmetAiRequestCacheRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== REQUEST_CACHE_SCHEMA ||
    !candidate.packet ||
    typeof candidate.packet !== "object"
  ) {
    return null;
  }
  const packet = candidate.packet as EmetAiEvidencePacket;
  const answer = parseEmetAiAnswer(candidate.answer);
  const packetValidation = validateEmetAiEvidencePacket(packet);
  const answerValidation = answer && validateEmetAiAnswer(packet, answer);
  if (!packetValidation.ok || !answerValidation?.ok) return null;
  return {
    schemaVersion: REQUEST_CACHE_SCHEMA,
    packet: packetValidation.value,
    answer: answerValidation.value,
  };
}

export async function getSupabaseEmetAiRequestCache(key: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("emet_verified_answers")
    .select("answer, model")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  const record = parseRequestCacheRecord(data.answer);
  return record ? { ...record, model: data.model as string } : null;
}

export async function setSupabaseEmetAiRequestCache({
  key,
  packet,
  answer,
  model,
  createdAt,
}: {
  key: string;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
  model: string;
  createdAt: string;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const packetValidation = validateEmetAiEvidencePacket(packet);
  const answerValidation = validateEmetAiAnswer(packet, answer);
  if (!packetValidation.ok || !answerValidation.ok) return false;

  const record: EmetAiRequestCacheRecord = {
    schemaVersion: REQUEST_CACHE_SCHEMA,
    packet: packetValidation.value,
    answer: answerValidation.value,
  };
  const { error } = await supabase.from("emet_verified_answers").upsert({
    cache_key: key,
    schema_version: REQUEST_CACHE_SCHEMA,
    prompt_version: EMET_AI_PROMPT_VERSION,
    evidence_version: packet.provenance.evidenceVersion,
    canonical_entity_id: packet.identity.canonicalEntityId || null,
    answer: record,
    model,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return !error;
}
