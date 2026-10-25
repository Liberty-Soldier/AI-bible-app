/**
 * Removes mechanically repairable model bookkeeping language without changing
 * claims, evidence, support levels, or theological conclusions.
 */
import type { EmetAiAnswer } from "./EmetAiContract";

export type EmetAiVisibleEvidenceReference = {
  id: string;
  kind?: string;
  reference?: string;
};

const INTERNAL_EVIDENCE_ID = String.raw`(?:scripture|lexical|morphology):[A-Za-z0-9._:-]+`;

function visibleReferenceAnnotation(
  annotation: string,
  evidence: readonly EmetAiVisibleEvidenceReference[],
  precedingText: string,
) {
  const currentParagraph = precedingText.slice(precedingText.lastIndexOf("\n") + 1);
  if (/\b(?:[1-3]\s+)?[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+/u.test(currentParagraph)) {
    return "";
  }
  const byId = new Map(evidence.map((item) => [item.id, item] as const));
  const references = Array.from(new Set(
    Array.from(annotation.matchAll(new RegExp(INTERNAL_EVIDENCE_ID, "gi")))
      .map((match) => byId.get(match[0]))
      .filter((item) => item?.kind === "scripture" && Boolean(item.reference))
      .map((item) => item?.reference as string),
  ));
  return references.length ? ` (${references.join("; ")})` : "";
}

export function normalizeEmetAiMechanicalAnswerText(
  value: string,
  evidence: readonly EmetAiVisibleEvidenceReference[] = [],
) {
  return value
    .replace(
      new RegExp(String.raw`\s*\[\s*${INTERNAL_EVIDENCE_ID}(?:\s*,\s*${INTERNAL_EVIDENCE_ID})*\s*\]`, "gi"),
      (annotation, offset, source) =>
        visibleReferenceAnnotation(annotation, evidence, source.slice(0, offset)),
    )
    .replace(/\s*\([^)]*\b(?:scripture|lexical|morphology):[^)]*\)/gi, "")
    .replace(
      /\b(?:the\s+)?(?:supplied|provided)\s+(?:passages|texts|scriptures?|evidence)\b/gi,
      "Scripture",
    )
    .replace(
      /\b(?:the\s+)?(?:passages|texts|scriptures?|evidence)\s+(?:supplied|provided)\b/gi,
      "The cited passages",
    )
    .replace(
      /\b(?:the\s+)?verified lexical (?:meaning|data) in (?:the|this) packet\b/gi,
      "The verified lexical meaning",
    )
    .replace(
      /\b(?:the\s+)?(?:verified\s+)?evidence packet\b/gi,
      "the verified source material",
    )
    .replace(/\b(?:the|this) packet\b/gi, "the verified source material")
    .replace(/\bScripture do not\b/g, "Scripture does not")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

type DirectAnswerPolarity = "yes" | "no";

const DIRECT_MODAL_QUESTION =
  /^\s*(?:must|should|ought|may|can|does|do|is|are|was|were|has|have)\b/i;
const NEGATIVE_PREDICATE_QUESTION =
  /\b(?:must|should|ought|need)\b[^?]{0,100}\bnot\s+(?:perform|keep|obey|observe|practice|follow|do|serve|approach)\b|\b(?:forbidden|prohibited|not\s+authorized|not\s+permitted|need\s+not|required\s+not\s+to)\b/i;
const NEGATIVE_MODAL_CLAIM =
  /\b(?:does|do|is|are|was|were|must|should|need)\s+not\b[^.]{0,80}\b(?:require|apply|authorize|permit|assign|obligate|bind|perform|keep|observe|practice)\w*\b|\bnot\s+(?:required|authorized|permitted|assigned|obligated|binding|applicable)\b|\b(?:forbid|prohibit|exclude)\w*\b|\b(?:outsider|stranger|non[- ]?\w+)\b[^.]{0,80}\b(?:shall not|must not|may not|is not|are not|forbidden|prohibited)\b/i;
