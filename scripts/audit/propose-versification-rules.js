const fs = require("fs");
const path = require("path");
const { normalize } = require("../canonical/utils/normalize");

const root = process.cwd();

const canonicalRoot = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "hebrew"
);

const lexiconPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

const integrityReportPath = path.join(
  root,
  "reports",
  "verse-pair-integrity-audit.json"
);

const outputPath = path.join(
  root,
  "reports",
  "versification-rule-proposals.json"
);

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

const STOPWORDS = new Set([
  "the", "of", "and", "to", "in", "a", "an", "for", "with", "by", "from",
  "as", "at", "on", "unto", "into", "upon", "under", "over", "through",
  "than", "then", "there", "therefore", "so", "but", "or", "if", "when",
  "who", "whom", "which", "what", "where", "why", "how", "he", "she", "it",
  "they", "them", "him", "her", "his", "their", "my", "your", "our", "me",
  "you", "i", "we", "us", "thy", "thou", "thee", "ye", "hath", "hast",
  "shalt", "thine", "is", "are", "was", "were", "be", "been", "being",
  "shall", "will", "would", "should", "could", "may", "might", "must",
  "do", "does", "did", "not", "no", "nor", "very", "greatly"
]);

const SACRED_WORDS = new Set([
  "lord",
  "yahweh",
  "jehovah",
  "god",
  "elohim",
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
  "fire",
  "glory",
  "moses",
  "pharaoh",
  "jerusalem",
  "judah",
  "israel",
]);

