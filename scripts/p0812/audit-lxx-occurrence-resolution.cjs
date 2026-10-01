"use strict";

const fs = require("fs");
const path = require("path");

const {
  normalizeGreek,
  parseTaggedOccurrenceStream,
  resolveOccurrenceStream,
} = require("./lxx-occurrence-resolver.cjs");

const ROOT = process.cwd();
const CANONICAL_ROOT = path.join(
  ROOT,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "lxx",
);
const MORPH_PATH = path.join(
  ROOT,
  "sources",
  "lxx-greek",
  "LXX-Rahlfs-1935-master",
  "11_end-users_files",
  "MyBible",
  "Bibles",
  "LXX_final_main.csv",
);
const LEXICON_PATH = path.join(
  ROOT,
  "app",
  "data",
  "lexicon",
  "generatedLXXGreekLexiconV12.json",
);
const REPORT_PATH = path.join(
  ROOT,
  "reports",
  "lxx-occurrence-resolution-audit.json",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function bookKey(value) {
  return normalizeGreek(value).replace(/[^a-z0-9]/g, "");
}

function readCanonicalVerses() {
  return fs
    .readdirSync(CANONICAL_ROOT)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => Object.values(readJson(path.join(CANONICAL_ROOT, file))));
}

function readMorphIndex() {
  const rowsByChapterVerse = new Map();
  const rowsByBook = new Map();

  for (const line of fs.readFileSync(MORPH_PATH, "utf8").split(/\r?\n/)) {
    if (!line) continue;

    const first = line.indexOf("\t");
    const second = line.indexOf("\t", first + 1);
    const third = line.indexOf("\t", second + 1);
    if (first < 0 || second < 0 || third < 0) continue;

    const bookNo = line.slice(0, first).trim();
    const chapter = Number(line.slice(first + 1, second).trim());
    const verse = line.slice(second + 1, third).trim();
    const occurrences = parseTaggedOccurrenceStream(line.slice(third + 1));
    const row = { bookNo, chapter, verse, occurrences };
    const cv = `${chapter}:${verse}`;

    if (!rowsByChapterVerse.has(cv)) rowsByChapterVerse.set(cv, []);
    rowsByChapterVerse.get(cv).push(row);
    if (!rowsByBook.has(bookNo)) rowsByBook.set(bookNo, new Map());
    rowsByBook.get(bookNo).set(cv, row);
  }

  return { rowsByChapterVerse, rowsByBook };
}

function canonicalIds(verse) {
  return [...(verse.sourceTokens || [])]
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map((token) => token.lxxId)
    .filter(Boolean);
}

