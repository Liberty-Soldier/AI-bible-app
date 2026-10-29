import "server-only";

import fs from "node:fs";
import path from "node:path";

import { normalizeBookName } from "../../../data/bookAliases";
import { EMET_AI_MAX_PLANNED_RANGE_VERSES } from "../EmetAiReferenceLimits";
import type { EmetAiReaderContext } from "../EmetAiTopicEvidence";
import type { EmetAiPretrainedDraft, EmetAiPretrainedSupport } from "./EmetAiPretrainedContract";

export type VerifiedLexicalIdentity = {
  corpus: "hebrew" | "greek-nt" | "lxx";
  lexicalId: string;
  lemma: string;
  transliteration: string;
  meaning: string;
  sourceFingerprint: string;
};
type SourcePhraseIndex = {
  schemaVersion: "emet-source-phrase-index@3";
  sourceFingerprint: string;
  lexicalDetails: Record<"hebrew" | "greek-nt" | "lxx", Array<[string, string, string, string]>>;
};
let sourcePhraseIndex: SourcePhraseIndex | null = null;
function loadSourcePhraseIndex() {
  if (sourcePhraseIndex) return sourcePhraseIndex;
  const file = path.join(process.cwd(), "public", "scripture", "source-phrase-index.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as SourcePhraseIndex;
  if (parsed.schemaVersion !== "emet-source-phrase-index@3" || !parsed.sourceFingerprint || !parsed.lexicalDetails) throw new Error("Locked source phrase index failed validation.");
  sourcePhraseIndex = parsed;
  return parsed;
}
function normalizedLexicalLookup(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f\u0591-\u05c7]/g, "").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "").replace(/^ch/, "h").replace(/c/g, "s").replace(/uw/g, "u");
}
export function verifiedLexicalIdentities({ corpus, lookup }: { corpus: "hebrew" | "greek-nt" | "lxx"; lookup: string }): VerifiedLexicalIdentity[] {
  const source = loadSourcePhraseIndex();
  const wanted = normalizedLexicalLookup(lookup);
  const compactId = lookup.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "");
  return (source.lexicalDetails[corpus] || []).flatMap(([lexicalId, lemma, transliteration, meaning]) => {
    const idMatches = compactId === lexicalId.toLocaleUpperCase("en-US");
    const termMatches = wanted === normalizedLexicalLookup(lemma) || wanted === normalizedLexicalLookup(transliteration);
    return idMatches || termMatches ? [{ corpus, lexicalId, lemma, transliteration, meaning, sourceFingerprint: source.sourceFingerprint }] : [];
  });
}
export type EmetAiPretrainedTranslation = "web" | "kjv" | "brenton";
type SearchRecord = [book: string, chapter: number, verse: string, text: string];
type SearchPayload = { translation: EmetAiPretrainedTranslation; sourceFingerprint: string; books: string[]; records: SearchRecord[] };
type VerseRecord = { reference: string; book: string; chapter: number; verse: string; verseNumber: number; text: string };
type LoadedIndex = SearchPayload & { byReference: Map<string, VerseRecord> };

export type EmetAiVerifiedReferenceGroup = {
  requestedReference: string;
  reference: string;
  expandedReferences: string[];
  translation: EmetAiPretrainedTranslation;
  text: string;
  contextText: string;
  sourceFingerprint: string;
};
export type EmetAiPretrainedOmission = { reference: string; reason: string };
export type EmetAiPretrainedVerification = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  omissions: EmetAiPretrainedOmission[];
  referenceFindings: Array<{ requestedReference: string; canonicalReference: string | null; exists: boolean; relevant: boolean | null; reason: string }>;
  scripture: EmetAiVerifiedReferenceGroup[];
  lexical: VerifiedLexicalIdentity[];
  publicReferences: string[];
  latencyMs: number;
};

const MAX_REFERENCE_GROUPS = 24;
const MAX_TOTAL_EXPANDED_VERSES = 160;
const indexes = new Map<EmetAiPretrainedTranslation, LoadedIndex>();

