function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function isAlreadyAligned(token) {
  return (
    Array.isArray(token.alignedSourceTokenIds) &&
    token.alignedSourceTokenIds.length > 0
  );
}

function getCandidates(alignmentIndex, tokenText) {
  const key = normalize(tokenText);
  if (!key) return [];

  const entry = alignmentIndex[key];
  if (!entry) return [];

  return [
    ...(entry.exact || []).map((x) => ({ ...x, match: "exact" })),
    ...(entry.morphology || []).map((x) => ({ ...x, match: "morphology" })),
    ...(entry.synonyms || []).map((x) => ({ ...x, match: "synonym" })),
  ];
}

function confidenceForMatch(match) {
  if (match === "exact") return "high";
  if (match === "morphology") return "medium";
  return "low";
}

function matchRank(match) {
  if (match === "exact") return 3;
  if (match === "morphology") return 2;
  return 1;
}

function betterMatch(a, b) {
  return matchRank(a) >= matchRank(b) ? a : b;
}

function applyAlignment(token, sourceToken, match) {
  token.alignedSourceTokenIds = [sourceToken.id];
  token.confidence = confidenceForMatch(match);
  token.method = `${match}-alignment-index-match`;
}

function applyMorphologyStrategy(canonicalByVerse, alignmentIndex) {
  for (const canonical of Object.values(canonicalByVerse)) {
    if (!canonical?.sourceTokens?.length) continue;

    for (const translation of Object.values(canonical.translations || {})) {
      for (const token of translation.tokens || []) {
        if (isAlreadyAligned(token)) continue;

        const candidates = getCandidates(
          alignmentIndex,
          token.normalized || token.text
        );

        if (!candidates.length) continue;

        const matchesBySourceTokenId = new Map();

        for (const candidate of candidates) {
          for (const sourceToken of canonical.sourceTokens) {
            if (sourceToken.entityId !== candidate.entityId) continue;

            const existing = matchesBySourceTokenId.get(sourceToken.id);

            matchesBySourceTokenId.set(sourceToken.id, {
              sourceToken,
              match: existing
                ? betterMatch(existing.match, candidate.match)
                : candidate.match,
            });
          }
        }

        const sourceMatches = [...matchesBySourceTokenId.values()];

        if (sourceMatches.length === 1) {
          applyAlignment(
            token,
            sourceMatches[0].sourceToken,
            sourceMatches[0].match
          );
        }
      }
    }
  }
}

module.exports = {
  applyMorphologyStrategy,
};