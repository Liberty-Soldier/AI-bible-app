const HIGH_VALUE_FAMILIES = {
  // righteousness / justice / righteous
  H6662: ["righteous", "righteousness", "just", "justice"],
  H6663: ["righteous", "righteousness", "just", "justice"],
  H6664: ["righteous", "righteousness", "just", "justice"],
  H6665: ["righteous", "righteousness", "just", "justice"],
  H6666: ["righteous", "righteousness", "just", "justice"],

  // judgments / justice / ordinances
  H4941: ["judgment", "judgments", "justice", "ordinance", "ordinances"],

  // commandments / statutes / law
  H4687: ["commandment", "commandments", "command", "commands", "commanded"],
  H2706: ["statute", "statutes", "ordinance", "ordinances"],
  H2708: ["statute", "statutes", "ordinance", "ordinances"],
  H8451: ["law", "torah", "instruction"],

  // sin
  H2398: ["sin", "sins", "sinned", "sinning"],
  H2401: ["sin", "sins", "sinned"],
  H2403: ["sin", "sins", "offering", "sin offering"],
  H2404: ["sin", "sins", "sinful"],

  // holy
  H6918: ["holy", "holiness"],
  H6942: ["holy", "sanctify", "sanctified", "sanctuary"],
  H6944: ["holy", "holiness", "sanctuary"],

  // priest
  H3548: ["priest", "priests"],
  H3550: ["priest", "priests", "priesthood"],

  // covenant
  H1285: ["covenant", "covenants"],

  // life / live
  H2416: ["life", "living", "alive"],
  H2421: ["life", "live", "lived", "living"],
  H2425: ["life", "live", "lived", "living"],
  H5315: ["life", "soul", "person"],

  // death / die
  H4191: ["death", "die", "died", "dead"],
  H4194: ["death", "dead"],

  // blood
  H1818: ["blood"],

  // kingdom / king
  H4427: ["king", "reign", "reigned", "kingdom"],
  H4428: ["king", "kings"],
  H4438: ["kingdom", "royal"],
  H4467: ["kingdom", "realm"],

  // sacrifice / altar / temple / tabernacle
  H2076: ["sacrifice", "sacrifices", "offering"],
  H2077: ["sacrifice", "sacrifices", "offering"],
  H4196: ["altar", "altars"],
  H1964: ["temple", "palace"],
  H168: ["tent", "tabernacle"],
  H4908: ["tabernacle", "dwelling"],

  // light / darkness / heaven / earth / seed
  H216: ["light"],
  H2822: ["darkness"],
  H8064: ["heaven", "heavens", "sky"],
  H776: ["earth", "land"],
  H2233: ["seed", "offspring"],
};

function normalizeWord(value) {
  return String(value || "").toLowerCase().trim();
}

function alignToken(displayToken, sourceToken, method) {
  displayToken.alignedSourceTokenIds = [sourceToken.id];
  displayToken.confidence = "medium";
  displayToken.method = method;
}

function applyHighValueLexicalFamiliesStrategy(canonicalByVerse) {
  for (const canonical of Object.values(canonicalByVerse)) {
    const sourceTokens = (canonical.sourceTokens || []).filter(
      (token) => token?.strong && HIGH_VALUE_FAMILIES[token.strong]
    );

    if (!sourceTokens.length) continue;

    for (const translationData of Object.values(canonical.translations || {})) {
      for (const sourceToken of sourceTokens) {
        const words = HIGH_VALUE_FAMILIES[sourceToken.strong] || [];

        const displayToken = (translationData.tokens || []).find(
          (token) =>
            !token.alignedSourceTokenIds?.length &&
            words.includes(normalizeWord(token.normalized || token.text))
        );

        if (!displayToken) continue;

        alignToken(
          displayToken,
          sourceToken,
          `high-value-lexical-family-${sourceToken.strong}`
        );
      }
    }
  }
}

module.exports = { applyHighValueLexicalFamiliesStrategy };