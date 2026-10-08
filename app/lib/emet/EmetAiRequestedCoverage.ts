import { bookAliasMap, normalizeBookName } from "../../data/bookAliases";

export type EmetAiRequestedPassage = {
  id: string;
  label: string;
  book: string;
  chapter: number;
  startVerse?: number;
  endVerse?: number;
};

export type EmetAiRequestedLanguage = {
  id: string;
  corpora: Array<"hebrew" | "greek-nt">;
  subject: string;
};

export type EmetAiRequestedSubquestion = {
  id: string;
  text: string;
};

export type EmetAiRequestedCoverage = {
  passages: EmetAiRequestedPassage[];
  language: EmetAiRequestedLanguage[];
  subquestions: EmetAiRequestedSubquestion[];
  competingInterpretations: boolean;
  comparisonPassages: Array<{
    reference: string;
    reason: string;
  }>;
};

const aliasPattern = Object.keys(bookAliasMap)
  .sort((left, right) => right.length - left.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"))
  .join("|");

const referencePattern = new RegExp(
  `\\b(${aliasPattern})\\.?\\s+(\\d+)(?::(\\d+)(?:\\s*[-–—]\\s*(\\d+))?)?`,
  "gi",
);

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractEmetAiRequestedCoverage(
  question: string,
): EmetAiRequestedCoverage {
  const passages: EmetAiRequestedPassage[] = [];
  const passageKeys = new Set<string>();
  for (const match of question.matchAll(referencePattern)) {
    const book = normalizeBookName(match[1]);
    const chapter = Number(match[2]);
    const startVerse = match[3] ? Number(match[3]) : undefined;
    const endVerse = match[4] ? Number(match[4]) : startVerse;
    if (!book || !Number.isInteger(chapter) || chapter < 1) continue;
    if (startVerse !== undefined && (!Number.isInteger(startVerse) || startVerse < 1)) continue;
    if (endVerse !== undefined && (!Number.isInteger(endVerse) || endVerse < startVerse! || endVerse - startVerse! > 24)) continue;
    const key = `${book}|${chapter}|${startVerse || "chapter"}|${endVerse || "chapter"}`;
    if (passageKeys.has(key)) continue;
    passageKeys.add(key);
    const label = startVerse === undefined
      ? `${book} ${chapter}`
      : `${book} ${chapter}:${startVerse}${endVerse !== startVerse ? `-${endVerse}` : ""}`;
    passages.push({
      id: `requested-passage-${passages.length + 1}`,
      label,
      book,
      chapter,
      ...(startVerse === undefined ? {} : { startVerse, endVerse }),
    });
  }

  const asksHebrew = /\b(Hebrew|Masoretic|Tanakh|Old Testament source (?:word|language))\b/i.test(question);
  const asksGreek = /\b(Greek|Septuagint|LXX|New Testament source (?:word|language))\b/i.test(question);
  const asksLanguageAnalysis =
    asksHebrew || asksGreek ||
    /\b(original[- ]language|source[- ]language|source words?|lexical|lemma|word study|etymolog)\w*\b/i.test(question);
  const language: EmetAiRequestedLanguage[] = [];
  if (asksLanguageAnalysis) {
    const corpora: Array<"hebrew" | "greek-nt"> = [];
    if (asksHebrew || (!asksHebrew && !asksGreek)) corpora.push("hebrew");
    if (asksGreek || (!asksHebrew && !asksGreek)) corpora.push("greek-nt");
    const subjectMatch = question.match(/\b(?:word|term|meaning|terminology)\s+(?:for|of)\s+([^?.;,]{2,80})/i);
    language.push({
      id: "requested-language-1",
      corpora,
      subject: cleanText(subjectMatch?.[1] || "the requested original-language terminology"),
    });
  }

  const clauses = question
    .split(/\?|(?:^|\s)(?:and\s+)?(?:also|second(?:ly)?|third(?:ly)?|finally)[:,]?\s+/i)
    .map(cleanText)
    .filter((value) => value.length >= 8);
  const subquestions = clauses.length > 1
    ? clauses.slice(0, 6).map((text, index) => ({
        id: `requested-subquestion-${index + 1}`,
        text,
      }))
    : [];

  const competingInterpretations =
    /\b(?:for\s+(?:and|or|&)\s+against|arguments?\s+(?:for|against)|both\s+(?:sides|interpretations|views)|competing\s+(?:interpretations|views)|evidence\s+(?:for|against))\b/i.test(question);
  const comparisonPassages = competingInterpretations &&
    /\b(?:sabbath|seventh[- ]day)\b/i.test(question)
    ? [
        ["Colossians 2:16", "Commonly cited in arguments about judging Sabbath observance; its actual wording and scope must be examined."],
        ["Colossians 2:17", "Continues the shadow/substance statement that must be interpreted in its immediate context."],
        ["Romans 14:5", "Commonly cited in arguments about differing esteem of days; the day in view must not be assumed."],
        ["Romans 14:6", "Explains the God-directed conduct associated with the preceding distinction among days."],
        ["Galatians 4:9", "Introduces Paul's warning about returning to enslaving elements."],
        ["Galatians 4:10", "Names observed days, months, seasons, and years within that warning."],
        ["Galatians 4:11", "States Paul's concern about the Galatians and completes the immediate warning."],
      ].map(([reference, reason]) => ({ reference, reason }))
    : [];

  return {
    passages,
    language,
    subquestions,
    competingInterpretations,
    comparisonPassages,
  };
}

export function requestedCoverageComponents(coverage: EmetAiRequestedCoverage) {
  return coverage.subquestions.map((item) => ({
      id: item.id,
      proposition: `Answer this distinct requested part: ${item.text}`,
      category: "other" as const,
    }));
}
