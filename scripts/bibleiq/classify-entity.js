const { cleanText } = require("./text-utils");

function joinedOccurrenceText(occurrences) {
  return (occurrences || [])
    .map((item) => cleanText(item.englishText))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function joinedLexText(lex) {
  return [
    lex?.shortDefinition,
    lex?.usage,
    lex?.gloss,
    lex?.fullDefinition,
    lex?.partOfSpeech,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getMorphText(occurrences) {
  return (occurrences || [])
    .map((item) => cleanText(item.morph))
    .filter(Boolean)
    .join(" ");
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function classifyEntity({ lex, properName, occurrences }) {
  const lexText = joinedLexText(lex);
  const occurrenceText = joinedOccurrenceText(occurrences);
  const morphText = getMorphText(occurrences);
  const combinedText = `${lexText} ${occurrenceText}`;

const isVerb =
  /\bverb\b/.test(lexText) ||
  /\bHV/.test(morphText) ||
  morphText.includes("/V");

  const isProper =
    properName ||
    lexText.includes("proper") ||
    lexText.includes("name") ||
    morphText.includes("Np");

  if (isProper) {
    if (
      containsAny(occurrenceText, [
        "son of",
        "daughter of",
        "brother",
        "sister",
        "father",
        "mother",
        "king",
        "priest",
        "prophet",
        "wife",
        "husband",
        "begat",
        "gave birth",
        "born",
        "died",
        "slew",
        "killed",
      ])
    ) {
      return "person";
    }

    if (
      containsAny(occurrenceText, [
        "city",
        "land",
        "mount",
        "mountain",
        "river",
        "valley",
        "field",
        "wilderness",
        "gate",
        "sea",
        "brook",
        "border",
        "dwelt in",
        "came to",
        "went to",
      ])
    ) {
      return "place";
    }

    return "name";
  }

  if (
    containsAny(lexText, [
      "offering",
      "sacrifice",
      "tribute",
      "oblation",
      "atonement",
      "covenant",
      "commandment",
      "law",
      "torah",
      "sin",
      "righteous",
      "righteousness",
      "holy",
      "holiness",
      "mercy",
      "truth",
      "faith",
      "judgment",
      "justice",
      "wisdom",
      "knowledge",
      "understanding",
      "kingdom",
      "sabbath",
      "blessing",
      "curse",
    ])
  ) {
    return "concept";
  }

   if (isVerb) return "action";

  if (
    containsAny(lexText, [
      "sheep",
      "lamb",
      "goat",
      "bull",
      "ox",
      "cow",
      "calf",
      "horse",
      "donkey",
      "serpent",
      "bird",
      "fish",
      "lion",
      "bear",
      "wolf",
      "beast",
    ])
  ) {
    return "animal";
  }

  if (
    containsAny(combinedText, [
      "altar",
      "ark",
      "sword",
      "robe",
      "garment",
      "oil",
      "bread",
      "stone",
      "tent",
      "house",
      "tabernacle",
      "temple",
      "lamp",
      "vessel",
      "cup",
      "staff",
      "rod",
    ])
  ) {
    return "object";
  }

  return "word";
}

module.exports = {
  classifyEntity,
};