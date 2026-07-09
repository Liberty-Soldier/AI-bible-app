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

function alignTokenToSourceToken(displayToken, sourceToken, confidence, method) {
  displayToken.alignedSourceTokenIds = [sourceToken.id];
  displayToken.confidence = confidence;
  displayToken.method = method;
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
      alignTokenToSourceToken(displayTokens[i], sourceTokens[i], confidence, method);
    }
  }
}

function alignRemainingSacredTokensToAnyDivineSource(canonical) {
  const divineSourceTokens = canonical.sourceTokens.filter((token) =>
    [
        "hebrew:H3050", // Yah / Jah
      "hebrew:H3068", // YHWH
      "hebrew:H3069", // YHWH variant
      "hebrew:H430",  // Elohim
      "hebrew:H426",  // Elah
      "hebrew:H136",  // Adonai
      "hebrew:H113",  // Adon/master
      "hebrew:H410",  // El
      "hebrew:H433",  // Eloah
    ].includes(token.entityId)
  );

  if (!divineSourceTokens.length) return;

 const sacredWords = ["lord", "yah", "jah", "yahweh", "jehovah", "god", "elohim", "adonai"];

  for (const translationData of Object.values(canonical.translations)) {
    const remaining = translationData.tokens.filter(
      (token) =>
        !token.alignedSourceTokenIds.length &&
        sacredWords.includes(token.normalized)
    );

    for (let i = 0; i < remaining.length; i += 1) {
      const sourceToken = divineSourceTokens[i % divineSourceTokens.length];

      alignTokenToSourceToken(
        remaining[i],
        sourceToken,
        "medium",
        "sacred-name-remaining-divine-token-match"
      );
    }
  }
}

function applyAdonaiYhwhPairs(canonical) {
  const adonaiTokens = getSourceTokens(canonical, "hebrew:H136");
  const yhwhVariantTokens = getSourceTokens(canonical, "hebrew:H3069");
  const yhwhTokens = getSourceTokens(canonical, "hebrew:H3068");

  const divinePairTokens = [...adonaiTokens, ...yhwhVariantTokens];

  if (divinePairTokens.length < 2) return;

  for (const translationData of Object.values(canonical.translations)) {
    const lordGodTokens = translationData.tokens.filter(
      (token) =>
        !token.alignedSourceTokenIds.length &&
        ["lord", "god", "yahweh", "adonai"].includes(token.normalized)
    );

    const pairCount = Math.min(lordGodTokens.length, divinePairTokens.length);

    for (let i = 0; i < pairCount; i += 1) {
      alignTokenToSourceToken(
        lordGodTokens[i],
        divinePairTokens[i],
        "high",
        "sacred-name-adonai-yhwh-pair"
      );
    }
  }

  // If H3069 appears without H136 in a verse, treat it as divine-name variant.
  if (!adonaiTokens.length && yhwhVariantTokens.length) {
    alignTokens({
      canonical,
      entityId: "hebrew:H3069",
      normalizedWords: ["god", "lord", "yahweh", "jehovah"],
      confidence: "high",
      method: "sacred-name-yhwh-variant-match",
    });
  }

  if (yhwhTokens.length) {
    alignTokens({
      canonical,
      entityId: "hebrew:H3068",
      normalizedWords: ["lord", "yahweh", "jehovah"],
      confidence: "high",
      method: "sacred-name-yhwh-match",
    });
  }
}

function applySacredNamesStrategy(canonicalByVerse) {
  for (const canonical of Object.values(canonicalByVerse)) {
    applyAdonaiYhwhPairs(canonical);

    alignTokens({
      canonical,
      entityId: "hebrew:H3068",
      normalizedWords: ["lord", "yahweh", "jehovah"],
      confidence: "high",
      method: "sacred-name-yhwh-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H3069",
      normalizedWords: ["god", "lord", "yahweh", "jehovah"],
      confidence: "high",
      method: "sacred-name-yhwh-variant-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H430",
      normalizedWords: ["god", "gods", "elohim"],
      confidence: "high",
      method: "sacred-name-elohim-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H426",
      normalizedWords: ["god", "elah"],
      confidence: "high",
      method: "sacred-name-elah-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H410",
      normalizedWords: ["god", "el"],
      confidence: "high",
      method: "sacred-name-el-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H433",
      normalizedWords: ["god", "eloah"],
      confidence: "high",
      method: "sacred-name-eloah-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H136",
      normalizedWords: ["lord", "adonai"],
      confidence: "high",
      method: "sacred-title-adonai-match",
    });

    alignTokens({
      canonical,
      entityId: "hebrew:H113",
      normalizedWords: ["lord", "master", "adon"],
      confidence: "medium",
      method: "sacred-title-adon-match",
    });

    alignTokens({
  canonical,
  entityId: "hebrew:H3050",
  normalizedWords: ["yah", "jah", "yahweh", "lord"],
  confidence: "high",
  method: "sacred-name-yah-match",
});

    alignRemainingSacredTokensToAnyDivineSource(canonical);
  }
}

module.exports = { applySacredNamesStrategy };