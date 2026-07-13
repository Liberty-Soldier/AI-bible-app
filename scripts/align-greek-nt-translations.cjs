const fs = require("fs");
const path = require("path");

const { tokenizeDisplayText } = require("./canonical/utils/tokenize");

const {
  NT_BOOKS,
  normalizeBookName,
  isNewTestamentBook,
} = require("./shared/corpus-ownership.cjs");

const root = process.cwd();

const canonicalGreekNtDir = path.join(
  root,
  ".private",
  "scripture",
  "canonical",
  "greek-nt"
);

const runtimeGreekNtDir = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "greek-nt"
);

const scriptureDir = path.join(root, "app", "data", "scripture");

const translations = [
  {
    id: "kjv",
    label: "King James Version",
    file: path.join(scriptureDir, "generatedKJV.json"),
  },
  {
    id: "web",
    label: "World English Bible",
    file: path.join(scriptureDir, "generatedWEB.json"),
  },
];

const reportDir = path.join(root, "reports");
const reportPath = path.join(
  reportDir,
  "greek-nt-translation-alignment-audit.json"
);

const BOOK_FILE_NAMES = {
  Matthew: "Matt",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Romans: "Rom",
  "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phil",
  Colossians: "Col",
  "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim",
  "2 Timothy": "2Tim",
  Titus: "Titus",
  Philemon: "Phlm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pet",
  "2 Peter": "2Pet",
  "1 John": "1John",
  "2 John": "2John",
  "3 John": "3John",
  Jude: "Jude",
  Revelation: "Rev",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);

const ALIGNABLE_GRAMMAR_WORDS = new Set([
  "am",
  "are",
  "be",
  "been",
  "being",
  "in",
  "is",
  "was",
  "were",
  "with",
]);

const HIGH_VALUE_WORDS = new Set([
  "angel",
  "apostle",
  "baptize",
  "believe",
  "blood",
  "body",
  "bread",
  "christ",
  "commandment",
  "commandments",
  "covenant",
  "cross",
  "darkness",
  "death",
  "devil",
  "disciple",
  "disciples",
  "eternal",
  "faith",
  "father",
  "flesh",
  "forgive",
  "forgiveness",
  "gentile",
  "gentiles",
  "glory",
  "god",
  "gospel",
  "grace",
  "heart",
  "heaven",
  "holy",
  "israel",
  "jesus",
  "jew",
  "jews",
  "john",
  "judge",
  "judgment",
  "king",
  "kingdom",
  "law",
  "life",
  "light",
  "lord",
  "love",
  "man",
  "messiah",
  "moses",
  "name",
  "peace",
  "peter",
  "power",
  "priest",
  "prophet",
  "prophets",
  "repent",
  "repentance",
  "resurrection",
  "righteous",
  "righteousness",
  "sabbath",
  "satan",
  "save",
  "saved",
  "savior",
  "scripture",
  "scriptures",
  "sin",
  "sins",
  "son",
  "spirit",
  "temple",
  "testimony",
  "truth",
  "water",
  "word",
  "works",
  "world",
]);