function normalizeComparable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f\u0591-\u05c7]/g, "").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function normalizedIdentity(value: string) {
  return normalizeComparable(value).replace(/\s+/g, "");
}
function loadIndex(translation: EmetAiPretrainedTranslation) {
  const cached = indexes.get(translation);
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "scripture", "search", `${translation}.json`);
  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as SearchPayload;
  if (payload.translation !== translation || !payload.sourceFingerprint || !Array.isArray(payload.records)) throw new Error(`Locked ${translation.toUpperCase()} Scripture index failed validation.`);
  const byReference = new Map<string, VerseRecord>();
  for (const [book, chapter, verse, text] of payload.records) {
    const verseNumber = Number.parseInt(verse, 10);
    byReference.set(`${book} ${chapter}:${verse}`, { reference: `${book} ${chapter}:${verse}`, book, chapter, verse, verseNumber, text });
  }
  const loaded = { ...payload, byReference };
  indexes.set(translation, loaded);
  return loaded;
}

export function getEmetAiPretrainedSourceIdentity(translation: EmetAiPretrainedTranslation) {
  const scripture = loadIndex(translation);
  const file = path.join(process.cwd(), "public", "scripture", "source-phrase-index.json");
  const handle = fs.openSync(file, "r");
  const buffer = Buffer.alloc(512);
  try {
    fs.readSync(handle, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  const lexicalFingerprint = buffer.toString("utf8").match(/"sourceFingerprint":"([a-f0-9]{64})"/)?.[1];
  if (!lexicalFingerprint) throw new Error("Locked lexical source identity is unavailable.");
  return `${translation}:${scripture.sourceFingerprint}|lexical:${lexicalFingerprint}`;
}
export function parseEmetAiPretrainedReference(reference: string) {
  const clean = reference.trim().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const match = clean.match(/^(.+?)\s+(\d+):(.+)$/i);
  if (!match) return { ok: false as const, requestedReference: reference, reason: "Invalid Book chapter:verse grammar." };
  const book = normalizeBookName(match[1]);
  const books = new Set(loadIndex("web").books);
  if (!book || !books.has(book)) return { ok: false as const, requestedReference: reference, reason: `Unknown canonical book: ${match[1]}.` };
  let chapter = Number(match[2]);
  const expandedReferences: string[] = [];
  const displaySegments: Array<{ chapter: number; label: string }> = [];
  for (const rawSegment of match[3].split(",").map((value) => value.trim()).filter(Boolean)) {
    let versePart = rawSegment;
    const chapterChange = rawSegment.match(/^(\d+):(.+)$/);
    if (chapterChange) {
      chapter = Number(chapterChange[1]);
      versePart = chapterChange[2];
    }
    const verseMatch = versePart.match(/^(\d+[a-z]?)(?:-(\d+[a-z]?))?$/i);
    if (!verseMatch) return { ok: false as const, requestedReference: reference, reason: `Invalid verse segment: ${rawSegment}.` };
    const start = Number.parseInt(verseMatch[1], 10);
    const end = verseMatch[2] ? Number.parseInt(verseMatch[2], 10) : start;
    if (!Number.isInteger(chapter) || chapter < 1 || end < start || end - start + 1 > EMET_AI_MAX_PLANNED_RANGE_VERSES) return { ok: false as const, requestedReference: reference, reason: `Unbounded or reversed verse range: ${rawSegment}.` };
    const startLabel = verseMatch[1];
    const endLabel = verseMatch[2];
    displaySegments.push({ chapter, label: endLabel ? `${startLabel}-${endLabel}` : startLabel });
    for (let verse = start; verse <= end; verse += 1) expandedReferences.push(`${book} ${chapter}:${verse}`);
  }
  if (!displaySegments.length) return { ok: false as const, requestedReference: reference, reason: "No verse segments were supplied." };
  const firstChapter = displaySegments[0].chapter;
  const tail = displaySegments.map((segment, index) => index === 0 || segment.chapter !== displaySegments[index - 1].chapter ? `${segment.chapter}:${segment.label}` : segment.label).join(", ");
  return { ok: true as const, requestedReference: reference, reference: `${book} ${tail}`, book, chapter: firstChapter, expandedReferences: Array.from(new Set(expandedReferences)) };
}

function contextFor(index: LoadedIndex, references: string[]) {
  const selected = new Set(references);
  for (const reference of references) {
    const verse = index.byReference.get(reference);
    if (!verse) continue;
    for (const offset of [-1, 1]) {
      const candidate = `${verse.book} ${verse.chapter}:${verse.verseNumber + offset}`;
      if (index.byReference.has(candidate)) selected.add(candidate);
    }
  }
  return Array.from(selected).flatMap((reference) => {
    const verse = index.byReference.get(reference);
    return verse ? [`${reference} ${verse.text}`] : [];
  }).join(" ");
}

function resolveGroup(rawReference: string, preferred: EmetAiPretrainedTranslation): EmetAiVerifiedReferenceGroup | null {
  const parsed = parseEmetAiPretrainedReference(rawReference);
  if (!parsed.ok) return null;
  const order = Array.from(new Set([preferred, "web", "kjv", "brenton"] as EmetAiPretrainedTranslation[]));
  for (const translation of order) {
    const index = loadIndex(translation);
    const verses = parsed.expandedReferences.map((reference) => index.byReference.get(reference));
    if (verses.some((verse) => !verse)) continue;
    return {
      requestedReference: rawReference,
      reference: parsed.reference,
      expandedReferences: parsed.expandedReferences,
      translation,
      text: verses.map((verse) => `${verse!.reference} ${verse!.text}`).join(" "),
      contextText: contextFor(index, parsed.expandedReferences),
      sourceFingerprint: index.sourceFingerprint,
    };
  }
  return null;
}

function sourceQuotes(answer: string) {
  const quotes: string[] = [];
  const expression = /[“"]([^”"]+)[”"]/g;
  for (const match of answer.matchAll(expression)) {
    const quote = match[1].trim();
    const window = answer.slice(Math.max(0, (match.index || 0) - 80), Math.min(answer.length, (match.index || 0) + match[0].length + 40));
    const claimedExact = /\b(?:says?|states?|reads?|written|declares?|exact\s+(?:words?|wording)|explicitly\s+says?)\b/i.test(window);
    if (claimedExact && normalizeComparable(quote).split(" ").length >= 3) quotes.push(quote);
  }
  return quotes;
}
function withTranslationForQuotes(groups: EmetAiVerifiedReferenceGroup[], quotes: string[]) {
  const errors: string[] = [];
  const variants: string[] = [];
  const updated = [...groups];
  for (const quote of quotes) {
    const normalizedQuote = normalizeComparable(quote);
    let match: { groupIndex: number; translation: EmetAiPretrainedTranslation; text: string; contextText: string; fingerprint: string } | null = null;
    for (let groupIndex = 0; groupIndex < groups.length && !match; groupIndex += 1) {
      for (const translation of ["web", "kjv", "brenton"] as const) {
        const index = loadIndex(translation);
        const verses = groups[groupIndex].expandedReferences.map((reference) => index.byReference.get(reference));
        if (verses.some((verse) => !verse)) continue;
        const text = verses.map((verse) => `${verse!.reference} ${verse!.text}`).join(" ");
        if (normalizeComparable(text).includes(normalizedQuote)) match = { groupIndex, translation, text, contextText: contextFor(index, groups[groupIndex].expandedReferences), fingerprint: index.sourceFingerprint };
      }
    }
    if (!match) errors.push(`Exact reader-facing quotation was not found in locked WEB, KJV, or Brenton text: “${quote.slice(0, 100)}”.`);
    else if (updated[match.groupIndex].translation !== match.translation) {
      variants.push(`Quotation verified as a ${match.translation.toUpperCase()} translation variant at ${updated[match.groupIndex].reference}.`);
      updated[match.groupIndex] = { ...updated[match.groupIndex], translation: match.translation, text: match.text, contextText: match.contextText, sourceFingerprint: match.fingerprint };
    }
  }
  return { groups: updated, errors, variants };
}

const ENTITY_STOP = new Set(["Who", "What", "Which", "When", "Where", "Why", "How", "Does", "Did", "Is", "Are", "Was", "Were", "Should", "Can", "From", "In", "Scripture", "Bible", "Hebrew", "Greek", "Septuagint"]);
const ENTITY_ALIASES: Record<string, string[]> = {
  yahshua: ["yahshua", "jesus", "christ", "messiah", "lord"],
  jesus: ["yahshua", "jesus", "christ", "messiah", "lord"],
  messiah: ["yahshua", "jesus", "christ", "messiah", "lord"],
  yahweh: ["yahweh", "lord", "god"],
  immanuel: ["immanuel", "emmanuel"],
  logos: ["logos", "word"],
};
function questionEntities(question: string) {
  return Array.from(new Set(Array.from(question.matchAll(/\b[A-Z][\p{L}'’-]{2,}\b/gu), (match) => match[0]).filter((word) => !ENTITY_STOP.has(word))));
}
function passageNamesEntity(text: string, entity: string) {
  const normalized = normalizeComparable(text);
  const key = normalizedIdentity(entity);
  return (ENTITY_ALIASES[key] || [normalizeComparable(entity)]).some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
}
function explicitlyAttributesEntity(claim: string, entity: string) {
  const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:explicitly\\s+)?(?:says?|states?|identifies|names?|calls?|notes?|refers?\\s+to)\\b[^.]{0,48}\\b${escaped}\\b`, "i").test(claim);
}
function explicitlyAttributedEntities(claim: string) {
  const entities: string[] = [];
  const attribution = /\b(?:explicitly\s+)?(?:identifies|names?|calls?|refers?\s+to)\b/gi;
  for (const match of claim.matchAll(attribution)) {
    const tail = claim.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 64);
    const attributed = tail.match(/^\s+(?:(?:that|the|a|an|as|of|this|these)\s+){0,3}([A-Z][\p{L}'’-]{2,})\b/u)?.[1];
    if (attributed && !ENTITY_STOP.has(attributed)) entities.push(attributed);
  }
  return Array.from(new Set(entities));
}
function supportIsInterpretive(support: EmetAiPretrainedSupport) {
  return support === "interpretation" || support === "possible-interpretation";
}

function lexicalRequests(question: string, draft: EmetAiPretrainedDraft) {
  const source = `${question}\n${draft.proposedAnswer}\n${draft.claims.map((claim) => claim.claim).join("\n")}`;
  const requests: Array<{ corpus: "hebrew" | "greek-nt" | "lxx"; lookup: string }> = [];
  for (const id of Array.from(source.matchAll(/\b[HGL]\d{1,7}\b/gi), (match) => match[0].toUpperCase())) requests.push({ corpus: id.startsWith("H") ? "hebrew" : id.startsWith("L") ? "lxx" : "greek-nt", lookup: id });
  const named = question.match(/\b(Hebrew|Greek|Septuagint|LXX)(?:\s+NT)?\s+word\s+[“"]?([\p{L}]+)[”"]?/iu);
  if (named) requests.push({ corpus: /hebrew/i.test(named[1]) ? "hebrew" : /septuagint|lxx/i.test(named[1]) ? "lxx" : "greek-nt", lookup: named[2] });
  return Array.from(new Map(requests.map((request) => [`${request.corpus}|${normalizedIdentity(request.lookup)}`, request])).values());
}

export function verifyEmetAiPretrainedDraft({ question, draft, context }: { question: string; draft: EmetAiPretrainedDraft; context: EmetAiReaderContext | null }): EmetAiPretrainedVerification {
  const startedAt = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const omissions: EmetAiPretrainedOmission[] = [];
  if (normalizeComparable(question) !== normalizeComparable(draft.question)) errors.push("The model changed the question while answering it.");
  const preferred = context?.translation || "web";
  const allRawReferences = Array.from(new Set([...draft.references, ...draft.claims.flatMap((claim) => claim.references)]));
  if (allRawReferences.length > MAX_REFERENCE_GROUPS) errors.push(`The answer proposed more than ${MAX_REFERENCE_GROUPS} reference groups.`);
  const parsed = new Map<string, ReturnType<typeof parseEmetAiPretrainedReference>>();
  const groups = new Map<string, EmetAiVerifiedReferenceGroup>();
  const referenceFindings: EmetAiPretrainedVerification["referenceFindings"] = [];
  let expandedCount = 0;
  for (const rawReference of allRawReferences) {
    const parsedReference = parseEmetAiPretrainedReference(rawReference);
    parsed.set(rawReference, parsedReference);
    if (!parsedReference.ok) {
      errors.push(`${rawReference}: ${parsedReference.reason}`);
      referenceFindings.push({ requestedReference: rawReference, canonicalReference: null, exists: false, relevant: null, reason: parsedReference.reason });
      continue;
    }
    expandedCount += parsedReference.expandedReferences.length;
    const group = resolveGroup(rawReference, preferred);
    if (!group) {
      errors.push(`${parsedReference.reference} is unavailable in the locked Scripture indexes.`);
      referenceFindings.push({ requestedReference: rawReference, canonicalReference: parsedReference.reference, exists: false, relevant: null, reason: "Reference does not fully resolve in WEB, KJV, or Brenton." });
      continue;
    }
    groups.set(rawReference, group);
    referenceFindings.push({ requestedReference: rawReference, canonicalReference: group.reference, exists: true, relevant: null, reason: "Reference existence verified independently from relevance." });
  }
  if (expandedCount > MAX_TOTAL_EXPANDED_VERSES) errors.push(`Reference expansion exceeded the ${MAX_TOTAL_EXPANDED_VERSES}-verse hydration limit.`);
  const quoted = withTranslationForQuotes(Array.from(groups.values()), sourceQuotes(draft.proposedAnswer));
  for (const error of quoted.errors) errors.push(error);
  warnings.push(...quoted.variants);
  const translatedByRequest = new Map(quoted.groups.map((group) => [group.requestedReference, group]));

  const entities = questionEntities(question);
  const mismatchedRequests = new Set<string>();
  draft.claims.forEach((claim, claimIndex) => {
    const claimGroups = claim.references.flatMap((reference) => translatedByRequest.get(reference) ? [translatedByRequest.get(reference)!] : []);
    if (!claimGroups.length) {
      errors.push(`Claim ${claimIndex + 1} has no resolved supporting reference.`);
      return;
    }
    const assertedEntities = Array.from(new Set([
      ...entities.filter((entity) => explicitlyAttributesEntity(claim.claim, entity)),
      ...explicitlyAttributedEntities(claim.claim),
    ]));
    if (!assertedEntities.length) return;
    const supporting = claimGroups.filter((group) => assertedEntities.every((entity) => passageNamesEntity(group.contextText, entity)));
    const mismatched = claimGroups.filter((group) => !supporting.includes(group));
    for (const group of mismatched) {
      mismatchedRequests.add(group.requestedReference);
      const finding = referenceFindings.find((item) => item.requestedReference === group.requestedReference);
      if (finding) {
        finding.relevant = false;
        finding.reason = `The claim explicitly attributes its statement to ${assertedEntities.join(", ")}, but the bounded passage context does not identify that subject.`;
      }
    }
    if (!supporting.length) errors.push(`Claim ${claimIndex + 1} depends on passage text that does not identify its explicitly asserted subject (${assertedEntities.join(", ")}).`);
    else for (const group of mismatched) omissions.push({ reference: group.reference, reason: `Omitted because another claim reference supports the explicit subject while this passage does not identify ${assertedEntities.join(", ")}.` });
  });

  const usedByClaims = new Set(draft.claims.flatMap((claim) => claim.references));
  for (const reference of draft.references) {
    const group = translatedByRequest.get(reference);
    if (!group || mismatchedRequests.has(reference)) continue;
    if (!usedByClaims.has(reference)) omissions.push({ reference: group.reference, reason: "Supplementary reference was not attached to any displayed claim." });
  }
  const omittedCanonical = new Set(omissions.map((omission) => omission.reference));
  const publicReferences = Array.from(new Set([...draft.references, ...draft.claims.flatMap((claim) => claim.references)].flatMap((reference) => {
    const group = translatedByRequest.get(reference);
    return group && !omittedCanonical.has(group.reference) ? [group.reference] : [];
  }))).slice(0, 10);
  if (!publicReferences.length) errors.push("No verified relevant public citation remains.");

  if (supportIsInterpretive(draft.conclusionSupport) && /^\s*(?:yes|no)\b[.!,:;—-]?/i.test(draft.proposedAnswer)) errors.push("A merely interpretive conclusion is presented as a categorical yes or no.");
  if (supportIsInterpretive(draft.conclusionSupport) && /\bScripture\s+(?:explicitly\s+)?(?:proves?|establishes?)\b/i.test(draft.proposedAnswer)) errors.push("An interpretive conclusion is described as explicitly proven by Scripture.");

  const lexical: VerifiedLexicalIdentity[] = [];
  for (const request of lexicalRequests(question, draft)) {
    const matches = verifiedLexicalIdentities(request);
    if (matches.length !== 1) errors.push(`Locked ${request.corpus} lexical identity was ${matches.length ? "ambiguous" : "not found"}: ${request.lookup}.`);
    else if (!lexical.some((item) => item.corpus === matches[0].corpus && item.lexicalId === matches[0].lexicalId)) lexical.push(matches[0]);
  }
  if ((/[\u0590-\u05ff]/u.test(draft.proposedAnswer) || /[\u0370-\u03ff\u1f00-\u1fff]/u.test(draft.proposedAnswer)) && !lexical.length) errors.push("Reader-facing source-language text has no exact locked lexical identity.");

  for (const finding of referenceFindings) if (finding.exists && finding.relevant === null) {
    finding.relevant = true;
    finding.reason = "Reference exists and no clear material subject mismatch was detected.";
  }
  return { ok: errors.length === 0, errors, warnings, omissions, referenceFindings, scripture: quoted.groups, lexical, publicReferences, latencyMs: performance.now() - startedAt };
}

export function resetEmetAiPretrainedVerifierForTests() {
  indexes.clear();
  sourcePhraseIndex = null;
}




