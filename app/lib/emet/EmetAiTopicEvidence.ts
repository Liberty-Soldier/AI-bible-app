import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  EMET_AI_EVIDENCE_SCHEMA,
  type EmetAiEvidenceItem,
  type EmetAiEvidencePacket,
  validateEmetAiEvidencePacket,
} from "./EmetAiContract";
import { buildEmetConversationQuestion } from "./EmetAiConversation";

type SearchTranslation = "web" | "kjv" | "brenton";
type SearchRecord = [book: string, chapter: number, verse: string, text: string];
type SearchIndex = {
  translation: SearchTranslation;
  sourceFingerprint: string;
  records: SearchRecord[];
};

export type EmetAiReaderContext = {
  book: string;
  chapter: number;
  verse?: string | number | null;
  translation: SearchTranslation;
};

const MAX_EVIDENCE_VERSES = 20;
const TORAH_BOOKS = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
]);
const NEW_TESTAMENT_BOOKS = new Set([
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus",
  "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
  "3 John", "Jude", "Revelation",
]);
const STOP_WORDS = new Set([
  "about", "according", "after", "also", "and", "are", "because", "before",
  "bible", "but", "can", "could", "did", "does", "establish", "established",
  "evidence", "explain", "for", "from", "has", "have", "how", "into", "is",
  "its", "mean", "means", "of", "on", "or", "say", "says", "scripture",
  "should", "teach", "teaches", "testament", "that", "the", "their", "theme", "then",
  "there", "these", "they", "this", "through", "to", "was", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your",
  "understand",
]);

const NORMATIVE_QUESTION_WORDS = new Set([
  "command", "commanded", "commandment", "commandments", "duty", "establish",
  "established", "keep", "keeping", "must", "obey", "obedience", "observe",
  "required", "requirement", "should",
]);
const CONTINUITY_QUESTION_WORDS = new Set([
  "abolish", "abolished", "continue", "continued", "ended", "forever", "modern",
  "remain", "remains", "still", "today", "until",
]);
const QUESTION_CONTROL_WORDS = new Set([
  "establish", "established", "keep", "keeping", "modern", "must", "obey",
  "observe", "required", "should", "still", "today",
]);
const APPLICATION_QUESTION_WORDS = new Set([
  "believer", "believers", "christian", "christians", "church", "modern",
  "people", "today",
]);
const APPLICATION_CONCEPTS = [
  {
    id: "disciples",
    weight: 8,
    words: new Set(["disciple", "disciples"]),
  },
  {
    id: "saints",
    weight: 20,
    words: new Set(["saint", "saints"]),
  },
  {
    id: "assembly",
    weight: 5,
    words: new Set(["assembly", "assemblies", "believers"]),
  },
  {
    id: "nations",
    weight: 7,
    words: new Set(["gentile", "gentiles", "nation", "nations"]),
  },
] as const;
const DIRECT_QUESTION_CONCEPTS = [
  {
    id: "ending-or-abolition",
    weight: 30,
    words: new Set([
      "abolish", "abolished", "cancel", "canceled", "cancelled", "destroy",
      "destroyed", "end", "ended", "nullified", "nullify", "overthrow", "void",
    ]),
  },
  {
    id: "continuing-or-enduring",
    weight: 24,
    words: new Set([
      "continue", "continued", "eternal", "forever", "perpetual", "remain",
      "remains", "until",
    ]),
  },
  {
    id: "fulfillment",
    weight: 24,
    words: new Set(["accomplish", "accomplished", "fulfill", "fulfilled"]),
  },
] as const;
const GOVERNING_CONCEPTS = [
  {
    id: "command",
    weight: 4,
    words: new Set(["command", "commanded", "commandment", "commandments"]),
  },
  {
    id: "obedience",
    weight: 3,
    words: new Set(["keep", "keeps", "keeping", "obey", "obeyed", "observe", "observed"]),
  },
  {
    id: "law",
    weight: 4,
    words: new Set(["law", "laws", "statute", "statutes", "ordinance", "ordinances"]),
  },
  {
    id: "duration",
    weight: 4,
    words: new Set(["forever", "perpetual", "generation", "generations", "until"]),
  },
  {
    id: "continuity",
    weight: 4,
    words: new Set([
      "abolish", "abolished", "accomplished", "destroy", "fulfill", "fulfilled",
      "remain", "remains",
    ]),
  },
  {
    id: "cosmic-duration",
    weight: 3,
    words: new Set(["earth", "heaven", "heavens", "pass", "passed"]),
  },
  {
    id: "covenant",
    weight: 3,
    words: new Set(["covenant", "covenants"]),
  },
] as const;

