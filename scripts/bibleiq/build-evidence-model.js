const { cleanText, unique, fullBookName } = require("./text-utils");
const { classifyEntity } = require("./classify-entity");
const { baseDefinition } = require("./build-simple");
const { buildEventExtraction } = require("./build-event-extractor");

function getBooks(occurrences) {
  return unique(occurrences.map((item) => item.book).filter(Boolean));
}

function getReferences(occurrences, limit = 8) {
  return unique(occurrences.map((item) => item.reference).filter(Boolean)).slice(0, limit);
}

function getVerseTexts(occurrences, limit = 12) {
  return unique(
    occurrences.map((item) => cleanText(item.englishText)).filter(Boolean)
  ).slice(0, limit);
}

function detectGender(texts) {
  const joined = texts.join(" ").toLowerCase();

  if (
    joined.includes("daughter") ||
    joined.includes("sister") ||
    joined.includes("wife") ||
    joined.includes("mother") ||
    joined.includes("maid") ||
    joined.includes("woman")
  ) {
    return {
      value: "female",
      confidence: "high",
      evidence: ["Occurrence trail contains female relationship language"],
    };
  }

  if (
    joined.includes("son") ||
    joined.includes("brother") ||
    joined.includes("husband") ||
    joined.includes("father") ||
    joined.includes("man")
  ) {
    return {
      value: "male",
      confidence: "medium",
      evidence: ["Occurrence trail contains male relationship language"],
    };
  }

  return {
    value: "unknown",
    confidence: "low",
    evidence: [],
  };
}

function detectThemes(texts) {
  const joined = texts.join(" ").toLowerCase();

  const signals = [
    ["daughter", "family line"],
    ["son", "family line"],
    ["brother", "family"],
    ["sister", "family"],
    ["father", "family"],
    ["mother", "family"],
    ["king", "kingship"],
    ["priest", "priesthood"],
    ["prophet", "prophetic witness"],
    ["offering", "offering"],
    ["blood", "blood"],
    ["killed", "death"],
    ["slew", "death"],
    ["city", "city"],
    ["land", "land"],
    ["covenant", "covenant"],
    ["commandment", "commandment"],
    ["law", "Torah"],
  ];

  return unique(
    signals
      .filter(([needle]) => joined.includes(needle))
      .map(([, label]) => label)
  ).slice(0, 8);
}

function detectRelationships(texts) {
  const joined = texts.join(" ").toLowerCase();
  const relationships = [];

  const checks = [
    ["father", "father"],
    ["mother", "mother"],
    ["son", "son"],
    ["daughter", "daughter"],
    ["brother", "brother"],
    ["sister", "sister"],
    ["wife", "wife"],
    ["husband", "husband"],
  ];

  for (const [needle, type] of checks) {
    if (joined.includes(needle)) {
      relationships.push({
        type,
        confidence: "medium",
        evidenceText: `Occurrence trail contains "${needle}"`,
      });
    }
  }

  return relationships;
}

function buildEvidenceModel({
  lex,
  lemma,
  strong,
  occurrenceCount,
  occurrences,
  properName,
}) {
  const texts = getVerseTexts(occurrences);
  const books = getBooks(occurrences);
  const refs = getReferences(occurrences);
  const entityType = classifyEntity({ lex, lemma, strong, properName, occurrences });
  const gender = entityType === "person" ? detectGender(texts) : undefined;
  const eventExtraction = buildEventExtraction({ lemma, occurrences });

  return {
    id: `word:hebrew:${strong}`,
    source: "hebrew",
    strong,
    lemma,
    transliteration: cleanText(lex.transliteration),
    definition: baseDefinition(lex),
    occurrenceCount,

    classification: {
      primary: entityType,
      gender: gender?.value,
      confidence: properName ? "high" : "medium",
      evidence: [
        properName ? "Lexicon or morphology identifies this as a proper name" : "",
        ...(gender?.evidence || []),
      ].filter(Boolean),
    },

    firstOccurrence: occurrences[0]
      ? {
          reference: occurrences[0].reference,
          book: occurrences[0].book,
          bookName: fullBookName(occurrences[0].book),
          englishText: cleanText(occurrences[0].englishText),
        }
      : null,

    books,
    references: refs,

    themes: detectThemes(texts),
    relationships: detectRelationships(texts),
    majorEvents: eventExtraction.majorEvents,
timeline: eventExtraction.timeline,
canonicalTrailSummary: eventExtraction.canonicalTrailSummary,

    occurrenceTrail: occurrences.slice(0, 25).map((item) => ({
      reference: item.reference,
      book: item.book,
      englishText: cleanText(item.englishText),
    })),
  };
}

module.exports = { buildEvidenceModel };