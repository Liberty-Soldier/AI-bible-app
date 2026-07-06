const { normalize } = require("../utils/normalize");

function getEnglishCandidates(entry) {
  const candidates = new Set();

  const fields = [entry.gloss, entry.shortDefinition, entry.usage];

  for (const field of fields) {
    String(field || "")
      .split(/[;,./()]/)
      .map(normalize)
      .filter(Boolean)
      .forEach((value) => {
        if (value.length > 2) candidates.add(value);
      });
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
        displayToken.method = "exact-lexical-match";
      }
    }
  }
}

module.exports = { applyExactWordsStrategy };