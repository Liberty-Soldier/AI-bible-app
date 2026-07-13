const fs = require("fs");
const path = require("path");

const root = process.cwd();

const inputLxxPath = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedLXX.json"
);

const inputLexiconPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedLXXGreekLexiconV12.json"
);

const outputDir = path.join(
  root,
  ".private",
  "scripture",
  "canonical",
  "lxx"
);

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "lxx-canonical-corpus-audit.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeGreekText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ʼ'’]/g, "")
    .replace(/ς/g, "σ")
    .toLowerCase()
    .trim();
}

function cleanGreekToken(value) {
  return String(value || "")
    .replace(/^[\s.,;:!?()[\]{}"“”‘’«»·]+/g, "")
    .replace(/[\s.,;:!?()[\]{}"“”‘’«»·]+$/g, "")
    .trim();
}

function tokenizeGreekText(text) {
  const parts = String(text || "").split(/\s+/);
  const tokens = [];

  for (const part of parts) {
    const clean = cleanGreekToken(part);
    const normalized = normalizeGreekText(clean);

    if (!clean || !normalized) continue;

    tokens.push({
      surface: clean,
      normalizedSurface: normalized,
    });
  }

  return tokens;
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function toVerseKey(book, chapter, verse) {
  return `${book}.${Number(chapter)}.${Number(verse)}`;
}

function safeBookForFile(book) {
  return String(book)
    .replace(/[^A-Za-z0-9]+/g, "")
    .trim();
}

function safeBookForTokenId(book) {
  return String(book).replace(/\s+/g, "_");
}

function makeTokenId(book, chapter, verse, tokenIndex) {
  return `lxx:${safeBookForTokenId(book)}.${chapter}.${verse}:${tokenIndex}`;
}

function makeSurfaceEntityId(normalizedSurface) {
  return `word:lxx:surface:${normalizedSurface}`;
}

function makeLexiconEntityId(entry) {
  if (!entry?.lxxId) return null;
  return `word:lxx:${entry.lxxId}`;
}

function buildLexiconFormMap(lexicon) {
  const formMap = new Map();

  for (const entry of lexicon) {
    const forms = new Set([
      ...(entry.forms || []),
      entry.lemma,
      entry.normalizedLemma,
    ]);

    for (const form of forms) {
      const normalized = normalizeGreekText(form);
      if (!normalized) continue;

      if (!formMap.has(normalized)) formMap.set(normalized, []);

      formMap.get(normalized).push({
        id: entry.id || null,
        lxxId: entry.lxxId || null,
        lemma: entry.lemma || "",
        normalizedLemma: entry.normalizedLemma || "",
        transliteration: entry.transliteration || "",
        pronunciation: entry.pronunciation || "",
        partOfSpeech: entry.partOfSpeech || "",
        gloss: entry.gloss || "",
        shortDefinition: entry.shortDefinition || "",
        fullDefinition: entry.fullDefinition || "",
        forms: entry.forms || [],
      });
    }
  }

  return formMap;
}

function scoreLexiconMatch(match, normalizedSurface) {
  let score = 0;

  const safeSurface = String(normalizedSurface || "");
  const normalizedLemma = normalizeGreekText(match.normalizedLemma || match.lemma);
  const lemma = normalizeGreekText(match.lemma);

  if (normalizedLemma === safeSurface) score += 1000;
  if (lemma === safeSurface) score += 900;

  const normalizedForms = (match.forms || []).map(normalizeGreekText);

  if (normalizedForms.includes(safeSurface)) score += 200;

  if (match.gloss) score += 50;
  if (match.shortDefinition) score += 25;
  if (match.fullDefinition) score += 10;
  if (match.partOfSpeech) score += 5;
  if (match.lxxId) score += 5;

  const safeLemma = String(normalizedLemma || "");
  score -= Math.abs(safeLemma.length - safeSurface.length);

  return score;
}

function chooseLexiconMatch(matches, normalizedSurface) {
  if (!matches.length) return null;

  return [...matches].sort((a, b) => {
    const scoreA = scoreLexiconMatch(a, normalizedSurface);
    const scoreB = scoreLexiconMatch(b, normalizedSurface);

    if (scoreB !== scoreA) return scoreB - scoreA;

    const lemmaA = normalizeGreekText(a.normalizedLemma || a.lemma);
    const lemmaB = normalizeGreekText(b.normalizedLemma || b.lemma);

    return lemmaA.localeCompare(lemmaB);
  })[0];
}

function enrichTokenFromLexicon(token, formMap) {
  const matches = formMap.get(token.normalizedSurface) || [];
  const match = chooseLexiconMatch(matches, token.normalizedSurface);

  if (!match) {
    return {
      ...token,
      lexiconMatched: false,
      lexiconMatchCount: 0,
      lexiconAmbiguous: false,
      lexiconCandidateIds: [],

      lxxId: null,
      lemma: "",
      normalizedLemma: "",
      transliteration: "",
      pronunciation: "",
      partOfSpeech: "",
      gloss: "",
      shortDefinition: "",
      fullDefinition: "",

      entityId: makeSurfaceEntityId(token.normalizedSurface),
    };
  }

  return {
    ...token,
    lexiconMatched: true,
    lexiconMatchCount: matches.length,
    lexiconAmbiguous: matches.length > 1,
    lexiconCandidateIds: matches.map((item) => item.lxxId || item.id).filter(Boolean),

    lxxId: match.lxxId,
    lemma: match.lemma,
    normalizedLemma: match.normalizedLemma,
    transliteration: match.transliteration,
    pronunciation: match.pronunciation,
    partOfSpeech: match.partOfSpeech,
    gloss: match.gloss,
    shortDefinition: match.shortDefinition,
    fullDefinition: match.fullDefinition,

    entityId: makeLexiconEntityId(match) || makeSurfaceEntityId(token.normalizedSurface),
  };
}

function buildCanonicalVerse(verse, formMap) {
  const book = verse.book;
  const chapter = Number(verse.chapter);
  const verseNumber = Number(verse.verse);
  const verseKey = toVerseKey(book, chapter, verseNumber);

  const rawTokens = tokenizeGreekText(getVerseText(verse));

  const sourceTokens = rawTokens.map((token, index) => {
    const enriched = enrichTokenFromLexicon(token, formMap);
    const tokenId = makeTokenId(book, chapter, verseNumber, index);

    return {
      id: tokenId,
      tokenId,
      index,

      source: "lxx",
      corpus: "lxx",
      language: "greek",
      witness: "LXX Rahlfs",
      sourceName: "LXX Rahlfs",

      surface: enriched.surface,
      normalizedSurface: enriched.normalizedSurface,

      entityId: enriched.entityId,
      lxxId: enriched.lxxId,

      lemma: enriched.lemma,
      normalizedLemma: enriched.normalizedLemma,
      transliteration: enriched.transliteration,
      pronunciation: enriched.pronunciation,
      partOfSpeech: enriched.partOfSpeech,

      gloss: enriched.gloss,
      shortDefinition: enriched.shortDefinition,
      fullDefinition: enriched.fullDefinition,

      lexiconMatched: enriched.lexiconMatched,
      lexiconMatchCount: enriched.lexiconMatchCount,
      lexiconAmbiguous: enriched.lexiconAmbiguous,
      lexiconCandidateIds: enriched.lexiconCandidateIds,

      sourceReference: verseKey,
      canonicalReference: verseKey,
      versificationRuleId: null,
    };
  });

  return {
    reference: verseKey,
    book,
    chapter,
    verse: verseNumber,
    source: "lxx",
    sourceTokens,
    translations: {},
  };
}

function groupByBook(verses) {
  const byBook = {};

  for (const verse of verses) {
    const book = verse.book;
    const verseKey = toVerseKey(book, verse.chapter, verse.verse);

    if (!byBook[book]) byBook[book] = {};
    byBook[book][verseKey] = verse;
  }

  return byBook;
}

function buildAudit(byBook) {
  const books = Object.keys(byBook).sort();

  let totalVerses = 0;
  let totalTokens = 0;
  let matchedTokens = 0;
  let unmatchedTokens = 0;
  let ambiguousTokens = 0;

  const unmatchedSurfaceCounts = {};
  const ambiguousSurfaceCounts = {};
  const byBookAudit = {};

  function addCount(counter, key) {
    counter[key] = (counter[key] || 0) + 1;
  }

  for (const book of books) {
    const verses = Object.values(byBook[book]);
    const tokens = verses.flatMap((verse) => verse.sourceTokens);

    const bookMatched = tokens.filter((token) => token.lexiconMatched).length;
    const bookAmbiguous = tokens.filter((token) => token.lexiconAmbiguous).length;

    for (const token of tokens) {
      if (token.lexiconMatched) matchedTokens += 1;
      else {
        unmatchedTokens += 1;
        addCount(unmatchedSurfaceCounts, token.normalizedSurface);
      }

      if (token.lexiconAmbiguous) {
        ambiguousTokens += 1;
        addCount(ambiguousSurfaceCounts, token.normalizedSurface);
      }
    }

    totalVerses += verses.length;
    totalTokens += tokens.length;

    byBookAudit[book] = {
      verses: verses.length,
      tokens: tokens.length,
      matchedTokens: bookMatched,
      unmatchedTokens: tokens.length - bookMatched,
      ambiguousTokens: bookAmbiguous,
      firstVerse: verses[0]?.reference || null,
      lastVerse: verses[verses.length - 1]?.reference || null,
    };
  }

  function top(counter, limit = 50) {
    return Object.entries(counter)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([surface, count]) => ({ surface, count }));
  }

  return {
    corpus: "lxx",
    witness: "LXX Rahlfs",
    shape: "canonical-verse-map",
    generatedAt: new Date().toISOString(),

    books: {
      count: books.length,
      list: books,
    },

    verses: totalVerses,
    tokens: totalTokens,

    lexiconCoverage: {
      matchedTokens,
      unmatchedTokens,
      ambiguousTokens,
      matchedRate:
        totalTokens > 0 ? Number((matchedTokens / totalTokens).toFixed(4)) : 0,
      ambiguousRate:
        totalTokens > 0 ? Number((ambiguousTokens / totalTokens).toFixed(4)) : 0,
    },

    topUnmatchedSurfaces: top(unmatchedSurfaceCounts, 100),
    topAmbiguousSurfaces: top(ambiguousSurfaceCounts, 100),

    byBook: byBookAudit,
  };
}

function writeBookFiles(byBook) {
  cleanDir(outputDir);

  for (const [book, data] of Object.entries(byBook)) {
    const fileName = `${safeBookForFile(book)}.json`;
    fs.writeFileSync(
      path.join(outputDir, fileName),
      JSON.stringify(data, null, 2),
      "utf8"
    );
  }
}

function main() {
  if (!fs.existsSync(inputLxxPath)) {
    throw new Error(`Missing LXX file: ${inputLxxPath}`);
  }

  if (!fs.existsSync(inputLexiconPath)) {
    throw new Error(`Missing LXX lexicon file: ${inputLexiconPath}`);
  }

  ensureDir(reportDir);

  const lxx = readJson(inputLxxPath);
  const lexicon = readJson(inputLexiconPath);

  if (!Array.isArray(lxx)) {
    throw new Error("generatedLXX.json must be an array.");
  }

  if (!Array.isArray(lexicon)) {
    throw new Error("generatedLXXGreekLexiconV12.json must be an array.");
  }

  const formMap = buildLexiconFormMap(lexicon);
  const canonicalVerses = lxx.map((verse) => buildCanonicalVerse(verse, formMap));
  const byBook = groupByBook(canonicalVerses);
  const audit = buildAudit(byBook);

  writeBookFiles(byBook);
  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2), "utf8");

  console.log("Built LXX canonical corpus:");
  console.log(`books: ${audit.books.count}`);
  console.log(`verses: ${audit.verses}`);
  console.log(`tokens: ${audit.tokens}`);
  console.log(`lexicon matched: ${audit.lexiconCoverage.matchedTokens}`);
  console.log(`lexicon unmatched: ${audit.lexiconCoverage.unmatchedTokens}`);
  console.log(`matchedRate: ${audit.lexiconCoverage.matchedRate}`);
  console.log(`ambiguousRate: ${audit.lexiconCoverage.ambiguousRate}`);
  console.log(`output: ${path.relative(root, outputDir)}`);
  console.log(`audit: ${path.relative(root, reportPath)}`);
}

main();