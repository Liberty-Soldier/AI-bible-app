const { normalize } = require("../utils/normalize");

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "to",
  "in",
  "a",
  "an",
  "for",
  "with",
  "by",
  "from",
  "as",
  "at",
  "on",
  "unto",
  "into",
  "upon",
  "under",
  "over",
  "through",
  "than",
  "then",
  "there",
  "therefore",
  "so",
  "but",
  "or",
  "if",
  "when",
  "who",
  "whom",
  "which",
  "what",
  "where",
  "why",
  "how",
  "he",
  "she",
  "it",
  "they",
  "them",
  "him",
  "her",
  "his",
  "their",
  "my",
  "your",
  "our",
  "me",
  "you",
  "i",
  "we",
  "us",
  "thy",
  "thou",
  "thee",
  "ye",
  "hath",
  "hast",
  "shalt",
  "thine",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "shall",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "not",
  "no",
  "nor",
  "very",
  "greatly",
]);

function addCandidate(candidates, value) {
  const normalized = normalize(value);

  if (!normalized) return;

  for (const part of normalized.split(/\s+/)) {
    if (part.length > 2 && !STOPWORDS.has(part)) {
      candidates.add(part);
      addExpandedForms(candidates, part);
    }
  }

  if (!normalized.includes(" ") && normalized.length > 2 && !STOPWORDS.has(normalized)) {
    candidates.add(normalized);
    addExpandedForms(candidates, normalized);
  }
}

function addExpandedForms(candidates, word) {
  const value = normalize(word);

  if (!value || value.length <= 2 || STOPWORDS.has(value)) return;

  const forms = new Set();

  // Simple plural forms.
  if (!value.endsWith("s")) {
    forms.add(`${value}s`);
  }

  if (
    value.endsWith("ch") ||
    value.endsWith("sh") ||
    value.endsWith("x") ||
    value.endsWith("z")
  ) {
    forms.add(`${value}es`);
  }

  if (value.endsWith("y") && value.length > 3) {
    forms.add(`${value.slice(0, -1)}ies`);
  }

  // Simple past forms.
  if (value.endsWith("e")) {
    forms.add(`${value}d`);
  } else {
    forms.add(`${value}ed`);
  }

  // High-value biblical form families.
  const families = {
    righteous: ["righteousness"],
    righteousness: ["righteous"],
    wicked: ["wickedness"],
    wickedness: ["wicked"],
    holy: ["holiness"],
    holiness: ["holy"],

    command: ["commands", "commanded", "commanding", "commandment", "commandments"],
    commanded: ["command", "commands"],
    commandment: ["commandments"],
    commandments: ["commandment"],

    kill: ["kills", "killed", "killing", "slay", "slays", "slain", "slew"],
kills: ["kill", "killed", "slay", "slew"],
killed: ["kill", "kills", "slay", "slain", "slew"],
killing: ["kill", "kills", "killed"],
slay: ["slays", "slaying", "slain", "slew", "kill", "killed"],
slays: ["slay", "slew", "slain", "kill", "killed"],
slaying: ["slay", "kill", "killing"],
slain: ["slay", "slew", "kill", "killed"],
slew: ["slay", "slain", "kill", "killed"],

smite: ["smites", "smote", "smitten", "strike", "struck", "kill", "slew"],
smites: ["smite", "smote", "smitten"],
smote: ["smite", "smitten", "strike", "struck", "slew"],
smitten: ["smite", "smote", "struck"],
strike: ["strikes", "struck", "smite", "smote", "smitten"],
struck: ["strike", "smite", "smote", "smitten"],

    statute: ["statutes"],
    statutes: ["statute"],
    judgment: ["judgments"],
    judgments: ["judgment"],

    sin: ["sins", "sinned", "sinning"],
    sins: ["sin", "sinned"],
    sinned: ["sin", "sins"],
    sinner: ["sinners"],
    sinners: ["sinner"],

    priest: ["priests"],
    priests: ["priest"],
    offering: ["offerings"],
    offerings: ["offering"],
    sacrifice: ["sacrifices"],
    sacrifices: ["sacrifice"],

    covenant: ["covenants"],
    covenants: ["covenant"],
    law: ["laws"],
    laws: ["law"],

    heaven: ["heavens"],
    heavens: ["heaven"],
    nation: ["nations"],
    nations: ["nation"],
    people: ["peoples"],
    peoples: ["people"],

    altar: ["altars"],
    altars: ["altar"],
    temple: ["temples"],
    temples: ["temple"],
    tabernacle: ["tabernacles"],
    tabernacles: ["tabernacle"],
  };

  for (const form of families[value] || []) {
    forms.add(form);
  }

  for (const form of forms) {
    const normalizedForm = normalize(form);

    if (
      normalizedForm &&
      normalizedForm.length > 2 &&
      !STOPWORDS.has(normalizedForm)
    ) {
      candidates.add(normalizedForm);
    }
  }
}

function getEnglishCandidates(entry) {
  const candidates = new Set();

  const fields = [
    entry.gloss,
    entry.shortDefinition,
    entry.usage,
    entry.transliteration,
  ];

  for (const field of fields) {
    String(field || "")
      .split(/[;,./()|[\]{}"'“”‘’:-]+/)
      .map(normalize)
      .filter(Boolean)
      .forEach((value) => addCandidate(candidates, value));
  }

  return candidates;
}

function applyExactWordsStrategy(canonicalByVerse, lexicon) {
  const byEntityId = new Map();

  for (const entry of lexicon) {
    if (!entry?.strong || entry.language !== "hebrew") continue;

    const entityId = `hebrew:${entry.strong}`;
    const candidates = getEnglishCandidates(entry);

    if (!candidates.size) continue;

    byEntityId.set(entityId, candidates);
  }

  for (const canonical of Object.values(canonicalByVerse)) {
    for (const sourceToken of canonical.sourceTokens) {
      const candidates = byEntityId.get(sourceToken.entityId);
      if (!candidates) continue;

      for (const translationData of Object.values(canonical.translations)) {
        const displayToken = translationData.tokens.find(
          (token) =>
            !token.alignedSourceTokenIds.length &&
            candidates.has(token.normalized)
        );

        if (!displayToken) continue;

        displayToken.alignedSourceTokenIds = [sourceToken.id];
        displayToken.confidence = "medium";
        displayToken.method = "expanded-exact-lexical-match";
      }
    }
  }
}

module.exports = { applyExactWordsStrategy };