const MANUAL_GREEK_NT_GLOSS_FAMILIES = {
      am: ["G1510"],
        any: ["G5100", "G1538"],
  anyone: ["G5100", "G1538"],
  anybody: ["G5100"],
  someone: ["G5100"],
  somebody: ["G5100"],
  certain: ["G5100"],
  each: ["G1538"],
  every: ["G1538"],
  whoever: ["G3748", "G3739"],
  whosoever: ["G3748", "G3739"],
  are: ["G1510"],
  be: ["G1510"],
  been: ["G1510"],
  being: ["G1510"],
  is: ["G1510"],
  was: ["G1510"],
  were: ["G1510"],
  in: ["G1722"],
  with: ["G4314"],
  jesus: ["G2424"],
  christ: ["G5547"],
  messiah: ["G5547"],
  god: ["G2316"],
  lord: ["G2962"],
  spirit: ["G4151"],
  holy: ["G0040"],
  word: ["G3056"],
  life: ["G2222"],
  light: ["G5457"],
  darkness: ["G4655"],
  truth: ["G0225"],
  love: ["G0025", "G0026"],
  faith: ["G4102"],
  believe: ["G4100"],
  believed: ["G4100"],
  grace: ["G5485"],
  peace: ["G1515"],
  sin: ["G0266", "G0264"],
  sins: ["G0266", "G0264"],
  law: ["G3551"],
  commandment: ["G1785"],
  commandments: ["G1785"],
  kingdom: ["G0932"],
  king: ["G0935"],
  gospel: ["G2098"],
  angel: ["G0032"],
  apostle: ["G0652"],
  prophet: ["G4396"],
  prophets: ["G4396"],
  disciple: ["G3101"],
  disciples: ["G3101"],
  priest: ["G2409"],
  temple: ["G2411", "G3485"],
  sabbath: ["G4521"],
  covenant: ["G1242"],
  blood: ["G0129"],
  flesh: ["G4561"],
  body: ["G4983"],
  bread: ["G0740"],
  water: ["G5204"],
  death: ["G2288"],
  resurrection: ["G0386"],
  satan: ["G4567"],
  devil: ["G1228"],
  save: ["G4982"],
  saved: ["G4982"],
  savior: ["G4990"],
  forgive: ["G0863"],
  forgiveness: ["G0859"],
  repent: ["G3340"],
  repentance: ["G3341"],
  righteous: ["G1342"],
  righteousness: ["G1343"],
  judgment: ["G2920", "G2917"],
  judge: ["G2919"],
  power: ["G1411", "G1849"],
  name: ["G3686"],
  world: ["G2889"],
  heaven: ["G3772"],
  heart: ["G2588"],
  father: ["G3962"],
  son: ["G5207"],
  man: ["G0444", "G0435"],
  israel: ["G2474"],
  jew: ["G2453"],
  jews: ["G2453"],
  gentile: ["G1484"],
  gentiles: ["G1484"],
  scripture: ["G1124"],
  scriptures: ["G1124"],
  testimony: ["G3141"],
  works: ["G2041"],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }

  // Remove "es" only where English normally adds "es":
  // churches -> church, dishes -> dish, boxes -> box, heroes -> hero.
  // Do not turn stones -> ston.
  if (/(ches|shes|xes|zes|sses|oes)$/.test(word)) {
    return word.slice(0, -2);
  }

  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
}

function splitGloss(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,;/|]+/)
    .map(normalizeEnglish)
    .filter(Boolean);
}

function expandEnglishWord(value) {
  const normalized = normalizeEnglish(value);
  const singular = singularize(normalized);

  const forms = new Set([normalized, singular]);

  if (normalized.endsWith("eth")) {
    forms.add(normalized.slice(0, -3));
  }

  if (normalized.endsWith("est")) {
    forms.add(normalized.slice(0, -3));
  }

  if (normalized.endsWith("ed")) {
    forms.add(normalized.slice(0, -2));
  }

  if (normalized.endsWith("ing")) {
    forms.add(normalized.slice(0, -3));
  }

  return [...forms].filter(Boolean);
}