const indexes = new Map<SearchTranslation, SearchIndex>();

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

function tokenizedWords(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length > 2 && word.length <= 32);
}

function normalizedWords(value: string) {
  return tokenizedWords(value).filter((word) => !STOP_WORDS.has(word));
}

function questionTerms(question: string) {
  const terms = Array.from(new Set(normalizedWords(question)));
  const subjectTerms = terms.filter((term) => !QUESTION_CONTROL_WORDS.has(term));
  return (subjectTerms.length ? subjectTerms : terms).slice(0, 10);
}

function intersects(words: Set<string>, candidates: Set<string>) {
  return Array.from(candidates).some((candidate) => words.has(candidate));
}

function questionNeedsGoverningEvidence(question: string) {
  const words = new Set(tokenizedWords(question));
  return (
    intersects(words, NORMATIVE_QUESTION_WORDS) ||
    intersects(words, CONTINUITY_QUESTION_WORDS)
  );
}

function questionNeedsApplicationEvidence(question: string) {
  return intersects(new Set(tokenizedWords(question)), APPLICATION_QUESTION_WORDS);
}

function recordReference(record: SearchRecord) {
  return `${record[0]} ${record[1]}:${record[2]}`;
}

function recordKey(record: SearchRecord) {
  return `${record[0]}|${record[1]}|${record[2]}`;
}

function scriptureItem({
  index,
  record,
  recordIndex,
}: {
  index: SearchIndex;
  record: SearchRecord;
  recordIndex: number;
}): EmetAiEvidenceItem {
  return {
    id: `scripture:${index.translation}:${recordIndex + 1}`,
    kind: "scripture",
    corpus: "translation",
    text: record[3],
    reference: recordReference(record),
    provenance: {
      authority: "locked-scripture-search-runtime",
      sourceId: `${index.translation}:${recordIndex + 1}`,
      checksum: index.sourceFingerprint,
    },
  };
}

function contextRecords(context: EmetAiReaderContext | null) {
  if (!context) return [];

  const index = loadIndex(context.translation);
  const chapter = index.records
    .map((record, recordIndex) => ({ record, recordIndex }))
    .filter(
      ({ record }) =>
        record[0] === context.book && record[1] === context.chapter,
    );
  if (!chapter.length) return [];

  const verse = context.verse === null || context.verse === undefined
    ? ""
    : String(context.verse).trim();
  if (!verse) return chapter.slice(0, 5).map((item) => ({ index, ...item }));

  const selectedIndex = chapter.findIndex(({ record }) => record[2] === verse);
  if (selectedIndex < 0) return [];

  return chapter
    .slice(Math.max(0, selectedIndex - 2), selectedIndex + 3)
    .map((item) => ({ index, ...item }));
}

