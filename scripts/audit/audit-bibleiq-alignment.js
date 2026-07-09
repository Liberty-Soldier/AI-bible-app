const fs = require("fs");
const path = require("path");

const root = process.cwd();

const canonicalRoot = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "hebrew"
);

const seePath = path.join(
  root,
  "public",
  "data",
  "see",
  "lite",
  "evidence-lite.json"
);

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "bibleiq-alignment-audit.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function getSeeRecords() {
  const raw = readJson(seePath, {});
  if (raw.records && typeof raw.records === "object") return raw.records;
  if (raw.evidence && typeof raw.evidence === "object") return raw.evidence;
  return raw;
}

function toSeeEvidenceId(id) {
  const raw = String(id || "").trim();

  if (!raw) return "";

  if (raw.startsWith("lemma:")) return raw;

  if (raw.startsWith("word:")) {
    return raw.replace(/^word:/, "lemma:");
  }

  if (raw.startsWith("hebrew:")) {
    return `lemma:${raw}`;
  }

  return raw;
}

function seeHasEntity(seeRecords, entityId) {
  const evidenceId = toSeeEvidenceId(entityId);
  return !!seeRecords[evidenceId];
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function top(map, limit = 40) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

const HIGH_VALUE = new Set([
  "lord",
  "god",
  "elohim",
  "yahweh",
  "spirit",
  "holy",
  "sin",
  "covenant",
  "sabbath",
  "law",
  "torah",
  "commandment",
  "commandments",
  "formless",
  "void",
  "empty",
  "light",
  "darkness",
  "seed",
  "life",
  "death",
  "blood",
  "altar",
  "priest",
  "king",
  "kingdom",
]);

function main() {
  if (!fs.existsSync(canonicalRoot)) {
    throw new Error(`Missing canonical root: ${canonicalRoot}`);
  }

  const seeRecords = getSeeRecords();

  const files = fs
    .readdirSync(canonicalRoot)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(canonicalRoot, file));

  const stats = {
    canonicalBookFiles: files.length,
    seeRecordCount: Object.keys(seeRecords).length,
    verses: 0,
    sourceTokens: 0,
    sourceTokensMissingEntityId: 0,
    sourceTokensMissingSee: 0,
    translationTokens: 0,
    alignedTranslationTokens: 0,
    unalignedTranslationTokens: 0,
    alignedToMissingSourceToken: 0,
    alignedToSourceTokenMissingSee: 0,
    highValueTokens: 0,
    highValueUnalignedTokens: 0,
    weakOrLowConfidenceTokens: 0,
    mediumConfidenceTokens: 0,
  };

  const topUnalignedWords = {};
  const topMissingSeeEntities = {};
  const topHighValueUnalignedWords = {};

  const samples = {
    unalignedTokens: [],
    highValueUnalignedTokens: [],
    sourceTokensMissingSee: [],
    alignedToMissingSourceToken: [],
    alignedToSourceTokenMissingSee: [],
    weakOrLowConfidenceTokens: [],
    mediumConfidenceTokens: [],
  };

  function sample(name, value, limit = 75) {
    if (samples[name].length < limit) samples[name].push(value);
  }

  for (const filePath of files) {
    const bookData = readJson(filePath, {});

    for (const [verseKey, verseData] of Object.entries(bookData)) {
      stats.verses += 1;

      const sourceTokens = Array.isArray(verseData.sourceTokens)
        ? verseData.sourceTokens
        : [];

      const sourceById = new Map();

      for (const sourceToken of sourceTokens) {
        stats.sourceTokens += 1;

        if (sourceToken.id) sourceById.set(sourceToken.id, sourceToken);

        if (!sourceToken.entityId) {
          stats.sourceTokensMissingEntityId += 1;
          continue;
        }

        if (!seeHasEntity(seeRecords, sourceToken.entityId)) {
          stats.sourceTokensMissingSee += 1;
          increment(topMissingSeeEntities, sourceToken.entityId);

          sample("sourceTokensMissingSee", {
            reference: verseData.reference || verseKey,
            entityId: sourceToken.entityId,
            surface: sourceToken.surface,
            lemma: sourceToken.lemma,
            strong: sourceToken.strong,
          });
        }
      }

      const translations = verseData.translations || {};

      for (const [translationKey, translationData] of Object.entries(
        translations
      )) {
        const tokens = Array.isArray(translationData.tokens)
          ? translationData.tokens
          : [];

        for (const token of tokens) {
          stats.translationTokens += 1;

          const word = normalize(token.text);
          const isHighValue = HIGH_VALUE.has(word);

          if (isHighValue) stats.highValueTokens += 1;

          const alignedIds = Array.isArray(token.alignedSourceTokenIds)
            ? token.alignedSourceTokenIds
            : [];

          if (alignedIds.length === 0) {
            stats.unalignedTranslationTokens += 1;
            increment(topUnalignedWords, word);

            sample("unalignedTokens", {
              reference: verseData.reference || verseKey,
              translation: translationKey,
              tokenIndex: token.index,
              text: token.text,
            });

            if (isHighValue) {
              stats.highValueUnalignedTokens += 1;
              increment(topHighValueUnalignedWords, word);

              sample("highValueUnalignedTokens", {
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
              });
            }

            continue;
          }

          stats.alignedTranslationTokens += 1;

          if (token.confidence === "weak" || token.confidence === "low") {
            stats.weakOrLowConfidenceTokens += 1;
            sample("weakOrLowConfidenceTokens", {
              reference: verseData.reference || verseKey,
              translation: translationKey,
              tokenIndex: token.index,
              text: token.text,
              confidence: token.confidence,
              method: token.method,
              alignedSourceTokenIds: alignedIds,
            });
          }

          if (token.confidence === "medium") {
            stats.mediumConfidenceTokens += 1;
            sample("mediumConfidenceTokens", {
              reference: verseData.reference || verseKey,
              translation: translationKey,
              tokenIndex: token.index,
              text: token.text,
              confidence: token.confidence,
              method: token.method,
              alignedSourceTokenIds: alignedIds,
            });
          }

          for (const alignedId of alignedIds) {
            const sourceToken = sourceById.get(alignedId);

            if (!sourceToken) {
              stats.alignedToMissingSourceToken += 1;

              sample("alignedToMissingSourceToken", {
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
                alignedId,
              });

              continue;
            }

            if (!seeHasEntity(seeRecords, sourceToken.entityId)) {
              stats.alignedToSourceTokenMissingSee += 1;

              sample("alignedToSourceTokenMissingSee", {
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
                sourceToken,
              });
            }
          }
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    canonicalRoot,
    seePath,
    stats,
    rates: {
      alignedTranslationTokenRate:
        stats.translationTokens > 0
          ? Number(
              (stats.alignedTranslationTokens / stats.translationTokens).toFixed(
                4
              )
            )
          : 0,
      unalignedTranslationTokenRate:
        stats.translationTokens > 0
          ? Number(
              (
                stats.unalignedTranslationTokens / stats.translationTokens
              ).toFixed(4)
            )
          : 0,
      highValueUnalignedRate:
        stats.highValueTokens > 0
          ? Number(
              (
                stats.highValueUnalignedTokens / stats.highValueTokens
              ).toFixed(4)
            )
          : 0,
    },
    topUnalignedWords: top(topUnalignedWords),
    topMissingSeeEntities: top(topMissingSeeEntities),
    topHighValueUnalignedWords: top(topHighValueUnalignedWords),
    samples,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("BibleIQ alignment audit complete");
  console.log(`Canonical book files: ${stats.canonicalBookFiles}`);
  console.log(`SEE records: ${stats.seeRecordCount}`);
  console.log(`Verses: ${stats.verses}`);
  console.log(`Source tokens: ${stats.sourceTokens}`);
  console.log(`Source tokens missing SEE: ${stats.sourceTokensMissingSee}`);
  console.log(`Translation tokens: ${stats.translationTokens}`);
  console.log(`Aligned tokens: ${stats.alignedTranslationTokens}`);
  console.log(`Unaligned tokens: ${stats.unalignedTranslationTokens}`);
  console.log(`High-value tokens: ${stats.highValueTokens}`);
  console.log(`High-value unaligned: ${stats.highValueUnalignedTokens}`);
  console.log(`Weak/low confidence tokens: ${stats.weakOrLowConfidenceTokens}`);
  console.log(`Medium confidence tokens: ${stats.mediumConfidenceTokens}`);
  console.log(`Report written: ${reportPath}`);
}

main();