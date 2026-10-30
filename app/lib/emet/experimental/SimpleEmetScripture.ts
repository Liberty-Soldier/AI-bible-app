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
  const crossChapter = raw.trim().replace(/[–—]/g, "-").match(/^(.+?)\s+(\d+):(\d+[a-z]?)-(\d+):(\d+[a-z]?)$/i);
  if (crossChapter) {
    const index = loadIndex(translation);
    const book = canonicalBook(crossChapter[1], index.books);
    const first = `${book} ${Number(crossChapter[2])}:${crossChapter[3]}`;
    const last = `${book} ${Number(crossChapter[4])}:${crossChapter[5]}`;
    const start = index.records.findIndex((row) => `${row[0]} ${row[1]}:${row[2]}` === first);
    const end = index.records.findIndex((row) => `${row[0]} ${row[1]}:${row[2]}` === last);
    if (start < 0 || end < start || end - start >= 40) return null;
    const rows = index.records.slice(start, end + 1);
    if (rows.some((row) => row[0] !== book)) return null;
    return rows.map((row) => ({ reference: `${row[0]} ${row[1]}:${row[2]}`, text: row[3], translation }));
  }
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

const normalizeQuote = (value: string) => value.normalize("NFC").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

// This boundary certifies source text, never theological entailment. Prose is
// deliberately neither parsed for references nor promoted to verified sources.
export function verifySimpleDraft(draft: SimpleDraft) {
  const sources = new Map<string, { reference: string; text: string; translation: Translation }>();
  let expanded = 0;
  for (const citation of draft.references) {
    const resolved = resolveSimpleReference(citation.reference, citation.translation);
    if (!resolved) return { ok: false as const, stage: "citation-resolution" as const, code: "citation-unresolved" as const, reason: "A cited passage could not be verified in its stated translation." };
    expanded += resolved.length;
    if (expanded > 80) return { ok: false as const, stage: "citation-resolution" as const, code: "citation-limit" as const, reason: "The answer exceeds the bounded citation limit." };
    for (const verse of resolved) sources.set(`${verse.translation}:${verse.reference}`, verse);
  }
  if (draft.status === "complete" && !sources.size) return { ok: false as const, stage: "citation-resolution" as const, code: "citations-missing" as const, reason: "The answer did not supply verifiable Scripture sources." };
  const quotations = [];
  for (const quotation of draft.quotations) {
    // A quotation must identify one contiguous passage, not pooled sources.
    const resolved = quotation.reference.includes(",") ? null : resolveSimpleReference(quotation.reference, quotation.translation);
    if (!resolved || resolved.some((verse) => !sources.has(`${verse.translation}:${verse.reference}`)) ||
      !normalizeQuote(resolved.map((verse) => verse.text).join(" ")).includes(normalizeQuote(quotation.text))) {
      return { ok: false as const, stage: "quotation-verification" as const, code: "quotation-unverified" as const, reason: "A declared quotation did not match its particular source passage and translation." };
    }
    const first = resolved[0].reference;
    const last = resolved[resolved.length - 1].reference;
    quotations.push({
      text: quotation.text, translation: quotation.translation,
      reference: resolved.length === 1 ? first : `${first}–${last.slice(last.lastIndexOf(" ") + 1)}`,
    });
  }
  return {
    ok: true as const, quotations,
    citations: [...sources.values()].map((verse) => ({
      evidenceId: `scripture:${verse.translation}:simple:${verse.reference}`,
      ...verse, verification: "locked-corpus-text" as const,
    })),
  };
}
