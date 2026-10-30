import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeBookName } from "../../../data/bookAliases";
import type { SimpleDraft } from "./SimpleEmet";

type Translation = "web" | "kjv" | "brenton";
type RecordRow = [string, number, string, string];
type Index = { records: RecordRow[]; byReference: Map<string, RecordRow>; books: Set<string> };
const indexes = new Map<Translation, Index>();

function canonicalBook(value: string, books: Set<string>) {
  const normalized = normalizeBookName(value);
  return [...books].find((book) => book.toLowerCase() === normalized.toLowerCase()) || normalized;
}

function loadIndex(translation: Translation): Index {
  const cached = indexes.get(translation);
  if (cached) return cached;
  const directory = path.join(process.cwd(), "public/scripture/search");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")) as { summaries: Array<{ translation: string; sourceFingerprint: string; outputSha256: string }> };
  const seal = manifest.summaries.find((item) => item.translation === translation);
  const bytes = fs.readFileSync(path.join(directory, `${translation}.json`));
  const data = JSON.parse(bytes.toString("utf8")) as { translation: string; schemaVersion: number; sourceFingerprint: string; verseCount: number; records: RecordRow[] };
  if (!seal || createHash("sha256").update(bytes).digest("hex") !== seal.outputSha256 || data.translation !== translation || data.schemaVersion !== 1 || data.sourceFingerprint !== seal.sourceFingerprint || data.records.length !== data.verseCount) throw new Error("Locked Scripture is unavailable");
  const index = { records: data.records, books: new Set(data.records.map((row) => row[0])), byReference: new Map(data.records.map((row) => [`${row[0]} ${row[1]}:${row[2]}`, row])) };
  indexes.set(translation, index);
  return index;
}

export function resolveSimpleReference(raw: string, translation: Translation): Array<{ reference: string; text: string; translation: Translation }> | null {
  const match = raw.trim().replace(/[–—]/g, "-").match(/^(.+?)\s+(\d+):(.+)$/);
  if (!match) return null;
  const index = loadIndex(translation);
  const book = canonicalBook(match[1], index.books);
  if (!index.books.has(book)) return null;
  let chapter = Number(match[2]);
  const references: string[] = [];
  for (const segment of match[3].split(",").map((value) => value.trim())) {
    const part = segment.match(/^(?:(\d+):)?(\d+[a-z]?)(?:-(\d+[a-z]?))?$/i);
    if (!part) return null;
    if (part[1]) chapter = Number(part[1]);
    if (chapter < 1) return null;
    if (!part[3]) references.push(`${book} ${chapter}:${part[2]}`);
    else {
      if (!/^\d+$/.test(part[2]) || !/^\d+$/.test(part[3])) return null;
      const first = Number(part[2]);
      const last = Number(part[3]);
      if (last < first || last - first >= 20) return null;
      for (let verse = first; verse <= last; verse++) references.push(`${book} ${chapter}:${verse}`);
    }
    if (references.length > 40) return null;
  }
  if (!references.length) return null;
  const result = [];
  for (const reference of new Set(references)) {
    const row = index.byReference.get(reference);
    if (!row) return null;
    result.push({ reference, text: row[3], translation });
  }
  return result;
}

function inlineReferences(answer: string) {
  const found: string[] = [];
  // A comma before a numbered book begins a new citation, not another verse.
  const pattern = /\b((?:[1-4]\s*)?[A-Za-z]+(?:\s+[A-Za-z]+){0,5})\s*(\d+):([0-9]+[a-z]?(?:[-–—][0-9]+[a-z]?)?(?:\s*,\s*(?![1-4]\s*[A-Za-z]+(?:\s+[A-Za-z]+){0,5}\s+\d+:)(?:[0-9]+:)?[0-9]+[a-z]?(?:[-–—][0-9]+[a-z]?)?)*)/g;
  const known = new Set(["web", "kjv", "brenton"].flatMap((translation) => [...loadIndex(translation as Translation).books]));
  for (const match of answer.matchAll(pattern)) {
    const words = match[1].split(/\s+/);
    let book = "";
    for (let start = 0; start < words.length; start++) {
      const candidate = canonicalBook(words.slice(start).join(" "), known);
      if (known.has(candidate)) { book = candidate; break; }
    }
    found.push(`${book || match[1]} ${match[2]}:${match[3]}`);
  }
  return found;
}

