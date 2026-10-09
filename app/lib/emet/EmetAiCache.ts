import "server-only";

import { createHash } from "node:crypto";

import {
  EMET_AI_COVERAGE_VERSION,
  EMET_AI_PROMPT_VERSION,
  type EmetAiAnswer,
  type EmetAiEvidencePacket,
} from "./EmetAiContract";
import type { EmetConversationContext } from "./EmetAiConversation";
import { EMET_AI_RETRIEVAL_PLAN_SCHEMA } from "./EmetAiRetrievalPlan";
import type { EmetAiReaderContext } from "./EmetAiTopicEvidence";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";
import {
  classifyEmetAiResponseDesign,
  EMET_AI_CONCISE_STYLE_VERSION,
  EMET_AI_RESPONSE_POLICY_VERSION,
} from "./EmetAiResponseDesign";

export type EmetAiCachedAnswer = {
  answer: EmetAiAnswer;
  createdAt: string;
  model: string;
};

export interface EmetAiAnswerStore {
  get(key: string): Promise<EmetAiCachedAnswer | null>;
  set(key: string, value: EmetAiCachedAnswer): Promise<void>;
}

function normalizedQuestion(question: string) {
  return question
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

export function getEmetAiCacheKey(packet: EmetAiEvidencePacket) {
  const identity = packet.identity.canonicalEntityId || "no-entity";
  const conciseStyle = packet.responseDesign?.depth === "concise"
    ? {
        responseStyleVersion: EMET_AI_CONCISE_STYLE_VERSION,
        responseDesign: packet.responseDesign,
      }
    : {};
  const stableInput = JSON.stringify({
    schemaVersion: packet.schemaVersion,
    promptVersion: EMET_AI_PROMPT_VERSION,
    responsePolicyVersion: EMET_AI_RESPONSE_POLICY_VERSION,
    responseDesign: packet.responseDesign || null,
    question: normalizedQuestion(packet.question),
    reasoning: packet.reasoning,
    scopeType: packet.scope.type,
    references: [...packet.scope.references].sort(),
    entityIds: [...packet.scope.entityIds].sort(),
    identity,
    ...conciseStyle,
    evidenceVersion: packet.provenance.evidenceVersion,
    evidence: packet.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      corpus: item.corpus,
      text: item.text,
      reference: item.reference || "",
      entityId: item.entityId || "",
      lexicalId: item.lexicalId || "",
      authority: item.provenance.authority,
      sourceId: item.provenance.sourceId || "",
      checksum: item.provenance.checksum || "",
    })),
  });

  return `emet-ai:${createHash("sha256")
    .update(stableInput, "utf8")
    .digest("hex")}`;
}

export function getEmetAiRequestCacheKey({
  question,
  conversation,
  context,
}: {
  question: string;
  conversation: EmetConversationContext | null;
  context: EmetAiReaderContext | null;
}) {
  const requestedCoverage = extractEmetAiRequestedCoverage(question);
  const responseDesign = classifyEmetAiResponseDesign({ question, conversation });
  const hasRequestedCoverage =
    requestedCoverage.passages.length > 0 ||
    requestedCoverage.language.length > 0 ||
    requestedCoverage.subquestions.length > 0 ||
    requestedCoverage.competingInterpretations;
  const stableInput = JSON.stringify({
    requestSchema: "emet-ai-request-cache@4",
    promptVersion: EMET_AI_PROMPT_VERSION,
    responsePolicyVersion: EMET_AI_RESPONSE_POLICY_VERSION,
    retrievalPlanSchema: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    responseDesign,
    question: normalizedQuestion(question),
    ...(responseDesign.depth === "concise"
      ? {
          responseStyleVersion: EMET_AI_CONCISE_STYLE_VERSION,
          responseDesign,
        }
      : {}),
    ...(hasRequestedCoverage
      ? { coverageVersion: EMET_AI_COVERAGE_VERSION, requestedCoverage }
      : {}),
    context: context
      ? {
          book: context.book,
          chapter: context.chapter,
          verse: context.verse === null || context.verse === undefined
            ? null
            : String(context.verse),
          translation: context.translation,
        }
      : null,
    conversation: conversation
      ? {
          summary: {
            topics: conversation.summary.topics,
            passages: conversation.summary.passages,
            corrections: conversation.summary.corrections.map(normalizedQuestion),
            earlierQuestions:
              conversation.summary.earlierQuestions.map(normalizedQuestion),
            establishedClaims: conversation.summary.establishedClaims.map(
              (claim) => ({
                id: claim.id,
                text: normalizedQuestion(claim.text),
                support: claim.support,
                category: claim.category,
                polarity: claim.polarity,
                scope: normalizedQuestion(claim.scope),
                timing: claim.timing,
                references: [...claim.references].sort(),
              }),
            ),
          },
          recentExchanges: conversation.recentExchanges.map((exchange) => ({
            question: normalizedQuestion(exchange.question),
            outcome: exchange.outcome,
            references: [...exchange.references].sort(),
            claims: exchange.claims.map((claim) => ({
              id: claim.id,
              text: normalizedQuestion(claim.text),
              support: claim.support,
              category: claim.category,
              polarity: claim.polarity,
              scope: normalizedQuestion(claim.scope),
              timing: claim.timing,
              references: [...claim.references].sort(),
            })),
          })),
        }
      : null,
  });

  return `emet-ai-request:${createHash("sha256")
    .update(stableInput, "utf8")
    .digest("hex")}`;
}

export function createMemoryEmetAiAnswerStore(): EmetAiAnswerStore {
  const records = new Map<string, EmetAiCachedAnswer>();

  return {
    async get(key) {
      return records.get(key) || null;
    },
    async set(key, value) {
      records.set(key, value);
    },
  };
}
