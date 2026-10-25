import type { EmetAiEvidenceItem, EmetAiEvidencePacket } from "../EmetAiContract";
import {
  validateEmetAiConcreteAnswer,
  validateEmetAiScriptureOnlyFraming,
} from "../EmetAiAnswerCompleteness";
import { expandPlannedReferences } from "../EmetAiTopicEvidence";
import { verifiedSourcePhraseAtReference } from "../EmetAiSourcePhrase";

export const EMET_AI_SIMPLE_ANSWER_SCHEMA = "emet-ai-simple-answer@1" as const;

export type EmetAiSimpleDraft = {
  schemaVersion: typeof EMET_AI_SIMPLE_ANSWER_SCHEMA;
  status: "complete" | "insufficient-evidence";
  conclusion: "yes" | "no" | "qualified" | "not-applicable";
  answer: string;
  references: string[];
  lexicalAnalyses: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt" | "lxx";
    lexicalId: string;
    lemma: string;
    transliteration: string;
    meaning: string;
  }>;
  limitations: string[];
};

export type EmetAiSimpleAnswer = EmetAiSimpleDraft & {
  citations: Array<{ evidenceId: string; reference: string }>;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export function parseEmetAiSimpleDraft(value: unknown): EmetAiSimpleDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_SIMPLE_ANSWER_SCHEMA ||
    !["complete", "insufficient-evidence"].includes(String(candidate.status)) ||
    !["yes", "no", "qualified", "not-applicable"].includes(String(candidate.conclusion)) ||
    !Array.isArray(candidate.references) ||
    !Array.isArray(candidate.lexicalAnalyses) ||
    !Array.isArray(candidate.limitations)
  ) return null;

  const answer = clean(candidate.answer, 8_000);
  if (!answer) return null;
  const references = unique(candidate.references.map((item) => clean(item, 80)), 24);
  const limitations = unique(candidate.limitations.map((item) => clean(item, 400)), 8);
  const lexicalAnalyses = candidate.lexicalAnalyses.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const corpus = clean(entry.corpus, 16);
    if (!["hebrew", "greek-nt", "lxx"].includes(corpus)) return [];
    const parsed = {
      reference: clean(entry.reference, 80),
      corpus: corpus as "hebrew" | "greek-nt" | "lxx",
      lexicalId: clean(entry.lexicalId, 32),
      lemma: clean(entry.lemma, 80),
      transliteration: clean(entry.transliteration, 100),
      meaning: clean(entry.meaning, 400),
    };
    return Object.values(parsed).every(Boolean) ? [parsed] : [];
  }).slice(0, 12);

  return {
    schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
    status: candidate.status as EmetAiSimpleDraft["status"],
    conclusion: candidate.conclusion as EmetAiSimpleDraft["conclusion"],
    answer,
    references,
    lexicalAnalyses,
    limitations,
  };
}

function normalizedText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function scriptureQuotations(value: string) {
  return Array.from(value.matchAll(/[“"]([^”"\n]{8,300})[”"]/g)).flatMap((match) => {
    const quote = match[1].trim();
    if (quote.split(/\s+/).length < 4) return [];
    const start = match.index || 0;
    const before = value.slice(Math.max(0, start - 90), start);
    const after = value.slice(start + match[0].length, start + match[0].length + 90);
    const attributed = /\b(?:scripture|the\s+(?:text|verse|passage)|\w+\s+\d+:\d+)[^.]{0,70}\b(?:says?|said|writes?|declares?|reads?)\s*[:,]?\s*$/i.test(before) ||
      /^\s*(?:\([^)]*\b(?:[1-3]\s+)?[A-Z][A-Za-z]+\s+\d+:\d+)/.test(after);
    return attributed ? [quote] : [];
  });
}

function visibleSourceTerms(value: string) {
  return Array.from(value.matchAll(/[\u0590-\u05ff]+|[\u0370-\u03ff\u1f00-\u1fff]+/gu))
    .map((match) => match[0].normalize("NFKC"));
}