function getVerseKey(book, chapter, verse) {
  return `${book}.${Number(chapter)}.${Number(verse)}`;
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function sanitizeTranslationTextForAlignment(text) {
  let value = String(text || "");

  // Remove common inline WEB note artifacts that should not become alignment tokens.
  value = value.replace(/\s*[†‡]\s*Literally,\s*Lord of the Flies,\s*or the devil\s*/gi, " ");

  // Remove inline textual-critical notes like:
  // "* NU reads Christ Jesus and omits the Lord."
  value = value.replace(/\s*\*\s*(NU|TR|MT|WH)\s+reads\b[^.!?;]*[.!?;]/gi, " ");

  // Remove remaining standalone note symbols.
  value = value.replace(/[†‡]/g, "");
  value = value.replace(/\*/g, "");

  return value.replace(/\s+/g, " ").trim();
}

function loadTranslationVerseMap(translation) {
  const rows = readJson(translation.file);
  const map = new Map();

  for (const row of rows) {
    const book = normalizeBookName(row.book);

    if (!book || !isNewTestamentBook(book)) continue;

    const key = getVerseKey(book, row.chapter, row.verse);
    map.set(key, {
      book,
      chapter: Number(row.chapter),
      verse: Number(row.verse),
      text: getVerseText(row),
    });
  }

  return map;
}

function getSourceGlossWords(sourceToken) {
  const words = new Set();

  for (const field of ["gloss", "mounceGloss", "tyndaleGloss"]) {
    for (const part of splitGloss(sourceToken[field])) {
      words.add(part);
      words.add(singularize(part));
    }
  }

  return [...words].filter(Boolean);
}

function buildStrongLookup(sourceTokens) {
  const lookup = new Map();

  for (const token of sourceTokens) {
    if (!token.strong) continue;

    if (!lookup.has(token.strong)) lookup.set(token.strong, []);
    lookup.get(token.strong).push(token);
  }

  return lookup;
}

function findBestUnusedCandidate({
  englishToken,
  sourceTokens,
  usedSourceTokenIds,
  minSourceIndex,
}) {
  const englishForms = expandEnglishWord(englishToken.normalized || englishToken.text);

  let best = null;

  for (const sourceToken of sourceTokens) {
    if (usedSourceTokenIds.has(sourceToken.id)) continue;

    const sourceGlossWords = getSourceGlossWords(sourceToken);

    let score = 0;
    let method = null;

    for (const form of englishForms) {
      if (sourceGlossWords.includes(form)) {
        score += 100;
        method = "greek-nt-gloss-order";
      }
    }

    if (score === 0) continue;

    const sourceIndex = Number(sourceToken.index);
    const distancePenalty = Math.abs(sourceIndex - minSourceIndex);
    score -= distancePenalty;

    if (sourceIndex < minSourceIndex) {
      score -= 5;
    }

    if (!best || score > best.score) {
      best = {
        sourceToken,
        score,
        method,
        confidence: score >= 95 ? "high" : "medium",
      };
    }
  }

  return best;
}

function findManualFamilyCandidate({
  englishToken,
  sourceTokens,
  usedSourceTokenIds,
  minSourceIndex,
}) {
  const forms = expandEnglishWord(englishToken.normalized || englishToken.text);

  const strongs = new Set();

  for (const form of forms) {
    for (const strong of MANUAL_GREEK_NT_GLOSS_FAMILIES[form] || []) {
      strongs.add(strong);
    }
  }

  if (!strongs.size) return null;

  let best = null;

  for (const sourceToken of sourceTokens) {
    if (usedSourceTokenIds.has(sourceToken.id)) continue;
    if (!strongs.has(sourceToken.strong)) continue;

    const sourceIndex = Number(sourceToken.index);
    let score = 85 - Math.abs(sourceIndex - minSourceIndex);

    if (sourceIndex < minSourceIndex) {
      score -= 5;
    }

    if (!best || score > best.score) {
      best = {
        sourceToken,
        score,
        method: "greek-nt-strong-family-order",
        confidence: score >= 80 ? "medium" : "low",
      };
    }
  }

  return best;
}

function alignTranslationTokens({ verseKey, translationId, translationTokens, sourceTokens }) {
  const usedSourceTokenIds = new Set();
  let minSourceIndex = 0;

  const edges = [];

  for (const token of translationTokens) {
    token.alignedSourceTokenIds = [];

    const normalized = normalizeEnglish(token.normalized || token.text);

    if (!normalized || normalized.length < 2) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "empty-or-short-token";
      continue;
    }

    if (STOP_WORDS.has(normalized) && !ALIGNABLE_GRAMMAR_WORDS.has(normalized)) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "english-grammar-token";
      continue;
    }

    const glossCandidate = findBestUnusedCandidate({
      englishToken: token,
      sourceTokens,
      usedSourceTokenIds,
      minSourceIndex,
    });

    const manualCandidate =
      glossCandidate ||
      findManualFamilyCandidate({
        englishToken: token,
        sourceTokens,
        usedSourceTokenIds,
        minSourceIndex,
      });

    const candidate = glossCandidate || manualCandidate;

    if (!candidate) {
      token.alignmentStatus = "unaligned";
      continue;
    }

    const sourceToken = candidate.sourceToken;

    token.alignedSourceTokenIds.push(sourceToken.id);
    token.alignedSourceEntityIds = [sourceToken.entityId].filter(Boolean);
    token.alignmentStatus = "aligned";
    token.alignmentConfidence = candidate.confidence;
    token.alignmentMethod = candidate.method;

    usedSourceTokenIds.add(sourceToken.id);
    minSourceIndex = Math.max(minSourceIndex, Number(sourceToken.index));

    edges.push({
      verseKey,
      book: verseKey.split(".").slice(0, -2).join("."),
      chapter: Number(verseKey.split(".").slice(-2)[0]),
      verse: Number(verseKey.split(".").slice(-1)[0]),

      translationWitness: translationId,
      translationTokenIndex: token.index,
      translationTokenText: token.text,
      translationTokenNormalized: normalized,

      sourceCorpus: "greek-nt",
      sourceLanguage: "greek",
      sourceTokenId: sourceToken.id,
      sourceTokenIndex: sourceToken.index,
      sourceSurface: sourceToken.surface,
      sourceStrong: sourceToken.strong,
      sourceEntityId: sourceToken.entityId,

      confidence: candidate.confidence,
      method: candidate.method,
    });
  }

  return edges;
}