const STRONG_OVERRIDES = {
  H3068: ["yahweh", "lord", "jehovah"],
  H3069: ["yahweh", "god", "lord"],
  H430: ["god", "gods", "elohim"],
  H426: ["god", "elah"],
  H136: ["lord", "adonai"],
  H113: ["lord", "master"],
  H410: ["god", "el"],
  H433: ["god", "eloah"],
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseRef(ref) {
  const match = String(ref || "").match(/^([1-3]?[A-Za-z]+):(\d+):(\d+)$/);
  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function refKey(book, chapter, verse) {
  return `${book}:${chapter}:${verse}`;
}

function sortRefs(a, b) {
  const pa = parseRef(a);
  const pb = parseRef(b);

  if (!pa || !pb) return String(a).localeCompare(String(b));
  if (pa.book !== pb.book) return pa.book.localeCompare(pb.book);
  if (pa.chapter !== pb.chapter) return pa.chapter - pb.chapter;
  return pa.verse - pb.verse;
}

function addCandidateWords(target, rawValue) {
  String(rawValue || "")
    .split(/[;,./()|[\]{}"'“”‘’:-]+/)
    .map(normalize)
    .filter(Boolean)
    .forEach((value) => {
      if (!value) return;

      for (const part of value.split(/\s+/)) {
        const clean = normalize(part);
        if (clean && clean.length > 1 && !STOPWORDS.has(clean)) {
          target.add(clean);
        }
      }

      if (!value.includes(" ") && value.length > 1 && !STOPWORDS.has(value)) {
        target.add(value);
      }
    });
}

function buildLexiconCandidateMap(lexicon) {
  const map = new Map();

  for (const entry of lexicon) {
    if (!entry?.strong) continue;

    const words = new Set();

    for (const word of STRONG_OVERRIDES[entry.strong] || []) {
      words.add(normalize(word));
    }

    addCandidateWords(words, entry.gloss);
    addCandidateWords(words, entry.shortDefinition);
    addCandidateWords(words, entry.usage);
    addCandidateWords(words, entry.transliteration);

    map.set(entry.strong, words);
  }

  return map;
}

function getTranslationTokens(verseData) {
  const tokens = [];

  for (const [translation, translationData] of Object.entries(
    verseData?.translations || {}
  )) {
    for (const token of translationData.tokens || []) {
      const normalized = normalize(token.normalized || token.text);

      if (!normalized) continue;
      if (STOPWORDS.has(normalized)) continue;
      if (normalized.length <= 1) continue;

      tokens.push({
        translation,
        text: token.text,
        normalized,
        weight:
          SACRED_WORDS.has(normalized) ? 12 :
          HIGH_VALUE_WORDS.has(normalized) ? 6 :
          2,
      });
    }
  }

  return tokens;
}

function buildCanonicalIndexes(lexiconCandidates) {
  const byTargetRef = new Map();
  const sourceByOriginalRef = new Map();
  const refsByBook = new Map();

  const files = fs
    .readdirSync(canonicalRoot)
    .filter((file) => OT_BOOK_FILES.has(file))
    .map((file) => path.join(canonicalRoot, file));

  for (const filePath of files) {
    const bookData = readJson(filePath);

    for (const [targetReference, verseData] of Object.entries(bookData)) {
      const parsed = parseRef(verseData.reference || targetReference);
      if (!parsed) continue;

      byTargetRef.set(verseData.reference || targetReference, verseData);

      if (!refsByBook.has(parsed.book)) refsByBook.set(parsed.book, new Set());
      refsByBook.get(parsed.book).add(verseData.reference || targetReference);

      for (const sourceToken of verseData.sourceTokens || []) {
        const originalRef =
          sourceToken.sourceReference ||
          sourceToken.canonicalReference ||
          verseData.reference ||
          targetReference;

        const originalParsed = parseRef(originalRef);
        if (!originalParsed) continue;

        if (!refsByBook.has(originalParsed.book)) {
          refsByBook.set(originalParsed.book, new Set());
        }

        refsByBook.get(originalParsed.book).add(originalRef);

        if (!sourceByOriginalRef.has(originalRef)) {
          sourceByOriginalRef.set(originalRef, {
            reference: originalRef,
            tokens: [],
            candidateWords: new Set(),
            strongs: new Set(),
          });
        }

        const sourceEntry = sourceByOriginalRef.get(originalRef);
        sourceEntry.tokens.push(sourceToken);

        if (sourceToken.strong) {
          sourceEntry.strongs.add(sourceToken.strong);

          for (const word of lexiconCandidates.get(sourceToken.strong) || []) {
            sourceEntry.candidateWords.add(word);
          }
        }

        addCandidateWords(sourceEntry.candidateWords, sourceToken.lemma);
      }
    }
  }

  const orderedRefsByBook = new Map();

  for (const [book, refs] of refsByBook.entries()) {
    orderedRefsByBook.set(book, Array.from(refs).sort(sortRefs));
  }

  return {
    byTargetRef,
    sourceByOriginalRef,
    orderedRefsByBook,
  };
}

function scoreSourceForTarget(targetVerse, sourceEntry) {
  if (!targetVerse || !sourceEntry) return { score: 0, hits: [] };

  const translationTokens = getTranslationTokens(targetVerse);
  const hits = [];
  let score = 0;

  for (const token of translationTokens) {
    if (sourceEntry.candidateWords.has(token.normalized)) {
      score += token.weight;
      hits.push({
        word: token.normalized,
        translation: token.translation,
        weight: token.weight,
      });
    }
  }

  // Bonus when an English sacred word is present and source has a divine strong.
  const hasSacredEnglish = translationTokens.some((token) =>
    SACRED_WORDS.has(token.normalized)
  );

  const hasDivineSource = [...sourceEntry.strongs].some((strong) =>
    ["H3068", "H3069", "H430", "H426", "H136", "H113", "H410", "H433"].includes(
      strong
    )
  );

  if (hasSacredEnglish && hasDivineSource) {
    score += 20;
    hits.push({
      word: "__divine_source_bonus__",
      translation: "source",
      weight: 20,
    });
  }

  return { score, hits };
}

function getNearbySourceRefs(book, targetRef, orderedRefsByBook, windowSize = 35) {
  const ordered = orderedRefsByBook.get(book) || [];
  const targetIndex = ordered.indexOf(targetRef);

  if (targetIndex === -1) {
    return ordered.filter((ref) => parseRef(ref)?.book === book).slice(0, 80);
  }

  const start = Math.max(0, targetIndex - windowSize);
  const end = Math.min(ordered.length, targetIndex + windowSize + 1);

  return ordered.slice(start, end);
}

function confidenceFor(best, secondBest) {
  if (!best || best.score < 25) return "low";

  const gap = best.score - (secondBest?.score || 0);

  if (best.score >= 55 && gap >= 15) return "high";
  if (best.score >= 35 && gap >= 8) return "medium";
  return "low";
}

function ruleIdFor(rule) {
  return `${rule.sourceBook.toLowerCase()}-${rule.sourceChapter}-${rule.sourceVerseStart}-${rule.sourceVerseEnd}-to-${rule.targetBook.toLowerCase()}-${rule.targetChapter}-${rule.targetVerseStart}-${rule.targetVerseEnd}`;
}

function groupMappingsIntoRules(mappings) {
  const buckets = new Map();

  for (const mapping of mappings) {
    if (!mapping.bestSourceParsed || !mapping.targetParsed) continue;
    if (mapping.confidence === "low") continue;

    const key = [
      mapping.bestSourceParsed.book,
      mapping.bestSourceParsed.chapter,
      mapping.targetParsed.book,
      mapping.targetParsed.chapter,
      mapping.targetParsed.verse - mapping.bestSourceParsed.verse,
    ].join("|");

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mapping);
  }

  const proposedRules = [];

  for (const [key, items] of buckets.entries()) {
    items.sort(
      (a, b) => a.bestSourceParsed.verse - b.bestSourceParsed.verse
    );

    const [
      sourceBook,
      sourceChapterRaw,
      targetBook,
      targetChapterRaw,
      offsetRaw,
    ] = key.split("|");

    const sourceChapter = Number(sourceChapterRaw);
    const targetChapter = Number(targetChapterRaw);
    const offset = Number(offsetRaw);

    let current = null;

    for (const item of items) {
      const sourceVerse = item.bestSourceParsed.verse;
      const targetVerse = item.targetParsed.verse;

      if (
        !current ||
        sourceVerse !== current.sourceVerseEnd + 1 ||
        targetVerse !== current.targetVerseEnd + 1
      ) {
        if (current) proposedRules.push(current);

        current = {
          sourceBook,
          sourceChapter,
          sourceVerseStart: sourceVerse,
          sourceVerseEnd: sourceVerse,
          targetBook,
          targetChapter,
          targetVerseStart: targetVerse,
          targetVerseEnd: targetVerse,
          targetVerseOffset: offset,
          mappingCount: 1,
          scoreTotal: item.bestScore,
          confidenceCounts: {
            high: item.confidence === "high" ? 1 : 0,
            medium: item.confidence === "medium" ? 1 : 0,
          },
          samples: [
            {
              targetReference: item.targetReference,
              proposedSourceReference: item.bestSourceReference,
              score: item.bestScore,
              secondScore: item.secondScore,
              hits: item.hits.slice(0, 12),
            },
          ],
        };

        continue;
      }

      current.sourceVerseEnd = sourceVerse;
      current.targetVerseEnd = targetVerse;
      current.mappingCount += 1;
      current.scoreTotal += item.bestScore;
      current.confidenceCounts.high += item.confidence === "high" ? 1 : 0;
      current.confidenceCounts.medium += item.confidence === "medium" ? 1 : 0;

      if (current.samples.length < 5) {
        current.samples.push({
          targetReference: item.targetReference,
          proposedSourceReference: item.bestSourceReference,
          score: item.bestScore,
          secondScore: item.secondScore,
          hits: item.hits.slice(0, 12),
        });
      }
    }

    if (current) proposedRules.push(current);
  }

  return proposedRules
    .map((rule) => ({
      ...rule,
      id: ruleIdFor(rule),
      averageScore: Number((rule.scoreTotal / rule.mappingCount).toFixed(2)),
      confidence:
        rule.confidenceCounts.high >= Math.ceil(rule.mappingCount / 2)
          ? "high"
          : "medium",
      reason: `Proposed by nearby source/translation lexical matching across ${rule.mappingCount} verse(s). Review before applying.`,
    }))
    .sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence === "high" ? -1 : 1;
      }

      if (b.mappingCount !== a.mappingCount) {
        return b.mappingCount - a.mappingCount;
      }

      return b.averageScore - a.averageScore;
    });
}

