const fs = require("fs");
const path = require("path");
const config = require("./config");
const { tokenizeDisplayText } = require("./utils/tokenize");
const {
  parseSourceReference,
  toVerseKey,
  getEvidenceBook,
  mapSourceReferenceToCanonicalReference,
} = require("./utils/references");
const { applyProperNamesStrategy } = require("./strategies/properNames");
const { applySacredNamesStrategy } = require("./strategies/sacredNames");
const { applyExactWordsStrategy } = require("./strategies/exactWords");
const { applyMorphologyStrategy } = require("./strategies/morphology");
const { applyHighValueLexicalFamiliesStrategy } = require("./strategies/highValueLexicalFamilies");
const { reconcileWeakSourceCollisions } = require("./strategies/weakSourceCollisions");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function getOrCreateVerse(canonicalByVerse, source, book, chapter, verse) {
  const verseKey = toVerseKey(book, chapter, verse);

  if (!canonicalByVerse[verseKey]) {
    canonicalByVerse[verseKey] = {
      reference: verseKey,
      book,
      chapter,
      verse,
      source,
      sourceTokens: [],
      translations: {},
    };
  }

  return canonicalByVerse[verseKey];
}

function addSourceTokens(canonicalByVerse, corpusConfig, lexicon) {
  for (const entry of lexicon) {
    if (!entry?.strong) continue;

    for (const occurrence of entry.occurrences || []) {
      const parsed = parseSourceReference(occurrence.reference);
if (!parsed) continue;

const canonicalRef = mapSourceReferenceToCanonicalReference(
  corpusConfig.source,
  parsed
);

if (!canonicalRef) continue;

const canonical = getOrCreateVerse(
  canonicalByVerse,
  corpusConfig.source,
  canonicalRef.book,
  canonicalRef.chapter,
  canonicalRef.verse
);

      const sourceTokenIndex = canonical.sourceTokens.length;

canonical.sourceTokens.push({
  id: `${corpusConfig.source}:${canonical.reference}:${sourceTokenIndex}`,
  index: sourceTokenIndex,
  source: corpusConfig.source,
  surface: occurrence.surface || "",
  lemma: entry.lemma || "",
  strong: entry.strong,
  entityId: `${corpusConfig.source}:${entry.strong}`,
  morph: occurrence.morph || "",

  sourceReference: toVerseKey(parsed.book, parsed.chapter, parsed.verse),
  canonicalReference: canonical.reference,
  versificationRuleId: canonicalRef.ruleId || null,
});
    }
  }
}

function addTranslationTokens(canonicalByVerse, corpusConfig, translation) {
  const verses = readJson(translation.file);

  for (const verse of verses) {
    const book = getEvidenceBook(verse.book);
    const verseKey = toVerseKey(book, verse.chapter, verse.verse);

    // Important:
    // Do not create source-less canonical verses from translations.
    // A source-owned corpus must only receive translations for verses
    // that already exist from source tokens.
    const canonical = canonicalByVerse[verseKey];

    if (!canonical?.sourceTokens?.length) continue;

    canonical.translations[translation.id] = {
      text: getVerseText(verse),
      tokens: tokenizeDisplayText(getVerseText(verse)),
    };
  }
}

function writeCorpus(corpusId, canonicalByVerse) {
  const outputDir = path.join(config.outputRoot, corpusId);
  ensureDir(outputDir);

  const byBook = {};

  for (const [verseKey, canonical] of Object.entries(canonicalByVerse)) {
    if (!byBook[canonical.book]) byBook[canonical.book] = {};
    byBook[canonical.book][verseKey] = canonical;
  }

  for (const [book, data] of Object.entries(byBook)) {
    fs.writeFileSync(
      path.join(outputDir, `${book}.json`),
      JSON.stringify(data),
      "utf8"
    );
  }

  return {
    verses: Object.keys(canonicalByVerse).length,
    books: Object.keys(byBook).length,
    outputDir,
  };
}

function buildCorpus(corpusId, corpusConfig) {
const lexicon = readJson(corpusConfig.lexiconFile);
const alignmentIndex = readJson(corpusConfig.alignmentIndexFile);
const canonicalByVerse = {};

  addSourceTokens(canonicalByVerse, corpusConfig, lexicon);

  for (const translation of corpusConfig.translations) {
    addTranslationTokens(canonicalByVerse, corpusConfig, translation);
  }

applySacredNamesStrategy(canonicalByVerse);
applyProperNamesStrategy(canonicalByVerse, lexicon);
applyExactWordsStrategy(canonicalByVerse, lexicon);
applyMorphologyStrategy(canonicalByVerse, alignmentIndex);
applyHighValueLexicalFamiliesStrategy(canonicalByVerse);

reconcileWeakSourceCollisions(canonicalByVerse, lexicon, {

  translationIds: ["kjv"],

  minRemoteDisplayDistance: 5,

});

  const result = writeCorpus(corpusId, canonicalByVerse);

  console.log(`Built canonical corpus: ${corpusId}`);
  console.log(result);
}

function main() {
  for (const [corpusId, corpusConfig] of Object.entries(config.corpora)) {
    buildCorpus(corpusId, corpusConfig);
  }
}

main();