function buildBookStats() {
  const stats = {};

  for (const book of NT_BOOKS) {
    stats[book] = {
      verses: 0,
      sourceTokens: 0,

      kjv: {
        versesWithTranslation: 0,
        translationTokens: 0,
        alignedTokens: 0,
        ignoredTokens: 0,
        unalignedTokens: 0,
        highValueUnaligned: {},
highValueUnalignedSourcePresent: {},
highValueUnalignedSourceConsumed: {},
highValueUnalignedSourceAbsent: {},
      },

      web: {
        versesWithTranslation: 0,
        translationTokens: 0,
        alignedTokens: 0,
        ignoredTokens: 0,
        unalignedTokens: 0,
        highValueUnaligned: {},
highValueUnalignedSourcePresent: {},
highValueUnalignedSourceConsumed: {},
highValueUnalignedSourceAbsent: {},
      },
    };
  }

  return stats;
}

function addUnalignedWord(counter, word) {
  if (!word) return;

  if (!counter || Array.isArray(counter)) {
    throw new Error(
      `Invalid audit counter for word "${word}". A counter was converted to an array before alignment summarization finished.`
    );
  }

  counter[word] = (counter[word] || 0) + 1;
}

function getExpectedGreekStrongFamiliesForEnglish(word) {
  const forms = expandEnglishWord(word);
  const strongs = new Set();

  for (const form of forms) {
    for (const strong of MANUAL_GREEK_NT_GLOSS_FAMILIES[form] || []) {
      strongs.add(strong);
    }
  }

  return strongs;
}

function getExpectedSourceStrongState(sourceTokens, expectedStrongs, usedSourceTokenIds) {
  if (!expectedStrongs.size) return "unknown";

  const matching = sourceTokens.filter((sourceToken) =>
    expectedStrongs.has(sourceToken.strong)
  );

  if (!matching.length) return "absent";

  const unused = matching.filter(
    (sourceToken) => !usedSourceTokenIds.has(sourceToken.id)
  );

  if (unused.length) return "present-unused";

  return "present-already-consumed";
}

