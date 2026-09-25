"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();

const PATHS = {
  verseMap: path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "source-breakdown",
    "verse-map.json"
  ),

  wlcBooks: path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "source-graphs",
    "wlc-morpheme",
    "v2",
    "books"
  ),

  wlcTopology: path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "source-graphs",
    "wlc-morpheme",
    "v2",
    "source-slot-topology.v2.jsonl.gz"
  ),

  hebrewEntities: path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "word-study",
    "entities",
    "hebrew"
  ),

  greekEntities: path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "word-study",
    "entities",
    "greek-nt"
  ),

  greekNt: path.join(
    ROOT,
    "app",
    "data",
    "bibleiq",
    "canonical",
    "greek-nt"
  ),

  lxx: path.join(
    ROOT,
    "app",
    "data",
    "bibleiq",
    "canonical",
    "lxx"
  ),

  lxxMorph: path.join(
    ROOT,
    "sources",
    "lxx-greek",
    "LXX-Rahlfs-1935-master",
    "11_end-users_files",
    "MyBible",
    "Bibles",
    "LXX_final_main.csv"
  ),

  out: path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "source-breakdown",
    "runtime"
  ),
};

const EXPECTED = {
  hebrewRealOccurrences: 306785,
  hebrewLexicalOccurrences: 300808,
  hebrewGrammarOnlyOccurrences: 5977,
  hebrewConstructionSummaries: 401,
  greekNtOccurrences: 138013,
  greekNtVerses: 7941,
};

function die(message) {
  throw new Error(message);
}

function assertFile(p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    die(`Missing required file: ${p}`);
  }
}

function assertDir(p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    die(`Missing required directory: ${p}`);
  }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readJsonl(p) {
  const text = fs.readFileSync(p, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        die(`Invalid JSONL ${p}:${index + 1}: ${error.message}`);
      }
    });
}

function readGzipJsonl(p) {
  const text = zlib.gunzipSync(fs.readFileSync(p)).toString("utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        die(`Invalid gzipped JSONL ${p}:${index + 1}: ${error.message}`);
      }
    });
}

function firstString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }

  return null;
}

