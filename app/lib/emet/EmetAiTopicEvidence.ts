import "server-only";

import fs from "node:fs";
import path from "node:path";

import { normalizeBookName } from "../../data/bookAliases";
import { EMET_AI_MAX_PLANNED_RANGE_VERSES } from "./EmetAiReferenceLimits";
import {
  EMET_AI_EVIDENCE_SCHEMA,
  EMET_AI_COVERAGE_VERSION,
  type EmetAiEstablishedProposition,
  type EmetAiEvidenceItem,
  type EmetAiEvidencePacket,
  validateEmetAiEvidencePacket,
} from "./EmetAiContract";
import {
  buildEmetConversationQuestion,
  relevantEmetConversation,
  type EmetConversationContext,
} from "./EmetAiConversation";
import type {
  EmetAiRetrievalPlan,
  EmetAiRetrievalRole,
} from "./EmetAiRetrievalPlan";
import {
  verifiedSourcePhraseMatches,
  verifiedSourceTermsAtReference,
  type VerifiedSourcePhraseMatch,
} from "./EmetAiSourcePhrase";
import {
  extractEmetAiRequestedCoverage,
  requestedCoverageComponents,
} from "./EmetAiRequestedCoverage";
import { classifyEmetAiResponseDesign } from "./EmetAiResponseDesign";
import {
  buildEmetAiQuestionContract,
  type EmetAiQuestionContract,
} from "./EmetAiQuestionContract";
import { expectedEmetAiNamedListCount } from "./EmetAiAnswerCompleteness";

type SearchTranslation = "web" | "kjv" | "brenton";
type SearchRecord = [book: string, chapter: number, verse: string, text: string];
type SearchIndex = {
  translation: SearchTranslation;
  sourceFingerprint: string;
  records: SearchRecord[];
};

type RetrievalMethod = NonNullable<
  EmetAiEvidenceItem["provenance"]["retrieval"]
>["method"];

type EvidenceCandidate = {
  index: SearchIndex;
  record: SearchRecord;
  recordIndex: number;
  method: RetrievalMethod;
  role: EmetAiRetrievalRole;
  reason: string;
  score: number;
  sourceFingerprint?: string;
};

export type EmetAiReaderContext = {
  book: string;
  chapter: number;
  verse?: string | number | null;
  translation: SearchTranslation;
};

const MAX_LITERAL_FALLBACK_VERSES = 8;

export type EmetAiDeterministicEvidenceRoute =
  | "direct-factual"
  | "exact-reference-text"
  | "bounded-reference-explanation"
  | "single-reference-lexical"
  | "named-list"
  | "conversation-recall";

export type EmetAiDeterministicSufficiency = {
  sufficient: boolean;
  route: EmetAiDeterministicEvidenceRoute | null;
  reason: string;
  references: string[];
};

export type EmetAiInitialScriptureItem = {
  id: string;
  reference: string;
  text: string;
  translation: SearchTranslation;
};

function reestablishedConversationPropositions(
  conversation: EmetConversationContext | null,
  evidence: EmetAiEvidenceItem[],
) {
  if (!conversation) return [];
  const evidenceByReference = new Map<string, string[]>();
  for (const item of evidence) {
    if (!item.reference) continue;
    const ids = evidenceByReference.get(item.reference) || [];
    ids.push(item.id);
    evidenceByReference.set(item.reference, ids);
  }

  const result: EmetAiEstablishedProposition[] = [];
  const seen = new Set<string>();
  const claims = [
    ...conversation.summary.establishedClaims,
    ...conversation.recentExchanges.flatMap((exchange) => exchange.claims),
  ];
  for (const claim of claims) {
    if (
      claim.support !== "explicit-statement" &&
      claim.support !== "strong-implication"
    ) continue;
    const evidenceIds = Array.from(
      new Set(
        claim.references.flatMap(
          (reference) => evidenceByReference.get(reference) || [],
        ),
      ),
    );
    if (!evidenceIds.length || seen.has(claim.id)) continue;
    seen.add(claim.id);
    result.push({
      id: claim.id,
      text: claim.text,
      support: claim.support,
      category: claim.category,
      polarity: claim.polarity,
      scope: claim.scope,
      timing: claim.timing,
      evidenceIds,
    });
  }
  return result.slice(-32);
}
const READER_DEPENDENT_PATTERN =
  /\b(this|that)\s+(verse|chapter|passage|word|text)\b|\b(in|from)\s+this\s+(verse|chapter|passage)\b|\bwho is speaking\b|\bprevious\s+(verse|chapter)\b|\bwhat does (this|that|it) mean\b|\bhere\b|\bverse\s+\d+\b/i;
const STOP_WORDS = new Set([
  "about", "according", "after", "also", "and", "are", "because", "before",
  "bible", "but", "called", "can", "could", "did", "does", "establish",
  "established", "evidence", "explain", "for", "from", "has", "have", "how",
  "into", "is", "its", "mean", "means", "of", "on", "or", "say", "says",
  "scripture", "should", "teach", "teaches", "tell", "testament", "that", "the",
  "their", "theme", "then", "there", "these", "they", "this", "through", "to",
  "was", "what", "when", "where", "which", "who", "why", "will", "with",
  "would", "you", "your", "understand",
]);
const TOPIC_TERM_GROUPS = [
  ["tabernacle", "tabernacles", "sukkot", "booth", "booths", "shelter", "shelters", "ingathering"],
  ["atonement", "kippur", "reconciliation"],
  ["resurrection", "resurrected", "raised"],
  ["passover", "pascha", "unleavened"],
] as const;
const DIRECT_TERM_GROUPS = [
  ["abolish", "abolished", "abolishing", "destroy", "destroyed", "nullify", "nullified", "void"],
  ["command", "commands", "commandment", "commandments", "law", "laws", "torah", "instruction", "instructions"],
  ["keep", "keeps", "keeping", "obey", "obeys", "obeying", "observe", "observes", "observing"],
  ["messiah", "christ", "jesus"],
  ["yahweh", "lord", "god", "father"],
  ["believer", "believers", "disciple", "disciples", "saint", "saints"],
  ["sabbath", "seventh-day", "seventh", "rest"],
  ["resurrection", "resurrected", "raised", "rise"],
  ["die", "dies", "died", "death", "dead"],
] as const;
const SINGLE_CHAPTER_BOOKS = new Set([
  "Obadiah",
  "Philemon",
  "2 John",
  "3 John",
  "Jude",
]);

const indexes = new Map<SearchTranslation, SearchIndex>();
const recordMaps = new Map<SearchTranslation, Map<string, number>>();
const deterministicEvidenceCache = new Map<string, ReturnType<typeof resolveDeterministicEvidence>>();
let webDocumentFrequency: Map<string, number> | null = null;

function loadIndex(translation: SearchTranslation) {
  const cached = indexes.get(translation);
  if (cached) return cached;
  const filePath = path.join(
    process.cwd(),
    "public",
    "scripture",
    "search",
    `${translation}.json`,
  );
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SearchIndex;
  indexes.set(translation, parsed);
  return parsed;
}

