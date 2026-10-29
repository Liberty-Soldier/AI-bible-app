import "server-only";

import { createHash } from "node:crypto";

import type { EmetAiAnswerStore } from "./EmetAiCache";
import { isEmetAiCachedAnswerAuthorityVerified } from "./EmetAiCachedAnswerAuthority";
import {
  EMET_AI_PROMPT_VERSION,
  parseEmetAiAnswer,
  validateEmetAiAnswer,
  validateEmetAiEvidencePacket,
  type EmetAiAnswer,
  type EmetAiEvidencePacket,
} from "./EmetAiContract";
import { createSupabaseAdminClient } from "../supabase/admin";
import { validateEmetAiPretrainedAdaptedContracts } from "./pretrained/EmetAiPretrainedAdapter";
import {
  EMET_AI_PRETRAINED_ENGINE_PROFILE,
  EMET_AI_PRETRAINED_PROMPT_SHA256,
  EMET_AI_PRETRAINED_PROMPT_VERSION,
  EMET_AI_PRETRAINED_VERIFIER_VERSION,
  parseEmetAiPretrainedDraft,
  type EmetAiPretrainedDraft,
} from "./pretrained/EmetAiPretrainedContract";
import type { EmetAiPretrainedAudit } from "./pretrained/EmetAiPretrainedService";
import {
  parseEmetConversationClaims,
  type EmetConversationClaim,
} from "./EmetAiConversation";