function main() {
  const lexicon = readJson(lexiconPath);
  const integrity = readJson(integrityReportPath);

  const lexiconCandidates = buildLexiconCandidateMap(lexicon);
  const { byTargetRef, sourceByOriginalRef, orderedRefsByBook } =
    buildCanonicalIndexes(lexiconCandidates);

  const suspiciousVerses = integrity.suspiciousVerses || [];
  const mappings = [];

  for (const item of suspiciousVerses) {
    const targetReference = item.reference;
    const targetParsed = parseRef(targetReference);
    if (!targetParsed) continue;

    const targetVerse = byTargetRef.get(targetReference);
    if (!targetVerse) continue;

    const nearbyRefs = getNearbySourceRefs(
      targetParsed.book,
      targetReference,
      orderedRefsByBook,
      45
    );

    const scored = [];

    for (const sourceReference of nearbyRefs) {
      const sourceEntry = sourceByOriginalRef.get(sourceReference);
      if (!sourceEntry) continue;

      const scoreResult = scoreSourceForTarget(targetVerse, sourceEntry);

      if (scoreResult.score <= 0) continue;

      scored.push({
        sourceReference,
        sourceParsed: parseRef(sourceReference),
        score: scoreResult.score,
        hits: scoreResult.hits,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];

    if (!best) continue;

    const confidence = confidenceFor(best, second);

    mappings.push({
      targetReference,
      targetParsed,
      currentSourceSample:
        (targetVerse.sourceTokens || [])[0]?.sourceReference ||
        targetReference,
      bestSourceReference: best.sourceReference,
      bestSourceParsed: best.sourceParsed,
      bestScore: best.score,
      secondSourceReference: second?.sourceReference || null,
      secondScore: second?.score || 0,
      confidence,
      hits: best.hits,
    });
  }

  const proposedRules = groupMappingsIntoRules(mappings);

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      suspiciousVersesChecked: suspiciousVerses.length,
      candidateMappings: mappings.length,
      highConfidenceMappings: mappings.filter((x) => x.confidence === "high")
        .length,
      mediumConfidenceMappings: mappings.filter((x) => x.confidence === "medium")
        .length,
      lowConfidenceMappings: mappings.filter((x) => x.confidence === "low")
        .length,
      proposedRules: proposedRules.length,
      highConfidenceRules: proposedRules.filter((x) => x.confidence === "high")
        .length,
      mediumConfidenceRules: proposedRules.filter((x) => x.confidence === "medium")
        .length,
    },
    proposedRules,
    mappings: mappings.sort((a, b) => b.bestScore - a.bestScore).slice(0, 500),
  };

  writeJson(outputPath, report);

  console.log("Versification rule proposal complete");
  console.log(`Suspicious verses checked: ${report.summary.suspiciousVersesChecked}`);
  console.log(`Candidate mappings: ${report.summary.candidateMappings}`);
  console.log(`High-confidence mappings: ${report.summary.highConfidenceMappings}`);
  console.log(`Medium-confidence mappings: ${report.summary.mediumConfidenceMappings}`);
  console.log(`Low-confidence mappings: ${report.summary.lowConfidenceMappings}`);
  console.log(`Proposed rules: ${report.summary.proposedRules}`);
  console.log(`High-confidence rules: ${report.summary.highConfidenceRules}`);
  console.log(`Medium-confidence rules: ${report.summary.mediumConfidenceRules}`);
  console.log(`Report written: ${outputPath}`);
}

main();