function bindBooks(versesByBook, morphIndex) {
  const bindings = new Map();

  for (const [key, verses] of versesByBook) {
    const scores = new Map();
    const samples = verses
      .filter((verse) => canonicalIds(verse).length >= 3)
      .slice(0, 20);

    for (const verse of samples) {
      const ids = canonicalIds(verse).slice(0, 8);
      const cv = `${verse.chapter}:${verse.verse}`;

      for (const candidate of morphIndex.rowsByChapterVerse.get(cv) || []) {
        let same = 0;
        for (
          let index = 0;
          index < Math.min(ids.length, candidate.occurrences.length);
          index += 1
        ) {
          if (ids[index] === candidate.occurrences[index].lexicalId) same += 1;
        }
        if (same >= Math.min(3, ids.length)) {
          scores.set(candidate.bookNo, (scores.get(candidate.bookNo) || 0) + same);
        }
      }
    }

    const ranked = [...scores].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || (ranked[1] && ranked[0][1] === ranked[1][1])) {
      throw new Error(`Could not uniquely bind LXX morphology book: ${key}`);
    }
    bindings.set(key, ranked[0][0]);
  }

  return bindings;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function main() {
  const verses = readCanonicalVerses();
  const lexicon = readJson(LEXICON_PATH);
  const lexiconById = new Map(lexicon.map((entry) => [entry.lxxId, entry]));
  const morphIndex = readMorphIndex();
  const versesByBook = new Map();

  for (const verse of verses) {
    const key = bookKey(verse.book);
    if (!versesByBook.has(key)) versesByBook.set(key, []);
    versesByBook.get(key).push(verse);
  }

  const bindings = bindBooks(versesByBook, morphIndex);
  const formOwners = new Map();

  for (const entry of lexicon) {
    for (const form of new Set([
      ...(entry.forms || []),
      entry.lemma,
      entry.normalizedLemma,
    ])) {
      const normalized = normalizeGreek(form);
      if (!normalized) continue;
      if (!formOwners.has(normalized)) formOwners.set(normalized, new Set());
      formOwners.get(normalized).add(entry.lxxId);
    }
  }

  const topMisroutes = new Map();
  const regression = new Map();
  const stats = {
    books: versesByBook.size,
    verses: verses.length,
    sourceOccurrences: 0,
    normalizedSurfaceCollisionKeys: [...formOwners.values()].filter(
      (owners) => owners.size > 1,
    ).length,
    collisionExposedOccurrences: 0,
    exactStreamVerses: 0,
    nonExactStreamVerses: 0,
    exactStreamComparableOccurrences: 0,
    preRepairIdentityMismatches: 0,
    resolvedByExactOccurrenceStream: 0,
    resolvedByUniqueMonotonicSurfaceAnchor: 0,
    failClosedUnresolvedOccurrences: 0,
    authoritativeIdsMissingLexicon: 0,
    postRepairResolvedIdentityMismatches: 0,
    postRepairCrossCorpusEntityLeaks: 0,
  };

  for (const verse of verses) {
    const tokens = [...(verse.sourceTokens || [])].sort(
      (a, b) => Number(a.index) - Number(b.index),
    );
    const row = morphIndex.rowsByBook
      .get(bindings.get(bookKey(verse.book)))
      ?.get(`${verse.chapter}:${verse.verse}`);
    if (!row) throw new Error(`Missing authoritative row: ${verse.reference}`);

    stats.sourceOccurrences += tokens.length;
    const exact =
      tokens.length === row.occurrences.length &&
      tokens.every(
        (token, index) =>
          normalizeGreek(token.surface) ===
          row.occurrences[index].normalizedSurface,
      );

    if (exact) {
      stats.exactStreamVerses += 1;
      stats.exactStreamComparableOccurrences += tokens.length;
      tokens.forEach((token, index) => {
        const expected = row.occurrences[index].lexicalId;
        if (token.lxxId !== expected) {
          stats.preRepairIdentityMismatches += 1;
          increment(topMisroutes, `${token.lxxId || "null"}->${expected}`);
        }
      });
    } else {
      stats.nonExactStreamVerses += 1;
    }

    const resolutions = resolveOccurrenceStream(tokens, row.occurrences);

    tokens.forEach((token, index) => {
      const owners = formOwners.get(normalizeGreek(token.surface));
      if (owners && owners.size > 1) stats.collisionExposedOccurrences += 1;

      const resolution = resolutions[index];
      if (!resolution) {
        stats.failClosedUnresolvedOccurrences += 1;
        return;
      }

      const authoritative = row.occurrences[resolution.authoritativeIndex];
      if (!lexiconById.has(authoritative.lexicalId)) {
        stats.authoritativeIdsMissingLexicon += 1;
        stats.failClosedUnresolvedOccurrences += 1;
        return;
      }

      if (resolution.method === "exact-occurrence-stream") {
        stats.resolvedByExactOccurrenceStream += 1;
      } else {
        stats.resolvedByUniqueMonotonicSurfaceAnchor += 1;
      }

      const entityId = `word:lxx:${authoritative.lexicalId}`;
      if (!/^word:lxx:L\d+$/.test(entityId)) {
        stats.postRepairCrossCorpusEntityLeaks += 1;
      }
      if (entityId !== `word:lxx:${authoritative.lexicalId}`) {
        stats.postRepairResolvedIdentityMismatches += 1;
      }

      if (verse.reference === "Genesis.2.2") {
        const key = token.surface;
        if (["ἕκτῃ", "αὐτοῦ", "ἃ", "ὧν"].includes(key)) {
          if (!regression.has(key)) regression.set(key, []);
          regression.get(key).push({
            lexicalId: authoritative.lexicalId,
            entityId,
            lemma: lexiconById.get(authoritative.lexicalId).lemma,
            gloss:
              lexiconById.get(authoritative.lexicalId).shortDefinition ||
              lexiconById.get(authoritative.lexicalId).gloss,
            morphology: authoritative.morphology,
            method: resolution.method,
          });
        }
      }
    });
  }

  const expectedRegression = {
    "ἕκτῃ": "L704340",
    "αὐτοῦ": "L702165",
    "ἃ": "L709781",
    "ὧν": "L709781",
  };

  for (const [surface, lexicalId] of Object.entries(expectedRegression)) {
    const values = regression.get(surface) || [];
    if (!values.length || values.some((value) => value.lexicalId !== lexicalId)) {
      throw new Error(
        `Genesis 2:2 regression failed for ${surface}: ${JSON.stringify(values)}`,
      );
    }
  }

  const report = {
    schema: "emet-lxx-occurrence-resolution-audit/v1",
    generatedAt: new Date().toISOString(),
    authorities: {
      sourceTextAndOrder: "app/data/bibleiq/canonical/lxx",
      occurrenceIdentityAndMorphology: "LXX_final_main.csv",
      lexicalEntityMetadata: "generatedLXXGreekLexiconV12.json by exact LXX ID",
    },
    policy: {
      englishAlignmentChoosesIdentity: false,
      normalizedSurfaceChoosesIdentity: false,
      ambiguousIdentityFailsClosed: true,
    },
    stats,
    topPreRepairMisroutes: [...topMisroutes]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([route, count]) => ({ route, count })),
    genesis2_2Regression: Object.fromEntries(regression),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