const CONVERSATION_LEDGER_SCHEMA = "emet-conversation-ledger@1" as const;

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

      const parsed = parseEmetAiAnswer(data.answer);
      if (!parsed || !validateEmetAiAnswer(packet, parsed).ok ||
        !isEmetAiCachedAnswerAuthorityVerified({ packet, answer: parsed })) return null;

      return {
        answer: data.answer,
        createdAt: data.created_at,
        model: data.model,
      };
    },

    async set(key, value) {
      if (!validateEmetAiAnswer(packet, value.answer).ok ||
        !isEmetAiCachedAnswerAuthorityVerified({ packet, answer: value.answer })) return;
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

const REQUEST_CACHE_SCHEMA = "emet-ai-request-cache@4" as const;

type EmetAiRequestCacheRecord = {
  schemaVersion: typeof REQUEST_CACHE_SCHEMA;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
};

function parseRequestCacheRecord(value: unknown, question?: string): EmetAiRequestCacheRecord | null {
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
  if (!isEmetAiCachedAnswerAuthorityVerified({ packet, answer: answerValidation.value, question })) return null;
  return {
    schemaVersion: REQUEST_CACHE_SCHEMA,
    packet: packetValidation.value,
    answer: answerValidation.value,
  };
}

export async function getSupabaseEmetAiRequestCache(key: string, question?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("emet_verified_answers")
    .select("answer, model")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  try {
    const record = parseRequestCacheRecord(data.answer, question);
    return record ? { ...record, model: data.model as string } : null;
  } catch {
    return null;
  }
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
  if (!isEmetAiCachedAnswerAuthorityVerified({ packet, answer: answerValidation.value })) return false;

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

export async function getSupabaseEmetConversationLedger({
  userId,
  conversationId,
}: {
  userId: string;
  conversationId: string;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("emet_conversation_ledgers")
    .select("ledger")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) return null;
  if (!data) return [];
  const ledger = data.ledger as Record<string, unknown> | null;
  if (ledger?.schemaVersion !== CONVERSATION_LEDGER_SCHEMA) return null;
  return parseEmetConversationClaims(ledger.claims);
}

export function emetConversationClaimsFromAnswer(answer: EmetAiAnswer) {
  const referencesByEvidenceId = new Map<string, string[]>();
  for (const citation of answer.citations) {
    if (!citation.reference) continue;
    const references = referencesByEvidenceId.get(citation.evidenceId) || [];
    references.push(citation.reference);
    referencesByEvidenceId.set(citation.evidenceId, references);
  }
  return answer.claims.map<EmetConversationClaim>((claim) => {
    const references = Array.from(
      new Set(
        claim.evidenceIds.flatMap(
          (evidenceId) => referencesByEvidenceId.get(evidenceId) || [],
        ),
      ),
    );
    const propositionIdentity = JSON.stringify({
      text: claim.text.trim(),
      support: claim.support,
      category: claim.category,
      polarity: claim.polarity,
      scope: claim.scope.trim(),
      timing: claim.timing,
      references: [...references].sort(),
    });
    return {
      id: `p:${createHash("sha256").update(propositionIdentity).digest("hex").slice(0, 24)}`,
      text: claim.text,
      support: claim.support,
      category: claim.category,
      polarity: claim.polarity,
      scope: claim.scope,
      timing: claim.timing,
      references,
    };
  });
}

export async function appendSupabaseEmetConversationLedger({
  userId,
  conversationId,
  claims,
}: {
  userId: string;
  conversationId: string;
  claims: EmetConversationClaim[];
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const parsedClaims = parseEmetConversationClaims(claims);
  if (!parsedClaims) return false;
  const { error } = await supabase.rpc("append_emet_conversation_ledger", {
    p_user_id: userId,
    p_conversation_id: conversationId,
    p_claims: parsedClaims,
  });
  return !error;
}
const PRETRAINED_REQUEST_CACHE_SCHEMA = "emet-ai-pretrained-request-cache@1" as const;
type EmetAiPretrainedRequestCacheRecord = {
  schemaVersion: typeof PRETRAINED_REQUEST_CACHE_SCHEMA;
  engineProfile: typeof EMET_AI_PRETRAINED_ENGINE_PROFILE;
  promptSha256: typeof EMET_AI_PRETRAINED_PROMPT_SHA256;
  verifierVersion: typeof EMET_AI_PRETRAINED_VERIFIER_VERSION;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
  draft: EmetAiPretrainedDraft;
  audit: EmetAiPretrainedAudit;
};

function parsePretrainedRequestCacheRecord(value: unknown): EmetAiPretrainedRequestCacheRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== PRETRAINED_REQUEST_CACHE_SCHEMA ||
    candidate.engineProfile !== EMET_AI_PRETRAINED_ENGINE_PROFILE ||
    candidate.promptSha256 !== EMET_AI_PRETRAINED_PROMPT_SHA256 ||
    candidate.verifierVersion !== EMET_AI_PRETRAINED_VERIFIER_VERSION ||
    !candidate.packet || typeof candidate.packet !== "object" ||
    !candidate.audit || typeof candidate.audit !== "object"
  ) return null;
  const packet = candidate.packet as EmetAiEvidencePacket;
  const answer = parseEmetAiAnswer(candidate.answer);
  const draft = parseEmetAiPretrainedDraft(candidate.draft);
  if (!answer || !draft) return null;
  const validation = validateEmetAiPretrainedAdaptedContracts(packet, answer);
  if (!validation.ok) return null;
  return {
    schemaVersion: PRETRAINED_REQUEST_CACHE_SCHEMA,
    engineProfile: EMET_AI_PRETRAINED_ENGINE_PROFILE,
    promptSha256: EMET_AI_PRETRAINED_PROMPT_SHA256,
    verifierVersion: EMET_AI_PRETRAINED_VERIFIER_VERSION,
    packet: validation.packet,
    answer: validation.answer,
    draft,
    audit: candidate.audit as EmetAiPretrainedAudit,
  };
}

export async function getSupabaseEmetAiPretrainedRequestCache(key: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("emet_verified_answers").select("answer, model").eq("cache_key", key).maybeSingle();
  if (error || !data) return null;
  const record = parsePretrainedRequestCacheRecord(data.answer);
  return record ? { ...record, model: data.model as string } : null;
}

export async function setSupabaseEmetAiPretrainedRequestCache({ key, packet, answer, draft, audit, model, createdAt }: {
  key: string;
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
  draft: EmetAiPretrainedDraft;
  audit: EmetAiPretrainedAudit;
  model: string;
  createdAt: string;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || answer.status !== "complete" || audit.displayedEngine !== EMET_AI_PRETRAINED_ENGINE_PROFILE || audit.fallbackReason) return false;
  const validation = validateEmetAiPretrainedAdaptedContracts(packet, answer);
  if (!validation.ok) return false;
  const record: EmetAiPretrainedRequestCacheRecord = {
    schemaVersion: PRETRAINED_REQUEST_CACHE_SCHEMA,
    engineProfile: EMET_AI_PRETRAINED_ENGINE_PROFILE,
    promptSha256: EMET_AI_PRETRAINED_PROMPT_SHA256,
    verifierVersion: EMET_AI_PRETRAINED_VERIFIER_VERSION,
    packet: validation.packet,
    answer: validation.answer,
    draft,
    audit,
  };
  const { error } = await supabase.from("emet_verified_answers").upsert({
    cache_key: key,
    schema_version: PRETRAINED_REQUEST_CACHE_SCHEMA,
    prompt_version: EMET_AI_PRETRAINED_PROMPT_VERSION,
    evidence_version: packet.provenance.evidenceVersion,
    canonical_entity_id: packet.identity.canonicalEntityId || null,
    answer: record,
    model,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return !error;
}
