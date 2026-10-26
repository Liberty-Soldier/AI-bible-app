import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { EmetConversationContext } from "../EmetAiConversation";
import { buildEmetAiQuestionContract } from "../EmetAiQuestionContract";
import {
  verifiedSourceTermSequenceAtReference,
  verifiedSourceTermsAtReference,
} from "../EmetAiSourcePhrase";
import { expandPlannedReferences } from "../EmetAiTopicEvidence";

export type FastScripturePassage = {
  reference: string;
  text: string;
  score: number;
  reasons: string[];
  explicit: boolean;
};

export type FastScriptureLexicalTerm = {
  reference: string;
  corpus: "hebrew" | "greek-nt" | "lxx";
  lexicalId: string;
  lemma: string;
  transliteration: string;
  meaning: string;
  morphologySignature?: string;
  position?: number;
  evidenceMode?: "term" | "verse-sequence";
  surfaceForm?: string;
};

export type FastScriptureRetrievalResult = {
  status: "sufficient" | "insufficient";
  passages: FastScripturePassage[];
  lexicalTerms: FastScriptureLexicalTerm[];
  limitations: string[];
  diagnostics: {
    indexLoadMs: number;
    retrievalMs: number;
    queryTerms: string[];
    expandedTerms: string[];
    explicitReferences: string[];
    estimatedEvidenceTokens: number;
    testamentCoverage: Array<"ot" | "nt">;
  };
};

type SearchRecord = [string, number, string, string];
type IndexedVerse = {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
  tokens: string[];
  stems: string[];
  testament: "ot" | "nt";
};
type ScriptureIndex = {
  verses: IndexedVerse[];
  byReference: Map<string, number>;
  byChapter: Map<string, number[]>;
  postings: Map<string, number[]>;
  documentFrequency: Map<string, number>;
};

const NT_BOOKS = new Set([
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
]);

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "before", "by", "did", "do", "does",
  "for", "from", "how", "i", "in", "is", "it", "its", "of", "on", "or", "should", "someone",
  "that", "the", "their", "them", "they", "this", "to", "us", "was", "we", "what", "when",
  "which", "who", "with", "would", "yet", "modern", "suppose", "supposed", "supposedly",
  "require", "required", "requirement",
]);

// General lexical/concept families only. These add search vocabulary, never references or conclusions.
const TERM_FAMILIES: string[][] = [
  ["command", "commandment", "law", "statute", "ordinance", "precept", "instruction", "obey", "keep"],
  ["create", "created", "creation", "made", "maker"],
  ["die", "death", "dead", "dust", "grave", "sheol", "sleep"],
  ["raise", "raised", "resurrection", "rise", "rising"],
  ["resurrection", "raised", "last", "day", "coming", "trumpet", "incorruptible"],
  ["righteous", "righteousness", "just", "justify", "justification"],
  ["priest", "priestly", "priesthood", "aaron", "sons", "stranger", "outsider"],
  ["sabbath", "seventh", "rest", "holy", "sanctified"],
  ["covenant", "testament", "tablets", "law", "heart"],
  ["sacrifice", "offering", "altar", "offered"],
  ["clean", "unclean", "animal", "beast"],
  ["one", "single", "alone", "united"],
  ["messiah", "christ", "jesus", "lord", "master"],
];

let cachedIndex: ScriptureIndex | null = null;

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(value: string) {
  if (value.length <= 3) return value;
  return value
    .replace(/(?:ments?|ness|ation|ations|ingly|edly)$/u, "")
    .replace(/(?:ies)$/u, "y")
    .replace(/(?:ing|ers?|ed|es|s)$/u, "");
}

function contentTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function loadScriptureIndex() {
  if (cachedIndex) return { index: cachedIndex, loadMs: 0 };
  const startedAt = performance.now();
  const file = path.join(process.cwd(), "public", "scripture", "search", "web.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as { records: SearchRecord[] };
  const byReference = new Map<string, number>();
  const byChapter = new Map<string, number[]>();
  const postings = new Map<string, number[]>();
  const verses = payload.records.map(([book, chapter, verseLabel, text], index): IndexedVerse => {
    const verse = Number.parseInt(verseLabel, 10);
    const reference = `${book} ${chapter}:${verse}`;
    const tokens = contentTokens(text);
    const stems = Array.from(new Set(tokens.map(stem)));
    byReference.set(reference, index);
    const chapterKey = `${book} ${chapter}`;
    byChapter.set(chapterKey, [...(byChapter.get(chapterKey) || []), index]);
    for (const term of stems) postings.set(term, [...(postings.get(term) || []), index]);
    return { book, chapter, verse, reference, text, tokens, stems, testament: NT_BOOKS.has(book) ? "nt" : "ot" };
  });
  cachedIndex = {
    verses,
    byReference,
    byChapter,
    postings,
    documentFrequency: new Map(Array.from(postings, ([term, ids]) => [term, ids.length])),
  };
  return { index: cachedIndex, loadMs: performance.now() - startedAt };
}

/**
 * Finds topic-bearing testimony in the four Gospels from the locked corpus.
 * This is used only when the question itself relates Messiah's followers to an
 * earlier command. It selects by question entities and textual content, never
 * by a preferred conclusion or a fixed doctrinal reference list.
 */
export function retrieveLockedMessiahTopicTestimony({
  topicTerms,
  limit = 3,
}: {
  topicTerms: string[];
  limit?: number;
}): FastScripturePassage[] {
  const { index } = loadScriptureIndex();
  const topicStems = Array.from(new Set(topicTerms.flatMap(contentTokens).map(stem)))
    .filter((term) => !["messiah", "christ", "jesus", "follower", "believer", "christian"].includes(term));
  if (!topicStems.length) return [];
  const gospelBooks = new Set(["Matthew", "Mark", "Luke", "John"]);
  return index.verses
    .filter((verse) => gospelBooks.has(verse.book) && topicStems.some((term) => verse.stems.includes(term)))
    .map((verse) => {
      const directTerms = topicStems.filter((term) => verse.stems.includes(term)).length;
      const explicitMessiah = /\b(?:Jesus|Christ|Son of man|Lord)\b/i.test(verse.text);
      const teachingForm = /\b(?:said|says|answered|taught|commanded|made for|lord of)\b/i.test(verse.text);
      return {
        reference: verse.reference,
        text: verse.text,
        score: directTerms * 10 + (explicitMessiah ? 5 : 0) + (teachingForm ? 3 : 0),
        reasons: ["locked-gospel-topic-testimony"],
        explicit: false,
      } satisfies FastScripturePassage;
    })
    .sort((left, right) => right.score - left.score)
    .filter((passage, indexInList, passages) => {
      const chapter = passage.reference.replace(/:\d+$/, "");
      return passages.findIndex((candidate) => candidate.reference.replace(/:\d+$/, "") === chapter) === indexInList;
    })
    .slice(0, limit);
}

function expandTerms(tokens: string[]) {
  const expanded = new Set(tokens);
  const stems = new Set(tokens.map(stem));
  for (const family of TERM_FAMILIES) {
    if (!family.some((term) => stems.has(stem(term)))) continue;
    for (const term of family) expanded.add(term);
  }
  return Array.from(expanded);
}

function estimatedTokens(passages: FastScripturePassage[], lexical: FastScriptureLexicalTerm[]) {
  const characters = passages.reduce((sum, passage) => sum + passage.reference.length + passage.text.length + 8, 0)
    + lexical.reduce((sum, term) => sum + JSON.stringify(term).length, 0);
  return Math.ceil(characters / 4);
}

function lexicalLookupWord(question: string) {
  return question.match(/\btranslated\s+["“”']?([\p{L}]+)["“”']?/iu)?.[1]
    || question.match(/\bword\s+(?:for|meaning)\s+["“”']?([\p{L}]+)["“”']?/iu)?.[1]
    || "";
}

export function requiresVerseScopedLexicalSequence(question: string) {
  return /\b(?:hebrew|greek|original[- ]language)\s+(?:wording|phrase|text|structure)\b/i.test(question) ||
    /\b(?:separate|distinct|independent)\s+(?:hebrew|greek|original[- ]language)?\s*(?:word|token|noun)\b/i.test(question) ||
    /\b(?:word|term)\b[^?]{0,100}\b(?:supplied|added|omitted|absent|corresponds? to)\b/i.test(question);
}

export function deterministicLexicalLookups({
  question,
  contract,
}: {
  question: string;
  contract: ReturnType<typeof buildEmetAiQuestionContract>;
}) {
  if (!contract.requestedLanguages.length || !contract.requestedCoverage.passages.length) return [];
  const useSequence = requiresVerseScopedLexicalSequence(question);
  const lookup = lexicalLookupWord(question);
  const requests: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt";
    lookup: string;
    mode: "term" | "verse-sequence";
  }> = [];
  for (const passage of contract.requestedCoverage.passages) {
    if (passage.startVerse === undefined) continue;
    const endVerse = passage.endVerse || passage.startVerse;
    if (endVerse - passage.startVerse > 3) continue;
    for (let verse = passage.startVerse; verse <= endVerse; verse += 1) {
      for (const corpus of contract.requestedLanguages) {
        if (!useSequence && !lookup) continue;
        requests.push({
          reference: `${passage.book} ${passage.chapter}:${verse}`,
          corpus,
          lookup: useSequence ? "complete verified verse sequence" : lookup,
          mode: useSequence ? "verse-sequence" : "term",
        });
      }
    }
  }
  return requests.slice(0, 8);
}

function passageReferenceRange(book: string, chapter: number, startVerse?: number, endVerse?: number) {
  if (startVerse === undefined) return `${book} ${chapter}`;
  return `${book} ${chapter}:${startVerse}${endVerse && endVerse !== startVerse ? `-${endVerse}` : ""}`;
}

function addCandidate(
  candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>,
  id: number,
  score: number,
  reason: string,
  explicit = false,
) {
  const current = candidates.get(id) || { score: 0, reasons: new Set<string>(), explicit: false };
  current.score += score;
  current.reasons.add(reason);
  current.explicit ||= explicit;
  candidates.set(id, current);
}

function addExplicitCoverage(index: ScriptureIndex, explicit: ReturnType<typeof buildEmetAiQuestionContract>["requestedCoverage"]["passages"], candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>) {
  for (const passage of explicit) {
    if (passage.startVerse !== undefined) {
      for (let verse = passage.startVerse; verse <= (passage.endVerse || passage.startVerse); verse += 1) {
        const id = index.byReference.get(`${passage.book} ${passage.chapter}:${verse}`);
        if (id !== undefined) addCandidate(candidates, id, 1_000, "explicit-reference", true);
      }
      continue;
    }
    for (const id of index.byChapter.get(`${passage.book} ${passage.chapter}`) || []) {
      addCandidate(candidates, id, 12, "explicit-chapter", true);
    }
  }
}

function addCorpusMatches(index: ScriptureIndex, terms: string[], candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>, factor = 1) {
  const queryStems = Array.from(new Set(terms.map(stem)));
  for (const queryStem of queryStems) {
    const ids = index.postings.get(queryStem) || [];
    if (!ids.length) continue;
    const idf = Math.log(1 + index.verses.length / (1 + ids.length));
    for (const id of ids) addCandidate(candidates, id, idf * factor, `term:${queryStem}`);
  }
}

function addPhraseMatches(index: ScriptureIndex, question: string, candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>) {
  const normalizedQuestion = normalizeText(question);
  const questionWords = normalizedQuestion.split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const ngrams = new Set<string>();
  for (let size = 4; size >= 2; size -= 1) {
    for (let start = 0; start + size <= questionWords.length; start += 1) {
      ngrams.add(questionWords.slice(start, start + size).join(" "));
    }
  }
  const phrases = [
    ...Array.from(question.matchAll(/["“]([^"”]{3,80})["”]/gu), (match) => normalizeText(match[1])),
    ...Array.from(question.matchAll(/\b(?:sons? of [a-z]+|clean and unclean [a-z]+|ten commandments|last day)\b/giu), (match) => normalizeText(match[0])),
    ...ngrams,
  ].filter((phrase) => phrase.split(" ").length >= 2);
  for (const phrase of phrases) {
    const phraseStems = contentTokens(phrase).map(stem);
    if (phraseStems.length < 2) continue;
    const frequencies = phraseStems.map((term) => index.documentFrequency.get(term) || index.verses.length);
    const intentionalPhrase = /^(?:sons? of |clean and unclean |ten commandments|last day)/u.test(phrase);
    if (!intentionalPhrase && Math.min(...frequencies) > 180) continue;
    const rarestPosition = frequencies.indexOf(Math.min(...frequencies));
    const possibleIds = index.postings.get(phraseStems[rarestPosition]) || [];
    let matches = 0;
    for (const id of possibleIds) {
      const searchable = index.verses[id].tokens.map(stem).join(" ");
      if (!searchable.includes(phraseStems.join(" "))) continue;
      matches += 1;
      if (matches > 80) break;
      addCandidate(candidates, id, phrase.split(" ").length * 7, `phrase:${phrase}`);
    }
  }
}

function addExplicitChapterConnections(
  index: ScriptureIndex,
  explicit: ReturnType<typeof buildEmetAiQuestionContract>["requestedCoverage"]["passages"],
  candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>,
) {
  const chapters = explicit
    .filter((passage) => passage.startVerse === undefined)
    .map((passage) => index.byChapter.get(`${passage.book} ${passage.chapter}`) || [])
    .filter((ids) => ids.length);
  if (chapters.length < 2) return;
  const chapterTerms = chapters.map((ids) => {
    const terms = new Set<string>();
    for (const id of ids) for (const term of index.verses[id].stems) terms.add(term);
    return terms;
  });
  const shared = new Set(Array.from(chapterTerms[0]).filter((term) =>
    chapterTerms.slice(1).some((terms) => terms.has(term)) &&
    !STOP_WORDS.has(term) && (index.documentFrequency.get(term) || Infinity) < 2_000,
  ));
  for (const ids of chapters) {
    for (const id of ids) {
      const count = index.verses[id].stems.filter((term) => shared.has(term)).length;
      if (count >= 2) addCandidate(candidates, id, count * count * 3, "cross-chapter-parallel", true);
    }
  }
}

function addNamedEnumerationContext(
  index: ScriptureIndex,
  question: string,
  candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>,
) {
  const namedMatch = question.match(/^\s*(?:what|which)\s+(?:are|were)\s+(?:the\s+)?([^?]+?)(?:\?|$)/i);
  if (!namedMatch) return;
  const namedTerms = contentTokens(namedMatch[1]).map(stem);
  if (namedTerms.length < 2) return;
  const rarest = namedTerms
    .map((term) => ({ term, frequency: index.documentFrequency.get(term) || index.verses.length }))
    .sort((left, right) => left.frequency - right.frequency)[0];
  const anchors = (index.postings.get(rarest.term) || [])
    .filter((id) => index.verses[id].tokens.map(stem).join(" ").includes(namedTerms.join(" ")))
    .map((id) => [id, candidates.get(id) || { score: 0, reasons: new Set<string>(), explicit: false }] as const)
    .slice(0, 12);
  const chapterScores = new Map<string, number>();
  for (const [anchorId] of anchors) {
    const anchor = index.verses[anchorId];
    for (const delta of [-1, 0, 1]) {
      const key = `${anchor.book} ${anchor.chapter + delta}`;
      const ids = index.byChapter.get(key) || [];
      const imperativeDensity = ids.reduce((sum, id) => {
        const text = index.verses[id].text;
        return sum + (/\bshall not\b/i.test(text) ? 3 : 0) + (/\b(?:you shall|remember|honor|observe)\b/i.test(text) ? 1 : 0);
      }, 0);
      if (imperativeDensity) chapterScores.set(key, Math.max(chapterScores.get(key) || 0, imperativeDensity));
    }
  }
  const best = Array.from(chapterScores).sort((left, right) => right[1] - left[1]).slice(0, 1);
  for (const [key, density] of best) {
    const chapterIds = index.byChapter.get(key) || [];
    let bestWindow = chapterIds;
    let bestWindowScore = -1;
    for (let start = 0; start < chapterIds.length; start += 1) {
      const window = chapterIds.slice(start, start + 20);
      const score = window.reduce((sum, id) => {
        const text = index.verses[id].text;
        return sum + (/\bshall not\b/i.test(text) ? 3 : 0) + (/\b(?:you shall|remember|honor|observe)\b/i.test(text) ? 1 : 0);
      }, 0);
      if (score > bestWindowScore) {
        bestWindow = window;
        bestWindowScore = score;
      }
    }
    for (const id of bestWindow) {
      if (/\b(?:you shall|shall not|remember|honor|observe|i am yahweh)\b/i.test(index.verses[id].text)) {
        addCandidate(candidates, id, 25 + density * 2, "named-enumeration-context");
      } else {
        addCandidate(candidates, id, 18 + density, "named-enumeration-context");
      }
    }
  }
}

function addParallelTextCandidates(index: ScriptureIndex, candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>) {
  const anchors = Array.from(candidates)
    .filter(([, value]) => value.explicit || value.score >= 18)
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, 10);
  for (const [anchorId] of anchors) {
    const anchor = index.verses[anchorId];
    const rareTerms = anchor.stems
      .filter((term) => (index.documentFrequency.get(term) || Infinity) < 450)
      .sort((left, right) => (index.documentFrequency.get(left) || 0) - (index.documentFrequency.get(right) || 0))
      .slice(0, 7);
    const overlap = new Map<number, number>();
    for (const term of rareTerms) {
      for (const id of index.postings.get(term) || []) {
        if (id === anchorId) continue;
        overlap.set(id, (overlap.get(id) || 0) + 1);
      }
    }
    for (const [id, count] of overlap) {
      if (count < 3) continue;
      addCandidate(candidates, id, count * 2.4, `parallel:${anchor.reference}`);
    }
  }
}

function addContext(index: ScriptureIndex, selected: number[], candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>) {
  for (const id of selected.slice(0, 8)) {
    const verse = index.verses[id];
    for (const offset of [-1, 1, -2, 2]) {
      const neighborId = index.byReference.get(`${verse.book} ${verse.chapter}:${verse.verse + offset}`);
      if (neighborId !== undefined) addCandidate(candidates, neighborId, Math.max(3, (candidates.get(id)?.score || 0) * 0.16), `context:${verse.reference}`);
    }
  }
}

function selectBalanced(index: ScriptureIndex, candidates: Map<number, { score: number; reasons: Set<string>; explicit: boolean }>, limit: number) {
  const ranked = Array.from(candidates)
    .filter(([id]) => Boolean(index.verses[id]))
    .sort((left, right) => Number(right[1].explicit) - Number(left[1].explicit) || right[1].score - left[1].score);
  const selected: number[] = [];
  const chapterCounts = new Map<string, number>();
  for (const [id, value] of ranked) {
    const verse = index.verses[id];
    const key = `${verse.book} ${verse.chapter}`;
    const exactExplicit = value.reasons.has("explicit-reference");
    const enumeration = value.reasons.has("named-enumeration-context");
    const chapterLimit = exactExplicit || enumeration ? 24 : value.explicit ? 4 : 3;
    if ((chapterCounts.get(key) || 0) >= chapterLimit) continue;
    selected.push(id);
    chapterCounts.set(key, (chapterCounts.get(key) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function retrieveFastScriptureEvidence({
  question,
  conversation = null,
  maxPassages = 14,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  maxPassages?: number;
}): FastScriptureRetrievalResult {
  const totalStartedAt = performance.now();
  const { index, loadMs } = loadScriptureIndex();
  const contract = buildEmetAiQuestionContract({ question, conversation });
  const effectiveLimit = contract.intent === "enumeration" ? Math.max(maxPassages, 22) : maxPassages;
  const conversationText = conversation?.recentExchanges.slice(-2).map((item) => item.question).join(" ") || "";
  const queryTokens = contentTokens(question);
  const expandedTerms = expandTerms(queryTokens);
  const candidates = new Map<number, { score: number; reasons: Set<string>; explicit: boolean }>();

  addExplicitCoverage(index, contract.requestedCoverage.passages, candidates);
  addCorpusMatches(index, queryTokens, candidates, 2.4);
  addCorpusMatches(index, expandedTerms.filter((term) => !queryTokens.includes(term)), candidates, 0.55);
  if (conversationText) addCorpusMatches(index, expandTerms(contentTokens(conversationText)), candidates, 0.38);
  addPhraseMatches(index, `${question} ${conversationText}`, candidates);
  addExplicitChapterConnections(index, contract.requestedCoverage.passages, candidates);
  addNamedEnumerationContext(index, question, candidates);
  addParallelTextCandidates(index, candidates);

  const initial = selectBalanced(index, candidates, Math.max(8, effectiveLimit - 3));
  addContext(index, initial, candidates);
  addParallelTextCandidates(index, candidates);
  let selected = selectBalanced(index, candidates, effectiveLimit);

  // For broad Scriptural subjects, preserve the strongest relevant testimony
  // from earlier and later books. This balances evidence rather than asking
  // whether a command has been exempted, repealed, or reauthorized.
  const cumulativeStudy = !contract.requestedCoverage.passages.length &&
    !contract.requestedLanguages.length &&
    ["obligation", "doctrinal"].includes(contract.intent);
  if (cumulativeStudy) {
    const subjectStems = Array.from(new Set(contentTokens(contract.biblicalEntities.join(" ")).map(stem)));
    const ranked = Array.from(candidates)
      .filter(([id, value]) => value.score >= 4 &&
        (!subjectStems.length || subjectStems.some((term) => index.verses[id].stems.includes(term))))
      .sort((left, right) => right[1].score - left[1].score);
    const from = (predicate: (book: string, testament: string) => boolean, n: number) =>
      ranked.filter(([id]) => predicate(index.verses[id].book, index.verses[id].testament))
        .slice(0, n).map(([id]) => id);
    const torah = from((book) => /^(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy)$/.test(book), 3);
    const writingsAndProphets = from((book, testament) =>
      testament === "ot" && !/^(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy)$/.test(book), 3);
    const gospels = from((book) => /^(?:Matthew|Mark|Luke|John)$/.test(book), 3);
    const later = from((book, testament) =>
      testament === "nt" && !/^(?:Matthew|Mark|Luke|John)$/.test(book), 2);
    selected = Array.from(new Set([...torah, ...writingsAndProphets, ...gospels, ...later, ...selected]))
      .slice(0, effectiveLimit);
  }
  const exactReferenceRequestForSelection = contract.requestedCoverage.passages.length > 0
    && contract.requestedCoverage.passages.every((passage) => passage.startVerse !== undefined);
  if (exactReferenceRequestForSelection) {
    selected = selected.filter((id) => {
      const reasons = candidates.get(id)?.reasons || new Set<string>();
      return reasons.has("explicit-reference") || Array.from(reasons).some((reason) => reason.startsWith("context:"));
    }).slice(0, Math.max(6, contract.requestedCoverage.passages.length + 4));
  } else if (contract.requestedCoverage.passages.filter((passage) => passage.startVerse === undefined).length >= 2) {
    selected = selected.filter((id) => {
      const reasons = candidates.get(id)?.reasons || new Set<string>();
      return reasons.has("explicit-chapter") || reasons.has("cross-chapter-parallel");
    }).slice(0, 12);
  } else if (!contract.requestedCoverage.passages.length && contract.intent === "direct" && !contract.commandApplicability) {
    selected = selected.slice(0, 8);
  }

  const passages = selected.map((id): FastScripturePassage => {
    const verse = index.verses[id];
    const candidate = candidates.get(id)!;
    return {
      reference: verse.reference,
      text: verse.text,
      score: Math.round(candidate.score * 100) / 100,
      reasons: Array.from(candidate.reasons),
      explicit: candidate.explicit,
    };
  });

  const lexicalRequests = deterministicLexicalLookups({ question, contract });
  const lexicalTerms: FastScriptureLexicalTerm[] = lexicalRequests.flatMap((request) => {
    const terms = request.mode === "verse-sequence"
      ? verifiedSourceTermSequenceAtReference(request)
      : verifiedSourceTermsAtReference(request);
    return terms.map((term) => ({ ...term, evidenceMode: request.mode }));
  });

  const limitations: string[] = [];
  const selectedReferences = new Set(passages.map((passage) => passage.reference));
  for (const requested of contract.requestedCoverage.passages) {
    if (requested.startVerse === undefined) {
      if (!passages.some((passage) => passage.reference.startsWith(`${requested.book} ${requested.chapter}:`))) {
        limitations.push(`Requested chapter ${requested.book} ${requested.chapter} was not retrieved.`);
      }
      continue;
    }
    for (let verse = requested.startVerse; verse <= (requested.endVerse || requested.startVerse); verse += 1) {
      const reference = `${requested.book} ${requested.chapter}:${verse}`;
      if (!selectedReferences.has(reference)) limitations.push(`Requested reference ${reference} was not retrieved.`);
    }
  }
  if (contract.requestedLanguages.length && !lexicalTerms.length) {
    limitations.push("The requested lexical identity was not resolved from the locked source index.");
  }
  const testaments = new Set(passages.map((passage) => {
    const id = index.byReference.get(passage.reference)!;
    return index.verses[id].testament;
  }));
  if (contract.commandApplicability && /\b(?:messiah|christians?|believers?|new testament)\b/i.test(question)) {
    if (!testaments.has("ot")) limitations.push("No relevant Old Testament foundation was retrieved.");
    if (!testaments.has("nt")) limitations.push("No relevant later New Testament evidence was retrieved.");
  }
  const strongTopical = passages.filter((passage) => !passage.explicit && passage.score >= 8).length;
  if (!contract.requestedCoverage.passages.length && strongTopical < 2) {
    limitations.push("Topical retrieval did not establish enough high-confidence evidence.");
  }
  const exactReferenceRequest = contract.requestedCoverage.passages.length > 0
    && contract.requestedCoverage.passages.every((passage) => passage.startVerse !== undefined);
  const crossChapterEvidence = passages.filter((passage) => passage.reasons.includes("cross-chapter-parallel"));
  const namedEnumerationEvidence = passages.filter((passage) => passage.reasons.includes("named-enumeration-context"));
  const directQuestionTerms = Array.from(new Set(queryTokens.map(stem)));
  const hasDirectStatement = passages.some((passage) => {
    const passageTerms = new Set(contentTokens(passage.text).map(stem));
    return directQuestionTerms.length >= 2 && directQuestionTerms.filter((term) => passageTerms.has(term)).length >= Math.min(3, directQuestionTerms.length);
  });

  if (contract.temporalRelationship) {
    limitations.push("Temporal questions require bounded chronology-aware evidence discovery.");
  }
  if (contract.intent === "apparent-contradiction") {
    limitations.push("Apparent contradictions require bounded source-context and allusion discovery.");
  }
  const enumerationByChapter = new Map<string, number[]>();
  for (const passage of namedEnumerationEvidence) {
    const match = passage.reference.match(/^(.+) (\d+):(\d+)$/);
    if (!match) continue;
    const key = `${match[1]} ${match[2]}`;
    enumerationByChapter.set(key, [...(enumerationByChapter.get(key) || []), Number(match[3])]);
  }
  const hasContiguousEnumeration = Array.from(enumerationByChapter.values()).some((verses) => {
    const ordered = Array.from(new Set(verses)).sort((left, right) => left - right);
    return ordered.length >= 8 && ordered[ordered.length - 1] - ordered[0] <= 20;
  });
  if (contract.intent === "enumeration" && !hasContiguousEnumeration) {
    limitations.push("The named list was not retrieved completely enough for generation.");
  }
  if (conversation?.recentExchanges.length && contract.intent !== "conversation-recall") {
    limitations.push("The follow-up requires bounded context-aware evidence discovery.");
  }
  if (!exactReferenceRequest && !contract.requestedCoverage.passages.length && !hasDirectStatement && contract.intent === "direct") {
    limitations.push("No single high-confidence direct statement covers the question.");
  }
  if (!exactReferenceRequest && /\bwhat happens (?:when|after)\b/i.test(question)) {
    limitations.push("This broad state or sequence question requires bounded evidence discovery.");
  }
  if (
    contract.requestedCoverage.passages.some((passage) => passage.startVerse === undefined)
    && /^\s*who (?:is|are)\b/i.test(question)
  ) {
    limitations.push("The named passage does not itself establish the requested identity conclusively.");
  }
  if (
    contract.requestedCoverage.passages.some((passage) => passage.startVerse === undefined)
    && contract.requestedCoverage.passages.length >= 2
    && crossChapterEvidence.length < 4
  ) {
    limitations.push("The requested chapters were retrieved, but their material textual connection was not established.");
  }

  return {
    status: limitations.length ? "insufficient" : "sufficient",
    passages,
    lexicalTerms,
    limitations,
    diagnostics: {
      indexLoadMs: Math.round(loadMs * 100) / 100,
      retrievalMs: Math.round((performance.now() - totalStartedAt) * 100) / 100,
      queryTerms: queryTokens,
      expandedTerms,
      explicitReferences: contract.requestedCoverage.passages.map((passage) => passageReferenceRange(
        passage.book, passage.chapter, passage.startVerse, passage.endVerse,
      )),
      estimatedEvidenceTokens: estimatedTokens(passages, lexicalTerms),
      testamentCoverage: Array.from(testaments).sort(),
    },
  };
}

export function resetFastScriptureIndexForTests() {
  cachedIndex = null;
}

export function retrieveLockedScriptureReferences({
  references,
  lexicalLookups = [],
  includeContext = true,
}: {
  references: string[];
  lexicalLookups?: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt" | "lxx";
    lookup: string;
    mode?: "term" | "verse-sequence";
  }>;
  includeContext?: boolean;
}) {
  const startedAt = performance.now();
  const { index, loadMs } = loadScriptureIndex();
  const expanded = Array.from(new Set(references.flatMap(expandPlannedReferences)));
  const invalidReferences: string[] = [];
  const selected = new Map<number, Set<string>>();
  for (const reference of expanded) {
    const id = index.byReference.get(reference);
    if (id === undefined) {
      invalidReferences.push(reference);
      continue;
    }
    selected.set(id, new Set(["discovered-reference"]));
    if (!includeContext) continue;
    const verse = index.verses[id];
    for (const offset of [-1, 1]) {
      const contextId = index.byReference.get(`${verse.book} ${verse.chapter}:${verse.verse + offset}`);
      if (contextId === undefined || selected.has(contextId)) continue;
      selected.set(contextId, new Set([`context:${reference}`]));
    }
  }
  const passages = Array.from(selected, ([id, reasons]): FastScripturePassage => ({
    reference: index.verses[id].reference,
    text: index.verses[id].text,
    score: reasons.has("discovered-reference") ? 100 : 60,
    reasons: Array.from(reasons),
    explicit: reasons.has("discovered-reference"),
  }));
  const lexicalTerms = lexicalLookups.flatMap((lookup) => {
    const terms = lookup.mode === "verse-sequence"
      ? verifiedSourceTermSequenceAtReference(lookup)
      : verifiedSourceTermsAtReference(lookup);
    return terms.map((term) => ({ ...term, evidenceMode: lookup.mode || "term" }));
  });
  const unresolvedLexicalLookups = lexicalLookups.filter((lookup) =>
    !lexicalTerms.some((term) =>
      term.reference === lookup.reference && term.corpus === lookup.corpus,
    ),
  );
  return {
    passages,
    lexicalTerms,
    invalidReferences,
    unresolvedLexicalLookups,
    diagnostics: {
      indexLoadMs: Math.round(loadMs * 100) / 100,
      retrievalMs: Math.round((performance.now() - startedAt) * 100) / 100,
      estimatedEvidenceTokens: estimatedTokens(passages, lexicalTerms),
    },
  };
}
