const { normalize } = require("../utils/normalize");
const { parseSourceReference, toVerseKey } = require("../utils/references");

function isProperName(entry) {
  const pos = String(entry.partOfSpeech || "").toLowerCase();

  return (
    pos.includes("np") ||
    pos.includes("n-pr") ||
    pos.includes("proper")
  );
}

function getNameCandidates(entry) {
  const candidates = new Set();

  if (entry.transliteration) {
    candidates.add(normalize(entry.transliteration));
  }

  if (entry.usage) {
    String(entry.usage)
      .split(/[;,./]/)
      .map(normalize)
      .filter(Boolean)
      .forEach((value) => candidates.add(value));
  }

  return candidates;
}

function applyProperNamesStrategy(canonicalByVerse, lexicon) {
  for (const entry of lexicon) {
    if (!entry?.strong || entry.language !== "hebrew") continue;
    if (!isProperName(entry)) continue;

    const candidates = getNameCandidates(entry);
    if (!candidates.size) continue;

    const entityId = `hebrew:${entry.strong}`;

    for (const occurrence of entry.occurrences || []) {
      const parsed = parseSourceReference(occurrence.reference);
      if (!parsed) continue;

      const verseKey = toVerseKey(parsed.book, parsed.chapter, parsed.verse);
      const canonical = canonicalByVerse[verseKey];
      if (!canonical) continue;

      const sourceTokens = canonical.sourceTokens.filter(
        (token) => token.entityId === entityId
      );

      for (const translationData of Object.values(canonical.translations)) {
        const displayTokens = translationData.tokens.filter(
          (token) =>
            !token.alignedSourceTokenIds.length &&
            candidates.has(token.normalized)
        );

        const pairCount = Math.min(displayTokens.length, sourceTokens.length);

for (let i = 0; i < pairCount; i += 1) {
  displayTokens[i].alignedSourceTokenIds = [sourceTokens[i].id];
  displayTokens[i].confidence = "high";
  displayTokens[i].method = "proper-name-usage-match";
}
      }
    }
  }
}

module.exports = { applyProperNamesStrategy };