function evidenceForReference(evidence: EmetAiEvidenceItem[], reference: string) {
  return evidence.find((item) => item.kind === "scripture" && item.reference === reference);
}

/**
 * Canonicalizes only the unambiguous same-book, same-chapter comma shorthand
 * emitted by answer models (for example, Romans 7:7, 12, 14). Everything else
 * stays unchanged and must pass the existing locked-corpus resolver.
 */
export function normalizeEmetAiSimpleReferences(references: string[]) {
  return unique(references.flatMap((raw) => {
    const reference = raw.trim().replace(/[–—]/g, "-");
    const expanded = expandAnswerReference(reference);
    return expanded.length ? expanded : [reference];
  }), 24);
}

const ANSWER_RANGE_LIMIT = 48;

function expandAnswerReference(reference: string) {
  const normalized = reference.trim().replace(/[–—]/g, "-");
  const range = normalized.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)-(\d+)$/);
  if (range) {
    const [, book, chapterText, startText, endText] = range;
    const start = Number(startText);
    const end = Number(endText);
    if (end >= start && end - start + 1 <= ANSWER_RANGE_LIMIT) {
      return Array.from({ length: end - start + 1 }, (_, index) => `${book} ${chapterText}:${start + index}`);
    }
    return [];
  }
  return expandPlannedReferences(normalized);
}

const MEANING_FAMILIES = [
  ["guard", "keep", "protect", "observe", "attend", "watch"],
  ["action", "deed", "work", "activity", "transaction", "act"],
  ["judgment", "verdict", "justice", "sentence", "decree", "decision"],
  ["whole", "all", "every", "entire"],
  ["human", "person", "people", "mankind", "man", "humanity"],
  ["command", "commandment", "order", "instruction", "law", "precept"],
  ["fear", "revere", "reverence", "awe"],
] as const;

function meaningConcept(word: string) {
  return MEANING_FAMILIES.find((family) => family.includes(word as never))?.[0] || word;
}

function lexicalMeaningSupported(evidenceText: string, claimedMeaning: string) {
  const ignored = new Set(["and", "the", "means", "meaning", "to", "a", "an", "of", "or"]);
  const evidenceConcepts = new Set(normalizedText(evidenceText).split(" ")
    .filter((word) => word.length > 1 && !ignored.has(word))
    .map(meaningConcept));
  const claimConcepts = Array.from(new Set(normalizedText(claimedMeaning).split(" ")
    .filter((word) => word.length > 1 && !ignored.has(word))
    .map(meaningConcept)));
  return claimConcepts.length > 0 && claimConcepts.every((concept) => evidenceConcepts.has(concept));
}

export function usesOmissionAsNonApplicability(answer: string) {
  const omission = /\b(?:acts\s+15|a\s+(?:later\s+)?list|the\s+(?:apostolic\s+)?decree|later scripture|the new testament)\b[^.]{0,220}\b(?:does not|did not|doesn't|didn't|no)\b[^.]{0,160}\b(?:include|mention|list|place|restate|repeat|command|require)/i;
  const resultingNegative = /\b(?:therefore|so|thus|for that reason|on that basis)\b[^.]{0,260}\b(?:not\s+(?:required|commanded|binding|applicable)|need not|exempt|does not (?:apply|bind|require)|do not directly command)/i;
  return omission.test(answer) && resultingNegative.test(answer);
}