function structuredReferenceKey(
  book: string,
  chapter: string | number,
  verse: string | number,
) {
  return `${book.normalize("NFKC").toLocaleLowerCase("en-US").trim()}|${Number(chapter)}|${String(verse).toLocaleLowerCase("en-US")}`;
}

function recordReference(record: SearchRecord) {
  return `${record[0]} ${record[1]}:${record[2]}`;
}

function loadRecordMap(index: SearchIndex) {
  const cached = recordMaps.get(index.translation);
  if (cached) return cached;
  const map = new Map(
    index.records.map((record, recordIndex) => [
      structuredReferenceKey(record[0], record[1], record[2]),
      recordIndex,
    ]),
  );
  recordMaps.set(index.translation, map);
  return map;
}

function tokenizedWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 2 && word.length <= 40);
}

function questionTerms(question: string) {
  const expanded = new Set(
    tokenizedWords(question).filter((word) => !STOP_WORDS.has(word)),
  );
  for (const group of TOPIC_TERM_GROUPS) {
    if (group.some((term) => expanded.has(term))) {
      group.forEach((term) => expanded.add(term));
    }
  }
  return Array.from(expanded).slice(0, 20);
}

function normalizePlannedReference(value: string) {
  const trimmed = value.trim().replace(/[–—]/g, "-");
  const match = trimmed.match(/^(.+?)\s+(\d+):(\d+[a-z]?)$/i);
  if (match) {
    const book = normalizeBookName(match[1]);
    if (!book) return null;
    return `${book} ${Number(match[2])}:${match[3]}`;
  }
  const singleChapter = trimmed.match(/^(.+?)\s+(\d+[a-z]?)$/i);
  if (!singleChapter) return null;
  const book = normalizeBookName(singleChapter[1]);
  return SINGLE_CHAPTER_BOOKS.has(book)
    ? `${book} 1:${singleChapter[2]}`
    : null;
}

export function expandPlannedReferences(value: string) {
  const trimmed = value.trim().replace(/[–—]/g, "-");
  const commaList = trimmed.match(/^(.+?)\s+(\d+):(.+,.+)$/i);
  if (commaList) {
    const book = normalizeBookName(commaList[1]);
    const chapter = Number(commaList[2]);
    if (!book || !Number.isInteger(chapter)) return [];
    const expanded: string[] = [];
    for (const rawPart of commaList[3].split(",")) {
      const part = rawPart.trim();
      const single = part.match(/^(\d+[a-z]?)$/i);
      if (single) {
        expanded.push(`${book} ${chapter}:${single[1]}`);
        continue;
      }
      const range = part.match(/^(\d+)-(\d+)$/);
      if (!range) return [];
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        end < start ||
        end - start + 1 > EMET_AI_MAX_PLANNED_RANGE_VERSES
      ) return [];
      for (let verse = start; verse <= end; verse += 1) expanded.push(`${book} ${chapter}:${verse}`);
    }
    return Array.from(new Set(expanded));
  }
  const chapterRange = trimmed.match(
    /^(.+?)\s+(\d+):(\d+)-(\d+)$/i,
  );
  if (chapterRange) {
    const book = normalizeBookName(chapterRange[1]);
    const chapter = Number(chapterRange[2]);
    const start = Number(chapterRange[3]);
    const end = Number(chapterRange[4]);
    if (
      book &&
      Number.isInteger(chapter) &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start + 1 <= EMET_AI_MAX_PLANNED_RANGE_VERSES
    ) {
      return Array.from(
        { length: end - start + 1 },
        (_, offset) => `${book} ${chapter}:${start + offset}`,
      );
    }
  }
  const singleChapterRange = trimmed.match(/^(.+?)\s+(\d+)-(\d+)$/i);
  if (singleChapterRange) {
    const book = normalizeBookName(singleChapterRange[1]);
    const start = Number(singleChapterRange[2]);
    const end = Number(singleChapterRange[3]);
    if (
      SINGLE_CHAPTER_BOOKS.has(book) &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start + 1 <= EMET_AI_MAX_PLANNED_RANGE_VERSES
    ) {
      return Array.from(
        { length: end - start + 1 },
        (_, offset) => `${book} 1:${start + offset}`,
      );
    }
  }
  const single = normalizePlannedReference(trimmed);
  return single ? [single] : [];
}

function resolveReference(reference: string) {
  const normalized = normalizePlannedReference(reference);
  if (!normalized) return null;
  const parts = normalized.match(/^(.+?)\s+(\d+):(\d+[a-z]?)$/i);
  if (!parts) return null;
  const key = structuredReferenceKey(parts[1], parts[2], parts[3]);
  for (const translation of ["web", "brenton"] as const) {
    const index = loadIndex(translation);
    const recordIndex = loadRecordMap(index).get(key);
    if (recordIndex === undefined) continue;
    return { index, record: index.records[recordIndex], recordIndex };
  }
  return null;
}

export function emetAiLockedScriptureReferenceExists(reference: string) {
  return resolveReference(reference) !== null;
}

function scriptureItem(candidate: EvidenceCandidate): EmetAiEvidenceItem {
  return {
    id: `scripture:${candidate.index.translation}:${candidate.recordIndex + 1}`,
    kind: "scripture",
    corpus: "translation",
    text: candidate.record[3],
    reference: recordReference(candidate.record),
    provenance: {
      authority: "locked-scripture-search-runtime",
      sourceId: `${candidate.index.translation}:${candidate.recordIndex + 1}`,
      checksum: candidate.index.sourceFingerprint,
      retrieval: {
        method: candidate.method,
        role: candidate.role,
        reason: candidate.reason,
        score: Math.max(0, Math.min(100, Math.round(candidate.score))),
      },
    },
  };
}

function contextCandidates(
  context: EmetAiReaderContext | null,
  question: string,
) {
  if (!context || !READER_DEPENDENT_PATTERN.test(question)) return [];
  const index = loadIndex(context.translation);
  const chapter = index.records
    .map((record, recordIndex) => ({ record, recordIndex }))
    .filter(
      ({ record }) =>
        record[0] === context.book && record[1] === context.chapter,
    );
  if (!chapter.length) return [];

  const requestedVerse = question.match(/\bverse\s+(\d+)\b/i)?.[1];
  const verse = requestedVerse || String(context.verse ?? "").trim();
  const selection = !verse
    ? chapter.slice(0, 3)
    : (() => {
        const position = chapter.findIndex(({ record }) => record[2] === verse);
        return position < 0
          ? []
          : chapter.slice(Math.max(0, position - 1), position + 2);
      })();

  return selection.map(
    (item, position): EvidenceCandidate => ({
      index,
      ...item,
      method: "reader-context",
      role: "context",
      reason: "The reader explicitly asked about the open passage.",
      score: 100 - position,
    }),
  );
}