function summarizeTranslationTokens(tokens, translationStats, sourceTokens) {
  const usedSourceTokenIds = new Set();

  for (const token of tokens) {
    for (const id of token.alignedSourceTokenIds || []) {
      usedSourceTokenIds.add(id);
    }
  }

  for (const token of tokens) {
    if (token.alignmentStatus === "aligned") {
      translationStats.alignedTokens += 1;
    } else if (token.alignmentStatus === "ignored") {
      translationStats.ignoredTokens += 1;
    } else {
      translationStats.unalignedTokens += 1;

      const normalized = normalizeEnglish(token.normalized || token.text);

      if (HIGH_VALUE_WORDS.has(normalized)) {
        const expectedStrongs =
          getExpectedGreekStrongFamiliesForEnglish(normalized);

        const sourceState = getExpectedSourceStrongState(
          sourceTokens,
          expectedStrongs,
          usedSourceTokenIds
        );

        if (sourceState === "present-unused") {
          addUnalignedWord(
            translationStats.highValueUnalignedSourcePresent,
            normalized
          );

          token.alignmentReason = "expected-greek-source-present-but-unmatched";
        } else if (sourceState === "present-already-consumed") {
          addUnalignedWord(
            translationStats.highValueUnalignedSourceConsumed,
            normalized
          );

          token.alignmentReason = "expected-greek-source-already-consumed";
        } else {
          addUnalignedWord(
            translationStats.highValueUnalignedSourceAbsent,
            normalized
          );

          token.alignmentReason = "no-expected-greek-source-token-in-verse";
        }

        addUnalignedWord(translationStats.highValueUnaligned, normalized);
      }
    }
  }
}

function topCounter(counter, limit = 50) {
  if (!counter) return [];

  // If this was already converted, normalize it instead of nesting it.
  if (Array.isArray(counter)) {
    return counter
      .filter(
        (item) =>
          item &&
          typeof item.word === "string" &&
          typeof item.count === "number"
      )
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, limit);
  }

  return Object.entries(counter)
    .filter(
      ([word, count]) =>
        typeof word === "string" &&
        word.length > 0 &&
        !/^\d+$/.test(word) &&
        typeof count === "number"
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function loadGreekNtBooks() {
  const books = {};

  for (const book of NT_BOOKS) {
    const fileBase = BOOK_FILE_NAMES[book] || book.replace(/\s+/g, "");
    const filePath = path.join(canonicalGreekNtDir, `${fileBase}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing Greek NT canonical book file: ${filePath}`);
    }

    books[book] = {
      filePath,
      fileBase,
      data: readJson(filePath),
    };
  }

  return books;
}

