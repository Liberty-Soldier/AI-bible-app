import "server-only";

import type { EmetAiReaderContext } from "./EmetAiTopicEvidence";
import type { EmetConversationContext } from "./EmetAiConversation";
import type { EmetAiReasoningCategory } from "./EmetAiContract";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";

export const EMET_AI_RETRIEVAL_PLAN_SCHEMA =
  "emet-ai-retrieval-plan@3" as const;

export type EmetAiRetrievalRole =
  | "direct"
  | "foundation"
  | "later-witness"
  | "qualifying"
  | "contrast"
  | "context";

export type EmetAiPlannedPassage = {
  reference: string;
  role: EmetAiRetrievalRole;
  reason: string;
  priority: number;
};

export type EmetAiPlannedSourcePhrase = {
  corpus: "hebrew" | "lxx" | "greek-nt";
  label: string;
  lexicalIds: string[];
  lemmas: string[];
  reason: string;
};

export type EmetAiPlannedComponent = {
  id: string;
  proposition: string;
  category: EmetAiReasoningCategory;
};

export type EmetAiRetrievalPlan = {
  schemaVersion: typeof EMET_AI_RETRIEVAL_PLAN_SCHEMA;
  subject: string;
  analysisMode:
    | "simple"
    | "doctrinal-claim"
    | "apparent-contradiction";
  proposition: string;
  requiresScopeAnalysis: boolean;
  requiresTimeline: boolean;
  components: EmetAiPlannedComponent[];
  intent:
    | "identity"
    | "meaning"
    | "event"
    | "relationship"
    | "continuity"
    | "comparison"
    | "application"
    | "passage"
    | "other";
  passages: EmetAiPlannedPassage[];
  sourcePhrases: EmetAiPlannedSourcePhrase[];
  limitations: string[];
};

const roles = new Set<EmetAiRetrievalRole>([
  "direct",
  "foundation",
  "later-witness",
  "qualifying",
  "contrast",
  "context",
]);
const intents = new Set<EmetAiRetrievalPlan["intent"]>([
  "identity",
  "meaning",
  "event",
  "relationship",
  "continuity",
  "comparison",
  "application",
  "passage",
  "other",
]);
const corpora = new Set<EmetAiPlannedSourcePhrase["corpus"]>([
  "hebrew",
  "lxx",
  "greek-nt",
]);
const analysisModes = new Set<EmetAiRetrievalPlan["analysisMode"]>([
  "simple",
  "doctrinal-claim",
  "apparent-contradiction",
]);
const componentCategories = new Set<EmetAiPlannedComponent["category"]>([
  "identity",
  "authority",
  "nature",
  "relationship",
  "practice",
  "duration",
  "command",
  "covenant",
  "covenant-participants",
  "priesthood",
  "mediator",
  "sanctuary",
  "sacrifice",
  "promise",
  "timing",
  "prophecy",
  "chronology",
  "event",
  "application",
  "other",
]);

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) return null;
  const result = Array.from(
    new Set(value.map((item) => clean(item, maxLength)).filter(Boolean)),
  );
  return result.length <= limit ? result : result.slice(0, limit);
}