const normalizeQuote = (value: string) => value.normalize("NFC").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

export function verifySimpleDraft(draft: SimpleDraft) {
  const verses: Array<{ reference: string; text: string; translation: Translation }> = [];
  for (const citation of draft.references) {
    const resolved = resolveSimpleReference(citation.reference, citation.translation);
    if (!resolved) return { ok: false as const, stage: "citation-resolution" as const, code: "citation-unresolved" as const, reason: "A cited passage could not be verified in its stated translation." };
    verses.push(...resolved);
    if (verses.length > 80) return { ok: false as const, stage: "citation-resolution" as const, code: "citation-limit" as const, reason: "The answer exceeds the bounded citation limit." };
  }
  if (draft.status === "complete" && !verses.length) return { ok: false as const, stage: "citation-resolution" as const, code: "citations-missing" as const, reason: "The answer did not supply verifiable Scripture citations." };
  const references = new Set(verses.map((verse) => verse.reference));
  const displayedText = [draft.answer, ...draft.limitations].join("\n");
  const plainAnswer = displayedText.replace(/[*_`]/g, "");
  for (const inline of inlineReferences(plainAnswer)) {
    const resolved = draft.references.flatMap((citation) => resolveSimpleReference(inline, citation.translation) || []);
    if (!resolved.length || resolved.some((verse) => !references.has(verse.reference))) return { ok: false as const, stage: "citation-resolution" as const, code: "inline-citation-unverified" as const, reason: "A reference in the answer is not covered by verified citations." };
  }
  const books = new Set(["web", "kjv", "brenton"].flatMap((translation) => [...loadIndex(translation as Translation).books]));
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chapterPattern = new RegExp(`\\b(${[...books].sort((a, b) => b.length - a.length).map(escape).join("|")})\\s+(\\d+)\\b(?!:)`, "gi");
  for (const match of plainAnswer.matchAll(chapterPattern)) {
    const book = canonicalBook(match[1], books);
    if (!draft.references.some((citation) => loadIndex(citation.translation).records.some((row) => row[0] === book && row[1] === Number(match[2])))) return { ok: false as const, stage: "citation-resolution" as const, code: "chapter-unverified" as const, reason: "A chapter reference could not be verified in the cited translations." };
  }
  const quotationPattern = /[“"]([^”"]+)[”"]|‘([^’]+)’|(?<![\p{L}\p{N}])'((?:[^'\n]|'(?=[\p{L}]))+)'(?![\p{L}\p{N}])/gu;
  const corpusText = [...new Set(draft.references.map((item) => item.translation))].map((translation) =>
    normalizeQuote(verses.filter((verse) => verse.translation === translation).map((verse) => verse.text).join(" ")),
  );
  for (const match of displayedText.matchAll(quotationPattern)) {
    const quote = normalizeQuote(match[1] || match[2] || match[3]);
    const nearby = displayedText.slice(Math.max(0, (match.index || 0) - 80), (match.index || 0) + match[0].length + 30);
    const claimedScripture = /\b(says?|reads?|states?|written|declares?|quotation|quoted)\b/i.test(nearby);
    if ((claimedScripture || quote.split(" ").length >= 3) && !corpusText.some((text) => text.includes(quote))) return { ok: false as const, stage: "quotation-verification" as const, code: "quotation-unverified" as const, reason: "A quotation could not be matched to the cited locked Scripture." };
  }
  const unique = [...new Map(verses.map((verse) => [`${verse.translation}:${verse.reference}`, verse])).values()];
  return {
    ok: true as const,
    citations: unique.map((verse) => ({ evidenceId: `scripture:${verse.translation}:simple:${verse.reference}`, reference: verse.reference })),
  };
}