export function validateEmetAiSimpleAnswer({
  packet,
  draft,
}: {
  packet: EmetAiEvidencePacket;
  draft: EmetAiSimpleDraft;
}): { ok: true; value: EmetAiSimpleAnswer } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (/(?:scripture|lexical|morphology):[A-Za-z0-9._:-]+/i.test(draft.answer)) {
    errors.push("Reader-facing prose exposes an internal evidence identifier.");
  }
  const opening = /^\s*(yes|no)\b/i.exec(draft.answer)?.[1]?.toLocaleLowerCase("en-US");
  if (opening && (draft.conclusion === "yes" || draft.conclusion === "no") && opening !== draft.conclusion) {
    errors.push(`The opening ${opening.toUpperCase()} contradicts the structured ${draft.conclusion.toUpperCase()} conclusion.`);
  }
  if (draft.status === "complete" && draft.references.length === 0) {
    errors.push("A complete answer requires verified Scripture references.");
  }

  const normalizedReferences = normalizeEmetAiSimpleReferences(draft.references);
  const citations = normalizedReferences.flatMap((reference) => {
    const expanded = expandAnswerReference(reference);
    const items = expanded.map((part) => evidenceForReference(packet.evidence, part));
    if (!expanded.length || items.some((item) => !item)) {
      errors.push(`Reference ${reference} was not resolved from the locked Scripture corpus.`);
      return [];
    }
    return items.map((item) => ({ evidenceId: item!.id, reference: item!.reference! }));
  });

  const scriptureText = packet.evidence
    .filter((item) => item.kind === "scripture")
    .map((item) => normalizedText(item.text));
  for (const quote of scriptureQuotations(draft.answer)) {
    const normalizedQuote = normalizedText(quote);
    if (!scriptureText.some((text) => text.includes(normalizedQuote))) {
      errors.push(`Scripture quotation is not exact verified packet text: “${quote.slice(0, 80)}”.`);
    }
  }

  const lexicalEvidence = packet.evidence.filter((item) => item.kind === "lexical");
  if (
    /\b(?:hebrew|greek|original[- ]language)\b/i.test(packet.question) &&
    lexicalEvidence.length > 0 &&
    draft.lexicalAnalyses.length === 0
  ) {
    errors.push("The requested source-language explanation omitted verified lexical analysis.");
  }
  for (const term of visibleSourceTerms(draft.answer)) {
    const directlyVerified = lexicalEvidence.some((item) => item.text.normalize("NFKC").includes(term));
    const phraseVerified = !directlyVerified && lexicalEvidence.some((item) => {
      if (!item.reference || !item.corpus || !["hebrew", "greek-nt", "lxx"].includes(item.corpus)) return false;
      return verifiedSourcePhraseAtReference({
        corpus: item.corpus as "hebrew" | "greek-nt" | "lxx",
        reference: item.reference,
        phrase: term,
      });
    });
    if (!directlyVerified && !phraseVerified) {
      errors.push(`Reader-facing source term ${term} has no verified lexical identity.`);
    }
  }
  for (const claim of draft.lexicalAnalyses) {
    const matching = lexicalEvidence.find((item) =>
      item.corpus === claim.corpus &&
      item.reference === claim.reference &&
      item.lexicalId?.split("+").includes(claim.lexicalId) &&
      normalizedText(item.text).includes(normalizedText(claim.lemma)) &&
      normalizedText(item.text).includes(normalizedText(claim.transliteration)) &&
      // Meaning prose may summarize a locked gloss. Identity, occurrence,
      // lemma, and transliteration must still match independently; the
      // canonical locked gloss remains in the evidence packet.
      (normalizedText(item.text).includes(normalizedText(claim.meaning)) ||
        lexicalMeaningSupported(item.text, claim.meaning))
    );
    if (!matching) errors.push(`Lexical claim ${claim.corpus}:${claim.lexicalId} is not verified at ${claim.reference}.`);
  }

  const concreteError = validateEmetAiConcreteAnswer({
    question: packet.question,
    answer: draft.answer,
    evidence: packet.evidence,
  });
  if (concreteError) errors.push(concreteError);
  const framingError = validateEmetAiScriptureOnlyFraming({
    question: packet.question,
    answer: draft.answer,
  });
  if (framingError) errors.push(framingError);
  if (packet.reasoning.commandApplicability && usesOmissionAsNonApplicability(draft.answer)) {
    errors.push("The answer treats omission from a later list as evidence of repeal, exemption, or nonapplicability.");
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { ...draft, references: normalizedReferences, citations } };
}
