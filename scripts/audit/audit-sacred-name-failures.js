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

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "sacred-name-failures.json");

const OT_BOOK_FILES = new Set([
  "Gen.json",
  "Exod.json",
  "Lev.json",
  "Num.json",
  "Deut.json",
  "Josh.json",
  "Judg.json",
  "Ruth.json",
  "1Sam.json",
  "2Sam.json",
  "1Kgs.json",
  "2Kgs.json",
  "1Chr.json",
  "2Chr.json",
  "Ezra.json",
  "Neh.json",
  "Esth.json",
  "Job.json",
  "Ps.json",
  "Prov.json",
  "Eccl.json",
  "Song.json",
  "Isa.json",
  "Jer.json",
  "Lam.json",
  "Ezek.json",
  "Dan.json",
  "Hos.json",
  "Joel.json",
  "Amos.json",
  "Obad.json",
  "Jonah.json",
  "Mic.json",
  "Nah.json",
  "Hab.json",
  "Zeph.json",
  "Hag.json",
  "Zech.json",
  "Mal.json",
]);

const SACRED_WORDS = new Set([
  "lord",
  "yahweh",
  "god",
  "elohim",
  "jehovah",
  "yah",
"jah",
]);

const DIVINE_ENTITY_IDS = new Set([
    "hebrew:H3050", // Yah / Jah
  "hebrew:H3068", // YHWH
  "hebrew:H3069", // YHWH variant
  "hebrew:H430",  // Elohim
  "hebrew:H433",  // Eloah / God
  "hebrew:H410",  // El
  "hebrew:H136",  // Adonai
  "hebrew:H113",  // adon / lord/master
  "hebrew:H426",  // Aramaic Elah / God
]);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function top(map, limit = 50) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function sample(samples, key, value, limit = 100) {
  if (samples[key].length < limit) samples[key].push(value);
}

function main() {
  const files = fs
    .readdirSync(canonicalRoot)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => OT_BOOK_FILES.has(file))
    .map((file) => path.join(canonicalRoot, file));

  const stats = {
    files: files.length,
    sacredTokens: 0,
    sacredAligned: 0,
    sacredUnaligned: 0,

    unalignedButVerseHasDivineSource: 0,
    unalignedAndVerseHasNoDivineSource: 0,

    alignedToNonDivineSource: 0,
  };

  const byWord = {};
  const byBook = {};
  const byMissingSourceProfile = {};

  const samples = {
    unalignedButVerseHasDivineSource: [],
    unalignedAndVerseHasNoDivineSource: [],
    alignedToNonDivineSource: [],
  };

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const bookData = readJson(filePath, {});

    for (const [verseKey, verseData] of Object.entries(bookData)) {
      const sourceTokens = Array.isArray(verseData.sourceTokens)
        ? verseData.sourceTokens
        : [];

      const sourceById = new Map(
        sourceTokens.map((token) => [token.id, token])
      );

      const divineSourceTokens = sourceTokens.filter((token) =>
        DIVINE_ENTITY_IDS.has(token.entityId)
      );

      const divineProfile = divineSourceTokens
        .map((token) => `${token.entityId}:${token.surface}`)
        .join(" | ") || "none";

      for (const [translationKey, translationData] of Object.entries(
        verseData.translations || {}
      )) {
        const tokens = Array.isArray(translationData.tokens)
          ? translationData.tokens
          : [];

        for (const token of tokens) {
          if (!SACRED_WORDS.has(token.normalized)) continue;

          stats.sacredTokens += 1;
          increment(byWord, token.normalized);
          increment(byBook, fileName.replace(/\.json$/, ""));

          const alignedIds = Array.isArray(token.alignedSourceTokenIds)
            ? token.alignedSourceTokenIds
            : [];

          if (!alignedIds.length) {
            stats.sacredUnaligned += 1;

            if (divineSourceTokens.length) {
              stats.unalignedButVerseHasDivineSource += 1;

              sample(samples, "unalignedButVerseHasDivineSource", {
                file: fileName,
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
                normalized: token.normalized,
                divineSourceTokens: divineSourceTokens.map((sourceToken) => ({
                  id: sourceToken.id,
                  surface: sourceToken.surface,
                  lemma: sourceToken.lemma,
                  strong: sourceToken.strong,
                  entityId: sourceToken.entityId,
                })),
              });
            } else {
              stats.unalignedAndVerseHasNoDivineSource += 1;
              increment(byMissingSourceProfile, divineProfile);

              sample(samples, "unalignedAndVerseHasNoDivineSource", {
                file: fileName,
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
                normalized: token.normalized,
                translationText: translationData.text,
                sourceStrongList: sourceTokens.map((sourceToken) => ({
                  surface: sourceToken.surface,
                  strong: sourceToken.strong,
                  entityId: sourceToken.entityId,
                })),
              });
            }

            continue;
          }

          stats.sacredAligned += 1;

          for (const alignedId of alignedIds) {
            const sourceToken = sourceById.get(alignedId);

            if (!sourceToken) continue;

            if (!DIVINE_ENTITY_IDS.has(sourceToken.entityId)) {
              stats.alignedToNonDivineSource += 1;

              sample(samples, "alignedToNonDivineSource", {
                file: fileName,
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
                normalized: token.normalized,
                alignedId,
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
    stats,
    topSacredWords: top(byWord),
    topBooks: top(byBook),
    topMissingSourceProfiles: top(byMissingSourceProfile),
    samples,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Sacred-name failure audit complete");
  console.log(`Sacred tokens: ${stats.sacredTokens}`);
  console.log(`Sacred aligned: ${stats.sacredAligned}`);
  console.log(`Sacred unaligned: ${stats.sacredUnaligned}`);
  console.log(
    `Unaligned but verse has divine source: ${stats.unalignedButVerseHasDivineSource}`
  );
  console.log(
    `Unaligned and verse has no divine source: ${stats.unalignedAndVerseHasNoDivineSource}`
  );
  console.log(`Aligned to non-divine source: ${stats.alignedToNonDivineSource}`);
  console.log(`Report written: ${reportPath}`);
}

main();