function plannedCandidates(plan: EmetAiRetrievalPlan | null) {
  if (!plan) return [];
  return plan.passages
    .flatMap((passage) =>
      expandPlannedReferences(passage.reference).map((reference) => ({
        passage,
        reference,
      })),
    )
    .map(({ passage, reference }) => {
      const resolved = resolveReference(reference);
      if (!resolved) return null;
      return {
        ...resolved,
        method: "semantic-plan" as const,
        role: passage.role,
        reason: passage.reason,
        score: 78 + passage.priority * 0.2,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

function governingCandidates(plan: EmetAiRetrievalPlan | null) {
  if (!plan) return [];
  const plannedByReference = new Map(
    plan.passages.flatMap((passage) =>
      expandPlannedReferences(passage.reference).map((reference) => [reference, passage] as const),
    ),
  );
  return plan.components.flatMap((component) =>
    (component.governingReferences || []).flatMap((plannedReference) =>
      expandPlannedReferences(plannedReference).flatMap((reference) => {
        const resolved = resolveReference(reference);
        if (!resolved) return [];
        const planned = plannedByReference.get(reference);
        return [{
          ...resolved,
          method: "semantic-plan" as const,
          role: planned?.role || ("direct" as const),
          reason: `Governing Scripture selected for ${component.proposition}`,
          score: 100,
        }];
      }),
    ),
  );
}

/**
 * Turn point references from a plan into bounded units of meaning. The model
 * may name only the decisive clauses of an argument (for example Romans 14:1,
 * 2, 5, and 23); generation still needs the intervening verses to understand
 * the argument rather than treating those clauses as detached proof texts.
 *
 * This is deliberately structural rather than doctrinal: fill short spans in
 * the same chapter and retain their immediate boundaries. Very large spans are
 * left to the planner so an accidental pair of distant references cannot pull
 * an entire chapter into every packet.
 */
function governingMeaningfulContextCandidates(
  governing: EvidenceCandidate[],
  contract?: EmetAiQuestionContract,
  limit = 48,
) {
  const spans = new Map<string, {
    index: SearchIndex;
    book: string;
    chapter: number;
    verses: number[];
    reasons: string[];
  }>();
  for (const candidate of governing) {
    const verse = Number.parseInt(candidate.record[2], 10);
    if (!Number.isInteger(verse)) continue;
    const key = `${candidate.index.translation}|${candidate.record[0]}|${candidate.record[1]}`;
    const span = spans.get(key) || {
      index: candidate.index,
      book: candidate.record[0],
      chapter: candidate.record[1],
      verses: [],
      reasons: [],
    };
    span.verses.push(verse);
    span.reasons.push(candidate.reason);
    spans.set(key, span);
  }

  return Array.from(spans.values()).flatMap((span): EvidenceCandidate[] => {
    const ordered = Array.from(new Set(span.verses)).sort((left, right) => left - right);
    const first = ordered[0];
    const last = ordered.at(-1)!;
    const spanWidth = last - first;
    const explicitlyRequestedChapter = contract?.requestedCoverage.passages.some(
      (passage) =>
        passage.startVerse === undefined &&
        passage.book === span.book &&
        passage.chapter === span.chapter,
    ) || false;
    const sustainedDiscourse =
      ordered.length >= 3 &&
      spanWidth <= 12 &&
      span.reasons.some((reason) =>
        /\b(?:dispute|argument|conversation|council|speech|dialogue)\b/i.test(reason),
      );
    const contextStart = sustainedDiscourse && first <= 20
      ? 1
      : Math.max(1, first - 1);
    const contextEnd = last + 1;
    const contextVerses = spanWidth <= 12 || explicitlyRequestedChapter
      ? Array.from(
          { length: Math.min(28, contextEnd - contextStart + 1) },
          (_, offset) => contextStart + offset,
        )
      : [first - 1, last + 1];
    return contextVerses.filter((verse) => verse > 0).flatMap((verse) => {
      const recordIndex = loadRecordMap(span.index).get(
        structuredReferenceKey(span.book, span.chapter, verse),
      );
      if (recordIndex === undefined) return [];
      return [{
        index: span.index,
        record: span.index.records[recordIndex],
        recordIndex,
        method: "semantic-plan" as const,
        role: "context" as const,
        reason: "Bounded complete-passage context for a governing Scripture span.",
        score: 96,
      }];
    });
  }).slice(0, limit);
}

function sourcePhraseCandidates(plan: EmetAiRetrievalPlan | null) {
  if (!plan?.sourcePhrases.length) return [];
  const preferredReferences = plan.passages
    .flatMap((passage) => expandPlannedReferences(passage.reference));
  return verifiedSourcePhraseMatches({
    phrases: plan.sourcePhrases,
    preferredReferences,
    limit: 8,
  })
    .map((match) => {
      const resolved = resolveReference(match.reference);
      if (!resolved) return null;
      const planned = plan.passages.find(
        (passage) =>
          expandPlannedReferences(passage.reference).includes(match.reference),
      );
      return {
        ...resolved,
        method: "exact-source-phrase" as const,
        role: planned?.role || ("foundation" as const),
        reason: `${match.phrase.reason} Verified as the same ${match.phrase.corpus} source sequence (${match.phrase.label}).`,
        score: 100,
        sourceFingerprint: match.sourceFingerprint,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

function requestedPassageCandidates(question: string, plan: EmetAiRetrievalPlan | null) {
  const coverage = extractEmetAiRequestedCoverage(question);
  return coverage.passages.flatMap((passage) => {
    const index = loadIndex("web");
    const plannedChapterReferences = (plan?.passages || [])
      .flatMap((item) => expandPlannedReferences(item.reference))
      .filter((reference) => reference.startsWith(`${passage.book} ${passage.chapter}:`));
    const references = passage.startVerse === undefined
      ? plannedChapterReferences.length
        ? plannedChapterReferences
        : index.records
            .filter((record) => record[0] === passage.book && record[1] === passage.chapter)
            .slice(0, 24)
            .map(recordReference)
      : Array.from(
          { length: (passage.endVerse || passage.startVerse) - passage.startVerse + 1 },
          (_, offset) => `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`,
        );
    return references.map((reference) => {
      const resolved = resolveReference(reference);
      return resolved ? {
        ...resolved,
        method: "explicit-reference" as const,
        role: "direct" as const,
        reason: `The user explicitly requested ${passage.label}.`,
        score: 100,
      } : null;
    }).filter((value): value is NonNullable<typeof value> => value !== null);
  });
}

function requiredComparisonCandidates(question: string) {
  const coverage = extractEmetAiRequestedCoverage(question);
  return coverage.comparisonPassages.map((passage) => {
    const resolved = resolveReference(passage.reference);
    return resolved ? {
      ...resolved,
      method: "explicit-reference" as const,
      role: "contrast" as const,
      reason: passage.reason,
      score: 99,
    } : null;
  }).filter((value): value is NonNullable<typeof value> => value !== null);
}

function documentFrequency() {
  if (webDocumentFrequency) return webDocumentFrequency;
  const frequency = new Map<string, number>();
  for (const record of loadIndex("web").records) {
    for (const word of new Set(tokenizedWords(record[3]))) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }
  webDocumentFrequency = frequency;
  return frequency;
}

function literalCandidates(question: string) {
  const terms = questionTerms(question);
  if (!terms.length) return [];
  const index = loadIndex("web");
  const frequency = documentFrequency();

  return index.records
    .map((record, recordIndex) => {
      const words = new Set(tokenizedWords(record[3]));
      const matches = terms.filter((term) => words.has(term));
      const rareMatches = matches.filter((term) => (frequency.get(term) || 0) <= 16);
      const score = matches.length * 18 + rareMatches.length * 34;
      return { record, recordIndex, matches, rareMatches, score };
    })
    .filter(
      (item) =>
        item.rareMatches.length > 0 ||
        item.matches.length >= Math.min(2, terms.length),
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.recordIndex - right.recordIndex,
    )
    .slice(0, MAX_LITERAL_FALLBACK_VERSES)
    .map(
      (item): EvidenceCandidate => ({
        index,
        record: item.record,
        recordIndex: item.recordIndex,
        method: "literal-text-match",
        role: "direct",
        reason: `The locked verse text contains the question's material term${item.matches.length === 1 ? "" : "s"}: ${item.matches.join(", ")}.`,
        score: Math.min(72, 35 + item.score / 2),
      }),
    );
}

const DIRECT_NAMED_ENTITY_TERMS: Partial<Record<string, string[]>> = {
  Messiah: ["jesus", "yeshua", "messiah", "christ"],
  Paul: ["paul"],
  Moses: ["moses"],
  Noah: ["noah"],
  Abraham: ["abraham"],
  Cain: ["cain"],
  Abel: ["abel"],
};

function deterministicDirectCandidates(
  question: string,
  contract: EmetAiQuestionContract,
) {
  const questionWords = new Set(tokenizedWords(question));
  const namedPersonQuestion = contract.biblicalEntities.some((entity) =>
    Boolean(DIRECT_NAMED_ENTITY_TERMS[entity]),
  );
  const distinctiveAction = [DIRECT_TERM_GROUPS[0], DIRECT_TERM_GROUPS[7], DIRECT_TERM_GROUPS[8]]
    .some((group) => group.some((term) => questionWords.has(term)));
  if (
    namedPersonQuestion &&
    /^\s*(?:did|does|do|is|was|were|are|has|have)\b/i.test(question) &&
    !distinctiveAction
  ) return [];
  const concepts = DIRECT_TERM_GROUPS.filter((group) =>
    group.some((term) => questionWords.has(term)),
  );
  const ungrouped = questionTerms(question).filter(
    (term) => !DIRECT_TERM_GROUPS.some((group) => group.includes(term as never)),
  );
  const index = loadIndex("web");
  const requiredEntityGroups = contract.biblicalEntities.flatMap(
    (entity) => DIRECT_NAMED_ENTITY_TERMS[entity]
      ? [DIRECT_NAMED_ENTITY_TERMS[entity]!]
      : [],
  );
  const scored = index.records.map((record, recordIndex) => {
    const verseWords = tokenizedWords(record[3]);
    const words = new Set(verseWords);
    const matchedConcepts = concepts.filter((group) =>
      group.some((term) => words.has(term)),
    );
    const matchedUngrouped = ungrouped.filter((term) => words.has(term));
    const definitionMatch = /^\s*(?:what\s+is|define)\b/i.test(question) &&
      matchedUngrouped.some((term) =>
        new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(?:is|means)\\b`, "i")
          .test(record[3]),
      );
    const conceptPositions = matchedConcepts.map((group) =>
      verseWords.flatMap((word, position) => group.includes(word as never) ? [position] : []),
    );
    const minimumConceptSpan = conceptPositions.length >= 2
      ? Math.min(...conceptPositions[0].flatMap((left) =>
          conceptPositions.slice(1).flatMap((positions) =>
            positions.map((right) => Math.abs(left - right)),
          ),
        ))
      : Number.POSITIVE_INFINITY;
    const proximityBonus = minimumConceptSpan <= 3 ? 54 : minimumConceptSpan <= 7 ? 24 : 0;
    const score = matchedConcepts.length * 36 + matchedUngrouped.length * 14 +
      proximityBonus + (definitionMatch ? 48 : 0);
    return {
      record,
      recordIndex,
      matchedConcepts,
      matchedUngrouped,
      definitionMatch,
      minimumConceptSpan,
      score,
    };
  }).filter((item) =>
    item.score > 0 && requiredEntityGroups.every((terms) =>
      terms.some((term) => new Set(tokenizedWords(item.record[3])).has(term)),
    )
  ).sort(
    (left, right) => right.score - left.score || left.recordIndex - right.recordIndex,
  );
  const anchor = scored[0];
  const runnerUp = scored[1];
  const strongFactualTextAnchor = Boolean(
    anchor &&
    /^\s*(?:who|what|where|when)\b/i.test(question) &&
    anchor.matchedUngrouped.length >= Math.max(3, ungrouped.length) &&
    anchor.score >= 42
  );
  const strongAnchor = Boolean(
    anchor &&
    (strongFactualTextAnchor || (
      anchor.matchedConcepts.length >= 2 &&
      anchor.score >= 72 &&
      (!runnerUp ||
        anchor.score >= runnerUp.score + 18 ||
        anchor.matchedConcepts.length > runnerUp.matchedConcepts.length ||
        anchor.matchedConcepts.length >= 3 ||
        (anchor.minimumConceptSpan <= 3 && anchor.score >= 120))
    )),
  );
  if (!strongAnchor) return [];

  const asksBelieverApplication = DIRECT_TERM_GROUPS[5].some((term) =>
    questionWords.has(term),
  );
  const gospelWitness = asksBelieverApplication
    ? scored.find((item) =>
        ["Matthew", "Mark", "Luke", "John"].includes(item.record[0]) &&
        item.matchedConcepts.length >= 2 &&
        item.minimumConceptSpan <= 7,
      )
    : null;
  const sameChapter = scored.filter((item) =>
    item.record[0] === anchor.record[0] &&
    item.record[1] === anchor.record[1] &&
    Math.abs(Number(item.record[2]) - Number(anchor.record[2])) <= 2 &&
    (item.matchedConcepts.length > 0 || item.matchedUngrouped.length > 0),
  );
  const selectionPool = strongFactualTextAnchor
    ? [
        anchor,
        ...scored.filter((item) =>
          item.matchedUngrouped.length >= Math.max(3, ungrouped.length),
        ),
      ]
    : asksBelieverApplication && gospelWitness
    ? [anchor, gospelWitness]
    : sameChapter.length >= 2
      ? [anchor, ...sameChapter]
      : [anchor, ...sameChapter, ...scored];
  const selected = selectionPool
    .filter((item, position, items) =>
      items.findIndex((candidate) => candidate.recordIndex === item.recordIndex) === position,
    )
    .slice(0, 4);
  return selected.map((item): EvidenceCandidate => ({
    index,
    record: item.record,
    recordIndex: item.recordIndex,
    method: "literal-text-match",
    role: "direct",
    reason: "The locked verse text strongly matches multiple material concepts in the direct question.",
    score: Math.min(100, item.score),
  }));
}

const EXACT_REFERENCE_TEXT_PATTERN =
  /\bwhat\s+(?:does|do)\s+[^?]{1,90}\s+(?:say|read)\b|\b(?:quote|recite)\b|\b(?:show|give)\s+(?:me\s+)?(?:the\s+)?(?:wording|text)\b/i;
const LEXICAL_LOOKUP_PATTERN =
  /\b(?:word|term)\b.{0,50}\b(?:translated|rendered|means?)\b|\b(?:translated|rendered)\b.{0,35}\b(?:as\s+)?["'“”‘’]/i;
const BOUNDED_REFERENCE_EXPLANATION_PATTERN =
  /\b(?:explain|meaning|mean|understand|context)\b/i;
const UNSAFE_DEEP_INTENT = new Set<EmetAiQuestionContract["intent"]>([
  "symbolic",
  "historical",
  "obligation",
  "doctrinal",
  "comparison",
  "apparent-contradiction",
  "procedure",
  "enumeration",
  "multi-part",
]);
const THEOLOGICAL_APPLICABILITY_PATTERN =
  /\b(?:should|must|required?|obligated?|under\s+(?:the\s+)?law|appl(?:y|ies|icable)|binding)\b.{0,90}\b(?:believers?|christians?|gentiles?|israel|church|sabbath|commandments?|torah|law|covenant)\b|\b(?:believers?|christians?|gentiles?|israel|church)\b.{0,90}\b(?:should|must|required?|obligated?|sabbath|commandments?|torah|law|covenant)\b/i;
const THEOLOGICAL_IDENTITY_PATTERN =
  /\b(?:same|one)\s+(?:being|person|essence|nature)\b|\b(?:messiah|christ|jesus|holy spirit|spirit)\b.{0,45}\b(?:yahweh|god|father)\b|\b(?:yahweh|god|father)\b.{0,45}\b(?:messiah|christ|jesus|holy spirit|spirit)\b/i;

const DETERMINISTIC_NAMED_LISTS: Array<{
  pattern: RegExp;
  count: number;
  references: string[];
}> = [
  {
    pattern: /^\s*what\s+are\s+the\s+ten\s+commandments\s*[?.!]*\s*$/i,
    count: 10,
    references: Array.from({ length: 16 }, (_, offset) => `Exodus 20:${offset + 2}`),
  },
];

function resolvedCandidates(
  references: string[],
  reason: string,
  method: RetrievalMethod = "explicit-reference",
) {
  return references.flatMap((reference): EvidenceCandidate[] => {
    const resolved = resolveReference(reference);
    return resolved ? [{
      ...resolved,
      method,
      role: "direct",
      reason,
      score: 100,
    }] : [];
  });
}

function exactReferenceTextCandidates(
  question: string,
  contract: EmetAiQuestionContract,
) {
  if (!EXACT_REFERENCE_TEXT_PATTERN.test(question)) return [];
  if (contract.requestedCoverage.passages.length !== 1) return [];
  const passage = contract.requestedCoverage.passages[0];
  if (passage.startVerse === undefined) return [];
  const references = Array.from(
    { length: (passage.endVerse || passage.startVerse) - passage.startVerse + 1 },
    (_, offset) => `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`,
  );
  const candidates = resolvedCandidates(
    references,
    `The user requested the wording of ${passage.label}.`,
  );
  return candidates.length === references.length ? candidates : [];
}

function boundedReferenceExplanationCandidates(
  question: string,
  contract: EmetAiQuestionContract,
) {
  if (!BOUNDED_REFERENCE_EXPLANATION_PATTERN.test(question)) return [];
  if (
    contract.requestedCoverage.passages.length !== 1 ||
    contract.requestedCoverage.language.length ||
    contract.requestedCoverage.competingInterpretations ||
    contract.requestedCoverage.subquestions.length > 1 ||
    contract.commandApplicability ||
    contract.intent === "comparison" ||
    contract.intent === "apparent-contradiction" ||
    contract.intent === "doctrinal" ||
    contract.intent === "multi-part"
  ) return [];
  const passage = contract.requestedCoverage.passages[0];
  if (passage.startVerse === undefined) return [];
  const endVerse = passage.endVerse || passage.startVerse;
  if (endVerse - passage.startVerse > 4) return [];
  const requested = Array.from(
    { length: endVerse - passage.startVerse + 1 },
    (_, offset) => `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`,
  );
  const direct = resolvedCandidates(
    requested,
    `The user requested an explanation of ${passage.label}.`,
  );
  if (direct.length !== requested.length) return [];
  const asksForContext = /\b(?:in\s+context|context\s+of|surrounding\s+(?:passage|argument|conversation)|immediate\s+context)\b/i.test(question);
  const contextStart = Math.max(
    1,
    passage.startVerse - (asksForContext ? 15 : 3),
  );
  const contextEnd = endVerse + (asksForContext ? 5 : 3);
  const boundedContextEnd = Math.min(contextEnd, contextStart + 23);
  const contextReferences = Array.from(
    { length: boundedContextEnd - contextStart + 1 },
    (_, offset) => `${passage.book} ${passage.chapter}:${contextStart + offset}`,
  ).filter((reference) => !requested.includes(reference));
  const context = resolvedCandidates(
    contextReferences,
    `Bounded complete-passage context for ${passage.label}.`,
    "reader-context",
  ).map((candidate) => ({ ...candidate, role: "context" as const, score: 92 }));
  return [...direct, ...context];
}

function lexicalLookupLabel(question: string) {
  const quoted = question.match(/["'“”‘’]([^"'“”‘’]{1,40})["'“”‘’]/)?.[1];
  if (quoted) return quoted.trim();
  return question.match(/\b(?:translated|rendered)\s+(?:as\s+)?([\p{L}\p{N}-]{1,30})\b/iu)?.[1] || "";
}

function deterministicLexicalMatches(
  question: string,
  contract: EmetAiQuestionContract,
): VerifiedSourcePhraseMatch[] {
  if (!LEXICAL_LOOKUP_PATTERN.test(question)) return [];
  if (contract.requestedCoverage.passages.length !== 1 || contract.requestedCoverage.language.length !== 1) return [];
  const passage = contract.requestedCoverage.passages[0];
  if (passage.startVerse === undefined || passage.endVerse !== passage.startVerse) return [];
  const language = contract.requestedCoverage.language[0];
  if (language.corpora.length !== 1) return [];
  const lookup = lexicalLookupLabel(question);
  if (!lookup) return [];
  const reference = `${passage.book} ${passage.chapter}:${passage.startVerse}`;
  const corpus = language.corpora[0];
  const terms = verifiedSourceTermsAtReference({ corpus, reference, lookup });
  if (terms.length !== 1) return [];
  const term = terms[0];
  return [{
    reference,
    phrase: {
      corpus,
      label: lookup,
      lexicalIds: [term.lexicalId],
      lemmas: [term.lemma],
      reason: `The user requested the verified source identity of “${lookup}” in ${reference}.`,
    },
    sourceFingerprint: term.sourceFingerprint,
    matchMethod: "lexical-id-sequence",
    morphologySignature: term.morphologySignature,
    verifiedLexicalIds: [term.lexicalId],
    verifiedLemmas: [term.lemma],
    verifiedTerms: [{
      lexicalId: term.lexicalId,
      lemma: term.lemma,
      transliteration: term.transliteration,
      meaning: term.meaning,
    }],
  }];
}

function namedListCandidates(question: string) {
  const expectedCount = expectedEmetAiNamedListCount(question);
  if (!expectedCount) return [];
  const definition = DETERMINISTIC_NAMED_LISTS.find(
    (item) => item.count === expectedCount && item.pattern.test(question),
  );
  if (!definition) return [];
  const candidates = resolvedCandidates(
    definition.references,
    "The locked passage contains the complete named list requested by the user.",
  );
  return candidates.length === definition.references.length ? candidates : [];
}

function conversationRecallCandidates(
  question: string,
  conversation: EmetConversationContext | null,
) {
  if (!conversation || !/\b(?:first question|previous question|earlier question|what did i ask|what was my)\b/i.test(question)) return [];
  const exchanges = conversation.recentExchanges;
  const target = /\bfirst question\b/i.test(question)
    ? exchanges[0]
    : exchanges.at(-1);
  if (!target?.references.length) return [];
  const candidates = resolvedCandidates(
    target.references,
    "Verified Scripture previously cited in the recalled conversation exchange.",
  );
  return candidates.length === target.references.length ? candidates : [];
}

function resolveDeterministicEvidence({
  question,
  conversation,
  contract,
}: {
  question: string;
  conversation: EmetConversationContext | null;
  contract: EmetAiQuestionContract;
}) {
  const lexical = deterministicLexicalMatches(question, contract);
  if (lexical.length) {
    const references = lexical.map((item) => item.reference);
    return {
      route: "single-reference-lexical" as const,
      candidates: resolvedCandidates(
        references,
        "The explicitly requested verse contains the unambiguous verified source term.",
        "exact-source-phrase",
      ),
      lexical,
    };
  }

  const exact = exactReferenceTextCandidates(question, contract);
  if (exact.length) return { route: "exact-reference-text" as const, candidates: exact };

  const boundedExplanation = boundedReferenceExplanationCandidates(question, contract);
  if (boundedExplanation.length) {
    return { route: "bounded-reference-explanation" as const, candidates: boundedExplanation };
  }

  const named = namedListCandidates(question);
  if (named.length) return { route: "named-list" as const, candidates: named };

  const recall = conversationRecallCandidates(question, conversation);
  if (recall.length) return { route: "conversation-recall" as const, candidates: recall };

  if (
    !contract.conversation.relevant &&
    !UNSAFE_DEEP_INTENT.has(contract.intent) &&
    !THEOLOGICAL_APPLICABILITY_PATTERN.test(question) &&
    !THEOLOGICAL_IDENTITY_PATTERN.test(question) &&
    !contract.requestedCoverage.passages.length &&
    !contract.requestedCoverage.language.length &&
    !contract.requestedCoverage.subquestions.length &&
    !contract.requestedCoverage.competingInterpretations
  ) {
    const direct = deterministicDirectCandidates(question, contract);
    if (direct.length) return { route: "direct-factual" as const, candidates: direct };
  }
  return null;
}

function deterministicEvidenceCandidates(input: {
  question: string;
  conversation: EmetConversationContext | null;
  contract: EmetAiQuestionContract;
}) {
  // A single request assesses sufficiency and then constructs the packet. Keep
  // locked-index work reusable between those two stages, and across identical
  // context-free cold questions handled by the same server instance.
  if (!input.conversation) {
    const key = `${input.contract.version}|${input.question.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
    if (deterministicEvidenceCache.has(key)) {
      return deterministicEvidenceCache.get(key) || null;
    }
    const resolved = resolveDeterministicEvidence(input);
    if (deterministicEvidenceCache.size >= 256) {
      const oldest = deterministicEvidenceCache.keys().next().value;
      if (oldest) deterministicEvidenceCache.delete(oldest);
    }
    deterministicEvidenceCache.set(key, resolved);
    return resolved;
  }
  return resolveDeterministicEvidence(input);
}

export function assessEmetAiDeterministicSufficiency({
  question,
  conversation = null,
  context = null,
  questionContract,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  questionContract?: EmetAiQuestionContract;
}): EmetAiDeterministicSufficiency {
  const contract = questionContract || buildEmetAiQuestionContract({ question, conversation, context });
  if (
    context ||
    (READER_DEPENDENT_PATTERN.test(question) && !contract.requestedCoverage.passages.length)
  ) {
    return { sufficient: false, route: null, reason: "Reader-dependent questions require contextual planning.", references: [] };
  }
  const resolved = deterministicEvidenceCandidates({ question, conversation, contract });
  if (!resolved?.candidates.length) {
    return { sufficient: false, route: null, reason: "Locked evidence did not independently establish complete governing coverage.", references: [] };
  }
  return {
    sufficient: true,
    route: resolved.route,
    reason: "Every required component resolved from locked evidence before generation.",
    references: Array.from(new Set(resolved.candidates.map((item) => recordReference(item.record)))),
  };
}

/**
 * Supplies only Scripture whose relevance can be established without semantic
 * planning. These items are a progressive reading aid, never the finalized
 * evidence packet used to generate or validate an answer.
 */
export function buildEmetAiInitialScriptureEvidence({
  question,
  conversation = null,
  context = null,
  limit = 5,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  limit?: number;
}): {
  status: "ready" | "finding";
  route: EmetAiDeterministicEvidenceRoute | "explicit-reference" | "reader-context" | null;
  items: EmetAiInitialScriptureItem[];
} {
  const cleanQuestion = question.trim();
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  const contract = buildEmetAiQuestionContract({
    question: cleanQuestion,
    conversation,
    context,
  });
  const sufficiency = assessEmetAiDeterministicSufficiency({
    question: cleanQuestion,
    conversation,
    context,
    questionContract: contract,
  });

  let route: EmetAiDeterministicEvidenceRoute | "explicit-reference" | "reader-context" | null = null;
  let candidates: EvidenceCandidate[] = [];
  if (sufficiency.sufficient && sufficiency.route !== "conversation-recall") {
    const resolved = deterministicEvidenceCandidates({
      question: cleanQuestion,
      conversation,
      contract,
    });
    route = resolved?.route || null;
    candidates = resolved?.candidates || [];
  } else {
    const boundedRequestedReferences = new Set(
      contract.requestedCoverage.passages.flatMap((passage) =>
        passage.startVerse === undefined
          ? []
          : Array.from(
              { length: (passage.endVerse || passage.startVerse) - passage.startVerse + 1 },
              (_, offset) => `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`,
            ),
      ),
    );
    const explicit = requestedPassageCandidates(cleanQuestion, null).filter((candidate) =>
      boundedRequestedReferences.has(recordReference(candidate.record)),
    );
    const contextual = contextCandidates(context, cleanQuestion);
    if (explicit.length) {
      route = "explicit-reference";
      candidates = explicit;
    } else if (contextual.length) {
      route = "reader-context";
      candidates = contextual;
    }
  }

  const unique = Array.from(new Map(
    candidates.map((candidate) => [recordReference(candidate.record), candidate]),
  ).values()).slice(0, safeLimit);
  const items = unique.map((candidate) => {
    const item = scriptureItem(candidate);
    return {
      id: item.id,
      reference: item.reference || recordReference(candidate.record),
      text: item.text,
      translation: candidate.index.translation,
    };
  });
  return {
    status: items.length ? "ready" : "finding",
    route,
    items,
  };
}

export function isEmetAiDeterministicFastPathEligible({
  question,
  conversation = null,
  context = null,
  questionContract,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  questionContract?: EmetAiQuestionContract;
}) {
  return assessEmetAiDeterministicSufficiency({
    question,
    conversation,
    context,
    questionContract,
  }).sufficient;
}

function selectedCandidates({
  question,
  plan,
  context,
  conversation,
  questionContract,
}: {
  question: string;
  plan: EmetAiRetrievalPlan | null;
  context: EmetAiReaderContext | null;
  conversation: EmetConversationContext | null;
  questionContract?: EmetAiQuestionContract;
}) {
  const responseDesign = questionContract?.responseDesign ||
    classifyEmetAiResponseDesign({ question, conversation });
  const namedListCount = expectedEmetAiNamedListCount(question);
  const effectiveDepth = plan?.sourcePhrases.length
    ? "deep"
    : plan?.analysisMode === "apparent-contradiction"
      ? "standard"
    : questionContract?.commandApplicability
      ? "standard"
    : responseDesign.depth;
  const contextEvidence = contextCandidates(context, question);
  const explicitEvidence = requestedPassageCandidates(question, plan);
  const requiredComparisonEvidence = requiredComparisonCandidates(question);
  const plannedEvidence = plannedCandidates(plan);
  const governingEvidence = governingCandidates(plan);
  const governingMeaningfulContext = governingMeaningfulContextCandidates(
    governingEvidence,
    questionContract,
  );
  const phraseEvidence = sourcePhraseCandidates(plan);
  const literalEvidence = literalCandidates(question);
  const candidates = plan
    ? [
        ...explicitEvidence,
        ...requiredComparisonEvidence,
        ...governingEvidence,
        ...contextEvidence,
        ...phraseEvidence,
        ...plannedEvidence,
        ...(plan.analysisMode === "simple"
          ? literalEvidence.filter((candidate) => candidate.score >= 65).slice(0, 2)
          : []),
      ]
    : explicitEvidence.length
      ? [...explicitEvidence, ...contextEvidence]
      : contextEvidence.length
        ? contextEvidence
        : literalEvidence;
  const byReference = new Map<string, EvidenceCandidate>();

  for (const candidate of candidates) {
    const reference = recordReference(candidate.record);
    const existing = byReference.get(reference);
    if (!existing || candidate.score > existing.score) {
      byReference.set(reference, candidate);
    }
  }

  const ranked = Array.from(byReference.values()).sort(
    (left, right) =>
      right.score - left.score || left.recordIndex - right.recordIndex,
  );
  if (!plan) return ranked.slice(0, MAX_LITERAL_FALLBACK_VERSES);

  const evidenceLimit = namedListCount
    ? Math.min(16, namedListCount + 4)
    : effectiveDepth === "concise"
      ? 4
      : effectiveDepth === "standard"
        ? 8
        : 24;

  const selected: EvidenceCandidate[] = [];
  const selectedReferences = new Set<string>();
  const chapterCounts = new Map<string, number>();
  const add = (candidate: EvidenceCandidate, force = false) => {
    const reference = recordReference(candidate.record);
    if (selectedReferences.has(reference)) return false;
    const chapterKey = `${candidate.record[0]}|${candidate.record[1]}`;
    const chapterLimit = namedListCount
      ? Math.min(24, namedListCount + 4)
      : effectiveDepth === "concise"
      ? 4
      : effectiveDepth === "standard"
        ? 4
      : 10;
    if (!force && (chapterCounts.get(chapterKey) || 0) >= chapterLimit) return false;
    selected.push(candidate);
    selectedReferences.add(reference);
    chapterCounts.set(chapterKey, (chapterCounts.get(chapterKey) || 0) + 1);
    return true;
  };

  for (const candidate of explicitEvidence) add(candidate, true);
  for (const candidate of requiredComparisonEvidence) add(candidate, true);
  for (const candidate of governingEvidence) add(candidate, true);

  // Direct witnesses outrank background and qualifications. Preserve more
  // than one when Scripture gives independent direct statements.
  for (const candidate of ranked.filter((item) => item.role === "direct")) {
    if (selected.length >= evidenceLimit) break;
    add(candidate);
  }

  // Preserve the canonical evidence hierarchy before filling remaining
  // slots. Direct statements and earlier foundations govern; a genuinely
  // relevant qualification remains available without displacing them.
  for (const role of [
    "direct",
    "foundation",
    "later-witness",
    "qualifying",
    "contrast",
    "context",
  ] as const) {
    const candidate = ranked.find((item) => item.role === role);
    if (candidate) add(candidate);
  }

  for (const candidate of ranked) {
    if (selected.length >= evidenceLimit) break;
    add(candidate);
  }
  // Meaningful-unit context supplements the selected governing material; it never
  // consumes the ordinary evidence budget ahead of planned direct witnesses.
  for (const candidate of governingMeaningfulContext) add(candidate, true);
  return selected;
}

export function buildEmetAiTopicEvidence({
  question,
  conversation = null,
  context = null,
  retrievalPlan = null,
  requireSemanticPlan = false,
  deterministicFastPath = false,
  questionContract,
  builtAt,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  retrievalPlan?: EmetAiRetrievalPlan | null;
  requireSemanticPlan?: boolean;
  deterministicFastPath?: boolean;
  questionContract?: EmetAiQuestionContract;
  builtAt?: string;
}) {
  const cleanQuestion = question.trim();
  const contract = questionContract || buildEmetAiQuestionContract({
    question: cleanQuestion,
    conversation,
    context,
  });
  const requestedCoverage = contract.requestedCoverage;
  const baseResponseDesign = contract.responseDesign;
  const responseDesign = retrievalPlan?.sourcePhrases.length
    ? { ...baseResponseDesign, depth: "deep" as const, targetMinWords: 120, targetMaxWords: 500, maxScriptureCitations: 16 }
    : retrievalPlan?.analysisMode === "apparent-contradiction" && baseResponseDesign.depth === "concise"
      ? { ...baseResponseDesign, depth: "standard" as const, targetMinWords: 65, targetMaxWords: 220, maxScriptureCitations: 8 }
      : baseResponseDesign;
  if (!cleanQuestion) {
    return {
      status: "insufficient-evidence" as const,
      limitations: ["A question is required."],
    };
  }

  const relevantConversation = conversation
    ? relevantEmetConversation({ question: cleanQuestion, conversation })
    : null;
  const readerDependent = READER_DEPENDENT_PATTERN.test(cleanQuestion);
  if (requireSemanticPlan && !retrievalPlan && !readerDependent) {
    return {
      status: "insufficient-evidence" as const,
      limitations: [
        "The semantic Scripture retrieval plan could not be verified for this question.",
      ],
    };
  }

  const deterministicEvidence = deterministicFastPath
    ? deterministicEvidenceCandidates({
        question: cleanQuestion,
        conversation: relevantConversation,
        contract,
      })
    : null;
  const candidates = deterministicFastPath
    ? deterministicEvidence?.candidates || []
    : selectedCandidates({
        question: cleanQuestion,
        plan: retrievalPlan,
        context,
        conversation,
        questionContract: contract,
      });
  const evidence = candidates.map(scriptureItem);
  if (!evidence.length) {
    return {
      status: "insufficient-evidence" as const,
      limitations: [
        "The locked Scripture indexes did not supply directly relevant passages for this question.",
      ],
    };
  }

  const fingerprints = new Set(
    candidates.flatMap((candidate) => [
      candidate.index.sourceFingerprint,
      ...(candidate.sourceFingerprint ? [candidate.sourceFingerprint] : []),
    ]),
  );
  const resolvedQuestion = buildEmetConversationQuestion({
    question: cleanQuestion,
    conversation: relevantConversation,
  });
  const rawSourcePhraseMatches = deterministicEvidence?.lexical || (retrievalPlan
    ? verifiedSourcePhraseMatches({
        phrases: retrievalPlan.sourcePhrases,
        preferredReferences: candidates.map((candidate) => recordReference(candidate.record)),
        limit: 8,
        allowIndividualTerms: requestedCoverage.language.length > 0,
      })
    : []);
  const sourcePhraseMatches = Array.from(new Map(
    rawSourcePhraseMatches.map((match) => [
      `${match.phrase.corpus}|${match.reference}|${match.verifiedLexicalIds.join("+")}`,
      match,
    ]),
  ).values());
  evidence.push(...sourcePhraseMatches.map((match, index): EmetAiEvidenceItem => ({
    id: `lexical:${match.phrase.corpus}:${index + 1}`,
    kind: "lexical",
    corpus: match.phrase.corpus,
    text: `Verified ${match.phrase.corpus} source term(s) in ${match.reference}: ${match.verifiedTerms
      .map((term) => `${term.lemma} (${term.transliteration}) — ${term.meaning}`)
      .join("; ")}.`,
    reference: match.reference,
    lexicalId: match.verifiedLexicalIds.join("+"),
    provenance: {
      authority: "locked-source-phrase-index",
      sourceId: match.matchMethod,
      checksum: match.sourceFingerprint,
      retrieval: {
        method: "exact-source-phrase",
        role: "direct",
        reason: `Verified as the same ${match.phrase.corpus} source sequence in a requested passage.`,
        score: 100,
      },
    },
  })));
  const requestedPassages = requestedCoverage.passages.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    references: Array.from(new Set(
      requestedPassageCandidates(cleanQuestion, retrievalPlan)
        .map((candidate) => recordReference(candidate.record))
        .filter((reference) => requirement.startVerse === undefined
          ? reference.startsWith(`${requirement.book} ${requirement.chapter}:`)
          : Array.from(
              { length: (requirement.endVerse || requirement.startVerse) - requirement.startVerse + 1 },
              (_, offset) => `${requirement.book} ${requirement.chapter}:${requirement.startVerse! + offset}`,
            ).includes(reference)),
    )),
  }));
  const comparisonPassages = requestedCoverage.comparisonPassages.map((requirement) => {
    const evidenceItem = evidence.find((item) =>
      item.kind === "scripture" && item.reference === requirement.reference
    );
    return {
      reference: requirement.reference,
      evidenceId: evidenceItem?.id || "",
    };
  });
  const deterministicComponents = requestedCoverageComponents(requestedCoverage);
  const plannedComponents = retrievalPlan?.components || [];
  const components = [
    ...plannedComponents,
    ...deterministicComponents.filter(
      (required) => !plannedComponents.some((planned) => planned.id === required.id),
    ),
  ];
  const governingCoverage = (retrievalPlan?.components || []).map((component) => ({
    componentId: component.id,
    evidenceIds: Array.from(new Set(
      (component.governingReferences || [])
        .flatMap(expandPlannedReferences)
        .flatMap((reference) => evidence
          .filter((item) => item.kind === "scripture" && item.reference === reference)
          .map((item) => item.id)),
    )),
  })).filter((item) => item.evidenceIds.length);
  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question: retrievalPlan
      ? `${resolvedQuestion}\n\nResolved retrieval subject (context only, not evidence): ${retrievalPlan.subject}`
      : resolvedQuestion,
    responseDesign,
    reasoning: retrievalPlan
      ? {
          mode: retrievalPlan.analysisMode,
          proposition: retrievalPlan.proposition,
          requiresScopeAnalysis: retrievalPlan.requiresScopeAnalysis,
          requiresTimeline: retrievalPlan.requiresTimeline,
          commandApplicability: contract.commandApplicability,
          components,
          establishedPropositions: reestablishedConversationPropositions(
            relevantConversation,
            evidence,
          ),
        }
      : {
          mode: "simple",
          proposition: cleanQuestion,
          requiresScopeAnalysis: false,
          requiresTimeline: false,
          commandApplicability: contract.commandApplicability,
          components,
          establishedPropositions: [],
        },
    ...(governingCoverage.length ? { governingCoverage } : {}),
    scope: {
      type: candidates.some((candidate) => candidate.method === "reader-context")
        ? "passage"
        : "topic",
      references: evidence
        .filter((item) => item.kind === "scripture")
        .map((item) => item.reference)
        .filter((value): value is string => Boolean(value)),
      entityIds: [],
    },
    requestedCoverage: {
      version: EMET_AI_COVERAGE_VERSION,
      passages: requestedPassages,
      competingInterpretations: requestedCoverage.competingInterpretations,
      comparisonPassages,
      language: requestedCoverage.language.map((requirement) => ({
        ...requirement,
        terms: Array.from(new Map(
          sourcePhraseMatches
            .filter((match) => requirement.corpora.includes(match.phrase.corpus as "hebrew" | "greek-nt"))
            .flatMap((match) => match.verifiedTerms.map((term) => ({
              ...term,
              corpus: match.phrase.corpus as "hebrew" | "greek-nt",
            })))
            .map((term) => [`${term.corpus}:${term.lexicalId}`, term]),
        ).values()),
      })),
      subquestions: requestedCoverage.subquestions,
    },
    identity: { gate: "not-applicable" },
    evidence,
    provenance: {
      evidenceVersion: `semantic-scripture-topic@2:${Array.from(fingerprints).sort().join(":")}`,
      builtAt: builtAt || new Date().toISOString(),
    },
  };
  const validation = validateEmetAiEvidencePacket(packet);
  return validation.ok
    ? { status: "ready" as const, packet: validation.value }
    : {
        status: "insufficient-evidence" as const,
        limitations: validation.errors,
      };
}