function main() {
  if (!fs.existsSync(canonicalGreekNtDir)) {
    throw new Error(
      `Missing Greek NT canonical corpus. Run: node scripts\\build-greek-nt-canonical-corpus.cjs`
    );
  }

  ensureDir(reportDir);

  const translationMaps = new Map();

  for (const translation of translations) {
    if (!fs.existsSync(translation.file)) {
      throw new Error(`Missing translation file: ${translation.file}`);
    }

    translationMaps.set(translation.id, loadTranslationVerseMap(translation));
  }

  const books = loadGreekNtBooks();

  const byBook = buildBookStats();
  const totals = {
    books: 0,
    verses: 0,
    sourceTokens: 0,
    alignmentEdges: 0,

    kjv: {
      versesWithTranslation: 0,
      translationTokens: 0,
      alignedTokens: 0,
      ignoredTokens: 0,
      unalignedTokens: 0,
     highValueUnaligned: {},
highValueUnalignedSourcePresent: {},
highValueUnalignedSourceConsumed: {},
highValueUnalignedSourceAbsent: {},
    },

    web: {
      versesWithTranslation: 0,
      translationTokens: 0,
      alignedTokens: 0,
      ignoredTokens: 0,
      unalignedTokens: 0,
      highValueUnaligned: {},
highValueUnalignedSourcePresent: {},
highValueUnalignedSourceConsumed: {},
highValueUnalignedSourceAbsent: {},
    },
  };

  const sampleEdges = [];

  for (const book of NT_BOOKS) {
    const bookRecord = books[book];
    const bookData = bookRecord.data;

    totals.books += 1;

    for (const [verseKey, canonical] of Object.entries(bookData)) {
      byBook[book].verses += 1;
      byBook[book].sourceTokens += canonical.sourceTokens.length;
      totals.verses += 1;
      totals.sourceTokens += canonical.sourceTokens.length;

      if (!canonical.translations) canonical.translations = {};

      for (const translation of translations) {
        const translationMap = translationMaps.get(translation.id);
        const translationVerse = translationMap.get(verseKey);

        if (!translationVerse?.text) continue;

        const alignmentText = sanitizeTranslationTextForAlignment(translationVerse.text);
const tokens = tokenizeDisplayText(alignmentText);

        const edges = alignTranslationTokens({
          verseKey,
          translationId: translation.id,
          translationTokens: tokens,
          sourceTokens: canonical.sourceTokens,
        });

       canonical.translations[translation.id] = {
  text: translationVerse.text,
  alignmentText,
  tokens,
};

        byBook[book][translation.id].versesWithTranslation += 1;
        byBook[book][translation.id].translationTokens += tokens.length;
        summarizeTranslationTokens(
  tokens,
  byBook[book][translation.id],
  canonical.sourceTokens
);

        totals[translation.id].versesWithTranslation += 1;
        totals[translation.id].translationTokens += tokens.length;
        summarizeTranslationTokens(
  tokens,
  totals[translation.id],
  canonical.sourceTokens
);

        totals.alignmentEdges += edges.length;

        for (const edge of edges.slice(0, 5)) {
          if (sampleEdges.length < 25) sampleEdges.push(edge);
        }
      }
    }

    writeJson(bookRecord.filePath, bookData);
  }
  for (const book of NT_BOOKS) {
    for (const translation of translations) {
      const stats = byBook[book][translation.id];

      stats.highValueUnaligned = topCounter(
        stats.highValueUnaligned
      );

      stats.highValueUnalignedSourcePresent = topCounter(
        stats.highValueUnalignedSourcePresent
      );

      stats.highValueUnalignedSourceConsumed = topCounter(
        stats.highValueUnalignedSourceConsumed
      );

      stats.highValueUnalignedSourceAbsent = topCounter(
        stats.highValueUnalignedSourceAbsent
      );
    }
  }

  for (const translation of translations) {
    const stats = totals[translation.id];

    stats.highValueUnaligned = topCounter(
      stats.highValueUnaligned,
      100
    );

    stats.highValueUnalignedSourcePresent = topCounter(
      stats.highValueUnalignedSourcePresent,
      100
    );

    stats.highValueUnalignedSourceConsumed = topCounter(
      stats.highValueUnalignedSourceConsumed,
      100
    );

    stats.highValueUnalignedSourceAbsent = topCounter(
      stats.highValueUnalignedSourceAbsent,
      100
    );

    stats.alignedRate =
      stats.translationTokens > 0
        ? Number((stats.alignedTokens / stats.translationTokens).toFixed(4))
        : 0;

    stats.actionableAlignedRate =
      stats.translationTokens - stats.ignoredTokens > 0
        ? Number(
            (
              stats.alignedTokens /
              (stats.translationTokens - stats.ignoredTokens)
            ).toFixed(4)
          )
        : 0;
  }


  const report = {
    corpus: "greek-nt",
    translations: translations.map((translation) => translation.id),
    generatedAt: new Date().toISOString(),
    canonicalDir: path.relative(root, canonicalGreekNtDir),

    totals,
    byBook,
    sampleEdges,
  };

  writeJson(reportPath, report);

  console.log("Aligned Greek NT translations:");
  console.log(`books: ${totals.books}`);
  console.log(`verses: ${totals.verses}`);
  console.log(`source tokens: ${totals.sourceTokens}`);
  console.log(`alignment edges: ${totals.alignmentEdges}`);

  for (const translation of translations) {
    const stats = totals[translation.id];

    console.log(
      `${translation.id}: verses=${stats.versesWithTranslation}, tokens=${stats.translationTokens}, aligned=${stats.alignedTokens}, ignored=${stats.ignoredTokens}, unaligned=${stats.unalignedTokens}, alignedRate=${stats.alignedRate}, actionableAlignedRate=${stats.actionableAlignedRate}`
    );

    const topHighValueUnaligned = stats.highValueUnaligned
      .slice(0, 20)
      .map((item) => `${item.word}:${item.count}`)
      .join(", ");

    console.log(
      `${translation.id} top high-value unaligned: ${topHighValueUnaligned}`
    );  }

  console.log(`audit: ${path.relative(root, reportPath)}`);

  if (fs.existsSync(runtimeGreekNtDir)) {
    console.log(
      "Note: runtime export not updated yet. Run: node scripts\\export-bibleiq-canonical-runtime.js"
    );
  }
}

main();