function normalizeBookRaw(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

const BOOK_ALIASES = {
  gen: "genesis",
  ge: "genesis",
  gn: "genesis",
  genesis: "genesis",

  ex: "exodus",
  exo: "exodus",
  exod: "exodus",
  exodus: "exodus",

  lev: "leviticus",
  le: "leviticus",
  leviticus: "leviticus",

  num: "numbers",
  nu: "numbers",
  numbers: "numbers",

  deut: "deuteronomy",
  dt: "deuteronomy",
  deuteronomy: "deuteronomy",

  josh: "joshua",
  jos: "joshua",
  joshua: "joshua",

  judg: "judges",
  jdg: "judges",
  judges: "judges",

  ruth: "ruth",
  rut: "ruth",

  "1sam": "1samuel",
  "1sa": "1samuel",
  "1sm": "1samuel",
  "1samuel": "1samuel",

  "2sam": "2samuel",
  "2sa": "2samuel",
  "2sm": "2samuel",
  "2samuel": "2samuel",

  "1kgs": "1kings",
  "1kg": "1kings",
  "1ki": "1kings",
  "1kings": "1kings",

  "2kgs": "2kings",
  "2kg": "2kings",
  "2ki": "2kings",
  "2kings": "2kings",

  "1chr": "1chronicles",
  "1ch": "1chronicles",
  "1chron": "1chronicles",
  "1chronicles": "1chronicles",

  "2chr": "2chronicles",
  "2ch": "2chronicles",
  "2chron": "2chronicles",
  "2chronicles": "2chronicles",

  ezra: "ezra",
  ezr: "ezra",

  neh: "nehemiah",
  nehemiah: "nehemiah",

  esth: "esther",
  est: "esther",
  esther: "esther",

  job: "job",

  ps: "psalms",
  psa: "psalms",
  psalm: "psalms",
  psalms: "psalms",

  prov: "proverbs",
  pr: "proverbs",
  proverbs: "proverbs",

  eccl: "ecclesiastes",
  ecc: "ecclesiastes",
  ecclesiastes: "ecclesiastes",

  song: "songofsongs",
  songofsongs: "songofsongs",
  songofsolomon: "songofsongs",
  canticles: "songofsongs",

  isa: "isaiah",
  is: "isaiah",
  isaiah: "isaiah",

  jer: "jeremiah",
  jeremiah: "jeremiah",

  lam: "lamentations",
  lamentations: "lamentations",

  ezek: "ezekiel",
  eze: "ezekiel",
  ezekiel: "ezekiel",

  dan: "daniel",
  daniel: "daniel",

  hos: "hosea",
  hosea: "hosea",

  joel: "joel",
  joe: "joel",

  amos: "amos",
  amo: "amos",

  obad: "obadiah",
  oba: "obadiah",
  obadiah: "obadiah",

  jonah: "jonah",
  jon: "jonah",

  mic: "micah",
  micah: "micah",

  nah: "nahum",
  nahum: "nahum",

  hab: "habakkuk",
  habakkuk: "habakkuk",

  zeph: "zephaniah",
  zep: "zephaniah",
  zephaniah: "zephaniah",

  hag: "haggai",
  haggai: "haggai",

  zech: "zechariah",
  zec: "zechariah",
  zechariah: "zechariah",

  mal: "malachi",
  malachi: "malachi",

  matt: "matthew",
  mt: "matthew",
  matthew: "matthew",

  mark: "mark",
  mrk: "mark",
  mk: "mark",

  luke: "luke",
  luk: "luke",
  lk: "luke",

  john: "john",
  jn: "john",

  acts: "acts",
  act: "acts",

  rom: "romans",
  romans: "romans",

  "1cor": "1corinthians",
  "1co": "1corinthians",
  "1corinthians": "1corinthians",

  "2cor": "2corinthians",
  "2co": "2corinthians",
  "2corinthians": "2corinthians",

  gal: "galatians",
  galatians: "galatians",

  eph: "ephesians",
  ephesians: "ephesians",

  phil: "philippians",
  php: "philippians",
  philippians: "philippians",

  col: "colossians",
  colossians: "colossians",

  "1thess": "1thessalonians",
  "1th": "1thessalonians",
  "1thessalonians": "1thessalonians",

  "2thess": "2thessalonians",
  "2th": "2thessalonians",
  "2thessalonians": "2thessalonians",

  "1tim": "1timothy",
  "1ti": "1timothy",
  "1timothy": "1timothy",

  "2tim": "2timothy",
  "2ti": "2timothy",
  "2timothy": "2timothy",

  titus: "titus",
  tit: "titus",

  phlm: "philemon",
  phm: "philemon",
  philemon: "philemon",

  heb: "hebrews",
  hebrews: "hebrews",

  jas: "james",
  jam: "james",
  james: "james",

  "1pet": "1peter",
  "1pe": "1peter",
  "1peter": "1peter",

  "2pet": "2peter",
  "2pe": "2peter",
  "2peter": "2peter",

  "1john": "1john",
  "1jn": "1john",

  "2john": "2john",
  "2jn": "2john",

  "3john": "3john",
  "3jn": "3john",

  jude: "jude",

  rev: "revelation",
  revelation: "revelation",

  tobit: "tobit",
  tob: "tobit",

  judith: "judith",
  jdt: "judith",

  wisdom: "wisdom",
  wisdomofsolomon: "wisdom",

  sirach: "sirach",
  ecclesiasticus: "sirach",

  baruch: "baruch",

  epistleofjeremiah: "epistleofjeremiah",
  letterofjeremiah: "epistleofjeremiah",

  susanna: "susanna",

  belandthedragon: "belandthedragon",
  bel: "belandthedragon",

  "1maccabees": "1maccabees",
  "1macc": "1maccabees",
  "1mac": "1maccabees",

  "2maccabees": "2maccabees",
  "2macc": "2maccabees",
  "2mac": "2maccabees",

  "3maccabees": "3maccabees",
  "3macc": "3maccabees",

  "4maccabees": "4maccabees",
  "4macc": "4maccabees",

  "1esdras": "1esdras",
  "2esdras": "2esdras",
};

function bookKey(value) {
  const raw = normalizeBookRaw(value);
  return BOOK_ALIASES[raw] || raw;
}

function sourceTupleKey(corpus, book, chapter, verse) {
  return [
    corpus,
    bookKey(book),
    Number(chapter),
    String(verse),
  ].join(":");
}

function parseReference(value) {
  if (!value) return null;

  const text = String(value).trim();

  let m = text.match(/^(.+?):(\d+):([^:]+)$/);
  if (!m) m = text.match(/^(.+?)\.(\d+)\.([^.]+)$/);

  if (!m) return null;

  return {
    book: m[1],
    chapter: Number(m[2]),
    verse: String(m[3]),
  };
}

function normalizeEntityKey(corpus, strongOrEntity) {
  if (!strongOrEntity) return null;

  const text = String(strongOrEntity);

  if (text.startsWith("word:")) return text;

  const strong = text.match(/[HG]\d+/i)?.[0]?.toUpperCase();
  if (!strong) return null;

  return `word:${corpus}:${strong}`;
}

function entityIdentity(entity) {
  const i = entity?.i || entity?.identity || entity || {};

  const transliteration =
    firstString(i.t) ||
    firstString(i.transliteration) ||
    firstString(entity?.transliteration);

  const meaning =
    firstString(i.rm) ||
    firstString(i.readerMeaning) ||
    firstString(i.m) ||
    firstString(entity?.readerMeaning) ||
    firstString(entity?.meaning) ||
    firstString(i.gl) ||
    firstString(i.glosses) ||
    firstString(entity?.gloss) ||
    firstString(i.d) ||
    firstString(i.shortDefinitions) ||
    firstString(entity?.shortDefinition);

  return {
    transliteration: transliteration || null,
    meaning: meaning || null,
  };
}

function loadCompactEntityRuntime(dir) {
  assertDir(dir);

  const map = new Map();

  for (const name of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const file = path.join(dir, name);
    const json = readJson(file);
    const entities = json.entities || json.e || json;

    if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
      continue;
    }

    for (const [key, value] of Object.entries(entities)) {
      if (!key.startsWith("word:")) continue;
      map.set(key, value);
    }
  }

  return map;
}