export function parseEmetAiRetrievalPlan(
  value: unknown,
): EmetAiRetrievalPlan | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_RETRIEVAL_PLAN_SCHEMA ||
    !analysisModes.has(candidate.analysisMode as EmetAiRetrievalPlan["analysisMode"]) ||
    typeof candidate.requiresScopeAnalysis !== "boolean" ||
    typeof candidate.requiresTimeline !== "boolean" ||
    !intents.has(candidate.intent as EmetAiRetrievalPlan["intent"]) ||
    !Array.isArray(candidate.components) ||
    !Array.isArray(candidate.passages) ||
    !Array.isArray(candidate.sourcePhrases) ||
    !Array.isArray(candidate.limitations)
  ) {
    return null;
  }

  const subject = clean(candidate.subject, 160);
  const proposition = clean(candidate.proposition, 360);
  if (!subject || !proposition) return null;

  const components: EmetAiPlannedComponent[] = [];
  const componentIds = new Set<string>();
  for (const item of candidate.components.slice(0, 8)) {
    if (!item || typeof item !== "object") return null;
    const component = item as Record<string, unknown>;
    const id = clean(component.id, 40);
    const componentProposition = clean(component.proposition, 260);
    const category = component.category as EmetAiPlannedComponent["category"];
    if (
      !id ||
      componentIds.has(id) ||
      !componentProposition ||
      !componentCategories.has(category)
    ) {
      return null;
    }
    componentIds.add(id);
    components.push({ id, proposition: componentProposition, category });
  }

  if (
    candidate.analysisMode !== "simple" &&
    components.length < 2
  ) {
    return null;
  }

  const passages: EmetAiPlannedPassage[] = [];
  for (const item of candidate.passages.slice(0, 16)) {
    if (!item || typeof item !== "object") return null;
    const passage = item as Record<string, unknown>;
    const reference = clean(passage.reference, 80);
    const reason = clean(passage.reason, 240);
    const role = passage.role as EmetAiRetrievalRole;
    const priority = Number(passage.priority);
    if (
      !reference ||
      !reason ||
      !roles.has(role) ||
      !Number.isInteger(priority) ||
      priority < 1 ||
      priority > 100
    ) {
      return null;
    }
    passages.push({ reference, reason, role, priority });
  }

  const sourcePhrases: EmetAiPlannedSourcePhrase[] = [];
  for (const item of candidate.sourcePhrases.slice(0, 4)) {
    if (!item || typeof item !== "object") return null;
    const phrase = item as Record<string, unknown>;
    const corpus = phrase.corpus as EmetAiPlannedSourcePhrase["corpus"];
    const label = clean(phrase.label, 120);
    const reason = clean(phrase.reason, 240);
    const lexicalIds = cleanList(phrase.lexicalIds, 6, 32);
    const lemmas = cleanList(phrase.lemmas, 6, 80);
    if (
      !corpora.has(corpus) ||
      !label ||
      !reason ||
      !lexicalIds ||
      !lemmas ||
      (lexicalIds.length < 1 && lemmas.length < 1)
    ) {
      continue;
    }
    sourcePhrases.push({ corpus, label, lexicalIds, lemmas, reason });
  }

  const limitations = cleanList(candidate.limitations, 6, 240);
  if (!limitations) return null;

  return {
    schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    subject,
    analysisMode: candidate.analysisMode as EmetAiRetrievalPlan["analysisMode"],
    proposition,
    requiresScopeAnalysis: candidate.requiresScopeAnalysis,
    requiresTimeline: candidate.requiresTimeline,
    components,
    intent: candidate.intent as EmetAiRetrievalPlan["intent"],
    passages,
    sourcePhrases,
    limitations,
  };
}

export function buildEmetAiRetrievalInput({
  question,
  conversation,
  context,
}: {
  question: string;
  conversation: EmetConversationContext | null;
  context: EmetAiReaderContext | null;
}) {
  return {
    question: question.trim(),
    requestedCoverage: extractEmetAiRequestedCoverage(question),
    readerContext: context
      ? {
          book: context.book,
          chapter: context.chapter,
          verse: context.verse ?? null,
          translation: context.translation,
        }
      : null,
    conversation: conversation
      ? {
          earlierTopics: conversation.summary.topics,
          earlierPassages: conversation.summary.passages,
          corrections: conversation.summary.corrections,
          recentQuestions: conversation.recentExchanges.slice(-4).map(
            (exchange) => exchange.question,
          ),
          recentTurns: conversation.recentExchanges.slice(-4).map((exchange) => ({
            question: exchange.question,
            outcome: exchange.outcome,
          })),
          recentReferences: Array.from(
            new Set(
              conversation.recentExchanges.flatMap(
                (exchange) => exchange.references,
              ),
            ),
          ).slice(-12),
          priorStructuredClaims: [
            ...conversation.summary.establishedClaims,
            ...conversation.recentExchanges.flatMap(
              (exchange) => exchange.claims,
            ),
          ].slice(-8),
        }
      : null,
  };
}
