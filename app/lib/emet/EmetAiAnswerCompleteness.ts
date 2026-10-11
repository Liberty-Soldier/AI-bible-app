import type { EmetAiEvidenceItem } from "./EmetAiContract";

export type EmetAiConcreteAnswerRequirement = "enumeration" | "procedure";

const ENUMERATION_PATTERN =
  /\b(?:what|which)\s+(?:(?:specific|actual|biblical|scriptural)\s+)?(?:are\s+the\s+)?(?:commandments?|commands?|foods?|animals?|actions?|requirements?|instructions?|rules?|laws?|practices?|steps?|signs?|gifts?|fruits?)\b/i;
const PROCEDURE_PATTERN =
  /\bhow\s+(?:do|does|should|can|may|would)\s+(?:i|we|a\s+person|someone|believers?|christians?|israel(?:ites)?)\b/i;

const NON_SPECIFIC_WORDS = new Set([
  "about", "according", "actual", "answer", "believe", "biblical", "command",
  "commanded", "commandment", "commandments", "does", "doing", "follow", "given",
  "gives", "keep", "keeping", "kept", "laws", "observe", "observing", "scripture",
  "should", "specific", "statutes", "teach", "thing", "things", "what", "which",
  "yahweh", "yourself",
]);

function words(value: string) {
  return value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) || [];
}

export function classifyEmetAiConcreteAnswerRequirement(
  question: string,
): EmetAiConcreteAnswerRequirement | null {
  if (PROCEDURE_PATTERN.test(question)) return "procedure";
  if (ENUMERATION_PATTERN.test(question) || /^\s*what\s+are\s+the\b/i.test(question)) {
    return "enumeration";
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export function expectedEmetAiNamedListCount(question: string) {
  const match = question.match(/^\s*what\s+are\s+the\s+(\d+|[a-z]+)\b/i);
  if (!match) return null;
  const token = match[1].toLocaleLowerCase("en-US");
  const count = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
  return Number.isInteger(count) && count >= 2 && count <= 16 ? count : null;
}

export function validateEmetAiConcreteAnswer({
  question,
  answer,
  evidence,
}: {
  question: string;
  answer: string;
  evidence: EmetAiEvidenceItem[];
}) {
  const requirement = classifyEmetAiConcreteAnswerRequirement(question);
  if (!requirement) return null;

  const questionWords = new Set(words(question));
  const answerWords = new Set(words(answer));
  const evidenceWords = new Set(
    evidence
      .filter((item) => item.kind === "scripture")
      .flatMap((item) => words(item.text)),
  );
  const concreteEvidenceWords = [...answerWords].filter((word) =>
    word.length >= 4 &&
    evidenceWords.has(word) &&
    !questionWords.has(word) &&
    !NON_SPECIFIC_WORDS.has(word),
  );

  if (concreteEvidenceWords.length < 4) {
    return requirement === "procedure"
      ? "A how-to question requires concrete actions or conditions from the cited Scripture, not a restatement of the requested practice."
      : "An enumeration question requires concrete items or categories from the cited Scripture, not a restatement of the requested category.";
  }

  const namedCount = expectedEmetAiNamedListCount(question);
  if (namedCount) {
    const listSeparators = (answer.match(/[;\n]|(?:^|\s)\d+[.)]/g) || []).length;
    if (listSeparators < Math.max(1, namedCount - 3)) {
      return "A question asking for a named multi-item list must actually identify the requested items rather than merely describe the list.";
    }
  }
  return null;
}

const EXTERNAL_COMPARISON_REQUEST =
  /\b(?:compare|comparison|versus|vs\.?|modern science|scientific consensus|astronomy|nasa|history says|historical evidence|denomination|church tradition)\b/i;
const EXCLUDES_EXTERNAL_FRAMING =
  /\b(?:do not|don't|without|exclude|excluding|only)\b.{0,45}\b(?:modern|scientific|science|astronomy|external|denominational|historical)\b/i;
const UNREQUESTED_EXTERNAL_FRAMING =
  /\b(?:phenomenolog(?:y|ical(?:ly)?)|ordinary human observation|as humans observe|earthbound perspective|human vantage|as it appears|technical astronomical system|orbital mechanics|modern astronomy|scientific model|merely observational|poetic in form|echoes? that language poetically)\b/i;

export function validateEmetAiScriptureOnlyFraming({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const asksWhatScriptureSays =
    /\b(?:what|does|do)\s+(?:the\s+)?(?:bible|scripture)\s+(?:say|teach|establish|describe)\b/i.test(question);
  if (
    asksWhatScriptureSays &&
    (EXCLUDES_EXTERNAL_FRAMING.test(question) || !EXTERNAL_COMPARISON_REQUEST.test(question)) &&
    UNREQUESTED_EXTERNAL_FRAMING.test(answer)
  ) {
    return "A Scripture-only question must report the biblical statements without importing an unrequested modern explanatory framework.";
  }
  return null;
}
