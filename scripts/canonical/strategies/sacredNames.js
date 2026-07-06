function hasSourceToken(canonical, entityId) {
  return canonical.sourceTokens.some((token) => token.entityId === entityId);
}

function getSourceTokens(canonical, entityId) {
  return canonical.sourceTokens.filter((token) => token.entityId === entityId);
}

function getUnalignedDisplayTokens(translationData, normalizedWords) {
  return translationData.tokens.filter(
    (token) =>
      !token.alignedSourceTokenIds.length &&
      normalizedWords.includes(token.normalized)
  );
}

function alignTokens({
  canonical,
  entityId,
  normalizedWords,
  confidence,
  method,
}) {
  if (!hasSourceToken(canonical, entityId)) return;

  const sourceTokens = getSourceTokens(canonical, entityId);

  for (const translationData of Object.values(canonical.translations)) {
    const displayTokens = getUnalignedDisplayTokens(
      translationData,
      normalizedWords
    );

    const pairCount = Math.min(displayTokens.length, sourceTokens.length);

    for (let i = 0; i < pairCount; i += 1) {
  displayTokens[i].alignedSourceTokenIds = [sourceTokens[i].id];
  displayTokens[i].confidence = confidence;
  displayTokens[i].method = method;
}
  }
}

function applySacredNamesStrategy(canonicalByVerse) {
  for (const canonical of Object.values(canonicalByVerse)) {
    // YHWH / LORD / Yahweh
    alignTokens({
      canonical,
      entityId: "hebrew:H3068",
      normalizedWords: ["lord", "yahweh", "jehovah"],
      confidence: "high",
      method: "sacred-name-yhwh-match",
    });

    // Elohim / God
    alignTokens({
      canonical,
      entityId: "hebrew:H430",
      normalizedWords: ["god", "gods", "elohim"],
      confidence: "high",
      method: "sacred-name-elohim-match",
    });

    // Adon / Lord/master
    alignTokens({
      canonical,
      entityId: "hebrew:H113",
      normalizedWords: ["lord", "master"],
      confidence: "medium",
      method: "sacred-title-adon-match",
    });
  }
}

module.exports = { applySacredNamesStrategy };