function topicRecords(question: string) {
  const index = loadIndex("web");
  const terms = questionTerms(question);
  if (!terms.length) return [];

  const questionWords = new Set(tokenizedWords(question));
  const activeDirectConcepts = DIRECT_QUESTION_CONCEPTS.filter((concept) =>
    intersects(questionWords, concept.words),
  );
  const activeDirectConceptWords = new Set(
    activeDirectConcepts.flatMap((concept) => Array.from(concept.words)),
  );
  const subjectTerms = terms.filter((term) => !activeDirectConceptWords.has(term));
  const retrievalTerms = subjectTerms.length ? subjectTerms : terms;
  const needsGoverningEvidence = questionNeedsGoverningEvidence(question);
  const needsApplicationEvidence = questionNeedsApplicationEvidence(question);

  const matches = index.records
    .map((record, recordIndex) => {
      const words = new Set(normalizedWords(record[3]));
      const directMatches = retrievalTerms.filter((term) => words.has(term));
      const directConceptScore = directMatches.length
        ? activeDirectConcepts
            .filter((concept) => intersects(words, concept.words))
            .reduce((score, concept) => score + concept.weight, 0)
        : 0;
      const governingMatches = needsGoverningEvidence
        ? GOVERNING_CONCEPTS.filter((concept) => intersects(words, concept.words))
        : [];
      const governingScore = governingMatches.reduce(
        (score, concept) => score + concept.weight,
        0,
      );
      const applicationCommandScore = governingMatches
        .filter(
          (concept) => concept.id === "command" || concept.id === "obedience",
        )
        .reduce((score, concept) => score + concept.weight, 0);
      const applicationScore = needsApplicationEvidence
        ? APPLICATION_CONCEPTS.filter((concept) => intersects(words, concept.words))
            .reduce((score, concept) => score + concept.weight, 0)
        : 0;
      return {
        index,
        record,
        recordIndex,
        directScore: directMatches.length * 20 + directConceptScore,
        governingScore,
        applicationScore,
        applicationBridgeScore: applicationScore,
        applicationCommandScore,
        score:
          directMatches.length * 20 +
          directConceptScore +
          governingScore +
          applicationScore,
      };
    })
    .filter((item) => item.score > 0);

  const matchesByRecordIndex = new Map(
    matches.map((item) => [item.recordIndex, item] as const),
  );
  for (const item of matches) {
    if (item.applicationScore <= 0) continue;
    item.applicationBridgeScore += item.applicationCommandScore * 2;
    item.applicationBridgeScore += [-1, 1].reduce(
      (score, offset) =>
        score +
        (matchesByRecordIndex.get(item.recordIndex + offset)?.applicationCommandScore || 0) * 2,
      0,
    );
  }
  matches.sort(
    (left, right) => right.score - left.score || left.recordIndex - right.recordIndex,
  );

  const bands = [
    matches.filter((item) => TORAH_BOOKS.has(item.record[0])),
    matches.filter(
      (item) =>
        !TORAH_BOOKS.has(item.record[0]) &&
        !NEW_TESTAMENT_BOOKS.has(item.record[0]),
    ),
    matches.filter((item) => NEW_TESTAMENT_BOOKS.has(item.record[0])),
  ];
  const selected = bands.flatMap((band, bandIndex) => {
    if (!needsGoverningEvidence) return band.slice(0, 6);

    // Earlier Scripture establishes the topic itself. Reserve governing-only
    // evidence for the New Testament band, where later statements can define
    // continuity, fulfillment, or change without displacing the foundation.
    if (bandIndex < 2) {
      const limit = needsApplicationEvidence && bandIndex === 1 ? 2 : 6;
      return band.filter((item) => item.directScore > 0).slice(0, limit);
    }

    const direct = band.filter((item) => item.directScore > 0).slice(0, 3);
    const directIndexes = new Set(direct.map((item) => item.recordIndex));
    const governingCandidates = band
      .filter(
        (item) => item.governingScore > 0 && !directIndexes.has(item.recordIndex),
      )
      .sort(
        (left, right) =>
          right.governingScore - left.governingScore ||
          right.directScore - left.directScore ||
          left.recordIndex - right.recordIndex,
      );
    const governing: typeof band = [];
    const governingIndexes = new Set<number>();

    for (const seed of governingCandidates) {
      if (governing.length >= 3) break;
      if (!governingIndexes.has(seed.recordIndex)) {
        governing.push(seed);
        governingIndexes.add(seed.recordIndex);
      }

      for (const offset of [-1, 1]) {
        if (governing.length >= 3) break;
        const neighbor = governingCandidates.find(
          (item) =>
            item.recordIndex === seed.recordIndex + offset &&
            item.record[0] === seed.record[0] &&
            item.record[1] === seed.record[1],
        );
        if (!neighbor || governingIndexes.has(neighbor.recordIndex)) continue;
        governing.push(neighbor);
        governingIndexes.add(neighbor.recordIndex);
      }
    }
    const application: typeof band = [];
    const applicationIndexes = new Set<number>();
    const applicationPassageCounts = new Map<string, number>();
    const reservedIndexes = new Set([
      ...direct.map((item) => item.recordIndex),
      ...governing.map((item) => item.recordIndex),
    ]);
    const applicationCandidates = band
      .filter(
        (item) =>
          item.applicationScore > 0 && !reservedIndexes.has(item.recordIndex),
      )
      .sort(
        (left, right) =>
          right.applicationBridgeScore - left.applicationBridgeScore ||
          right.applicationScore - left.applicationScore ||
          left.recordIndex - right.recordIndex,
      );

    for (const seed of applicationCandidates) {
      if (application.length >= 5) break;
      const seedPassageKey = `${seed.record[0]}|${seed.record[1]}`;
      if ((applicationPassageCounts.get(seedPassageKey) || 0) >= 2) continue;
      if (!applicationIndexes.has(seed.recordIndex)) {
        application.push(seed);
        applicationIndexes.add(seed.recordIndex);
        applicationPassageCounts.set(
          seedPassageKey,
          (applicationPassageCounts.get(seedPassageKey) || 0) + 1,
        );
      }

      for (const offset of [-1, 1]) {
        if (application.length >= 5) break;
        const neighbor = band.find(
          (item) =>
            item.recordIndex === seed.recordIndex + offset &&
            item.record[0] === seed.record[0] &&
            item.record[1] === seed.record[1] &&
            (item.applicationScore > 0 || item.applicationCommandScore > 0) &&
            !reservedIndexes.has(item.recordIndex),
        );
        if (!neighbor || applicationIndexes.has(neighbor.recordIndex)) continue;
        const neighborPassageKey = `${neighbor.record[0]}|${neighbor.record[1]}`;
        if ((applicationPassageCounts.get(neighborPassageKey) || 0) >= 2) continue;
        application.push(neighbor);
        applicationIndexes.add(neighbor.recordIndex);
        applicationPassageCounts.set(
          neighborPassageKey,
          (applicationPassageCounts.get(neighborPassageKey) || 0) + 1,
        );
      }
    }

    const bandLimit = needsApplicationEvidence ? 11 : 6;
    const bandSelection = [...direct, ...governing, ...application];
    const bandIndexes = new Set(bandSelection.map((item) => item.recordIndex));

    for (const item of band) {
      if (bandSelection.length >= bandLimit) break;
      if (bandIndexes.has(item.recordIndex)) continue;
      bandSelection.push(item);
      bandIndexes.add(item.recordIndex);
    }

    return bandSelection;
  });
  const seen = new Set(selected.map((item) => item.recordIndex));

  for (const match of matches) {
    if (selected.length >= MAX_EVIDENCE_VERSES) break;
    if (seen.has(match.recordIndex)) continue;
    selected.push(match);
    seen.add(match.recordIndex);
  }

  return selected.sort((left, right) => left.recordIndex - right.recordIndex);
}