function normalizeTuples(value) {
  if (value && !Array.isArray(value) && Array.isArray(value.sourceVerses)) {
    value = value.sourceVerses;
  }

  if (!Array.isArray(value)) return [];

  if (
    value.length >= 3 &&
    !Array.isArray(value[0]) &&
    typeof value[0] === "string"
  ) {
    value = [value];
  }

  return value
    .filter(
      (x) =>
        Array.isArray(x) &&
        x.length >= 3 &&
        x[0] !== null &&
        x[1] !== null &&
        x[2] !== null
    )
    .map((x) => ({
      book: String(x[0]),
      chapter: Number(x[1]),
      verse: String(x[2]),
    }));
}

function parseDisplayMapKey(rawKey, forcedTranslation) {
  const parts = String(rawKey).split(":");

  if (parts.length < 3) return null;

  let translation = forcedTranslation || null;

  const maybeTranslation = String(parts[0]).toLowerCase();

  if (["web", "kjv", "brenton"].includes(maybeTranslation)) {
    translation = maybeTranslation;
    parts.shift();
  }

  if (!translation) return null;
  if (parts.length < 3) return null;

  const verse = parts.pop();
  const chapter = Number(parts.pop());
  const book = parts.join(":");

  if (!book || !Number.isFinite(chapter)) return null;

  return {
    translation,
    book,
    chapter,
    verse: String(verse),
  };
}

function parsePhase1DisplayedKey(rawKey, forcedTranslation) {
  const text = String(rawKey || "");

  if (text.includes("|")) {
    const parts = text.split("|");

    if (parts.length !== 3) {
      return null;
    }

    const [book, chapterRaw, verseRaw] = parts;
    const chapter = Number(chapterRaw);

    if (
      !book ||
      !Number.isFinite(chapter) ||
      !String(verseRaw).trim()
    ) {
      return null;
    }

    return {
      translation: forcedTranslation,
      book,
      chapter,
      verse: String(verseRaw),
    };
  }

  return parseDisplayMapKey(
    rawKey,
    forcedTranslation
  );
}

function buildDisplayIndex(verseMapJson) {
  const root =
    verseMapJson &&
    verseMapJson.verseMap &&
    typeof verseMapJson.verseMap === "object"
      ? verseMapJson.verseMap
      : verseMapJson;

  if (!root || typeof root !== "object") {
    die("verse-map.json root is malformed.");
  }

  const displayIndex = {};

  const needed = {
    hebrew: new Set(),
    "greek-nt": new Set(),
    lxx: new Set(),
  };

  function addMap(
    map,
    translation,
    corpus,
    label
  ) {
    if (
      !map ||
      typeof map !== "object" ||
      Array.isArray(map)
    ) {
      die(
        `verse-map section ${label} is missing or malformed.`
      );
    }

    for (
      const [rawKey, rawValue]
      of Object.entries(map)
    ) {
      const parsed =
        parsePhase1DisplayedKey(
          rawKey,
          translation
        );

      if (!parsed) {
        die(
          `Unrecognized displayed verse key in ${label}: ${rawKey}`
        );
      }

      const tuples =
        normalizeTuples(rawValue);

      if (!tuples.length) {
        die(
          `No source verse tuple for ${label}: ${rawKey}`
        );
      }

      const displayKey = [
        translation,
        bookKey(parsed.book),
        Number(parsed.chapter),
        String(parsed.verse),
      ].join(":");

      const sourceVerses =
        tuples.map((tuple) => {
          const sourceKey =
            sourceTupleKey(
              corpus,
              tuple.book,
              tuple.chapter,
              tuple.verse
            );

          needed[corpus].add(
            sourceKey
          );

          return {
            book: tuple.book,
            chapter: Number(tuple.chapter),
            verse: String(tuple.verse),
            sourceKey,
          };
        });

      const existing =
        displayIndex[displayKey];

      if (existing) {
        const before =
          JSON.stringify(
            existing.sourceVerses
          );

        const after =
          JSON.stringify(
            sourceVerses
          );

        if (
          existing.corpus !== corpus ||
          before !== after
        ) {
          die(
            `Conflicting source ownership for ${displayKey}`
          );
        }

        continue;
      }

      displayIndex[displayKey] = {
        translation,
        displayedBook:
          parsed.book,
        displayedChapter:
          Number(parsed.chapter),
        displayedVerse:
          String(parsed.verse),
        corpus,
        sourceVerses,
      };
    }
  }

  /*
    Actual Phase-1 ownership schema:

    OT:
      root.ot
      one shared map used independently by
      WEB and KJV -> Hebrew WLC/MorphHB.

    NT:
      root.nt.web -> OpenGNT
      root.nt.kjv -> OpenGNT

    Brenton:
      root.brenton -> LXX
  */

  addMap(
    root.ot,
    "web",
    "hebrew",
    "ot -> WEB"
  );

  addMap(
    root.ot,
    "kjv",
    "hebrew",
    "ot -> KJV"
  );

  if (
    !root.nt ||
    typeof root.nt !== "object" ||
    Array.isArray(root.nt)
  ) {
    die(
      "verse-map root.nt is missing or malformed."
    );
  }

  addMap(
    root.nt.web,
    "web",
    "greek-nt",
    "nt.web"
  );

  addMap(
    root.nt.kjv,
    "kjv",
    "greek-nt",
    "nt.kjv"
  );

  addMap(
    root.brenton,
    "brenton",
    "lxx",
    "brenton"
  );

  return {
    displayIndex,
    needed,
  };
}

