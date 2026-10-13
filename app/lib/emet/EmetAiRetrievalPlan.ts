import "server-only";

import { normalizeBookName } from "../../data/bookAliases";
import type { EmetAiReaderContext } from "./EmetAiTopicEvidence";
import type { EmetConversationContext } from "./EmetAiConversation";
import type { EmetAiReasoningCategory } from "./EmetAiContract";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";
import { classifyEmetAiResponseDesign } from "./EmetAiResponseDesign";
import type { EmetAiQuestionContract } from "./EmetAiQuestionContract";

export const EMET_AI_RETRIEVAL_PLAN_SCHEMA =
  "emet-ai-retrieval-plan@4" as const;

const SINGLE_CHAPTER_BOOKS = new Set([
  "Obadiah", "Philemon", "2 John", "3 John", "Jude",
]);

export type EmetAiPlanReferenceNormalization =
  | { status: "resolved"; references: string[] }
  | { status: "ambiguous" | "invalid"; reason: string };

export function normalizeEmetAiPlanReference(
  value: string,
  exists: (reference: string) => boolean,
): EmetAiPlanReferenceNormalization {
  const trimmed = value.trim().replace(/[–—]/g, "-");
  const ordinary = expandEmetAiPlanReferences(trimmed);
  if (ordinary.length) {
    if (ordinary.every(exists)) return { status: "resolved", references: ordinary };
    return {
      status: "invalid",
      reason: `Planned Scripture reference does not exist in the locked corpus: ${value}`,
    };
  }

  // Models occasionally express one verse as editorial halves (for example
  // Luke 1:6a-1:6b?). Collapse only when both endpoints name the same actual
  // verse. Different base verses or chapters are not safe to guess.
  const subverseRange = trimmed.match(
    /^(.+?)\s+(\d+):(\d+)[a-z]\s*-\s*(?:(\d+):)?(\d+)[a-z]\??$/i,
  );
  if (subverseRange) {
    const book = normalizeBookName(subverseRange[1]);
    const chapter = Number(subverseRange[2]);
    const endChapter = subverseRange[4] ? Number(subverseRange[4]) : chapter;
    const startVerse = Number(subverseRange[3]);
    const endVerse = Number(subverseRange[5]);
    if (book && chapter === endChapter && startVerse === endVerse) {
      const reference = `${book} ${chapter}:${startVerse}`;
      return exists(reference)
        ? { status: "resolved", references: [reference] }
        : {
            status: "invalid",
            reason: `Normalized planned Scripture reference does not exist in the locked corpus: ${reference}`,
          };
    }
    return {
      status: "ambiguous",
      reason: `Editorial subverse range cannot be mapped unambiguously to one locked Scripture passage: ${value}`,
    };
  }

  if (/^.+?\s+\d+$/.test(trimmed)) {
    return {
      status: "ambiguous",
      reason: `A chapter reference does not identify which individual governing verse is intended: ${value}`,
    };
  }
  return {
    status: "invalid",
    reason: `Planned Scripture reference is malformed or unsupported: ${value}`,
  };
}

export function expandEmetAiPlanReferences(value: string) {
  const trimmed = value.trim().replace(/[–—]/g, "-");
  const ranged = trimmed.match(/^(.+?)\s+(\d+):(\d+)-(\d+)$/i);
  if (ranged) {
    const book = normalizeBookName(ranged[1]);
    const chapter = Number(ranged[2]);
    const start = Number(ranged[3]);
    const end = Number(ranged[4]);
    if (book && end >= start && end - start <= 12) {
      return Array.from({ length: end - start + 1 }, (_, offset) =>
        `${book} ${chapter}:${start + offset}`,
      );
    }
  }
  const standard = trimmed.match(/^(.+?)\s+(\d+):(\d+[a-z]?)$/i);
  if (standard) {
    const book = normalizeBookName(standard[1]);
    return book ? [`${book} ${Number(standard[2])}:${standard[3]}`] : [];
  }
  const singleChapter = trimmed.match(/^(.+?)\s+(\d+[a-z]?)$/i);
  if (singleChapter) {
    const book = normalizeBookName(singleChapter[1]);
    return SINGLE_CHAPTER_BOOKS.has(book)
      ? [`${book} 1:${singleChapter[2]}`]
      : [];
  }
  return [];
}

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
  governingReferences: string[];
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
    const governingReferences = cleanList(component.governingReferences, 8, 80);
    if (
      !id ||
      componentIds.has(id) ||
      !componentProposition ||
      !componentCategories.has(category) ||
      !governingReferences ||
      !governingReferences.length
    ) {
      return null;
    }
    componentIds.add(id);
    components.push({
      id,
      proposition: componentProposition,
      category,
      governingReferences,
    });
  }

  if (
    (candidate.analysisMode === "doctrinal-claim" && components.length < 1) ||
    (candidate.analysisMode === "apparent-contradiction" && components.length < 1)
  ) {
    return null;
  }

  const passages: EmetAiPlannedPassage[] = [];
  for (const item of candidate.passages.slice(0, 24)) {
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

  const plannedReferences = new Set(
    passages.flatMap((passage) => expandEmetAiPlanReferences(passage.reference)),
  );
  if (
    components.some((component) =>
      component.governingReferences.some((reference) =>
        !expandEmetAiPlanReferences(reference).some((expanded) =>
          plannedReferences.has(expanded),
        ),
      ),
    )
  ) {
    return null;
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
  questionContract,
}: {
  question: string;
  conversation: EmetConversationContext | null;
  context: EmetAiReaderContext | null;
  questionContract?: EmetAiQuestionContract;
}) {
  return {
    question: question.trim(),
    questionContract: questionContract || null,
    requestedCoverage:
      questionContract?.requestedCoverage || extractEmetAiRequestedCoverage(question),
    responseDesign:
      questionContract?.responseDesign ||
      classifyEmetAiResponseDesign({ question, conversation }),
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