export function buildEmetAiTopicEvidence({
  question,
  previousQuestions = [],
  context = null,
  builtAt,
}: {
  question: string;
  previousQuestions?: string[];
  context?: EmetAiReaderContext | null;
  builtAt?: string;
}) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    return {
      status: "insufficient-evidence" as const,
      limitations: ["A question is required."],
    };
  }

  const retrievalQuestion = [...previousQuestions, cleanQuestion].join("\n");
  const candidates = [
    ...contextRecords(context),
    ...topicRecords(retrievalQuestion),
  ];
  const seen = new Set<string>();
  const evidence: EmetAiEvidenceItem[] = [];
  const fingerprints = new Set<string>();

  for (const candidate of candidates) {
    const key = recordKey(candidate.record);
    if (seen.has(key) || evidence.length >= MAX_EVIDENCE_VERSES) continue;
    seen.add(key);
    fingerprints.add(candidate.index.sourceFingerprint);
    evidence.push(scriptureItem(candidate));
  }

  if (!evidence.length) {
    return {
      status: "insufficient-evidence" as const,
      limitations: [
        "The locked Scripture index did not supply enough directly relevant passages for this question.",
      ],
    };
  }

  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question: buildEmetConversationQuestion({
      question: cleanQuestion,
      previousQuestions,
    }),
    scope: {
      type: context ? "passage" : "topic",
      references: evidence
        .map((item) => item.reference)
        .filter((value): value is string => Boolean(value)),
      entityIds: [],
    },
    identity: { gate: "not-applicable" },
    evidence,
    provenance: {
      evidenceVersion: `locked-scripture-topic-search@3:${Array.from(fingerprints).sort().join(":")}`,
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