function extractHebrewStrong(row) {
  if (typeof row.strong === "string" && /H\d+/i.test(row.strong)) {
    return row.strong.match(/H\d+/i)[0].toUpperCase();
  }

  for (const component of row.components || []) {
    const route = component?.route;

    if (route?.kind !== "strong") continue;

    const found =
      String(route.entityId || "").match(/H\d+/i)?.[0] ||
      String(route.strong || "").match(/H\d+/i)?.[0];

    if (found) return found.toUpperCase();
  }

  return null;
}

function extractHebrewEntityId(row, strong) {
  for (const component of row.components || []) {
    const route = component?.route;
    if (route?.kind === "strong" && route?.entityId) {
      return normalizeEntityKey("hebrew", route.entityId);
    }
  }

  return strong ? `word:hebrew:${strong}` : null;
}

function grammarMeaning(row) {
  for (const component of row.components || []) {
    const candidate =
      firstString(component.readerMeaning) ||
      firstString(component.meaning) ||
      firstString(component.gloss) ||
      firstString(component.label) ||
      firstString(component.description);

    if (candidate) return candidate;
  }

  return "Grammar form — no standalone lexical ID";
}

function buildHebrewRuntime(needed, hebrewEntities) {
  const topologyRows = readGzipJsonl(PATHS.wlcTopology);
  const topology = new Map();

  for (const row of topologyRows) {
    const id =
      row.occurrenceId ||
      row.sourceOccurrenceId ||
      row.id;

    if (id) topology.set(String(id), row);
  }

  const files = fs
    .readdirSync(PATHS.wlcBooks)
    .filter(
      (name) =>
        name.endsWith(".jsonl") &&
        !name.endsWith(".constructions.jsonl")
    );

  const constructionFiles = fs
    .readdirSync(PATHS.wlcBooks)
    .filter((name) => name.endsWith(".constructions.jsonl"));

  let constructionCount = 0;

  for (const name of constructionFiles) {
    constructionCount += readJsonl(path.join(PATHS.wlcBooks, name)).length;
  }

  let real = 0;
  let lexical = 0;
  let grammar = 0;
  let missingTopology = 0;

  const grouped = new Map();

  for (const name of files) {
    const rows = readJsonl(path.join(PATHS.wlcBooks, name));

    for (const row of rows) {
      if (!row?.occurrenceId) {
        // Construction-summary or non-occurrence metadata never renders.
        continue;
      }

      real += 1;

      const strong = extractHebrewStrong(row);

      if (strong) lexical += 1;
      else grammar += 1;

      const topo = topology.get(String(row.occurrenceId));

      if (!topo) {
        missingTopology += 1;
        continue;
      }

      const ref =
        parseReference(row.wlcReference) ||
        parseReference(row.canonicalReference) ||
        parseReference(row.reference);

      if (!ref) {
        die(
          `Cannot parse Hebrew reference for ${row.occurrenceId}: ` +
            JSON.stringify({
              wlcReference: row.wlcReference,
              canonicalReference: row.canonicalReference,
              reference: row.reference,
            })
        );
      }

      const key = sourceTupleKey(
        "hebrew",
        ref.book,
        ref.chapter,
        ref.verse
      );

      if (!needed.has(key)) continue;

      const entityId = extractHebrewEntityId(row, strong);
      const entity = entityId ? hebrewEntities.get(entityId) : null;
      const identity = entityIdentity(entity);

      const occurrence = {
        id: String(row.occurrenceId),
        sourceSlotOrder: Number(topo.sourceSlotOrder),
        slotId: topo.slotId ?? null,
        readingBranch: topo.readingBranch ?? null,
        readingOrder:
          topo.readingOrder === null || topo.readingOrder === undefined
            ? null
            : Number(topo.readingOrder),
        legacyFlatOrder:
          topo.legacyFlatOrder === null ||
          topo.legacyFlatOrder === undefined
            ? null
            : Number(topo.legacyFlatOrder),

        surface: row.surface ?? "",
        lemma: row.lemmaRaw ?? row.lemma ?? null,
        transliteration: identity.transliteration,
        lexicalId: strong,
        entityId,
        morphology: row.morphRaw ?? row.morph ?? null,
        morphologyEnglish: null,
        partOfSpeech: null,
        meaning: strong
          ? identity.meaning
          : grammarMeaning(row),
        grammarOnly: !strong,
      };

      if (!Number.isFinite(occurrence.sourceSlotOrder)) {
        die(
          `Missing/invalid sourceSlotOrder for ${row.occurrenceId}`
        );
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          source: "hebrew",
          witness: "WLC/MorphHB",
          reference: `${ref.book}.${ref.chapter}.${ref.verse}`,
          book: ref.book,
          chapter: ref.chapter,
          verse: ref.verse,
          orderAuthority: "sourceSlotOrder",
          occurrences: [],
        });
      }

      grouped.get(key).occurrences.push(occurrence);
    }
  }

  if (real !== EXPECTED.hebrewRealOccurrences) {
    die(
      `Hebrew real occurrence count changed: expected ` +
        `${EXPECTED.hebrewRealOccurrences}, got ${real}`
    );
  }

  if (lexical !== EXPECTED.hebrewLexicalOccurrences) {
    die(
      `Hebrew lexical occurrence count changed: expected ` +
        `${EXPECTED.hebrewLexicalOccurrences}, got ${lexical}`
    );
  }

  if (grammar !== EXPECTED.hebrewGrammarOnlyOccurrences) {
    die(
      `Hebrew grammar-only count changed: expected ` +
        `${EXPECTED.hebrewGrammarOnlyOccurrences}, got ${grammar}`
    );
  }

  if (constructionCount !== EXPECTED.hebrewConstructionSummaries) {
    die(
      `Hebrew construction-summary count changed: expected ` +
        `${EXPECTED.hebrewConstructionSummaries}, got ${constructionCount}`
    );
  }

  if (missingTopology !== 0) {
    die(
      `Hebrew topology regression: ${missingTopology} real occurrences ` +
        `lack authoritative sourceSlotOrder`
    );
  }

  for (const verse of grouped.values()) {
    verse.occurrences.sort((a, b) => {
      if (a.sourceSlotOrder !== b.sourceSlotOrder) {
        return a.sourceSlotOrder - b.sourceSlotOrder;
      }

      const ar =
        a.readingOrder === null ? Number.MAX_SAFE_INTEGER : a.readingOrder;
      const br =
        b.readingOrder === null ? Number.MAX_SAFE_INTEGER : b.readingOrder;

      if (ar !== br) return ar - br;

      return String(a.readingBranch || "").localeCompare(
        String(b.readingBranch || "")
      );
    });
  }

  return {
    grouped,
    stats: {
      realOccurrences: real,
      lexicalOccurrences: lexical,
      grammarOnlyOccurrences: grammar,
      constructionSummariesExcluded: constructionCount,
      missingTopology,
      emittedSourceVerses: grouped.size,
    },
  };
}