const POSITIVE_MODAL_CLAIM =
  /\b(?:must|should|ought|need(?:s)?\s+to|has\s+to|have\s+to)\b|\b(?:is|are|was|were)\s+(?:required|authorized|permitted|assigned|obligated|binding|applicable|responsible)\b|\b(?:applies?|belongs?)\s+to\b/i;

function normalizedPolarityText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectMarkers(question: string) {
  const value = normalizedPolarityText(question);
  const markers: string[] = [];
  const nonPriest = /\b(?:non-priest|not a priest|someone who is not a priest)\b/.test(value);
  const nonKing = /\b(?:non-king|not a king|someone who is not a king)\b/.test(value);
  if (nonPriest) {
    markers.push("non-priest", "non-priests", "outsider", "stranger");
  }
  if (nonKing) {
    markers.push("non-king", "non-kings", "outsider", "stranger");
  }
  if (/\b(?:followers? of (?:messiah|christ|jesus|yeshua)|believers?|christians?|disciples?)\b/.test(value)) {
    markers.push("follower", "followers", "believer", "believers", "christian", "christians", "disciple", "disciples");
  }
  if (/\b(?:humanity|mankind|humans?|every human|all people)\b/.test(value)) {
    markers.push("humanity", "mankind", "human", "humans", "people", "person");
  }
  for (const role of ["priest", "king", "parent", "child", "servant", "master", "landowner", "farmer"]) {
    if ((role === "priest" && nonPriest) || (role === "king" && nonKing)) continue;
    if (new RegExp(`\\b${role}s?\\b`).test(value)) markers.push(role, `${role}s`);
  }
  return Array.from(new Set(markers));
}

function claimDirection(text: string): DirectAnswerPolarity | null {
  if (NEGATIVE_MODAL_CLAIM.test(text)) return "no";
  if (POSITIVE_MODAL_CLAIM.test(text)) return "yes";
  return null;
}

export function expectedEmetAiDirectAnswerPolarity(
  question: string,
  answer: Pick<EmetAiAnswer, "claims">,
): DirectAnswerPolarity | null {
  if (!DIRECT_MODAL_QUESTION.test(question)) return null;
  const markers = subjectMarkers(question);
  const directional = answer.claims.flatMap((claim) => {
    const text = normalizedPolarityText(claim.text);
    if (markers.length && !markers.some((marker) => text.includes(marker))) return [];
    const direction = claimDirection(text);
    return direction ? [direction] : [];
  });
  const unique = new Set(directional);
  if (unique.size !== 1) return null;
  const claimPredicate = directional[0];
  const questionPredicate: DirectAnswerPolarity = NEGATIVE_PREDICATE_QUESTION.test(question)
    ? "no"
    : "yes";
  return claimPredicate === questionPredicate ? "yes" : "no";
}

export function normalizeEmetAiDirectAnswerPolarity(
  question: string,
  answer: EmetAiAnswer,
): EmetAiAnswer {
  const opening = /^\s*(yes|no)\b/i.exec(answer.answer)?.[1]?.toLocaleLowerCase("en-US") as
    | DirectAnswerPolarity
    | undefined;
  if (!opening) return answer;
  const expected = expectedEmetAiDirectAnswerPolarity(question, answer);
  if (!expected || expected === opening) return answer;
  return {
    ...answer,
    answer: answer.answer.replace(/^\s*(?:yes|no)\b/i, expected === "yes" ? "Yes" : "No"),
  };
}

export function validateEmetAiDirectAnswerPolarity(
  question: string,
  answer: EmetAiAnswer,
) {
  const opening = /^\s*(yes|no)\b/i.exec(answer.answer)?.[1]?.toLocaleLowerCase("en-US") as
    | DirectAnswerPolarity
    | undefined;
  if (!opening) return null;
  const expected = expectedEmetAiDirectAnswerPolarity(question, answer);
  return expected && expected !== opening
    ? `The opening ${opening.toUpperCase()} contradicts the uniquely supported ${expected.toUpperCase()} conclusion for the question's subject and modal predicate.`
    : null;
}
