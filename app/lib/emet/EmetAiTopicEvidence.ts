import "server-only";

import fs from "node:fs";
import path from "node:path";

import { normalizeBookName } from "../../data/bookAliases";
import {
  EMET_AI_EVIDENCE_SCHEMA,
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
import { verifiedSourcePhraseMatches } from "./EmetAiSourcePhrase";

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

const MAX_PLANNED_EVIDENCE_VERSES = 10;
const MAX_LITERAL_FALLBACK_VERSES = 8;
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
const SINGLE_CHAPTER_BOOKS = new Set([
  "Obadiah",
  "Philemon",
  "2 John",
  "3 John",
  "Jude",
]);

const indexes = new Map<SearchTranslation, SearchIndex>();
const recordMaps = new Map<SearchTranslation, Map<string, number>>();
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

function expandPlannedReferences(value: string) {
  const trimmed = value.trim().replace(/[–—]/g, "-");
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
      end - start <= 12
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
      end - start <= 12
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

function governingCandidates(plan: EmetAiRetrievalPlan | null) {
  if (!plan || !["continuity", "application"].includes(plan.intent)) return [];
  const governing = [
    ["Matthew 5:17", "direct", "Jesus directly addresses abolishing the Law and the Prophets."],
    ["Matthew 5:18", "direct", "Jesus states the law's duration and stated end condition."],
    ["Matthew 5:19", "later-witness", "Jesus addresses doing and teaching the commandments."],
    ["Romans 3:31", "later-witness", "Paul directly addresses whether faith nullifies or establishes the law."],
    ["Revelation 14:12", "later-witness", "A later canonical witness describes the saints in relation to God's commandments."],
  ] as const;

  return governing
    .map(([reference, role, reason], position) => {
      const resolved = resolveReference(reference);
      if (!resolved) return null;
      return {
        ...resolved,
        method: "governing-scripture" as const,
        role,
        reason,
        score: 99 - position * 0.2,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
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

function selectedCandidates({
  question,
  plan,
  context,
}: {
  question: string;
  plan: EmetAiRetrievalPlan | null;
  context: EmetAiReaderContext | null;
}) {
  const contextEvidence = contextCandidates(context, question);
  const plannedEvidence = plannedCandidates(plan);
  const phraseEvidence = sourcePhraseCandidates(plan);
  const governingEvidence = governingCandidates(plan);
  const literalEvidence = literalCandidates(question);
  const candidates = plan
    ? [
        ...contextEvidence,
        ...phraseEvidence,
        ...governingEvidence,
        ...plannedEvidence,
        ...(plan.analysisMode === "simple"
          ? literalEvidence.filter((candidate) => candidate.score >= 65).slice(0, 2)
          : []),
      ]
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

  const evidenceLimit =
    plan.analysisMode === "simple" ? MAX_PLANNED_EVIDENCE_VERSES : 12;

  const selected: EvidenceCandidate[] = [];
  const selectedReferences = new Set<string>();
  const chapterCounts = new Map<string, number>();
  const add = (candidate: EvidenceCandidate) => {
    const reference = recordReference(candidate.record);
    if (selectedReferences.has(reference)) return false;
    const chapterKey = `${candidate.record[0]}|${candidate.record[1]}`;
    if ((chapterCounts.get(chapterKey) || 0) >= 3) return false;
    selected.push(candidate);
    selectedReferences.add(reference);
    chapterCounts.set(chapterKey, (chapterCounts.get(chapterKey) || 0) + 1);
    return true;
  };

  // Preserve the evidence hierarchy before filling remaining slots. This
  // prevents one long chapter from displacing later witness or qualifying
  // passages merely because the planner returned its verses first.
  if (plan.analysisMode !== "simple") {
    for (const candidate of ranked.filter(
      (item) => item.role === "qualifying" || item.role === "contrast",
    ).slice(0, 4)) {
      add(candidate);
    }
  }
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
  return selected;
}

export function buildEmetAiTopicEvidence({
  question,
  conversation = null,
  context = null,
  retrievalPlan = null,
  requireSemanticPlan = false,
  builtAt,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  retrievalPlan?: EmetAiRetrievalPlan | null;
  requireSemanticPlan?: boolean;
  builtAt?: string;
}) {
  const cleanQuestion = question.trim();
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

  const candidates = selectedCandidates({
    question: cleanQuestion,
    plan: retrievalPlan,
    context,
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

  if (retrievalPlan && retrievalPlan.analysisMode !== "simple") {
    const roles = new Set(candidates.map((candidate) => candidate.role));
    const hasSupportingEvidence = [
      "direct",
      "foundation",
      "later-witness",
    ].some((role) => roles.has(role as EmetAiRetrievalRole));
    const qualifyingEvidenceCount = candidates.filter(
      (candidate) =>
        candidate.role === "qualifying" || candidate.role === "contrast",
    ).length;
    if (!hasSupportingEvidence || qualifyingEvidenceCount < 2) {
      return {
        status: "insufficient-evidence" as const,
        limitations: [
          "A disputed claim requires verified Scripture on both the proposed support and the material qualification or tension.",
        ],
      };
    }
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
  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question: retrievalPlan
      ? `${resolvedQuestion}\n\nResolved retrieval subject (context only, not evidence): ${retrievalPlan.subject}`
      : resolvedQuestion,
    reasoning: retrievalPlan
      ? {
          mode: retrievalPlan.analysisMode,
          proposition: retrievalPlan.proposition,
          components: retrievalPlan.components,
        }
      : {
          mode: "simple",
          proposition: cleanQuestion,
          components: [],
        },
    scope: {
      type: candidates.some((candidate) => candidate.method === "reader-context")
        ? "passage"
        : "topic",
      references: evidence
        .map((item) => item.reference)
        .filter((value): value is string => Boolean(value)),
      entityIds: [],
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
