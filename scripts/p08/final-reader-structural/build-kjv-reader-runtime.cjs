#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(
  process.env.EMETSEES_REPO_ROOT || process.cwd(),
);
const REPORT_DIR = process.env.EMETSEES_P0810_V7_REPORT_DIR
  ? path.resolve(process.env.EMETSEES_P0810_V7_REPORT_DIR)
  : (
      process.env.EMETSEES_P0810_V5_REPORT_DIR
        ? path.resolve(process.env.EMETSEES_P0810_V5_REPORT_DIR)
        : (
            process.env.EMETSEES_P0810_V4_REPORT_DIR
              ? path.resolve(process.env.EMETSEES_P0810_V4_REPORT_DIR)
              : null
          )
    );
const BOUND_ROOT = process.env.EMETSEES_P0810_V7_BOUND_ROOT
  ? path.resolve(process.env.EMETSEES_P0810_V7_BOUND_ROOT)
  : (
      process.env.EMETSEES_P0810_V5_BOUND_ROOT
        ? path.resolve(process.env.EMETSEES_P0810_V5_BOUND_ROOT)
        : (
            process.env.EMETSEES_P0810_V4_BOUND_ROOT
              ? path.resolve(process.env.EMETSEES_P0810_V4_BOUND_ROOT)
              : null
          )
    );

const CANONICAL_ROOT = path.join(
  ROOT, "app", "data", "bibleiq", "canonical",
);
const DISPLAY_FILE = path.join(
  ROOT, "app", "data", "scripture", "generatedKJV.json",
);
const OUTPUT_ROOT = path.join(
  ROOT, "public", "data", "bibleiq", "word-study-kjv-reader",
);
const EVIDENCE_BOOK_MAP_FILE = path.join(
  ROOT, "app", "data", "evidence", "evidenceBookMap.ts",
);

const NEW_TESTAMENT_BOOKS = new Set([
  "Matthew","Mark","Luke","John","Acts","Romans",
  "1 Corinthians","2 Corinthians","Galatians","Ephesians",
  "Philippians","Colossians","1 Thessalonians","2 Thessalonians",
  "1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James",
  "1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation",
]);

const GREEK_COMPOUND_ROUTES = Object.freeze({
  "G4566«G4567": "compound:greek-nt:G4566-G4567",
  "G3535«G3536": "compound:greek-nt:G3535-G3536",
  "G1176+G3638": "compound:greek-nt:G1176-G3638",
  "G3379+G4219": "compound:greek-nt:G3379-G4219",
});

const VALID_ENTITY =
  /^(?:word:(?:hebrew:H\d+[A-Za-z]?|greek-nt:G\d+[A-Za-z]?)|compound:greek-nt:G\d+-G\d+)$/u;

function fail(message) {
  throw new Error(`[P08.10 V4 KJV runtime] ${message}`);
}
function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function readJson(file) {
  if (!existsFile(file)) fail(`Required JSON missing: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function writeJson(file, value, pretty = false) {
  ensure(path.dirname(file));
  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`,
    "utf8",
  );
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function normalizeAlias(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^0-9A-Za-z]+/gu, "")
    .toLowerCase();
  if (
    key === "songofsongs" ||
    key === "songofsolomon" ||
    key === "canticles"
  ) return "song";
  return key;
}
function tokenIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/æ/giu, "ae")
    .replace(/œ/giu, "oe")
    .replace(/[§¶†‡]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}
