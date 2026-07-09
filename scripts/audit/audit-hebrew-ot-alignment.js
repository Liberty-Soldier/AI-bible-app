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
const reportPath = path.join(reportDir, "hebrew-ot-alignment-audit.json");

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

const HIGH_VALUE = new Set([
  "lord",
  "god",
  "elohim",
  "yahweh",
  "spirit",
  "holy",
  "sin",
  "sins",
  "sinned",
  "covenant",
  "sabbath",
  "law",
  "torah",
  "commandment",
  "commandments",
  "statute",
  "statutes",
  "judgment",
  "judgments",
  "righteous",
  "righteousness",
  "wicked",
  "priest",
  "priests",
  "king",
  "kingdom",
  "messiah",
  "anointed",
  "seed",
  "light",
  "darkness",
  "formless",
  "void",
  "empty",
  "earth",
  "heaven",
  "heavens",
  "life",
  "death",
  "blood",
  "sacrifice",
  "altar",
  "temple",
  "tabernacle",
]);

const IGNORE_UNALIGNED = new Set([
  "the",
  "of",
  "and",
  "to",
  "in",
  "a",
  "an",
  "that",
  "this",
  "these",
  "those",
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
]);

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

function top(map, limit = 50) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function sample(samples, name, value, limit = 100) {
  if (samples[name].length < limit) {
    samples[name].push(value);
  }
}

function main() {
  if (!fs.existsSync(canonicalRoot)) {
    throw new Error(`Missing canonical root: ${canonicalRoot}`);
  }

  const seeRecords = getSeeRecords();

  const files = fs
    .readdirSync(canonicalRoot)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => OT_BOOK_FILES.has(file))
    .map((file) => path.join(canonicalRoot, file));

  const stats = {
    otBookFiles: files.length,
    seeRecordCount: Object.keys(seeRecords).length,

    verses: 0,
    sourceTokens: 0,
    sourceTokensMissingSee: 0,

    translationTokens: 0,
    alignedTranslationTokens: 0,
    unalignedTranslationTokens: 0,

    actionableUnalignedTokens: 0,

    highValueTokens: 0,
    highValueAlignedTokens: 0,
    highValueUnalignedTokens: 0,

    weakOrLowConfidenceTokens: 0,
    mediumConfidenceTokens: 0,

    alignedToMissingSourceToken: 0,
    alignedToSourceTokenMissingSee: 0,
  };

  const topUnalignedWords = {};
  const topActionableUnalignedWords = {};
  const topHighValueUnalignedWords = {};
  const topMissingSeeEntities = {};

  const samples = {
    highValueUnalignedTokens: [],
    actionableUnalignedTokens: [],
    weakOrLowConfidenceTokens: [],
    mediumConfidenceTokens: [],
    alignedToMissingSourceToken: [],
    alignedToSourceTokenMissingSee: [],
    sourceTokensMissingSee: [],
  };

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const bookData = readJson(filePath, {});

    for (const [verseKey, verseData] of Object.entries(bookData)) {
      stats.verses += 1;

      const sourceTokens = Array.isArray(verseData.sourceTokens)
        ? verseData.sourceTokens
        : [];

      const sourceById = new Map();

      for (const sourceToken of sourceTokens) {
        stats.sourceTokens += 1;

        if (sourceToken.id) {
          sourceById.set(sourceToken.id, sourceToken);
        }

        if (!seeHasEntity(seeRecords, sourceToken.entityId)) {
          stats.sourceTokensMissingSee += 1;
          increment(topMissingSeeEntities, sourceToken.entityId);

          sample(samples, "sourceTokensMissingSee", {
            file: fileName,
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
          const isIgnored = IGNORE_UNALIGNED.has(word);

          if (isHighValue) {
            stats.highValueTokens += 1;
          }

          const alignedIds = Array.isArray(token.alignedSourceTokenIds)
            ? token.alignedSourceTokenIds
            : [];

          if (alignedIds.length === 0) {
            stats.unalignedTranslationTokens += 1;
            increment(topUnalignedWords, word);

            if (!isIgnored) {
              stats.actionableUnalignedTokens += 1;
              increment(topActionableUnalignedWords, word);

              sample(samples, "actionableUnalignedTokens", {
                file: fileName,
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
              });
            }

            if (isHighValue) {
              stats.highValueUnalignedTokens += 1;
              increment(topHighValueUnalignedWords, word);

              sample(samples, "highValueUnalignedTokens", {
                file: fileName,
                reference: verseData.reference || verseKey,
                translation: translationKey,
                tokenIndex: token.index,
                text: token.text,
              });
            }

            continue;
          }

          stats.alignedTranslationTokens += 1;

          if (isHighValue) {
            stats.highValueAlignedTokens += 1;
          }

          if (token.confidence === "weak" || token.confidence === "low") {
            stats.weakOrLowConfidenceTokens += 1;

            sample(samples, "weakOrLowConfidenceTokens", {
              file: fileName,
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

            sample(samples, "mediumConfidenceTokens", {
              file: fileName,
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

              sample(samples, "alignedToMissingSourceToken", {
                file: fileName,
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

              sample(samples, "alignedToSourceTokenMissingSee", {
                file: fileName,
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
      actionableUnalignedRate:
        stats.translationTokens > 0
          ? Number(
              (
                stats.actionableUnalignedTokens / stats.translationTokens
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
    topActionableUnalignedWords: top(topActionableUnalignedWords),
    topHighValueUnalignedWords: top(topHighValueUnalignedWords),
    topMissingSeeEntities: top(topMissingSeeEntities),
    samples,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Hebrew OT alignment audit complete");
  console.log(`OT book files: ${stats.otBookFiles}`);
  console.log(`SEE records: ${stats.seeRecordCount}`);
  console.log(`Verses: ${stats.verses}`);
  console.log(`Source tokens: ${stats.sourceTokens}`);
  console.log(`Source tokens missing SEE: ${stats.sourceTokensMissingSee}`);
  console.log(`Translation tokens: ${stats.translationTokens}`);
  console.log(`Aligned tokens: ${stats.alignedTranslationTokens}`);
  console.log(`Unaligned tokens: ${stats.unalignedTranslationTokens}`);
  console.log(`Actionable unaligned tokens: ${stats.actionableUnalignedTokens}`);
  console.log(`High-value tokens: ${stats.highValueTokens}`);
  console.log(`High-value aligned: ${stats.highValueAlignedTokens}`);
  console.log(`High-value unaligned: ${stats.highValueUnalignedTokens}`);
  console.log(`Weak/low confidence tokens: ${stats.weakOrLowConfidenceTokens}`);
  console.log(`Medium confidence tokens: ${stats.mediumConfidenceTokens}`);
  console.log(`Report written: ${reportPath}`);
}

main();