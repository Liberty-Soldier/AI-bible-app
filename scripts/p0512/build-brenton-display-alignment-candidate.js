"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { tokenizeDisplayText } = require("../canonical/utils/tokenize");

const ROOT = process.cwd();
const PRODUCTION_PATH = path.join(
  ROOT,
  "app",
  "data",
  "scripture",
  "generatedBrenton.json",
);
const INTEGRITY_PATH = path.join(
  ROOT,
  "app",
  "data",
  "scripture",
  "generatedBrenton.integrity.json",
);
const CANONICAL_ROOT = path.join(
  ROOT,
  ".private",
  "scripture",
  "canonical",
  "lxx",
);
const GENERATED_ROOT = path.join(
  ROOT,
  ".private",
  "generated",
  "P05.12",
  "brenton-display-alignments",
);

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but",
  "by", "for", "from", "had", "has", "have", "he", "her", "him", "his",
  "i", "if", "in", "is", "it", "its", "me", "my", "of", "on", "or",
  "our", "she", "so", "that", "the", "their", "them", "then", "there",
  "these", "they", "this", "those", "thy", "thee", "thou", "to", "unto",
  "was", "we", "were", "with", "ye", "you", "your",
]);

const ALIGNABLE_GRAMMAR_WORDS = new Set([
  "am", "are", "be", "been", "being", "in", "is", "made", "make",
  "was", "were", "with",
]);

const HIGH_VALUE_WORDS = new Set([
  "angel", "blood", "commandment", "commandments", "covenant",
  "darkness", "death", "earth", "elohim", "faith", "father", "flesh",
  "god", "heaven", "holy", "israel", "jerusalem", "judah", "judgment",
  "king", "kingdom", "law", "life", "light", "lord", "man", "moses",
  "name", "peace", "priest", "prophet", "prophets", "righteous",
  "righteousness", "sabbath", "sin", "sins", "son", "spirit", "temple",
  "truth", "water", "wisdom", "word", "world",
]);

function fail(message) {
  throw new Error(`[P05.12U Brenton alignment candidate] ${message}`);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relative(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCompactJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value), "utf8"));
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];

  const output = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        output.push(fullPath);
      }
    }
  }

  return output.sort((left, right) => left.localeCompare(right));
}

function treeSha256(directory) {
  const rows = walk(directory).map((filePath) => {
    const rel = relative(directory, filePath);
    const stat = fs.statSync(filePath);
    return `${rel}\t${stat.size}\t${sha256File(filePath)}`;
  });

  return sha256Text(rows.join("\n"));
}

function parseArgs(argv) {
  const args = { output: "" };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");

  return args;
}

function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function singularize(value) {
  const word = normalizeEnglish(value);
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses|oes)$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

function expandEnglishWord(value) {
  const normalized = normalizeEnglish(value);
  const singular = singularize(normalized);
  const forms = new Set([normalized, singular]);

  if (normalized.endsWith("eth")) forms.add(normalized.slice(0, -3));
  if (normalized.endsWith("est")) forms.add(normalized.slice(0, -3));
  if (normalized.endsWith("ed")) forms.add(normalized.slice(0, -2));
  if (normalized.endsWith("ing")) forms.add(normalized.slice(0, -3));

  const oldEnglish = {
    made: ["make"],
    maketh: ["make"],
    created: ["create"],
    saith: ["say"],
    spake: ["speak"],
    hath: ["have"],
    hast: ["have"],
    art: ["be"],
    wast: ["be"],
    shalt: ["shall"],
    thy: ["your"],
    thee: ["you"],
    thou: ["you"],
    ye: ["you"],
  };

  for (const extra of oldEnglish[normalized] || []) forms.add(extra);
  return [...forms].filter(Boolean);
}

function splitGloss(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,;/|:]+/)
    .map(normalizeEnglish)
    .filter(Boolean);
}

function getSourceGlossWords(sourceToken) {
  const words = new Set();

  for (const field of [
    "gloss",
    "shortDefinition",
    "lemma",
    "normalizedLemma",
    "transliteration",
    "partOfSpeech",
  ]) {
    for (const part of splitGloss(sourceToken?.[field])) {
      words.add(part);
      words.add(singularize(part));
    }
  }

  return [...words].filter(Boolean);
}

function validLxxEntityId(value) {
  return /^word:lxx:L\d+$/.test(String(value || ""));
}

function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail("Canonical LXX file must be an object.");
  }

  for (const key of ["verses", "records", "data", "entries"]) {
    const candidate = document[key];

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.values(candidate).some(
        (value) =>
          value &&
          typeof value === "object" &&
          Array.isArray(value.sourceTokens),
      )
    ) {
      return candidate;
    }
  }

  return document;
}