function readCanonicalCorpus(dir) {
  const verses = [];

  for (const name of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const root = readJson(path.join(dir, name));

    if (Array.isArray(root)) {
      for (const item of root) {
        if (item?.sourceTokens) verses.push(item);
      }
      continue;
    }

    for (const value of Object.values(root)) {
      if (value?.sourceTokens) verses.push(value);
    }
  }

  return verses;
}

function buildGreekRuntime(needed, greekEntities) {
  const canonicalVerses = readCanonicalCorpus(PATHS.greekNt);

  let totalOccurrences = 0;
  const referencedEntities = new Set();
  const missingEntities = new Set();
  const missingMeaning = new Set();
  const missingTranslit = new Set();

  const grouped = new Map();

  for (const verse of canonicalVerses) {
    const tokens = [...(verse.sourceTokens || [])].sort(
      (a, b) => Number(a.index) - Number(b.index)
    );

    totalOccurrences += tokens.length;

    const key = sourceTupleKey(
      "greek-nt",
      verse.book,
      verse.chapter,
      verse.verse
    );

    for (const token of tokens) {
      if (token.entityId) referencedEntities.add(token.entityId);
    }

    if (!needed.has(key)) continue;

    const occurrences = tokens.map((token) => {
      const entityId =
        token.entityId ||
        (token.strong
          ? `word:greek-nt:${String(token.strong).toUpperCase()}`
          : null);

      const entity = entityId ? greekEntities.get(entityId) : null;

      if (entityId && !entity) missingEntities.add(entityId);

      const identity = entityIdentity(entity);

      const meaning =
        token.gloss ||
        token.mounceGloss ||
        token.tyndaleGloss ||
        identity.meaning ||
        null;

      if (entityId && !meaning) missingMeaning.add(entityId);
      if (entityId && !identity.transliteration) {
        missingTranslit.add(entityId);
      }

      return {
        id: token.occurrenceId || token.tokenId || token.id,
        sourceOrder: Number(token.index),
        surface: token.surface || "",
        lemma: token.lemma || null,
        transliteration: identity.transliteration,
        lexicalId: token.strong || null,
        entityId,
        morphology: token.morph || null,
        morphologyEnglish: token.morphEnglish || null,
        partOfSpeech: null,
        meaning,
        grammarOnly: false,
      };
    });

    grouped.set(key, {
      source: "greek-nt",
      witness: "OpenGNT",
      reference:
        verse.sourceReference ||
        verse.reference ||
        `${verse.book}.${verse.chapter}.${verse.verse}`,
      book: verse.book,
      chapter: verse.chapter,
      verse: String(verse.verse),
      orderAuthority: "OpenGNT-canonical-source-order",
      occurrences,
    });
  }

  if (canonicalVerses.length !== EXPECTED.greekNtVerses) {
    die(
      `OpenGNT verse count changed: expected ` +
        `${EXPECTED.greekNtVerses}, got ${canonicalVerses.length}`
    );
  }

  if (totalOccurrences !== EXPECTED.greekNtOccurrences) {
    die(
      `OpenGNT occurrence count changed: expected ` +
        `${EXPECTED.greekNtOccurrences}, got ${totalOccurrences}`
    );
  }

  if (missingEntities.size !== 0) {
    die(
      `OpenGNT entity-runtime regression: ${missingEntities.size} ` +
        `referenced entities are missing`
    );
  }

  if (missingMeaning.size !== 0) {
    die(
      `OpenGNT reader-meaning regression: ${missingMeaning.size} ` +
        `referenced entities have no usable meaning`
    );
  }

  return {
    grouped,
    stats: {
      sourceVerses: canonicalVerses.length,
      sourceOccurrences: totalOccurrences,
      referencedEntities: referencedEntities.size,
      missingEntities: missingEntities.size,
      missingReaderMeanings: missingMeaning.size,
      missingTransliterationEntities: missingTranslit.size,
      emittedSourceVerses: grouped.size,
    },
  };
}

