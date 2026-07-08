const { cleanText, unique, fullBookName } = require("./text-utils");
const { classifyEntity } = require("./classify-entity");

function isProperName(lex, lemmaEntry) {
  const pos = cleanText(lex.partOfSpeech).toLowerCase();
  const morphs = Array.isArray(lemmaEntry?.morphs) ? lemmaEntry.morphs : [];

  return (
    pos.includes("name") ||
    pos.includes("proper") ||
    morphs.some(([m]) => String(m).includes("Np"))
  );
}

function baseDefinition(lex) {
  return (
    cleanText(lex.shortDefinition) ||
    cleanText(lex.usage) ||
    cleanText(lex.gloss) ||
    cleanText(lex.fullDefinition) ||
    "meaning pending"
  ).replace(/\.$/, "");
}

function getBooks(occurrences) {
  return unique(occurrences.map((item) => item.book).filter(Boolean));
}

function getReferences(occurrences, limit = 4) {
  return unique(occurrences.map((item) => item.reference).filter(Boolean)).slice(
    0,
    limit
  );
}

function getVerseTexts(occurrences, limit = 6) {
  return unique(
    occurrences.map((item) => cleanText(item.englishText)).filter(Boolean)
  ).slice(0, limit);
}

function getBookPhrase(books) {
  if (!books.length) return "";
  if (books.length === 1) return fullBookName(books[0]);

  const shown = books.slice(0, 5).map(fullBookName).filter(Boolean);

  if (books.length > 5) {
    return `${shown.join(", ")}, and ${books.length - 5} more`;
  }

  return shown.join(", ");
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function detectSignals(texts) {
  const joined = texts.join(" ").toLowerCase();

  const signals = [
    ["gave birth", "birth"],
    ["born", "birth"],
    ["brother", "family"],
    ["sister", "family"],
    ["father", "family"],
    ["mother", "family"],
    ["son", "family line"],
    ["daughter", "family line"],
    ["keeper of sheep", "shepherding"],
    ["flock", "flock"],
    ["offering", "offering"],
    ["firstborn", "firstborn"],
    ["sacrifice", "sacrifice"],
    ["altar", "altar"],
    ["blood", "blood"],
    ["killed", "death"],
    ["slew", "death"],
    ["died", "death"],
    ["righteous", "righteousness"],
    ["faith", "faith"],
    ["covenant", "covenant"],
    ["commandment", "commandment"],
    ["law", "Torah"],
    ["king", "kingship"],
    ["priest", "priesthood"],
    ["prophet", "prophetic witness"],
    ["city", "city"],
    ["land", "land"],
    ["mountain", "mountain"],
    ["wilderness", "wilderness"],
    ["egypt", "Egypt"],
    ["israel", "Israel"],
  ];

  return unique(
    signals
      .filter(([needle]) => joined.includes(needle))
      .map(([, label]) => label)
  ).slice(0, 6);
}

function readableRefs(refs) {
  return refs.length ? refs.join(", ") : "its source-text occurrences";
}

function buildPersonSimple({
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
  evidenceModel,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 8);
  const joined = texts.join(" ");
  const lower = joined.toLowerCase();
  const books = getBooks(occurrences);
  const bookPhrase = getBookPhrase(books);
  const signals = detectSignals(texts);

  const occurrencePhrase =
    occurrenceCount === 1
      ? "appears once in the Hebrew Scriptures"
      : `appears ${occurrenceCount || "multiple"} times in the Hebrew Scriptures`;

  const introDetails = [];

if (evidenceModel?.classification?.gender === "female") {
  if (lower.includes("daughter")) {
    introDetails.push("as a daughter in the family line");
  } else if (lower.includes("sister")) {
    introDetails.push("as a sister in the family line");
  }
} else if (evidenceModel?.classification?.gender === "male") {
  if (lower.includes("son")) {
    introDetails.push("as a son in the family line");
  } else if (lower.includes("brother")) {
    introDetails.push("as a brother in the family line");
  }
}

  if (lower.includes("keeper of sheep")) {
    introDetails.push("as a keeper of sheep");
  } else if (lower.includes("flock") || lower.includes("sheep")) {
    introDetails.push("in connection with flocks");
  }

  if (lower.includes("king")) {
    introDetails.push("in connection with kingship");
  }

  if (lower.includes("priest")) {
    introDetails.push("in connection with priesthood");
  }

  if (lower.includes("prophet")) {
    introDetails.push("in connection with prophetic witness");
  }

  const worshipDetails = [];

  if (
    lower.includes("offering") &&
    lower.includes("firstborn") &&
    (lower.includes("fat") || lower.includes("flock"))
  ) {
    worshipDetails.push(
      "an offering from the firstborn of the flock and its fat"
    );
  } else if (lower.includes("offering")) {
    worshipDetails.push("an offering");
  }

  if (
    lower.includes("yahweh respected") ||
    lower.includes("lord had respect") ||
    lower.includes("accepted")
  ) {
    worshipDetails.push("divine acceptance");
  }

  const conflictDetails = [];

  if (
    lower.includes("rose up against") ||
    lower.includes("against his brother") ||
    lower.includes("angry")
  ) {
    conflictDetails.push("conflict");
  }

  if (lower.includes("killed") || lower.includes("slew")) {
    conflictDetails.push("death");
  }

  if (lower.includes("blood")) {
    conflictDetails.push("blood crying from the ground");
  }

  const introSentence = introDetails.length
    ? `${lemma}${transliteration} ${occurrencePhrase} and is introduced ${unique(
        introDetails
      ).join(" and ")}.`
    : `${lemma}${transliteration} ${occurrencePhrase} as a person-name in the Hebrew text.`;

  const worshipSentence = worshipDetails.length
    ? `The occurrence trail connects the name with ${unique(
        worshipDetails
      ).join(" and ")}.`
    : "";

const conflictList = unique(conflictDetails);

const conflictPhrase =
  conflictList.length <= 2
    ? conflictList.join(" and ")
    : `${conflictList.slice(0, -1).join(", ")}, and ${
        conflictList[conflictList.length - 1]
      }`;

const conflictSentence = conflictList.length
  ? `The surrounding account also brings the name into ${conflictPhrase}.`
  : "";

  const meaning = [introSentence, worshipSentence, conflictSentence]
    .filter(Boolean)
    .join(" ");

  const biblicalBackground = texts.length
    ? `The first appearances are in ${bookPhrase || "the Hebrew Bible"}${
        refs[0] ? `, beginning at ${refs[0]}` : ""
      }. ${
        signals.length
          ? `BibleIQ detects the main surrounding context as ${signals.join(
              ", "
            )}.`
          : "The background comes from the surrounding verses where the name appears."
      }`
    : `BibleIQ identifies this person-name from the Hebrew source text and builds the background from its occurrence trail.`;

  const inThisVerse = `In this verse, the tapped English word is source-aligned to ${lemma}${
    strong ? ` (${strong})` : ""
  } in the Hebrew text.`;

  const whyItMatters = `People in Scripture are understood by their place in the story. BibleIQ follows ${lemma} through the actual verses so the reader sees the person in context instead of as an isolated dictionary entry.`;

  const summary = `${lemma}${transliteration}${
    strong ? ` / ${strong}` : ""
  } is tracked through ${readableRefs(
    refs
  )}. The entry is generated from source alignment, occurrence evidence, and the surrounding Scripture context.`;

  return { meaning, biblicalBackground, inThisVerse, whyItMatters, summary };
}

function buildPlaceSimple({
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 6);
  const books = getBooks(occurrences);
  const bookPhrase = getBookPhrase(books);
  const signals = detectSignals(texts);

  return {
    meaning: `${lemma}${transliteration} is a place-name in the Hebrew text${
      strong ? ` (${strong})` : ""
    }. BibleIQ follows its ${occurrenceCount || "source-text"} occurrence${
      occurrenceCount === 1 ? "" : "s"
    } across Scripture.`,
    biblicalBackground: `This place appears${
      bookPhrase ? ` in ${bookPhrase}` : ""
    }${refs[0] ? `, beginning at ${refs[0]}` : ""}. ${
      signals.length
        ? `The surrounding context includes ${signals.join(", ")}.`
        : "The occurrence trail shows where the place enters the biblical story."
    }`,
    inThisVerse: `In this verse, the tapped English word is source-aligned to the Hebrew place-name ${lemma}${
      strong ? ` (${strong})` : ""
    }.`,
    whyItMatters:
      "Places in Scripture often connect geography, covenant history, judgment, worship, and movement through the land. BibleIQ keeps the place tied to its actual verse trail.",
    summary: `${lemma}${transliteration}${
      strong ? ` / ${strong}` : ""
    } is traced through ${readableRefs(refs)} using generated occurrence evidence.`,
  };
}

function buildActionSimple({
  lex,
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
  definition,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 6);
  const books = getBooks(occurrences);
  const bookPhrase = getBookPhrase(books);
  const signals = detectSignals(texts);

  return {
    meaning: `${lemma}${transliteration} is a Hebrew action word meaning “${definition}.” BibleIQ anchors the English reading to this source verb before comparing its uses.`,
    biblicalBackground: `This action appears ${occurrenceCount || "multiple"} time${
      occurrenceCount === 1 ? "" : "s"
    }${bookPhrase ? ` in ${bookPhrase}` : ""}${
      refs[0] ? `, beginning at ${refs[0]}` : ""
    }. ${
      signals.length
        ? `The surrounding contexts include ${signals.join(", ")}.`
        : "Its meaning becomes clearer as the uses are compared."
    }`,
    inThisVerse: `In this verse, the tapped English word is source-aligned to ${lemma}${
      strong ? ` (${strong})` : ""
    } in the Hebrew text.`,
    whyItMatters:
      "Actions in Scripture show what people do, what God does, and how covenant faithfulness or rebellion is described. BibleIQ compares the action across its occurrences.",
    summary: `${lemma}${transliteration}${
      strong ? ` / ${strong}` : ""
    } is traced through ${readableRefs(refs)} with source-language evidence and verse context.`,
  };
}

function buildConceptSimple({
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
  definition,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 6);
  const books = getBooks(occurrences);
  const bookPhrase = getBookPhrase(books);
  const signals = detectSignals(texts);

  return {
    meaning: `${lemma}${transliteration} is a Hebrew concept word meaning “${definition}.” BibleIQ follows how Scripture develops this idea across its occurrences.`,
    biblicalBackground: `The concept appears ${occurrenceCount || "multiple"} time${
      occurrenceCount === 1 ? "" : "s"
    }${bookPhrase ? ` across ${bookPhrase}` : ""}${
      refs[0] ? `, beginning at ${refs[0]}` : ""
    }. ${
      signals.length
        ? `Its contexts include ${signals.join(", ")}.`
        : "Its meaning is built by comparing the passages where Scripture uses it."
    }`,
    inThisVerse: `In this verse, the tapped English word is source-aligned to ${lemma}${
      strong ? ` (${strong})` : ""
    }.`,
    whyItMatters:
      "Concept words shape biblical themes. BibleIQ keeps the concept grounded in actual verse evidence instead of starting with a later theological definition.",
    summary: `${lemma}${transliteration}${
      strong ? ` / ${strong}` : ""
    } is traced through ${readableRefs(refs)} as a generated source-based concept entry.`,
  };
}

function buildObjectSimple({
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
  definition,
  typeLabel,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 6);
  const signals = detectSignals(texts);

  return {
    meaning: `${lemma}${transliteration} is a Hebrew ${typeLabel} word meaning “${definition}.” BibleIQ follows the concrete thing through the verses where it appears.`,
    biblicalBackground: `${
      refs[0] ? `The occurrence trail begins at ${refs[0]}. ` : ""
    }${
      signals.length
        ? `The surrounding context includes ${signals.join(", ")}.`
        : "The background is built from the passages where the word occurs."
    }`,
    inThisVerse: `In this verse, the tapped English word is source-aligned to ${lemma}${
      strong ? ` (${strong})` : ""
    } in the Hebrew text.`,
    whyItMatters:
      "Concrete words often carry patterns through Scripture because objects, animals, offerings, and created things are used repeatedly in worship, judgment, covenant, and narrative.",
    summary: `${lemma}${transliteration}${
      strong ? ` / ${strong}` : ""
    } is traced through ${readableRefs(refs)} with generated occurrence evidence.`,
  };
}

function buildDefaultSimple({
  lemma,
  strong,
  transliteration,
  occurrenceCount,
  occurrences,
  definition,
}) {
  const refs = getReferences(occurrences, 4);
  const texts = getVerseTexts(occurrences, 6);
  const books = getBooks(occurrences);
  const bookPhrase = getBookPhrase(books);

  return {
    meaning: `${lemma}${transliteration} is a Hebrew word meaning “${definition}.” BibleIQ connects the English word back to this source word so its use can be compared across Scripture.`,
    biblicalBackground:
      occurrenceCount > 1
        ? `${lemma}${strong ? ` (${strong})` : ""} appears ${
            occurrenceCount || "multiple"
          } times in the Hebrew Bible${
            refs[0] ? `, beginning at ${refs[0]}` : ""
          }${bookPhrase ? `, with occurrences in ${bookPhrase}` : ""}.`
        : `This word has limited occurrence data, so BibleIQ begins with the Hebrew word, its basic meaning, and the verse where it appears.`,
    inThisVerse: `In this verse, the tapped English word is source-aligned to ${lemma}${
      strong ? ` (${strong})` : ""
    } in the Hebrew text.`,
    whyItMatters: `English translations can use the same English word for different Hebrew words. BibleIQ anchors the study in ${lemma}${
      strong ? ` (${strong})` : ""
    } before moving outward to related references.`,
    summary: `${lemma}${transliteration}${
      strong ? ` / ${strong}` : ""
    } is traced through ${readableRefs(refs)} using source-language evidence and occurrence comparison.`,
  };
}

function buildSimple({
  lex,
  lemma,
  strong,
  occurrenceCount,
  occurrences,
  properName,
  evidenceModel,
}) {
  const definition = baseDefinition(lex);
  const transliteration = lex.transliteration
    ? ` (${cleanText(lex.transliteration)})`
    : "";

  const entityType = classifyEntity({
    lex,
    lemma,
    strong,
    properName,
    occurrences,
  });

if (entityType === "person") {
  return buildPersonSimple({
    lemma,
    strong,
    transliteration,
    occurrenceCount,
    occurrences,
    evidenceModel,
  });
}

if (entityType === "place") {
    return buildPlaceSimple({
      lemma,
      strong,
      transliteration,
      occurrenceCount,
      occurrences,
    });
  }

  if (entityType === "action") {
    return buildActionSimple({
      lex,
      lemma,
      strong,
      transliteration,
      occurrenceCount,
      occurrences,
      definition,
    });
  }

  if (entityType === "concept") {
    return buildConceptSimple({
      lemma,
      strong,
      transliteration,
      occurrenceCount,
      occurrences,
      definition,
    });
  }

  if (entityType === "object" || entityType === "animal") {
    return buildObjectSimple({
      lemma,
      strong,
      transliteration,
      occurrenceCount,
      occurrences,
      definition,
      typeLabel: entityType,
    });
  }

  return buildDefaultSimple({
    lemma,
    strong,
    transliteration,
    occurrenceCount,
    occurrences,
    definition,
  });
}

module.exports = {
  isProperName,
  baseDefinition,
  buildSimple,
};