function canonicalKeyForVerse(verse, fallbackKey) {
  const book = String(verse?.book || "").trim();
  const chapter = Number(verse?.chapter);
  const verseNumber = Number(verse?.verse);

  if (book && Number.isInteger(chapter) && Number.isInteger(verseNumber)) {
    return `${book}.${chapter}.${verseNumber}`;
  }

  return String(fallbackKey || "").trim();
}

function loadCanonicalIndex() {
  if (!fs.existsSync(CANONICAL_ROOT)) {
    fail(`Missing canonical LXX source: ${relative(ROOT, CANONICAL_ROOT)}`);
  }

  const index = new Map();
  const files = walk(
    CANONICAL_ROOT,
    (filePath) => filePath.toLowerCase().endsWith(".json"),
  );

  for (const filePath of files) {
    const document = readJson(filePath);
    const verseMap = unwrapVerseMap(document);

    for (const [fallbackKey, verse] of Object.entries(verseMap)) {
      if (!verse || typeof verse !== "object") continue;

      const keys = new Set([
        String(fallbackKey || "").trim(),
        canonicalKeyForVerse(verse, fallbackKey),
        String(verse?.reference || "").trim().replace(/ /g, ".").replace(":", "."),
      ]);

      const record = {
        filePath,
        fallbackKey,
        verse,
        sourceTokens: Array.isArray(verse.sourceTokens)
          ? verse.sourceTokens
          : [],
      };

      for (const key of keys) {
        if (!key) continue;

        const existing = index.get(key);

        if (existing && existing.verse !== verse) {
          fail(`Canonical ownership-key collision: ${key}`);
        }

        index.set(key, record);
      }
    }
  }

  return { index, files };
}

function productionDocument() {
  if (!fs.existsSync(PRODUCTION_PATH) || !fs.existsSync(INTEGRITY_PATH)) {
    fail("Production Brenton data or integrity manifest is missing.");
  }

  const integrity = readJson(INTEGRITY_PATH);
  const actualHash = sha256File(PRODUCTION_PATH);

  if (actualHash !== integrity.productionSha256) {
    fail(
      `Production Brenton hash mismatch. Expected ${integrity.productionSha256}, found ${actualHash}`,
    );
  }

  const document = readJson(PRODUCTION_PATH);

  if (
    document?.schemaVersion !== "brenton-production-reader@1" ||
    !Array.isArray(document.verses) ||
    !Array.isArray(document.superscriptions)
  ) {
    fail("Production Brenton document shape is invalid.");
  }

  if (
    document.verses.length !== 28548 ||
    document.superscriptions.length !== 67 ||
    Number(document.readerCoordinatePolicy?.productionReaderBooks) !== 53 ||
    Number(document.readerCoordinatePolicy?.crossBookCandidatesAccepted) !== 0
  ) {
    fail("Production Brenton V8 gates are not present.");
  }

  return { document, integrity, actualHash };
}

function tokenSignature(token) {
  return normalizeEnglish(token?.normalized || token?.text);
}

function previousTokens(canonicalVerse) {
  const tokens = canonicalVerse?.translations?.brenton?.tokens;
  return Array.isArray(tokens) ? tokens : [];
}

function tokenContextScore(newTokens, oldTokens, newIndex, oldIndex) {
  let score = 0;
  const normalized = tokenSignature(newTokens[newIndex]);

  if (normalized && normalized === tokenSignature(oldTokens[oldIndex])) {
    score += 100;
  }

  for (const offset of [-2, -1, 1, 2]) {
    const nextNew = newTokens[newIndex + offset];
    const nextOld = oldTokens[oldIndex + offset];

    if (
      nextNew &&
      nextOld &&
      tokenSignature(nextNew) === tokenSignature(nextOld)
    ) {
      score += Math.abs(offset) === 1 ? 12 : 5;
    }
  }

  const expected =
    newTokens.length <= 1 || oldTokens.length <= 1
      ? 0
      : (newIndex / (newTokens.length - 1)) * (oldTokens.length - 1);

  score -= Math.min(Math.abs(oldIndex - expected), 20) * 0.25;
  return score;
}

