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
const reportPath = path.join(reportDir, "verse-pair-integrity-audit.json");

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
  "yah",
  "jah",
  "yahweh",
  "jehovah",
  "god",
  "elohim",
]);

const DIVINE_ENTITY_IDS = new Set([
  "hebrew:H3050", // Yah / Jah
  "hebrew:H3068", // YHWH
  "hebrew:H3069", // YHWH variant
  "hebrew:H430",  // Elohim
  "hebrew:H433",  // Eloah
  "hebrew:H410",  // El
  "hebrew:H136",  // Adonai
  "hebrew:H113",  // adon / lord / master
  "hebrew:H426",  // Aramaic Elah / God
]);

const HIGH_VALUE_WORDS = new Set([
  "lord",
  "yahweh",
  "jehovah",
  "god",
  "elohim",
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

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function top(map, limit = 50) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function parseVerseKey(reference) {
  const match = String(reference || "").match(/^([1-3]?[A-Za-z]+):(\d+):(\d+)$/);
  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function getSourceProfile(sourceTokens) {
  return sourceTokens.map((token) => ({
    id: token.id,
    surface: token.surface,
    lemma: token.lemma,
    strong: token.strong,
    entityId: token.entityId,
    sourceReference: token.sourceReference,
    canonicalReference: token.canonicalReference,
    versificationRuleId: token.versificationRuleId,
  }));
}

function getDivineSourceTokens(sourceTokens) {
  return sourceTokens.filter((token) => DIVINE_ENTITY_IDS.has(token.entityId));
}

function countAlignedTokens(tokens) {
  return tokens.filter(
    (token) =>
      Array.isArray(token.alignedSourceTokenIds) &&
      token.alignedSourceTokenIds.length > 0
  ).length;
}

function getTranslationSignals(translationKey, translationData, sourceTokens) {
  const tokens = Array.isArray(translationData.tokens)
    ? translationData.tokens
    : [];

  const divineSourceTokens = getDivineSourceTokens(sourceTokens);

  const sacredTokens = tokens.filter((token) =>
    SACRED_WORDS.has(token.normalized)
  );

  const highValueTokens = tokens.filter((token) =>
    HIGH_VALUE_WORDS.has(token.normalized)
  );

  const unalignedSacredTokens = sacredTokens.filter(
    (token) =>
      !Array.isArray(token.alignedSourceTokenIds) ||
      token.alignedSourceTokenIds.length === 0
  );

  const unalignedHighValueTokens = highValueTokens.filter(
    (token) =>
      !Array.isArray(token.alignedSourceTokenIds) ||
      token.alignedSourceTokenIds.length === 0
  );

  const alignedCount = countAlignedTokens(tokens);

  const alignedRate =
    tokens.length > 0 ? Number((alignedCount / tokens.length).toFixed(4)) : 0;

  const sacredNoSource =
    sacredTokens.length > 0 && divineSourceTokens.length === 0;

  const sacredUnalignedDespiteSource =
    unalignedSacredTokens.length > 0 && divineSourceTokens.length > 0;

  const veryLowAlignment =
    tokens.length >= 10 && sourceTokens.length >= 5 && alignedRate < 0.12;

  let score = 0;

  if (sacredNoSource) score += 20 + sacredTokens.length * 5;
  if (sacredUnalignedDespiteSource) score += 8 + unalignedSacredTokens.length * 3;
  if (veryLowAlignment) score += 6;
  if (unalignedHighValueTokens.length >= 3) score += unalignedHighValueTokens.length;

  return {
    translation: translationKey,
    text: translationData.text || "",
    tokenCount: tokens.length,
    alignedCount,
    alignedRate,

    sacredTokens: sacredTokens.map((token) => ({
      index: token.index,
      text: token.text,
      normalized: token.normalized,
      alignedSourceTokenIds: token.alignedSourceTokenIds || [],
      method: token.method,
      confidence: token.confidence,
    })),

    unalignedSacredTokens: unalignedSacredTokens.map((token) => ({
      index: token.index,
      text: token.text,
      normalized: token.normalized,
    })),

    unalignedHighValueTokens: unalignedHighValueTokens.map((token) => ({
      index: token.index,
      text: token.text,
      normalized: token.normalized,
    })),

    flags: {
      sacredNoSource,
      sacredUnalignedDespiteSource,
      veryLowAlignment,
    },

    score,
  };
}

function groupSuspiciousVerses(suspiciousVerses) {
  const byBookChapter = new Map();

  for (const item of suspiciousVerses) {
    const key = `${item.book}:${item.chapter}`;

    if (!byBookChapter.has(key)) {
      byBookChapter.set(key, []);
    }

    byBookChapter.get(key).push(item);
  }

  const groups = [];

  for (const [key, items] of byBookChapter.entries()) {
    items.sort((a, b) => a.verse - b.verse);

    let current = null;

    for (const item of items) {
      if (
        !current ||
        item.verse !== current.endVerse + 1
      ) {
        if (current) groups.push(current);

        current = {
          key,
          book: item.book,
          chapter: item.chapter,
          startVerse: item.verse,
          endVerse: item.verse,
          count: 1,
          score: item.score,
          references: [item.reference],
          reasons: new Set(item.reasons),
          sample: item,
        };

        continue;
      }

      current.endVerse = item.verse;
      current.count += 1;
      current.score += item.score;
      current.references.push(item.reference);

      for (const reason of item.reasons) {
        current.reasons.add(reason);
      }
    }

    if (current) groups.push(current);
  }

  return groups
    .map((group) => ({
      ...group,
      reasons: Array.from(group.reasons),
    }))
    .sort((a, b) => b.score - a.score);
}

function main() {
  if (!fs.existsSync(canonicalRoot)) {
    throw new Error(`Missing canonical root: ${canonicalRoot}`);
  }

  const files = fs
    .readdirSync(canonicalRoot)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => OT_BOOK_FILES.has(file))
    .map((file) => path.join(canonicalRoot, file));

  const stats = {
    files: files.length,
    verses: 0,
    translationsChecked: 0,

    suspiciousVerses: 0,
    suspiciousTranslations: 0,

    sacredNoSourceTranslations: 0,
    sacredUnalignedDespiteSourceTranslations: 0,
    veryLowAlignmentTranslations: 0,
    highValueUnalignedTranslations: 0,
  };

  const byBook = {};
  const byBookChapter = {};
  const byReason = {};

  const suspiciousVerses = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const bookData = readJson(filePath, {});

    for (const [verseKey, verseData] of Object.entries(bookData)) {
      const parsed = parseVerseKey(verseData.reference || verseKey);
      if (!parsed) continue;

      stats.verses += 1;

      const sourceTokens = Array.isArray(verseData.sourceTokens)
        ? verseData.sourceTokens
        : [];

      const translations = verseData.translations || {};
      const translationSignals = [];

      let verseScore = 0;
      const reasons = new Set();

      for (const [translationKey, translationData] of Object.entries(translations)) {
        stats.translationsChecked += 1;

        const signals = getTranslationSignals(
          translationKey,
          translationData,
          sourceTokens
        );

        translationSignals.push(signals);

        if (signals.score > 0) {
          stats.suspiciousTranslations += 1;
          verseScore += signals.score;

          if (signals.flags.sacredNoSource) {
            stats.sacredNoSourceTranslations += 1;
            reasons.add("sacred-token-but-no-divine-source");
            increment(byReason, "sacred-token-but-no-divine-source");
          }

          if (signals.flags.sacredUnalignedDespiteSource) {
            stats.sacredUnalignedDespiteSourceTranslations += 1;
            reasons.add("sacred-token-unaligned-despite-divine-source");
            increment(byReason, "sacred-token-unaligned-despite-divine-source");
          }

          if (signals.flags.veryLowAlignment) {
            stats.veryLowAlignmentTranslations += 1;
            reasons.add("very-low-alignment-rate");
            increment(byReason, "very-low-alignment-rate");
          }

          if (signals.unalignedHighValueTokens.length >= 3) {
            stats.highValueUnalignedTranslations += 1;
            reasons.add("many-high-value-unaligned-tokens");
            increment(byReason, "many-high-value-unaligned-tokens");
          }
        }
      }

      if (verseScore <= 0) continue;

      stats.suspiciousVerses += 1;

      increment(byBook, parsed.book);
      increment(byBookChapter, `${parsed.book}:${parsed.chapter}`);

      suspiciousVerses.push({
        file: fileName,
        reference: verseData.reference || verseKey,
        book: parsed.book,
        chapter: parsed.chapter,
        verse: parsed.verse,
        score: verseScore,
        reasons: Array.from(reasons),
        sourceTokenCount: sourceTokens.length,
        divineSourceTokens: getDivineSourceTokens(sourceTokens).map((token) => ({
          id: token.id,
          surface: token.surface,
          lemma: token.lemma,
          strong: token.strong,
          entityId: token.entityId,
          sourceReference: token.sourceReference,
          canonicalReference: token.canonicalReference,
          versificationRuleId: token.versificationRuleId,
        })),
        sourceProfileSample: getSourceProfile(sourceTokens).slice(0, 25),
        translations: translationSignals,
      });
    }
  }

  const groups = groupSuspiciousVerses(suspiciousVerses);

  const report = {
    generatedAt: new Date().toISOString(),
    canonicalRoot,
    stats,
    topBooks: top(byBook),
    topBookChapters: top(byBookChapter, 75),
    topReasons: top(byReason),
    groups: groups.slice(0, 200),
suspiciousVerses: suspiciousVerses.sort((a, b) => b.score - a.score),
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Verse-pair integrity audit complete");
  console.log(`Files: ${stats.files}`);
  console.log(`Verses: ${stats.verses}`);
  console.log(`Translations checked: ${stats.translationsChecked}`);
  console.log(`Suspicious verses: ${stats.suspiciousVerses}`);
  console.log(`Suspicious translations: ${stats.suspiciousTranslations}`);
  console.log(`Sacred token but no divine source: ${stats.sacredNoSourceTranslations}`);
  console.log(
    `Sacred unaligned despite divine source: ${stats.sacredUnalignedDespiteSourceTranslations}`
  );
  console.log(`Very low alignment translations: ${stats.veryLowAlignmentTranslations}`);
  console.log(`Many high-value unaligned translations: ${stats.highValueUnalignedTranslations}`);
  console.log(`Report written: ${reportPath}`);
}

main();