function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}
function readCsvSync(file) {
  if (!existsFile(file)) fail(`Required CSV missing: ${file}`);
  const lines = fs.readFileSync(file, "utf8")
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}
function buildUnsafeFallbackIndexMap() {
  const map = new Map();
  if (!BOUND_ROOT) return map;
  const file = path.join(BOUND_ROOT, "kjv-structural-route-anomalies.csv");
  const rows = readCsvSync(file);
  const unsafeFamilies = new Set([
    "runtime_route_without_canonical_display_token",
    "runtime_route_without_canonical_source_relationship",
    "source_and_entity_mismatch",
    "wrong_source_occurrence_same_entity",
  ]);
  for (const row of rows) {
    if (!unsafeFamilies.has(String(row.calibratedFamily || ""))) continue;
    const key =
      `${String(row.book || "")}|${Number(row.chapter)}:${Number(row.routeVerse || row.verse)}`;
    const set = map.get(key) || new Set();
    set.add(String(Number(row.displayIndex)));
    map.set(key, set);
  }
  return map;
}
function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadBookMap() {
  const text = fs.readFileSync(EVIDENCE_BOOK_MAP_FILE, "utf8");
  const map = new Map();
  const re = /^\s*(?:"([^"]+)"|([A-Za-z0-9]+)):\s*"([^"]+)",?\s*$/gmu;
  let match;
  while ((match = re.exec(text))) {
    map.set(match[1] || match[2], match[3]);
  }
  if (!map.has("Genesis") || map.get("Genesis") !== "Gen") {
    fail("Central evidence book map did not expose Genesis -> Gen.");
  }
  return map;
}
function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {};
  }
  for (const key of ["verses", "records", "data", "entries"]) {
    const candidate = document[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.values(candidate).some(
        (value) => value && typeof value === "object" && "sourceTokens" in value,
      )
    ) {
      return candidate;
    }
  }
  return document;
}
function canonicalCoordinates(verseMap) {
  const map = new Map();
  for (const [fallbackKey, verse] of Object.entries(verseMap)) {
    if (!verse || typeof verse !== "object") continue;
    const m = /(?:^|[.:])(\d+)[.:](\d+)$/u.exec(String(fallbackKey || ""));
    const chapter = Number(verse.chapter ?? m?.[1]);
    const verseNumber = Number(verse.verse ?? m?.[2]);
    if (Number.isInteger(chapter) && Number.isInteger(verseNumber)) {
      map.set(`${chapter}:${verseNumber}`, { verse, fallbackKey });
    }
  }
  return map;
}
function sourceEntity(source, corpus) {
  const existing = String(source?.entityId || "").trim();
  if (VALID_ENTITY.test(existing)) return existing;
  const strong = String(source?.strong || "").trim();
  if (corpus === "greek-nt" && GREEK_COMPOUND_ROUTES[strong]) {
    return GREEK_COMPOUND_ROUTES[strong];
  }
  if (corpus === "hebrew" && /^H\d+[A-Za-z]?$/u.test(strong)) {
    return `word:hebrew:${strong}`;
  }
  if (corpus === "greek-nt" && /^G\d+[A-Za-z]?$/u.test(strong)) {
    return `word:greek-nt:${strong}`;
  }
  return "";
}
function compactSource(source, corpus) {
  return [
    String(source?.id || ""),
    String(source?.surface || ""),
    String(source?.lemma || ""),
    String(source?.strong || ""),
    sourceEntity(source, corpus),
    String(source?.morph || ""),
  ];
}
function displayText(record) {
  if (typeof record?.text === "string" && record.text.trim()) return record.text;
  if (Array.isArray(record?.sources) && record.sources.length) {
    return String(record.sources[0]?.text || "");
  }
  return "";
}
function safeOutputFile(book) {
  return `${String(book || "").replace(/[^0-9A-Za-z]+/gu, "_").replace(/^_+|_+$/gu, "")}.json`;
}
function sourceRouteForCanonicalToken(token, verse, corpus) {
  const ids = Array.isArray(token?.alignedSourceTokenIds)
    ? token.alignedSourceTokenIds.map(String).filter(Boolean)
    : [];
  if (!ids.length) return null;

  const sourceTokens = Array.isArray(verse?.sourceTokens) ? verse.sourceTokens : [];
  const byId = new Map(sourceTokens.map((source, index) => [String(source?.id || ""), { source, index }]));
  const hits = ids.map((id) => byId.get(id)).filter(Boolean);
  if (!hits.length) return null;

  const entities = [...new Set(
    hits.map(({ source }) => sourceEntity(source, corpus)).filter((id) => VALID_ENTITY.test(id)),
  )];
  if (entities.length !== 1) return null;

  const selected = hits.find(({ source }) => sourceEntity(source, corpus) === entities[0]);
  if (!selected) return null;
  return {
    sourceIndex: selected.index,
    sourceId: String(selected.source?.id || ""),
    entityId: entities[0],
  };
}
function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let previous = new Uint16Array(b.length + 1);
  let current = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous; previous = current; current = swap; current.fill(0);
  }
  return previous[b.length];
}
function similarity(displayTokens, canonicalTokens) {
  const a = displayTokens.map((t) => tokenIdentity(t?.text ?? t)).filter(Boolean);
  const b = canonicalTokens.map((t) => tokenIdentity(t?.text ?? t)).filter(Boolean);
  if (!a.length || !b.length) return 0;
  const lcs = lcsLength(a, b);
  return (2 * lcs) / (a.length + b.length);
}
function exactSequence(displayTokens, canonicalTokens) {
  const a = displayTokens.map((t) => tokenIdentity(t?.text ?? t)).filter(Boolean);
  const b = canonicalTokens.map((t) => tokenIdentity(t?.text ?? t)).filter(Boolean);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function exactJoined(displayTokens, canonicalTokens) {
  const a = displayTokens.map((t) => tokenIdentity(t?.text ?? t)).join("");
  const b = canonicalTokens.map((t) => tokenIdentity(t?.text ?? t)).join("");
  return Boolean(a) && a === b;
}
function chooseOwner(record, displayTokens, coordinateMap) {
  const candidates = [];
  for (let delta = -3; delta <= 3; delta += 1) {
    const targetVerse = Number(record.verse) + delta;
    if (targetVerse < 1) continue;
    const hit = coordinateMap.get(`${Number(record.chapter)}:${targetVerse}`);
    const canonicalTokens = Array.isArray(hit?.verse?.translations?.kjv?.tokens)
      ? hit.verse.translations.kjv.tokens
      : [];
    if (!hit || !canonicalTokens.length) continue;
    candidates.push({
      hit,
      delta,
      exactSequence: exactSequence(displayTokens, canonicalTokens),
      exactJoined: exactJoined(displayTokens, canonicalTokens),
      similarity: similarity(displayTokens, canonicalTokens),
    });
  }
  candidates.sort((a, b) =>
    Number(b.exactSequence) - Number(a.exactSequence) ||
    Number(b.exactJoined) - Number(a.exactJoined) ||
    b.similarity - a.similarity ||
    Math.abs(a.delta) - Math.abs(b.delta)
  );
  const top = candidates[0], second = candidates[1];
  if (!top) return { resolved: false, reason: "no-canonical-kjv-owner" };
  if (top.exactSequence || top.exactJoined) {
    if (second && (second.exactSequence || second.exactJoined) &&
        Math.abs(top.similarity - second.similarity) < 1e-9 &&
        Math.abs(top.delta) === Math.abs(second.delta)) {
      return { resolved: false, reason: "ambiguous-exact-nearby-owner" };
    }
    return { resolved: true, ...top, confidence: top.exactSequence ? "exact-sequence" : "exact-joined" };
  }
  const margin = top.similarity - (second?.similarity || 0);
  if (top.similarity >= 0.88 && margin >= 0.08) {
    return { resolved: true, ...top, confidence: "high-sequence-similarity", margin };
  }
  if (top.delta === 0 && top.similarity >= 0.94) {
    return { resolved: true, ...top, confidence: "same-coordinate-high-similarity", margin };
  }
  return {
    resolved: false,
    reason: "no-unique-high-confidence-owner",
    bestSimilarity: top.similarity,
    bestDelta: top.delta,
    margin,
  };
}
function spanIdentity(tokens, start, length) {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += tokenIdentity(tokens[start + i]?.text ?? tokens[start + i]);
  }
  return value;
}
function spanAlignment(displayTokens, canonicalTokens) {
  const memo = new Map();
  function better(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.cost < a.cost - 1e-9) return b;
    if (a.cost < b.cost - 1e-9) return a;
    if (b.covered > a.covered) return b;
    if (a.covered > b.covered) return a;
    return b.matches.length > a.matches.length ? b : a;
  }
  function solve(i, j) {
    const key = `${i}|${j}`;
    if (memo.has(key)) return memo.get(key);
    if (i >= displayTokens.length && j >= canonicalTokens.length) {
      const done = { cost: 0, covered: 0, matches: [] };
      memo.set(key, done);
      return done;
    }
    let best = null;
    if (i < displayTokens.length) {
      const next = solve(i + 1, j);
      best = better(best, { cost: 1 + next.cost, covered: next.covered, matches: next.matches });
    }
    if (j < canonicalTokens.length) {
      const next = solve(i, j + 1);
      best = better(best, { cost: 1 + next.cost, covered: next.covered, matches: next.matches });
    }
    for (let di = 1; di <= 4; di += 1) {
      if (i + di > displayTokens.length) break;
      const left = spanIdentity(displayTokens, i, di);
      if (!left) continue;
      for (let cj = 1; cj <= 4; cj += 1) {
        if (j + cj > canonicalTokens.length) break;
        const right = spanIdentity(canonicalTokens, j, cj);
        if (!right || left !== right) continue;
        const next = solve(i + di, j + cj);
        best = better(best, {
          cost: 0.01 * (di + cj - 2) + next.cost,
          covered: Math.max(di, cj) + next.covered,
          matches: [{
            displayStart: i, displayLength: di,
            canonicalStart: j, canonicalLength: cj,
          }, ...next.matches],
        });
      }
    }
    memo.set(key, best);
    return best;
  }
  return solve(0, 0)?.matches || [];
}
function assignRoutes(displayTokens, canonicalTokens, verse, corpus) {
  const map = {};
  const methods = {};
  const groups = spanAlignment(displayTokens, canonicalTokens);

  function canonicalRoute(index) {
    return sourceRouteForCanonicalToken(canonicalTokens[index], verse, corpus);
  }
  function sameEntity(routes) {
    const valid = routes.filter(Boolean);
    if (!valid.length) return null;
    const entities = [...new Set(valid.map((r) => r.entityId))];
    return entities.length === 1 ? valid[0] : null;
  }

  for (const group of groups) {
    const d = group.displayLength, c = group.canonicalLength;

    if (d === c) {
      for (let offset = 0; offset < d; offset += 1) {
        const route = canonicalRoute(group.canonicalStart + offset);
        if (!route) continue;
        map[String(group.displayStart + offset)] = route.sourceIndex;
        methods[String(group.displayStart + offset)] = "exact-token-position";
      }
      continue;
    }

    if (c === 1) {
      const route = canonicalRoute(group.canonicalStart);
      if (!route) continue;
      for (let offset = 0; offset < d; offset += 1) {
        map[String(group.displayStart + offset)] = route.sourceIndex;
        methods[String(group.displayStart + offset)] = "display-split-of-one-canonical-token";
      }
      continue;
    }

    if (d === 1) {
      const routes = [];
      for (let offset = 0; offset < c; offset += 1) routes.push(canonicalRoute(group.canonicalStart + offset));
      const valid = routes.filter(Boolean);
      const route = valid.length === 1 ? valid[0] : sameEntity(valid);
      if (route) {
        map[String(group.displayStart)] = route.sourceIndex;
        methods[String(group.displayStart)] =
          valid.length === 1 ? "display-fused-over-one-routed-canonical-token" : "display-fused-same-entity";
      }
      continue;
    }

    const routes = [];
    for (let offset = 0; offset < c; offset += 1) routes.push(canonicalRoute(group.canonicalStart + offset));
    const route = sameEntity(routes);
    if (route) {
      for (let offset = 0; offset < d; offset += 1) {
        map[String(group.displayStart + offset)] = route.sourceIndex;
        methods[String(group.displayStart + offset)] = "multi-token-same-entity-span";
      }
    }
  }

  return { map, methods, groups };
}
function routeAt(runtimeBook, chapter, verse, displayIndex) {
  const compact = runtimeBook?.verses?.[`${chapter}:${verse}`];
  const sourceIndex = compact?.a?.kjv?.[String(displayIndex)];
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return null;
  const row = compact?.s?.[sourceIndex];
  if (!Array.isArray(row)) return null;
  return { sourceId: String(row[0] || ""), strong: String(row[3] || ""), entityId: String(row[4] || "") };
}
function main() {
  const tokenizerModule = path.join(ROOT, "scripts", "canonical", "utils", "tokenize.js");
  if (!existsFile(tokenizerModule)) fail(`Tokenizer missing: ${tokenizerModule}`);
  const { tokenizeDisplayText } = require(tokenizerModule);

  const bookMap = loadBookMap();
  const displayRecords = readJson(DISPLAY_FILE);
  if (!Array.isArray(displayRecords) || displayRecords.length !== 31102) {
    fail(`generatedKJV expected 31,102 records; found ${Array.isArray(displayRecords) ? displayRecords.length : "non-array"}.`);
  }

  const oldManifestFile = path.join(OUTPUT_ROOT, "manifest.json");
  const oldManifest = existsFile(oldManifestFile) ? readJson(oldManifestFile) : null;
  const oldBooks = new Map();
  if (oldManifest?.books) {
    for (const fileName of Object.keys(oldManifest.books)) {
      const file = path.join(OUTPUT_ROOT, fileName);
      if (existsFile(file)) oldBooks.set(fileName, readJson(file));
    }
  }

  const unsafeFallbackIndices = buildUnsafeFallbackIndexMap();

  const recordsByBook = new Map();
  for (const record of displayRecords) {
    const book = String(record?.book || "").trim();
    if (!book) fail(`KJV display record missing book: ${record?.id || "unknown"}`);
    if (!recordsByBook.has(book)) recordsByBook.set(book, []);
    recordsByBook.get(book).push(record);
  }

  const newBooks = new Map();
  const aliases = {};
  const stats = {
    displayRecords: displayRecords.length,
    books: recordsByBook.size,
    ownerResolved: 0,
    ownerUnresolved: 0,
    routedDisplayTokens: 0,
    ownerReasons: {},
    ownerConfidence: {},
    oldRuntime: {
      presentRoutes: 0,
      canonicalConsistentRoutes: 0,
      canonicalConsistentPreserved: 0,
      changedOrRemovedOldRoutes: 0,
    },
    unresolvedFallback: {
      preservedVerses: 0,
      suppressedKnownBadRoutes: 0,
      noBaselineVerse: 0,
    },
    methods: {},
    unresolvedOwnerSamples: [],
    changedOldRouteSamples: [],
  };

  for (const [book, records] of [...recordsByBook.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const corpus = NEW_TESTAMENT_BOOKS.has(book) ? "greek-nt" : "hebrew";
    const canonicalBook = bookMap.get(book) || book;
    const canonicalFile = path.join(CANONICAL_ROOT, corpus, `${canonicalBook}.json`);
    if (!existsFile(canonicalFile)) fail(`Canonical ${corpus} file missing for ${book}: ${canonicalFile}`);
    const coordinateMap = canonicalCoordinates(unwrapVerseMap(readJson(canonicalFile)));

    const outputFile = safeOutputFile(book);
    const oldOutputFile =
      oldManifest?.aliases?.[normalizeAlias(book)] ||
      oldManifest?.aliases?.[normalizeAlias(canonicalBook)] ||
      outputFile;
    const oldBook = oldBooks.get(oldOutputFile) || oldBooks.get(outputFile) || null;

    const runtimeBook = {
      version: 2,
      edition: "kjv2006-standardized-1769",
      corpus,
      book,
      verses: {},
    };

    for (const record of records) {
      const text = displayText(record);
      const displayTokens = tokenizeDisplayText(text);
      const owner = chooseOwner(record, displayTokens, coordinateMap);

      if (!owner.resolved) {
        stats.ownerUnresolved += 1;
        stats.ownerReasons[owner.reason] = (stats.ownerReasons[owner.reason] || 0) + 1;

        const visibleVerseKey = `${Number(record.chapter)}:${Number(record.verse)}`;
        const baselineVerse = oldBook?.verses?.[visibleVerseKey]
          ? deepClone(oldBook.verses[visibleVerseKey])
          : null;

        let suppressed = 0;
        if (baselineVerse) {
          const unsafeKey = `${book}|${visibleVerseKey}`;
          const unsafe = unsafeFallbackIndices.get(unsafeKey) || new Set();
          baselineVerse.a = baselineVerse.a || {};
          baselineVerse.a.kjv = baselineVerse.a.kjv || {};
          for (const displayIndex of unsafe) {
            if (
              Object.prototype.hasOwnProperty.call(
                baselineVerse.a.kjv,
                displayIndex,
              )
            ) {
              delete baselineVerse.a.kjv[displayIndex];
              suppressed += 1;
            }
          }
          baselineVerse.o = {
            ...(baselineVerse.o || {}),
            p0810v7PreservedBaselineBecauseOwnerUnresolved: true,
            p0810v7SuppressedKnownBadRoutes: suppressed,
          };
          runtimeBook.verses[visibleVerseKey] = baselineVerse;
          stats.unresolvedFallback.preservedVerses += 1;
          stats.unresolvedFallback.suppressedKnownBadRoutes += suppressed;
        } else {
          stats.unresolvedFallback.noBaselineVerse += 1;
        }

        if (stats.unresolvedOwnerSamples.length < 200) {
          stats.unresolvedOwnerSamples.push({
            book, chapter: record.chapter, verse: record.verse,
            reason: owner.reason,
            bestSimilarity: owner.bestSimilarity ?? null,
            bestDelta: owner.bestDelta ?? null,
            margin: owner.margin ?? null,
            baselineVersePreserved: Boolean(baselineVerse),
            suppressedKnownBadRoutes: suppressed,
          });
        }
        continue;
      }

      stats.ownerResolved += 1;
      stats.ownerConfidence[owner.confidence] = (stats.ownerConfidence[owner.confidence] || 0) + 1;

      const verse = owner.hit.verse;
      const canonicalTokens = Array.isArray(verse?.translations?.kjv?.tokens)
        ? verse.translations.kjv.tokens
        : [];
      const assigned = assignRoutes(displayTokens, canonicalTokens, verse, corpus);

      for (const method of Object.values(assigned.methods)) {
        stats.methods[method] = (stats.methods[method] || 0) + 1;
      }
      stats.routedDisplayTokens += Object.keys(assigned.map).length;

      runtimeBook.verses[`${Number(record.chapter)}:${Number(record.verse)}`] = {
        s: (Array.isArray(verse?.sourceTokens) ? verse.sourceTokens : []).map((source) => compactSource(source, corpus)),
        a: { kjv: assigned.map },
        o: {
          canonicalKey: owner.hit.fallbackKey,
          canonicalVerse: Number(verse?.verse ?? Number(record.verse) + owner.delta),
          verseDelta: owner.delta,
          confidence: owner.confidence,
          similarity: Number(owner.similarity.toFixed(6)),
        },
        m: assigned.methods,
      };
    }

    newBooks.set(outputFile, runtimeBook);
    aliases[normalizeAlias(book)] = outputFile;
    aliases[normalizeAlias(canonicalBook)] = outputFile;
    if (book === "Song of Solomon") {
      aliases.song = outputFile;
      aliases.songofsongs = outputFile;
      aliases.songofsolomon = outputFile;
    }
  }

  // Regression accounting against the pre-existing dedicated KJV runtime.
  // A route counts as canonical-consistent only when the new deterministic
  // display->canonical reconciliation derives the same entity. Every such
  // old route MUST be preserved.
  if (oldManifest) {
    for (const [book, records] of recordsByBook.entries()) {
      const outputFile =
        oldManifest.aliases?.[normalizeAlias(book)] ||
        oldManifest.aliases?.[normalizeAlias(bookMap.get(book) || book)];
      const oldBook = outputFile ? oldBooks.get(outputFile) : null;
      const newFile = safeOutputFile(book);
      const newBook = newBooks.get(newFile);

      for (const record of records) {
        const text = displayText(record);
        const displayTokens = tokenizeDisplayText(text);
        for (let index = 0; index < displayTokens.length; index += 1) {
          const oldRoute = routeAt(oldBook, Number(record.chapter), Number(record.verse), index);
          if (!oldRoute) continue;
          stats.oldRuntime.presentRoutes += 1;
          const newRoute = routeAt(newBook, Number(record.chapter), Number(record.verse), index);
          if (newRoute && newRoute.entityId === oldRoute.entityId) {
            stats.oldRuntime.canonicalConsistentRoutes += 1;
            stats.oldRuntime.canonicalConsistentPreserved += 1;
          } else {
            stats.oldRuntime.changedOrRemovedOldRoutes += 1;
            if (stats.changedOldRouteSamples.length < 200) {
              stats.changedOldRouteSamples.push({
                book, chapter: record.chapter, verse: record.verse, displayIndex: index,
                displayWord: displayTokens[index]?.text || "",
                oldRoute, newRoute,
              });
            }
          }
        }
      }
    }
  }

  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  ensure(OUTPUT_ROOT);

  const booksManifest = {};
  for (const [fileName, runtimeBook] of [...newBooks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const serialized = `${JSON.stringify(runtimeBook)}\n`;
    fs.writeFileSync(path.join(OUTPUT_ROOT, fileName), serialized, "utf8");
    booksManifest[fileName] = {
      book: runtimeBook.book,
      corpus: runtimeBook.corpus,
      verses: Object.keys(runtimeBook.verses).length,
      sha256: sha256(serialized),
    };
  }

  const manifest = {
    version: 2,
    edition: "kjv2006-standardized-1769",
    method: "actual-display-to-existing-canonical-exact-structural-reconciliation-with-safe-unresolved-baseline-preservation",
    semanticGuessing: false,
    stopWordListUsed: false,
    aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
    books: booksManifest,
    stats,
  };
  writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest, true);

  if (REPORT_DIR) {
    writeJson(path.join(REPORT_DIR, "kjv-reader-runtime-build.json"), manifest, true);
  }

  console.log("");
  console.log("P08.10 V5 KJV structural runtime rebuilt.");
  console.log(`Display records: ${stats.displayRecords}`);
  console.log(`Owner resolved: ${stats.ownerResolved}`);
  console.log(`Owner unresolved: ${stats.ownerUnresolved}`);
  console.log(`Unresolved baseline verses preserved: ${stats.unresolvedFallback.preservedVerses}`);
  console.log(`Known-bad fallback routes suppressed: ${stats.unresolvedFallback.suppressedKnownBadRoutes}`);
  console.log(`Routed display tokens: ${stats.routedDisplayTokens}`);
  console.log("Semantic guessing: NO");
  console.log("Stop-word list: NO");
  console.log("");
}
main();