function parseLxxMorphFile() {
  const rowsByChapterVerse = new Map();
  const rowsByBook = new Map();

  const lines = fs
    .readFileSync(PATHS.lxxMorph, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  for (const line of lines) {
    const first = line.indexOf("\t");
    if (first < 0) continue;

    const second = line.indexOf("\t", first + 1);
    if (second < 0) continue;

    const third = line.indexOf("\t", second + 1);
    if (third < 0) continue;

    const bookNo = line.slice(0, first).trim();
    const chapter = line.slice(first + 1, second).trim();
    const verse = line.slice(second + 1, third).trim();
    const stream = line.slice(third + 1);

    const occurrences = [];

    const rx = /<S>(\d+)<\/S><m>(lxx\.[^<]+)<\/m>/g;

    for (const match of stream.matchAll(rx)) {
      occurrences.push({
        lxxId: `L${match[1]}`,
        morphology: match[2],
      });
    }

    const record = {
      bookNo,
      chapter: Number(chapter),
      verse: String(verse),
      occurrences,
    };

    const cvKey = `${chapter}:${verse}`;

    if (!rowsByChapterVerse.has(cvKey)) {
      rowsByChapterVerse.set(cvKey, []);
    }

    rowsByChapterVerse.get(cvKey).push(record);

    if (!rowsByBook.has(bookNo)) {
      rowsByBook.set(bookNo, new Map());
    }

    rowsByBook.get(bookNo).set(cvKey, record);
  }

  return {
    rowsByChapterVerse,
    rowsByBook,
  };
}

function canonicalLxxIds(verse) {
  return (verse.sourceTokens || [])
    .slice()
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map((token) => token.lxxId)
    .filter(Boolean);
}

function resolveLxxBookNumber(bookVerses, morphIndex) {
  const scores = new Map();

  const samples = bookVerses
    .filter((verse) => canonicalLxxIds(verse).length >= 3)
    .slice(0, 20);

  for (const verse of samples) {
    const ids = canonicalLxxIds(verse).slice(0, 8);
    const cvKey = `${verse.chapter}:${verse.verse}`;

    for (const candidate of morphIndex.rowsByChapterVerse.get(cvKey) || []) {
      const candidateIds = candidate.occurrences
        .map((x) => x.lxxId)
        .slice(0, ids.length);

      let same = 0;

      for (let i = 0; i < Math.min(ids.length, candidateIds.length); i++) {
        if (ids[i] === candidateIds[i]) same += 1;
      }

      if (same >= Math.min(3, ids.length)) {
        scores.set(
          candidate.bookNo,
          (scores.get(candidate.bookNo) || 0) + same
        );
      }
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return null;

  if (
    ranked.length > 1 &&
    ranked[0][1] === ranked[1][1]
  ) {
    return null;
  }

  return ranked[0][0];
}

function buildLxxRuntime(needed) {
  const canonicalVerses = readCanonicalCorpus(PATHS.lxx);
  const morphIndex = parseLxxMorphFile();

  const byBook = new Map();

  for (const verse of canonicalVerses) {
    const key = bookKey(verse.book);
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(verse);
  }

  const bookNumber = new Map();
  const unresolvedBooks = [];

  for (const [key, verses] of byBook.entries()) {
    const resolved = resolveLxxBookNumber(verses, morphIndex);

    if (!resolved) unresolvedBooks.push(key);
    else bookNumber.set(key, resolved);
  }

  if (unresolvedBooks.length) {
    die(
      `Could not bind authoritative Rahlfs morphology book numbers for: ` +
        unresolvedBooks.join(", ")
    );
  }

  let morphAttached = 0;
  let morphMissing = 0;

  const grouped = new Map();

  for (const verse of canonicalVerses) {
    const key = sourceTupleKey(
      "lxx",
      verse.book,
      verse.chapter,
      verse.verse
    );

    if (!needed.has(key)) continue;

    const tokens = [...(verse.sourceTokens || [])].sort(
      (a, b) => Number(a.index) - Number(b.index)
    );

    const bno = bookNumber.get(bookKey(verse.book));
    const morphVerse = morphIndex.rowsByBook
      .get(bno)
      ?.get(`${verse.chapter}:${verse.verse}`);

    const morphBuckets = new Map();

    for (const entry of morphVerse?.occurrences || []) {
      if (!morphBuckets.has(entry.lxxId)) {
        morphBuckets.set(entry.lxxId, []);
      }

      morphBuckets.get(entry.lxxId).push(entry.morphology);
    }

    const morphCursor = new Map();

    const occurrences = tokens.map((token) => {
      let morphology = null;

      if (token.lxxId) {
        const list = morphBuckets.get(token.lxxId) || [];
        const cursor = morphCursor.get(token.lxxId) || 0;

        morphology = list[cursor] || null;
        morphCursor.set(token.lxxId, cursor + 1);

        if (morphology) morphAttached += 1;
        else morphMissing += 1;
      }

      return {
        id: token.tokenId || token.id,
        sourceOrder: Number(token.index),
        surface: token.surface || "",
        lemma: token.lemma || null,
        transliteration: token.transliteration || null,

        // LXX lexical ID is honest even when no NT Strong number exists.
        lexicalId: token.lxxId || null,
        entityId: token.entityId || null,

        // Only authoritative occurrence morphology from LXX_final_main.csv.
        morphology,
        morphologyEnglish: null,

        // Kept separate: lexical POS is not occurrence morphology.
        partOfSpeech: token.partOfSpeech || null,

        meaning:
          token.shortDefinition ||
          token.gloss ||
          null,

        grammarOnly: false,
      };
    });

    grouped.set(key, {
      source: "lxx",
      witness: "Rahlfs LXX",
      reference:
        verse.sourceReference ||
        verse.reference ||
        `${verse.book}.${verse.chapter}.${verse.verse}`,
      book: verse.book,
      chapter: verse.chapter,
      verse: String(verse.verse),
      orderAuthority: "LXX-canonical-source-order",
      occurrences,
    });
  }

  return {
    grouped,
    stats: {
      canonicalSourceVerses: canonicalVerses.length,
      emittedSourceVerses: grouped.size,
      morphologyAttachedOccurrences: morphAttached,
      morphologyUnavailableOccurrences: morphMissing,
      morphologyAuthority:
        "LXX_final_main.csv exact source verse + repeated lxxId occurrence order",
    },
  };
}

function writeCorpusShards(tmpRoot, corpus, grouped, sourceIndex) {
  const dir = path.join(tmpRoot, corpus);
  fs.mkdirSync(dir, { recursive: true });

  const books = new Map();

  for (const [sourceKey, verse] of grouped.entries()) {
    const key = bookKey(verse.book);

    if (!books.has(key)) books.set(key, {});
    books.get(key)[sourceKey] = verse;
  }

  for (const [book, verses] of books.entries()) {
    const relative = `${corpus}/${book}.json`;
    const absolute = path.join(tmpRoot, relative);

    fs.writeFileSync(
      absolute,
      JSON.stringify({
        schema: "emet-phase1-source-breakdown-source-book/v1",
        corpus,
        book,
        verses,
      })
    );

    for (const sourceKey of Object.keys(verses)) {
      sourceIndex[sourceKey] = {
        file: relative.replace(/\\/g, "/"),
        key: sourceKey,
      };
    }
  }
}

function validateNeededSourceVerses(needed, sourceIndex) {
  const missing = [];

  for (const [corpus, keys] of Object.entries(needed)) {
    for (const key of keys) {
      if (!sourceIndex[key]) {
        missing.push({
          corpus,
          sourceKey: key,
        });
      }
    }
  }

  return missing;
}

function main() {
  console.log("EMETSEES Phase 1 Source Breakdown runtime build");
  console.log("READ AUTHORITIES ONLY — no alignment regeneration");

  assertFile(PATHS.verseMap);
  assertDir(PATHS.wlcBooks);
  assertFile(PATHS.wlcTopology);
  assertDir(PATHS.hebrewEntities);
  assertDir(PATHS.greekEntities);
  assertDir(PATHS.greekNt);
  assertDir(PATHS.lxx);
  assertFile(PATHS.lxxMorph);

  const verseMap = readJson(PATHS.verseMap);
  const { displayIndex, needed } = buildDisplayIndex(verseMap);

  console.log(`Displayed verse mappings: ${Object.keys(displayIndex).length}`);
  console.log(`Needed Hebrew source verses: ${needed.hebrew.size}`);
  console.log(`Needed OpenGNT source verses: ${needed["greek-nt"].size}`);
  console.log(`Needed LXX source verses: ${needed.lxx.size}`);

  if (!Object.keys(displayIndex).length) {
    die("No displayed verse mappings were recognized.");
  }

  if (!needed.hebrew.size) {
    die(
      "SOURCE BREAKDOWN FAIL: Hebrew mapped source verse count is zero."
    );
  }

  if (!needed["greek-nt"].size) {
    die(
      "SOURCE BREAKDOWN FAIL: OpenGNT mapped source verse count is zero."
    );
  }

  if (!needed.lxx.size) {
    die(
      "SOURCE BREAKDOWN FAIL: LXX mapped source verse count is zero."
    );
  }
  const hebrewEntities = loadCompactEntityRuntime(PATHS.hebrewEntities);
  const greekEntities = loadCompactEntityRuntime(PATHS.greekEntities);

  console.log(`Hebrew Word Overview entities loaded: ${hebrewEntities.size}`);
  console.log(`Greek NT Word Overview entities loaded: ${greekEntities.size}`);

  const hebrew = buildHebrewRuntime(needed.hebrew, hebrewEntities);
  console.log("Hebrew source runtime CLOSED:", hebrew.stats);

  const greek = buildGreekRuntime(
    needed["greek-nt"],
    greekEntities
  );
  console.log("OpenGNT source runtime CLOSED:", greek.stats);

  const lxx = buildLxxRuntime(needed.lxx);
  console.log("LXX source runtime built:", lxx.stats);

  const tmp = `${PATHS.out}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const sourceIndex = {};

  writeCorpusShards(tmp, "hebrew", hebrew.grouped, sourceIndex);
  writeCorpusShards(tmp, "greek-nt", greek.grouped, sourceIndex);
  writeCorpusShards(tmp, "lxx", lxx.grouped, sourceIndex);

  const missingSourceVerses = validateNeededSourceVerses(
    needed,
    sourceIndex
  );

  if (missingSourceVerses.length) {
    fs.rmSync(tmp, { recursive: true, force: true });

    die(
      `Source Breakdown runtime is missing ` +
        `${missingSourceVerses.length} mapped source verses.\n` +
        JSON.stringify(missingSourceVerses.slice(0, 25), null, 2)
    );
  }

  fs.writeFileSync(
    path.join(tmp, "display-index.json"),
    JSON.stringify({
      schema: "emet-phase1-source-breakdown-display-index/v1",
      policy: {
        interaction: "verse-first",
        englishWordOwnershipRequired: false,
        failClosed: true,
      },
      displayIndex,
    })
  );

  fs.writeFileSync(
    path.join(tmp, "manifest.json"),
    JSON.stringify(
      {
        schema: "emet-phase1-source-breakdown-runtime/v1",
        generatedAt: new Date().toISOString(),

        policy: {
          interaction: "verse-first",
          englishWordToSourceHighlighting: false,
          webKjvOt: "WLC/MorphHB",
          webKjvNt: "OpenGNT",
          brenton: "Rahlfs LXX",
          hebrewOrderAuthority: "sourceSlotOrder",
          greekNtOrderAuthority: "OpenGNT-canonical-source-order",
          lxxOrderAuthority: "LXX-canonical-source-order",
          lxxMorphologyAuthority:
            "LXX_final_main.csv occurrence stream",
        },

        counts: {
          displayedVerseMappings: Object.keys(displayIndex).length,
          sourceVerseIndexEntries: Object.keys(sourceIndex).length,
        },

        sourceIndex,

        stats: {
          hebrew: hebrew.stats,
          greekNt: greek.stats,
          lxx: lxx.stats,
        },

        nonBlocking: {
          greekMissingTransliterationEntities:
            greek.stats.missingTransliterationEntities,
          note:
            "Underlying Greek source occurrences are preserved even when transliteration metadata is absent.",
        },
      },
      null,
      2
    )
  );

  fs.rmSync(PATHS.out, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(PATHS.out), { recursive: true });
  fs.renameSync(tmp, PATHS.out);

  const downloads = path.join(
    process.env.USERPROFILE || ROOT,
    "Downloads"
  );

  const reportPath = path.join(
    downloads,
    `EMETSEES-PHASE1-SOURCE-BREAKDOWN-RUNTIME-${Date.now()}.json`
  );

  const report = {
    status: "PASS",
    repo: ROOT,
    output: PATHS.out,
    immutableAuthorities: {
      verseMap: PATHS.verseMap,
      wlcSourceGraph: PATHS.wlcBooks,
      wlcTopology: PATHS.wlcTopology,
      openGnt: PATHS.greekNt,
      lxxCanonical: PATHS.lxx,
      lxxOccurrenceMorphology: PATHS.lxxMorph,
    },
    stats: {
      displayedVerseMappings: Object.keys(displayIndex).length,
      sourceVerseIndexEntries: Object.keys(sourceIndex).length,
      hebrew: hebrew.stats,
      greekNt: greek.stats,
      lxx: lxx.stats,
    },
    missingMappedSourceVerses: 0,
    sourceTextsModified: false,
    alignmentRegenerated: false,
    deploymentPerformed: false,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("");
  console.log("======================================================");
  console.log("PHASE-1 SOURCE BREAKDOWN RUNTIME: PASS");
  console.log("======================================================");
  console.log(`Runtime: ${PATHS.out}`);
  console.log(`Report:  ${reportPath}`);
  console.log("");
  console.log("Hebrew:");
  console.log(
    `  ${hebrew.stats.realOccurrences} real occurrences`
  );
  console.log(
    `  ${hebrew.stats.lexicalOccurrences} lexical`
  );
  console.log(
    `  ${hebrew.stats.grammarOnlyOccurrences} grammar-only`
  );
  console.log(
    `  ${hebrew.stats.constructionSummariesExcluded} construction summaries excluded`
  );
  console.log(
    `  topology missing: ${hebrew.stats.missingTopology}`
  );
  console.log("");
  console.log("OpenGNT:");
  console.log(
    `  ${greek.stats.sourceOccurrences} occurrences`
  );
  console.log(
    `  ${greek.stats.sourceVerses} verses`
  );
  console.log(
    `  missing entities: ${greek.stats.missingEntities}`
  );
  console.log(
    `  missing meanings: ${greek.stats.missingReaderMeanings}`
  );
  console.log(
    `  missing-transliteration entities (non-blocking): ` +
      `${greek.stats.missingTransliterationEntities}`
  );
  console.log("");
  console.log("LXX:");
  console.log(
    `  occurrence morphology attached: ` +
      `${lxx.stats.morphologyAttachedOccurrences}`
  );
  console.log(
    `  morphology unavailable: ` +
      `${lxx.stats.morphologyUnavailableOccurrences}`
  );
  console.log("");
  console.log("No deployment performed.");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("PHASE-1 SOURCE BREAKDOWN RUNTIME: FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
}