function transferPriorAlignments({
  tokens,
  priorTokens,
  sourceById,
  stats,
}) {
  const oldPositions = new Map();

  priorTokens.forEach((token, index) => {
    const normalized = tokenSignature(token);
    if (!normalized) return;

    const positions = oldPositions.get(normalized) || [];
    positions.push(index);
    oldPositions.set(normalized, positions);
  });

  let minimumOldIndex = 0;

  for (let newIndex = 0; newIndex < tokens.length; newIndex += 1) {
    const token = tokens[newIndex];
    const normalized = tokenSignature(token);
    const positions = oldPositions.get(normalized) || [];

    const candidates = positions
      .filter((oldIndex) => oldIndex >= minimumOldIndex)
      .map((oldIndex) => ({
        oldIndex,
        score: tokenContextScore(
          tokens,
          priorTokens,
          newIndex,
          oldIndex,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.oldIndex - right.oldIndex,
      );

    if (!candidates.length) continue;

    const best = candidates[0];
    const prior = priorTokens[best.oldIndex];
    minimumOldIndex = best.oldIndex + 1;

    const sourceIds = Array.isArray(prior?.alignedSourceTokenIds)
      ? prior.alignedSourceTokenIds.map(String)
      : [];
    const validIds = sourceIds.filter((id) => sourceById.has(id));

    if (validIds.length) {
      token.alignedSourceTokenIds = validIds;
      token.alignedSourceEntityIds = validIds
        .map((id) => sourceById.get(id)?.entityId)
        .filter(validLxxEntityId);
      token.alignmentStatus = "aligned";
      token.alignmentConfidence =
        prior.alignmentConfidence || prior.confidence || "high";
      token.alignmentMethod =
        "p0512-prior-brenton-alignment-transfer";
      token.alignmentOriginalMethod =
        prior.alignmentMethod || prior.method || null;
      stats.transferredAlignedTokens += 1;
      stats.transferredAlignmentEdges += validIds.length;
    } else if (prior?.alignmentStatus === "ignored") {
      token.alignmentStatus = "ignored";
      token.alignmentReason =
        prior.alignmentReason || "transferred-ignored-token";
      stats.transferredIgnoredTokens += 1;
    }
  }
}

function findBestUnusedCandidate({
  englishToken,
  sourceTokens,
  usedSourceTokenIds,
  minSourceIndex,
}) {
  const englishForms = expandEnglishWord(
    englishToken.normalized || englishToken.text,
  );

  let best = null;

  for (const sourceToken of sourceTokens) {
    if (usedSourceTokenIds.has(String(sourceToken.id))) continue;
    if (!validLxxEntityId(sourceToken.entityId)) continue;

    const sourceGlossWords = getSourceGlossWords(sourceToken);
    let score = 0;

    for (const form of englishForms) {
      if (sourceGlossWords.includes(form)) score += 100;
    }

    if (score === 0) continue;
    if (sourceToken.lexiconMatched) score += 10;
    if (sourceToken.lexiconAmbiguous) score -= 2;

    const sourceIndex = Number(sourceToken.index);
    score -= Math.abs(sourceIndex - minSourceIndex);
    if (sourceIndex < minSourceIndex) score -= 5;

    if (!best || score > best.score) {
      best = {
        sourceToken,
        score,
        confidence:
          score >= 100 ? "high" : score >= 80 ? "medium" : "low",
      };
    }
  }

  return best;
}

function completeFreshAlignments({
  tokens,
  sourceTokens,
  stats,
}) {
  const usedSourceTokenIds = new Set();

  for (const token of tokens) {
    for (const id of token.alignedSourceTokenIds || []) {
      usedSourceTokenIds.add(String(id));
    }
  }

  let minSourceIndex = 0;

  for (const id of usedSourceTokenIds) {
    const source = sourceTokens.find(
      (token) => String(token.id) === id,
    );
    if (source) {
      minSourceIndex = Math.max(
        minSourceIndex,
        Number(source.index) || 0,
      );
    }
  }

  for (const token of tokens) {
    if (token.alignmentStatus === "aligned") continue;
    if (token.alignmentStatus === "ignored") continue;

    const normalized = tokenSignature(token);

    if (!normalized || normalized.length < 2) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "empty-or-short-token";
      stats.freshIgnoredTokens += 1;
      continue;
    }

    if (
      STOP_WORDS.has(normalized) &&
      !ALIGNABLE_GRAMMAR_WORDS.has(normalized)
    ) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "english-grammar-token";
      stats.freshIgnoredTokens += 1;
      continue;
    }

    const candidate = findBestUnusedCandidate({
      englishToken: token,
      sourceTokens,
      usedSourceTokenIds,
      minSourceIndex,
    });

    if (!candidate) {
      token.alignmentStatus = "unaligned";
      continue;
    }

    const sourceToken = candidate.sourceToken;
    const sourceId = String(sourceToken.id);

    token.alignedSourceTokenIds = [sourceId];
    token.alignedSourceEntityIds = [sourceToken.entityId];
    token.alignmentStatus = "aligned";
    token.alignmentConfidence = candidate.confidence;
    token.alignmentMethod = "p0512-lxx-gloss-order";

    usedSourceTokenIds.add(sourceId);
    minSourceIndex = Math.max(
      minSourceIndex,
      Number(sourceToken.index) || 0,
    );

    stats.freshAlignedTokens += 1;
    stats.freshAlignmentEdges += 1;
  }
}

function emptyStats() {
  return {
    readerVerses: 0,
    eligibleReaderVerses: 0,
    failClosedTranslationOnly: 0,
    failClosedUnresolved: 0,
    ownershipResolved: 0,
    ownershipMissing: 0,
    displayTokens: 0,
    alignedTokens: 0,
    ignoredTokens: 0,
    unalignedTokens: 0,
    transferredAlignedTokens: 0,
    transferredAlignmentEdges: 0,
    transferredIgnoredTokens: 0,
    freshAlignedTokens: 0,
    freshAlignmentEdges: 0,
    freshIgnoredTokens: 0,
    priorTranslationTokens: 0,
    priorAlignedTokens: 0,
    exactPriorTextMatches: 0,
    highValueUnaligned: {},
    highValueSourcePresent: {},
    invalidAlignedEntities: 0,
  };
}

function increment(counter, key) {
  if (!key) return;
  counter[key] = (counter[key] || 0) + 1;
}

function sourceGlossAvailable(sourceTokens, word) {
  const forms = expandEnglishWord(word);

  return sourceTokens.some((sourceToken) => {
    const values = getSourceGlossWords(sourceToken);
    return forms.some((form) => values.includes(form));
  });
}

function finalizeStats(stats) {
  stats.actionableTokens =
    stats.displayTokens - stats.ignoredTokens;
  stats.alignedRate =
    stats.displayTokens > 0
      ? Number((stats.alignedTokens / stats.displayTokens).toFixed(6))
      : 0;
  stats.actionableAlignedRate =
    stats.actionableTokens > 0
      ? Number(
          (stats.alignedTokens / stats.actionableTokens).toFixed(6),
        )
      : 0;

  for (const key of [
    "highValueUnaligned",
    "highValueSourcePresent",
  ]) {
    stats[key] = Object.entries(stats[key])
      .sort(
        (left, right) =>
          right[1] - left[1] ||
          left[0].localeCompare(right[0]),
      )
      .map(([word, count]) => ({ word, count }));
  }

  return stats;
}

function compactHit(sourceToken) {
  return [
    String(sourceToken.id || ""),
    Number(sourceToken.index),
    String(sourceToken.surface || ""),
    String(sourceToken.lemma || ""),
    String(sourceToken.strong || sourceToken.lxxId || ""),
    String(sourceToken.entityId || ""),
    String(sourceToken.morph || ""),
  ];
}

function safeBookName(book) {
  return String(book || "")
    .replace(/[^1-4A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function compareVerseLabels(left, right) {
  const parse = (value) => {
    const match = /^(\d+)([A-Za-z]*)$/.exec(String(value || ""));
    return {
      number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
      suffix: match ? match[2] : String(value || ""),
    };
  };

  const a = parse(left);
  const b = parse(right);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function buildCandidate() {
  const production = productionDocument();
  const canonical = loadCanonicalIndex();
  const canonicalTreeBefore = treeSha256(CANONICAL_ROOT);
  const productionHashBefore = sha256File(PRODUCTION_PATH);

  const totals = emptyStats();
  const byBook = {};
  const unresolvedRows = [];
  const chapterMap = new Map();
  const sourceOwnershipUsage = {};
  const samples = [];

  const sortedVerses = [...production.document.verses].sort(
    (left, right) =>
      left.book.localeCompare(right.book) ||
      Number(left.chapter) - Number(right.chapter) ||
      compareVerseLabels(left.verseLabel, right.verseLabel),
  );

  for (const readerVerse of sortedVerses) {
    totals.readerVerses += 1;
    if (!byBook[readerVerse.book]) byBook[readerVerse.book] = emptyStats();
    const bookStats = byBook[readerVerse.book];
    bookStats.readerVerses += 1;

    const ownership = readerVerse.lxxOwnership || {};
    const eligibility = String(ownership.eligibility || "");
    const classification = String(ownership.classification || "");
    const verseLabel = String(readerVerse.verseLabel || readerVerse.verse);
    const chapterKey = `${readerVerse.book}\u0000${readerVerse.chapter}`;
    const chapterRecord =
      chapterMap.get(chapterKey) || {
        schemaVersion: "brenton-reader-alignment-chapter@1",
        translationId: "brenton",
        book: readerVerse.book,
        chapter: Number(readerVerse.chapter),
        verses: {},
      };

    const runtimeVerse = {
      id: readerVerse.id,
      reference: readerVerse.reference,
      verseLabel,
      eligibility,
      classification,
      ownershipKey: ownership.authoritativeOwnershipKey || null,
      sourceReference: ownership.sourceReference || null,
      tokenCount: 0,
      alignedTokenCount: 0,
      hits: {},
    };

    if (
      eligibility === "not-tappable-until-greek-source-is-added"
    ) {
      totals.failClosedTranslationOnly += 1;
      bookStats.failClosedTranslationOnly += 1;
      chapterRecord.verses[verseLabel] = runtimeVerse;
      chapterMap.set(chapterKey, chapterRecord);
      continue;
    }

    if (eligibility !== "eligible-for-source-token-ownership") {
      totals.failClosedUnresolved += 1;
      bookStats.failClosedUnresolved += 1;
      unresolvedRows.push({
        id: readerVerse.id,
        reference: readerVerse.reference,
        classification,
        eligibility,
        ownershipKey: ownership.authoritativeOwnershipKey || null,
        reason: "reader-ownership-not-eligible",
      });
      chapterRecord.verses[verseLabel] = runtimeVerse;
      chapterMap.set(chapterKey, chapterRecord);
      continue;
    }

    totals.eligibleReaderVerses += 1;
    bookStats.eligibleReaderVerses += 1;

    const ownershipKey = String(
      ownership.authoritativeOwnershipKey || "",
    ).trim();
    const canonicalRecord = canonical.index.get(ownershipKey);

    if (!canonicalRecord) {
      totals.ownershipMissing += 1;
      bookStats.ownershipMissing += 1;
      unresolvedRows.push({
        id: readerVerse.id,
        reference: readerVerse.reference,
        classification,
        eligibility,
        ownershipKey,
        reason: "canonical-ownership-key-not-found",
      });
      chapterRecord.verses[verseLabel] = runtimeVerse;
      chapterMap.set(chapterKey, chapterRecord);
      continue;
    }

    totals.ownershipResolved += 1;
    bookStats.ownershipResolved += 1;
    sourceOwnershipUsage[ownershipKey] =
      (sourceOwnershipUsage[ownershipKey] || 0) + 1;

    const sourceTokens = canonicalRecord.sourceTokens;
    const sourceById = new Map(
      sourceTokens.map((token) => [String(token.id), token]),
    );
    const tokens = tokenizeDisplayText(
      readerVerse.text || readerVerse.sources?.[0]?.text || "",
    );
    const prior = previousTokens(canonicalRecord.verse);

    totals.priorTranslationTokens += prior.length;
    bookStats.priorTranslationTokens += prior.length;
    totals.priorAlignedTokens += prior.filter(
      (token) =>
        Array.isArray(token?.alignedSourceTokenIds) &&
        token.alignedSourceTokenIds.length > 0,
    ).length;
    bookStats.priorAlignedTokens += prior.filter(
      (token) =>
        Array.isArray(token?.alignedSourceTokenIds) &&
        token.alignedSourceTokenIds.length > 0,
    ).length;

    const newSignature = tokens.map(tokenSignature).join(" ");
    const oldSignature = prior.map(tokenSignature).join(" ");

    if (newSignature && newSignature === oldSignature) {
      totals.exactPriorTextMatches += 1;
      bookStats.exactPriorTextMatches += 1;
    }

    transferPriorAlignments({
      tokens,
      priorTokens: prior,
      sourceById,
      stats: totals,
    });
    // Book-level transfer counters are collected from the final tokens below
    // to avoid running the transfer operation twice.
    completeFreshAlignments({
      tokens,
      sourceTokens,
      stats: totals,
    });

    runtimeVerse.tokenCount = tokens.length;
    totals.displayTokens += tokens.length;
    bookStats.displayTokens += tokens.length;

    for (const token of tokens) {
      const alignedIds = Array.isArray(token.alignedSourceTokenIds)
        ? token.alignedSourceTokenIds.map(String)
        : [];

      if (alignedIds.length) {
        totals.alignedTokens += 1;
        bookStats.alignedTokens += 1;

        if (
          token.alignmentMethod ===
          "p0512-prior-brenton-alignment-transfer"
        ) {
          bookStats.transferredAlignedTokens += 1;
          bookStats.transferredAlignmentEdges += alignedIds.length;
        } else {
          bookStats.freshAlignedTokens += 1;
          bookStats.freshAlignmentEdges += alignedIds.length;
        }

        let primarySourceToken = null;

        for (const sourceId of alignedIds) {
          const sourceToken = sourceById.get(sourceId);

          if (
            !sourceToken ||
            !validLxxEntityId(sourceToken.entityId)
          ) {
            totals.invalidAlignedEntities += 1;
            bookStats.invalidAlignedEntities += 1;
            continue;
          }

          if (!primarySourceToken) primarySourceToken = sourceToken;
        }

        // The current SEE runtime resolves one primary source token per
        // display token. Preserve all edge counts in the audit, but publish
        // the first canonical source token exactly as the existing runtime
        // contract does.
        if (primarySourceToken) {
          runtimeVerse.hits[String(token.index)] =
            compactHit(primarySourceToken);
        }
      } else if (token.alignmentStatus === "ignored") {
        totals.ignoredTokens += 1;
        bookStats.ignoredTokens += 1;

        if (
          token.alignmentReason === "english-grammar-token" ||
          token.alignmentReason === "empty-or-short-token"
        ) {
          bookStats.freshIgnoredTokens += 1;
        } else {
          bookStats.transferredIgnoredTokens += 1;
        }
      } else {
        totals.unalignedTokens += 1;
        bookStats.unalignedTokens += 1;

        const word = tokenSignature(token);

        if (HIGH_VALUE_WORDS.has(word)) {
          increment(totals.highValueUnaligned, word);
          increment(bookStats.highValueUnaligned, word);

          if (sourceGlossAvailable(sourceTokens, word)) {
            increment(totals.highValueSourcePresent, word);
            increment(bookStats.highValueSourcePresent, word);
          }
        }
      }
    }

    runtimeVerse.alignedTokenCount =
      Object.keys(runtimeVerse.hits).length;
    chapterRecord.verses[verseLabel] = runtimeVerse;
    chapterMap.set(chapterKey, chapterRecord);

    if (
      samples.length < 100 &&
      (readerVerse.book === "Psalms" ||
        classification === "direct-shared-lxx-coordinate")
    ) {
      samples.push({
        reader: readerVerse.reference,
        source: ownership.sourceReference,
        ownershipKey,
        classification,
        tokenCount: runtimeVerse.tokenCount,
        alignedTokenCount: runtimeVerse.alignedTokenCount,
        displayToSource: runtimeVerse.hits,
      });
    }
  }

  if (totals.readerVerses !== 28548) {
    fail(`Reader accounting drift: ${totals.readerVerses}`);
  }

  if (
    totals.eligibleReaderVerses !== 27216 ||
    totals.failClosedTranslationOnly !== 1047 ||
    totals.failClosedUnresolved !== 285
  ) {
    fail(
      `Ownership accounting drift: ${JSON.stringify({
        eligible: totals.eligibleReaderVerses,
        translationOnly: totals.failClosedTranslationOnly,
        unresolved: totals.failClosedUnresolved,
      })}`,
    );
  }

  if (
    totals.ownershipResolved !== totals.eligibleReaderVerses ||
    totals.ownershipMissing !== 0
  ) {
    fail(
      `Eligible ownership resolution failed: ${JSON.stringify({
        eligible: totals.eligibleReaderVerses,
        resolved: totals.ownershipResolved,
        missing: totals.ownershipMissing,
      })}`,
    );
  }

  if (totals.invalidAlignedEntities !== 0) {
    fail(
      `Aligned tokens contain invalid LXX entities: ${totals.invalidAlignedEntities}`,
    );
  }

  for (const [book, stats] of Object.entries(byBook)) {
    finalizeStats(stats);
    byBook[book] = stats;
  }
  finalizeStats(totals);

  const chapterEntries = [...chapterMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, chapter]) => {
      chapter.verses = Object.fromEntries(
        Object.entries(chapter.verses).sort(([left], [right]) =>
          compareVerseLabels(left, right),
        ),
      );
      return chapter;
    });

  const manifestCore = {
    schemaVersion: "brenton-reader-alignment-manifest@1",
    translationId: "brenton",
    productionBrentonSha256: production.actualHash,
    productionIntegritySha256: sha256File(INTEGRITY_PATH),
    canonicalLxxTreeSha256: canonicalTreeBefore,
    readerVerses: totals.readerVerses,
    eligibleReaderVerses: totals.eligibleReaderVerses,
    failClosedTranslationOnly: totals.failClosedTranslationOnly,
    failClosedUnresolved: totals.failClosedUnresolved,
    chapters: chapterEntries.map((chapter) => ({
      book: chapter.book,
      chapter: chapter.chapter,
      verseCount: Object.keys(chapter.verses).length,
      checksum: sha256Text(JSON.stringify(chapter)),
    })),
  };

  const deterministicPayload = [
    JSON.stringify(manifestCore),
    ...chapterEntries.map((chapter) => JSON.stringify(chapter)),
  ].join("\n---P05.12U---\n");
  const fingerprint = sha256Text(deterministicPayload);

  return {
    fingerprint,
    production,
    canonicalTreeBefore,
    productionHashBefore,
    manifestCore,
    chapterEntries,
    totals,
    byBook,
    unresolvedRows,
    sourceOwnershipUsage,
    samples,
  };
}

function writeCsv(filePath, rows, columns) {
  const escape = (value) => {
    const text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    return /[",\r\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  ensureDir(path.dirname(filePath));
  const lines = [
    columns.map(escape).join(","),
    ...rows.map((row) =>
      columns.map((column) => escape(row[column])).join(","),
    ),
  ];
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

function writeChecksums(outputRoot) {
  const checksumPath = path.join(outputRoot, "checksums.sha256");
  const files = walk(
    outputRoot,
    (filePath) => filePath !== checksumPath,
  );
  const lines = files.map(
    (filePath) =>
      `${sha256File(filePath)}  ${relative(outputRoot, filePath)}`,
  );
  fs.writeFileSync(checksumPath, `${lines.join("\n")}\n`, "ascii");
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  console.log("[P05.12U] Building Brenton display-alignment candidate twice...");
  const first = buildCandidate();
  const second = buildCandidate();

  if (first.fingerprint !== second.fingerprint) {
    fail(
      `Candidate is not deterministic: ${first.fingerprint} versus ${second.fingerprint}`,
    );
  }

  const stageRoot = path.join(
    GENERATED_ROOT,
    first.fingerprint.slice(0, 16),
  );
  fs.rmSync(stageRoot, { recursive: true, force: true });
  ensureDir(stageRoot);

  const chapterFiles = [];

  for (const chapter of first.chapterEntries) {
    const relativePath = path.join(
      safeBookName(chapter.book),
      `${chapter.chapter}.json`,
    );
    const filePath = path.join(stageRoot, relativePath);
    writeCompactJson(filePath, chapter);
    chapterFiles.push({
      book: chapter.book,
      chapter: chapter.chapter,
      path: relative(ROOT, filePath),
      records: Object.keys(chapter.verses).length,
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    });
  }

  const manifest = {
    ...first.manifestCore,
    generatedAtUtc: new Date().toISOString(),
    fingerprint: first.fingerprint,
    totals: first.totals,
    files: chapterFiles,
  };
  const manifestPath = path.join(stageRoot, "manifest.json");
  writeJson(manifestPath, manifest);

  const productionHashAfter = sha256File(PRODUCTION_PATH);
  const canonicalTreeAfter = treeSha256(CANONICAL_ROOT);

  if (productionHashAfter !== first.productionHashBefore) {
    fail("Production Brenton changed during candidate generation.");
  }
  if (canonicalTreeAfter !== first.canonicalTreeBefore) {
    fail("Canonical LXX source changed during candidate generation.");
  }

  const summary = {
    milestone: "P05.12U",
    generatedAtUtc: new Date().toISOString(),
    status: "brenton-display-alignment-candidate-complete",
    source: {
      productionBrentonPath: relative(ROOT, PRODUCTION_PATH),
      productionBrentonSha256: first.production.actualHash,
      productionIntegrityPath: relative(ROOT, INTEGRITY_PATH),
      productionIntegritySha256: sha256File(INTEGRITY_PATH),
      canonicalLxxRoot: relative(ROOT, CANONICAL_ROOT),
      canonicalLxxTreeSha256: first.canonicalTreeBefore,
      canonicalFiles: walk(
        CANONICAL_ROOT,
        (filePath) => filePath.endsWith(".json"),
      ).length,
    },
    stagedCandidate: {
      root: relative(ROOT, stageRoot),
      manifest: relative(ROOT, manifestPath),
      manifestSha256: sha256File(manifestPath),
      fingerprint: first.fingerprint,
      repeatedFingerprint: second.fingerprint,
      chapterFiles: chapterFiles.length,
    },
    totals: first.totals,
    ownershipReuse: {
      uniqueCanonicalOwnershipKeys:
        Object.keys(first.sourceOwnershipUsage).length,
      sharedOwnershipKeys: Object.values(
        first.sourceOwnershipUsage,
      ).filter((count) => count > 1).length,
      maximumReaderSegmentsPerOwnershipKey: Math.max(
        ...Object.values(first.sourceOwnershipUsage),
      ),
    },
    gates: {
      productionV8IntegrityVerified: true,
      all28548ReaderVersesAccounted: true,
      all27216EligibleOwnershipKeysResolved: true,
      translationOnly1047RemainFailClosed: true,
      unresolved285RemainFailClosed: true,
      priorAlignmentsTransferredBeforeFreshAlignment: true,
      alignedEntitiesAreCanonicalLxxEntities: true,
      candidateBuiltIdenticallyTwice: true,
      productionBrentonModified: false,
      canonicalLxxModified: false,
      displayAlignmentsModified: false,
      safeToReviewAlignmentQuality: true,
      safeToPromoteAlignmentRuntime: false,
      reason:
        "The deterministic reader-alignment candidate is complete, but the quality report must be reviewed before installing the runtime and re-enabling Brenton word taps.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-alignment-candidate-summary.json"),
    summary,
  );
  writeJson(
    path.join(args.output, "brenton-alignment-samples.json"),
    first.samples,
  );
  writeJson(
    path.join(args.output, "brenton-source-ownership-usage.json"),
    first.sourceOwnershipUsage,
  );

  writeCsv(
    path.join(args.output, "brenton-alignment-by-book.csv"),
    Object.entries(first.byBook).map(([book, stats]) => ({
      book,
      ...stats,
      highValueUnaligned: stats.highValueUnaligned.slice(0, 20),
      highValueSourcePresent: stats.highValueSourcePresent.slice(0, 20),
    })),
    [
      "book",
      "readerVerses",
      "eligibleReaderVerses",
      "ownershipResolved",
      "ownershipMissing",
      "failClosedTranslationOnly",
      "failClosedUnresolved",
      "displayTokens",
      "alignedTokens",
      "ignoredTokens",
      "unalignedTokens",
      "transferredAlignedTokens",
      "freshAlignedTokens",
      "exactPriorTextMatches",
      "alignedRate",
      "actionableAlignedRate",
      "highValueUnaligned",
      "highValueSourcePresent",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-alignment-unresolved.csv"),
    first.unresolvedRows,
    [
      "id",
      "reference",
      "classification",
      "eligibility",
      "ownershipKey",
      "reason",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-high-value-unaligned.csv"),
    first.totals.highValueUnaligned.map((row) => ({
      ...row,
      sourcePresentCount:
        first.totals.highValueSourcePresent.find(
          (item) => item.word === row.word,
        )?.count || 0,
    })),
    ["word", "count", "sourcePresentCount"],
  );

  const psalm4 = first.chapterEntries.find(
    (chapter) =>
      chapter.book === "Psalms" &&
      Number(chapter.chapter) === 4,
  );
  writeJson(
    path.join(args.output, "brenton-psalm-4-alignment-candidate.json"),
    psalm4 || null,
  );

  const readme = [
    "# EMETSEES P05.12U Brenton Display-Alignment Candidate",
    "",
    "This is the first alignment-rebuild stage after the authoritative V8 Brenton promotion.",
    "",
    `- Reader verses accounted: ${first.totals.readerVerses}`,
    `- Eligible LXX-owned verses: ${first.totals.eligibleReaderVerses}`,
    `- Translation-only verses kept fail-closed: ${first.totals.failClosedTranslationOnly}`,
    `- Unresolved ownership verses kept fail-closed: ${first.totals.failClosedUnresolved}`,
    `- Display tokens: ${first.totals.displayTokens}`,
    `- Aligned display tokens: ${first.totals.alignedTokens}`,
    `- Prior aligned tokens transferred: ${first.totals.transferredAlignedTokens}`,
    `- Fresh aligned tokens: ${first.totals.freshAlignedTokens}`,
    `- Actionable aligned rate: ${first.totals.actionableAlignedRate}`,
    "",
    "No production reader, canonical LXX source, display-token alignment, or runtime was modified.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");

  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12U] Brenton display-alignment candidate complete.");
  console.log(
    `[P05.12U] Reader verses accounted: ${first.totals.readerVerses}`,
  );
  console.log(
    `[P05.12U] Eligible ownership resolved: ${first.totals.ownershipResolved}`,
  );
  console.log(
    `[P05.12U] Display tokens aligned: ${first.totals.alignedTokens}`,
  );
  console.log(
    `[P05.12U] Prior alignments transferred: ${first.totals.transferredAlignedTokens}`,
  );
  console.log(
    `[P05.12U] Fresh alignments: ${first.totals.freshAlignedTokens}`,
  );
  console.log(
    `[P05.12U] Actionable aligned rate: ${first.totals.actionableAlignedRate}`,
  );
  console.log("[P05.12U] Production Brenton modified: NO");
  console.log("[P05.12U] Canonical LXX modified: NO");
  console.log("[P05.12U] Word taps re-enabled: NO");
  console.log(`OUTPUT_DIR=${args.output}`);
}

try {
  main();
} catch (error) {
  const rendered = error?.stack || String(error);
  console.error(rendered);

  try {
    const outputIndex = process.argv.indexOf("--output");
    const output =
      outputIndex >= 0 && process.argv[outputIndex + 1]
        ? path.resolve(process.argv[outputIndex + 1])
        : path.join(
            ROOT,
            ".private",
            "reports",
            "P05.12",
            "p0512u-fatal",
          );

    ensureDir(output);
    fs.writeFileSync(
      path.join(output, "fatal-error.txt"),
      `${rendered}\n`,
      "utf8",
    );
  } catch {
    // Preserve the original error.
  }

  process.exit(1);
}
