import "server-only";

import type { EmetAiAnswerStore } from "./EmetAiCache";
import {
  EMET_AI_PROMPT_VERSION,
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
