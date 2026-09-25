"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

const PATHS = {
  web: path.join(ROOT, "app", "data", "scripture", "generatedWEB.json"),
  kjv: path.join(ROOT, "app", "data", "scripture", "generatedKJV.json"),
  brenton: path.join(ROOT, "app", "data", "scripture", "generatedBrenton.json"),

  hebrewCanonical: path.join(
    ROOT,
    "app",
    "data",
    "bibleiq",
    "canonical",
    "hebrew"
  ),

  greekCanonical: path.join(
    ROOT,
    "app",
    "data",
    "bibleiq",
    "canonical",
    "greek-nt"
  ),

  lxxCanonical: path.join(
    ROOT,
    "app",
    "data",
    "bibleiq",
    "canonical",
    "lxx"
  ),

  wlcGraph: path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "source-graphs",
    "wlc-morpheme",
    "v2",
    "books"
  ),

  overlayRoot: path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "overlays",
    "web-wlc",
    "v2"
  ),

  output: path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "source-breakdown",
    "verse-map.json"
  )
};

const EXPECTED = {
  webReader: 31098,
  kjvReader: 31102,
  brentonReader: 28548,

  otReader: 23145,

  webNtResolved: 7941,
  webNtUnresolved: 12,

  kjvNtResolved: 7942,
  kjvNtUnresolved: 15,

  brentonResolved: 27216,
  brentonUnresolved: 1332,

  hebrewSourceVerses: 23145
};

function fail(message) {
  throw new Error(message);
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  );
}

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
}

function rawBookKey(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const BOOK_ALIASES = {
  gen: "genesis",
  ge: "genesis",
  genesis: "genesis",

  ex: "exodus",
  exo: "exodus",
  exod: "exodus",
  exodus: "exodus",

  lev: "leviticus",
  leviticus: "leviticus",

  num: "numbers",
  nums: "numbers",
  numbers: "numbers",

  deut: "deuteronomy",
  deuteronomy: "deuteronomy",

  josh: "joshua",
  joshua: "joshua",

  judg: "judges",
  judges: "judges",

  ruth: "ruth",

  "1sam": "1samuel",
  "1samuel": "1samuel",
  "2sam": "2samuel",
  "2samuel": "2samuel",

  "1kgs": "1kings",
  "1ki": "1kings",
  "1kings": "1kings",

  "2kgs": "2kings",
  "2ki": "2kings",
  "2kings": "2kings",

  "1chr": "1chronicles",
  "1chron": "1chronicles",
  "1chronicles": "1chronicles",

  "2chr": "2chronicles",
  "2chron": "2chronicles",
  "2chronicles": "2chronicles",

  ezra: "ezra",

  neh: "nehemiah",
  nehemiah: "nehemiah",

  esth: "esther",
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
  eccles: "ecclesiastes",
  ecclesiastes: "ecclesiastes",

  song: "songofsolomon",
  songs: "songofsolomon",
  songofsongs: "songofsolomon",
  songofsolomon: "songofsolomon",
  canticles: "songofsolomon",

  isa: "isaiah",
  isaiah: "isaiah",

  jer: "jeremiah",
  jeremiah: "jeremiah",

  lam: "lamentations",
  lamentations: "lamentations",

  ezek: "ezekiel",
  ez: "ezekiel",
  ezekiel: "ezekiel",

  dan: "daniel",
  daniel: "daniel",

  hos: "hosea",
  hosea: "hosea",

  joel: "joel",
  amos: "amos",

  obad: "obadiah",
  obadiah: "obadiah",

  jonah: "jonah",

  mic: "micah",
  micah: "micah",

  nah: "nahum",
  nahum: "nahum",

  hab: "habakkuk",
  habakkuk: "habakkuk",

  zeph: "zephaniah",
  zephaniah: "zephaniah",

  hag: "haggai",
  haggai: "haggai",

  zech: "zechariah",
  zechariah: "zechariah",

  mal: "malachi",
  malachi: "malachi",

  matt: "matthew",
  mt: "matthew",
  matthew: "matthew",

  mark: "mark",
  mrk: "mark",

  luke: "luke",
  lk: "luke",

  john: "john",
  jn: "john",

  acts: "acts",

  rom: "romans",
  romans: "romans",

  "1cor": "1corinthians",
  "1corinthians": "1corinthians",
  "2cor": "2corinthians",
  "2corinthians": "2corinthians",

  gal: "galatians",
  galatians: "galatians",

  eph: "ephesians",
  ephesians: "ephesians",

  phil: "philippians",
  philippians: "philippians",

  col: "colossians",
  colossians: "colossians",

  "1thess": "1thessalonians",
  "1thessalonians": "1thessalonians",

  "2thess": "2thessalonians",
  "2thessalonians": "2thessalonians",

  "1tim": "1timothy",
  "1timothy": "1timothy",

  "2tim": "2timothy",
  "2timothy": "2timothy",

  titus: "titus",

  phlm: "philemon",
  philemon: "philemon",

  heb: "hebrews",
  hebrews: "hebrews",

  jas: "james",
  james: "james",

  "1pet": "1peter",
  "1peter": "1peter",

  "2pet": "2peter",
  "2peter": "2peter",

  "1john": "1john",
  "2john": "2john",
  "3john": "3john",

  jude: "jude",

  rev: "revelation",
  revelation: "revelation",

  "1esdras": "1esdras",
  "2esdras": "2esdras",
  judith: "judith",
  tob: "tobit",
  tobit: "tobit",
  prayerofmanasseh: "prayerofmanasseh",
  wisdom: "wisdom",
  wisdomofsolomon: "wisdom",
  sirach: "sirach",
  ecclesiasticus: "sirach",
  baruch: "baruch",
  letterofjeremiah: "epistleofjeremiah",
  epistleofjeremiah: "epistleofjeremiah",
  "1maccabees": "1maccabees",
  "2maccabees": "2maccabees",
  "3maccabees": "3maccabees",
  "4maccabees": "4maccabees"
};

function normalizeBook(value) {
  const raw = rawBookKey(value);
  return BOOK_ALIASES[raw] || raw;
}

const OT_BOOKS = new Set([
  "genesis",
  "exodus",
  "leviticus",
  "numbers",
  "deuteronomy",
  "joshua",
  "judges",
  "ruth",
  "1samuel",
  "2samuel",
  "1kings",
  "2kings",
  "1chronicles",
  "2chronicles",
  "ezra",
  "nehemiah",
  "esther",
  "job",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "isaiah",
  "jeremiah",
  "lamentations",
  "ezekiel",
  "daniel",
  "hosea",
  "joel",
  "amos",
  "obadiah",
  "jonah",
  "micah",
  "nahum",
  "habakkuk",
  "zephaniah",
  "haggai",
  "zechariah",
  "malachi"
]);

const NT_BOOKS = new Set([
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "1corinthians",
  "2corinthians",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "1thessalonians",
  "2thessalonians",
  "1timothy",
  "2timothy",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "1peter",
  "2peter",
  "1john",
  "2john",
  "3john",
  "jude",
  "revelation"
]);

function refKey(book, chapter, verse) {
  const normalizedBook = normalizeBook(book);
  const c = Number(chapter);
  const v = String(verse ?? "").trim().toLowerCase();

  if (
    !normalizedBook ||
    !Number.isInteger(c) ||
    c <= 0 ||
    !v
  ) {
    return null;
  }

  return `${normalizedBook}|${c}|${v}`;
}

function sourceRef(book, chapter, verse) {
  return [
    String(book || "").trim(),
    Number(chapter),
    String(verse ?? "").trim()
  ];
}

function parseReference(value) {
  const raw = String(value || "")
    .replace(/_/g, " ")
    .trim();

  if (!raw) return null;

  let match = raw.match(
    /^(.+?)[.:]\s*(\d+)[.:]\s*([0-9]+[a-z]?)$/i
  );

  if (!match) {
    match = raw.match(
      /^(.+?)\s+(\d+):([0-9]+[a-z]?)$/i
    );
  }

  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: match[3],
    key: refKey(match[1], match[2], match[3])
  };
}

function parseWlcOccurrenceId(value) {
  const match = String(value || "").match(
    /^wlc:([^:]+):(\d+):(\d+):/
  );

  if (!match) return null;

  return {
    id: String(value),
    book: match[1],
    chapter: Number(match[2]),
    verse: match[3],
    key: refKey(match[1], match[2], match[3])
  };
}

function unwrapVerseMap(document) {
  if (!document || typeof document !== "object") {
    return {};
  }

  if (Array.isArray(document)) {
    const result = {};
    document.forEach((value, index) => {
      result[`$${index}`] = value;
    });
    return result;
  }

  for (const key of [
    "verses",
    "records",
    "data",
    "entries"
  ]) {
    const candidate = document[key];

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      const values = Object.values(candidate);

      if (
        values.some(
          value =>
            value &&
            typeof value === "object" &&
            (
              Array.isArray(value.sourceTokens) ||
              value.reference ||
              value.book
            )
        )
      ) {
        return candidate;
      }
    }
  }

  return document;
}

function getReaderRows(document) {
  if (Array.isArray(document)) {
    return document;
  }

  for (const key of [
    "verses",
    "records",
    "data",
    "entries"
  ]) {
    if (Array.isArray(document?.[key])) {
      return document[key];
    }
  }

  fail("Could not determine reader record container.");
}

function readerText(row) {
  return normalizeText(
    row?.text ||
    row?.sources?.[0]?.text ||
    row?.translationText ||
    ""
  );
}

function readerKey(row) {
  return refKey(
    row?.book,
    row?.chapter,
    row?.verse
  );
}

function collectCanonicalRefs(fallbackKey, verse) {
  const refs = new Set();

  function add(value) {
    const parsed = parseReference(value);
    if (parsed?.key) refs.add(parsed.key);
  }

  add(fallbackKey);
  add(verse?.reference);
  add(verse?.canonicalReference);

  const direct = refKey(
    verse?.book,
    verse?.chapter,
    verse?.verse
  );

  if (direct) refs.add(direct);

  for (const token of Array.isArray(verse?.sourceTokens)
    ? verse.sourceTokens
    : []) {
    add(token?.canonicalReference);
  }

  return [...refs];
}

function collectSourceRefs(verse) {
  const refs = new Map();

  for (const token of Array.isArray(verse?.sourceTokens)
    ? verse.sourceTokens
    : []) {
    const parsed = parseReference(
      token?.sourceReference
    );

    if (!parsed?.key) continue;

    refs.set(
      parsed.key,
      sourceRef(
        parsed.book,
        parsed.chapter,
        parsed.verse
      )
    );
  }

  return [...refs.values()];
}

function addMapRefs(map, displayKey, refs) {
  if (!displayKey || !refs?.length) return;

  const existing = map.get(displayKey) || new Map();

  for (const ref of refs) {
    const key = refKey(
      ref[0],
      ref[1],
      ref[2]
    );

    if (key) existing.set(key, ref);
  }

  map.set(displayKey, existing);
}

function compareSourceRefs(left, right) {
  const bookCompare = normalizeBook(left[0]).localeCompare(
    normalizeBook(right[0])
  );

  if (bookCompare) return bookCompare;

  const chapterCompare =
    Number(left[1]) - Number(right[1]);

  if (chapterCompare) return chapterCompare;

  const parseVerse = value => {
    const match = /^(\d+)([a-z]*)$/i.exec(
      String(value || "")
    );

    return {
      number: match
        ? Number(match[1])
        : Number.MAX_SAFE_INTEGER,
      suffix: match?.[2] || String(value || "")
    };
  };

  const a = parseVerse(left[2]);
  const b = parseVerse(right[2]);

  return (
    a.number - b.number ||
    a.suffix.localeCompare(b.suffix)
  );
}

function compactMap(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, refs]) => [
        key,
        [...refs.values()].sort(compareSourceRefs)
      ])
  );
}

function readJsonl(file, onRow) {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "");

  let rows = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;

    rows += 1;
    onRow(JSON.parse(line), rows);
  }

  return rows;
}

function collectOverlaySourceIds(row) {
  const ids = new Set();

  function add(value) {
    const parsed = parseWlcOccurrenceId(value);

    if (parsed) ids.add(parsed.id);
  }

  add(row?.source?.ownerOccurrenceId);

  for (const item of Array.isArray(
    row?.source?.segment
  )
    ? row.source.segment
    : []) {
    add(item?.occurrenceId);
  }

  for (const id of Array.isArray(
    row?.v2Native?.sourceIds
  )
    ? row.v2Native.sourceIds
    : []) {
    add(id);
  }

  add(row?.sourceEvidence?.hostOccurrenceId);
  add(row?.sourceEvidence?.evidenceId);

  for (const item of Array.isArray(
    row?.sourceEvidence?.segment
  )
    ? row.sourceEvidence.segment
    : []) {
    add(item?.occurrenceId);
  }

  return [...ids];
}

function buildOtOverlayMap() {
  const manifestFile = path.join(
    PATHS.overlayRoot,
    "LAYER-MANIFEST.json"
  );

  if (!exists(manifestFile)) {
    fail(`Missing promoted WEB/WLC manifest: ${manifestFile}`);
  }

  const manifest = readJson(manifestFile);

  if (!Array.isArray(manifest.layers)) {
    fail("WEB/WLC LAYER-MANIFEST.json has no layers array.");
  }

  const map = new Map();

  for (const layer of manifest.layers) {
    const file = path.join(
      PATHS.overlayRoot,
      layer.file
    );

    if (!exists(file)) {
      fail(`Missing promoted layer: ${layer.file}`);
    }

    if (
      layer.sha256 &&
      sha256(file) !== layer.sha256
    ) {
      fail(`SHA mismatch for promoted layer ${layer.file}`);
    }

    const actualRows = readJsonl(
      file,
      row => {
        if (
          String(row?.translation || "")
            .toUpperCase() !== "WEB"
        ) {
          return;
        }

        const display = parseReference(
          row?.reference
        );

        if (!display?.key) return;

        const refs = new Map();

        for (const id of collectOverlaySourceIds(row)) {
          const parsed = parseWlcOccurrenceId(id);

          if (!parsed?.key) continue;

          refs.set(
            parsed.key,
            sourceRef(
              parsed.book,
              parsed.chapter,
              parsed.verse
            )
          );
        }

        addMapRefs(
          map,
          display.key,
          [...refs.values()]
        );
      }
    );

    if (
      Number.isFinite(Number(layer.rows)) &&
      actualRows !== Number(layer.rows)
    ) {
      fail(
        `Row-count mismatch for ${layer.file}: ` +
        `${layer.rows} != ${actualRows}`
      );
    }
  }

  return {
    map,
    manifestFingerprint:
      manifest.canonicalWlcV2Fingerprint || null,
    sourceOrderAuthority:
      manifest.sourceOrderAuthority || null
  };
}

function applyCanonicalHebrewFallback(map) {
  const files = fs
    .readdirSync(PATHS.hebrewCanonical)
    .filter(file => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const document = readJson(
      path.join(PATHS.hebrewCanonical, file)
    );

    const verseMap = unwrapVerseMap(document);

    for (const [fallbackKey, verse] of Object.entries(
      verseMap
    )) {
      if (!verse || typeof verse !== "object") {
        continue;
      }

      const displayRefs =
        collectCanonicalRefs(
          fallbackKey,
          verse
        );

      const sourceRefs =
        collectSourceRefs(verse);

      if (!sourceRefs.length) continue;

      for (const displayKey of displayRefs) {
        if (map.has(displayKey)) {
          continue;
        }

        addMapRefs(
          map,
          displayKey,
          sourceRefs
        );
      }
    }
  }
}

function setExactMapping(map, display, sources) {
  const parsedDisplay = parseReference(display);

  if (!parsedDisplay?.key) {
    fail(`Bad audited display mapping: ${display}`);
  }

  const refs = new Map();

  for (const source of sources) {
    const parsed = parseReference(source);

    if (!parsed?.key) {
      fail(`Bad audited source mapping: ${source}`);
    }

    refs.set(
      parsed.key,
      sourceRef(
        parsed.book,
        parsed.chapter,
        parsed.verse
      )
    );
  }

  map.set(parsedDisplay.key, refs);
}

function applyAuditedOtBridges(map) {
  setExactMapping(
    map,
    "Hosea 13:16",
    ["Hos 14:1"]
  );

  setExactMapping(
    map,
    "Isaiah 63:19",
    ["Isa 63:19"]
  );

  for (let i = 0; i < 5; i += 1) {
    setExactMapping(
      map,
      `Joel 2:${28 + i}`,
      [`Joel 3:${1 + i}`]
    );
  }

  for (let verse = 6; verse <= 15; verse += 1) {
    setExactMapping(
      map,
      `Joel 3:${verse}`,
      [`Joel 4:${verse}`]
    );
  }

  for (let verse = 19; verse <= 21; verse += 1) {
    setExactMapping(
      map,
      `Joel 3:${verse}`,
      [`Joel 4:${verse}`]
    );
  }

  setExactMapping(
    map,
    "Nehemiah 7:73",
    ["Neh 7:72"]
  );

  setExactMapping(
    map,
    "Song of Songs 6:13",
    ["Song 7:1"]
  );
}

function buildHebrewOrder() {
  if (!exists(PATHS.wlcGraph)) {
    fail(`Missing WLC v2 graph: ${PATHS.wlcGraph}`);
  }

  const groups = new Map();

  const files = fs
    .readdirSync(PATHS.wlcGraph)
    .filter(file => file.endsWith(".jsonl"))
    .sort();

  for (const file of files) {
    readJsonl(
      path.join(PATHS.wlcGraph, file),
      row => {
        const parsed = parseReference(
          row?.wlcReference
        );

        const occurrenceId =
          String(row?.occurrenceId || "").trim();

        if (
          !parsed?.key ||
          !occurrenceId
        ) {
          return;
        }

        const orderCandidate =
          Number.isFinite(Number(row?.sourceSlotOrder))
            ? Number(row.sourceSlotOrder)
            : Number.isFinite(Number(row?.order))
              ? Number(row.order)
              : Number.MAX_SAFE_INTEGER;

        const list =
          groups.get(parsed.key) || [];

        list.push({
          id: occurrenceId,
          slot: orderCandidate,
          order:
            Number.isFinite(Number(row?.order))
              ? Number(row.order)
              : orderCandidate,
          bridge:
            row?.versification?.bridge === true,
          quarantine:
            row?.versification?.quarantine === true
        });

        groups.set(parsed.key, list);
      }
    );
  }

  const output = {};

  for (const [key, rows] of groups.entries()) {
    output[key] = rows
      .sort(
        (a, b) =>
          a.slot - b.slot ||
          a.order - b.order ||
          a.id.localeCompare(b.id)
      )
      .map(row => [
        row.id,
        row.slot,
        row.bridge ? 1 : 0,
        row.quarantine ? 1 : 0
      ]);
  }

  return output;
}

function buildCanonicalCorpusIndex(
  directory,
  expectedSource
) {
  const direct = new Map();

  const translationText = {
    web: new Map(),
    kjv: new Map()
  };

  const files = fs
    .readdirSync(directory)
    .filter(file => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const document = readJson(
      path.join(directory, file)
    );

    const verseMap = unwrapVerseMap(document);

    for (const [fallbackKey, verse] of Object.entries(
      verseMap
    )) {
      if (!verse || typeof verse !== "object") {
        continue;
      }

      const tokens = Array.isArray(
        verse.sourceTokens
      )
        ? verse.sourceTokens
        : [];

      const owned = tokens.filter(token => {
        const source = String(
          token?.source ||
          token?.corpus ||
          ""
        ).trim();

        return !expectedSource ||
          source === expectedSource;
      });

      if (!owned.length) continue;

      const sourceRefs =
        collectSourceRefs(verse);

      if (!sourceRefs.length) continue;

      const displayRefs =
        collectCanonicalRefs(
          fallbackKey,
          verse
        );

      for (const key of displayRefs) {
        addMapRefs(
          direct,
          key,
          sourceRefs
        );
      }

      const canonicalKey =
        displayRefs[0];

      if (!canonicalKey) continue;

      const canonicalBook =
        canonicalKey.split("|")[0];

      for (const translation of [
        "web",
        "kjv"
      ]) {
        const text = normalizeText(
          verse?.translations?.[translation]?.text
        );

        if (!text) continue;

        const key =
          `${canonicalBook}|${text}`;

        if (!translationText[translation].has(key)) {
          translationText[translation].set(
            key,
            []
          );
        }

        translationText[translation]
          .get(key)
          .push(sourceRefs);
      }
    }
  }

  return {
    direct,
    translationText
  };
}

function buildNtReaderMap({
  rows,
  translation,
  index
}) {
  const map = new Map();
  const unresolved = [];

  for (const row of rows) {
    const displayKey =
      readerKey(row);

    if (!displayKey) continue;

    const book =
      displayKey.split("|")[0];

    if (!NT_BOOKS.has(book)) {
      continue;
    }

    const text =
      readerText(row);

    const textKey =
      `${book}|${text}`;

    const textMatches =
      text &&
      index.translationText[translation].get(
        textKey
      );

    if (
      textMatches &&
      textMatches.length === 1
    ) {
      addMapRefs(
        map,
        displayKey,
        textMatches[0]
      );

      continue;
    }

    const direct =
      index.direct.get(displayKey);

    if (direct?.size) {
      addMapRefs(
        map,
        displayKey,
        [...direct.values()]
      );

      continue;
    }

    unresolved.push({
      id: row?.id || null,
      reference:
        row?.reference ||
        `${row?.book} ${row?.chapter}:${row?.verse}`
    });
  }

  return {
    map,
    unresolved
  };
}

function buildBrentonMap(rows) {
  const map = new Map();
  const unresolved = [];

  for (const row of rows) {
    const id =
      String(row?.id || "").trim();

    if (!id) {
      unresolved.push({
        id: null,
        reference:
          row?.reference || null,
        reason: "missing-reader-record-id"
      });

      continue;
    }

    const ownership =
      row?.lxxOwnership || {};

    if (
      ownership.entityRoutingEligible !== true ||
      ownership.directLxxCoordinateExists !== true ||
      !ownership.authoritativeOwnershipKey ||
      ownership.exclusionReason
    ) {
      unresolved.push({
        id,
        reference:
          row?.reference || null,
        reason:
          ownership.exclusionReason ||
          ownership.eligibility ||
          "no-authoritative-lxx-source"
      });

      continue;
    }

    const parsed =
      parseReference(
        ownership.authoritativeOwnershipKey
      ) ||
      parseReference(
        ownership.directLxxCoordinate
      );

    if (!parsed?.key) {
      unresolved.push({
        id,
        reference:
          row?.reference || null,
        reason:
          "unparseable-authoritative-lxx-source"
      });

      continue;
    }

    map.set(
      id,
      [
        sourceRef(
          parsed.book,
          parsed.chapter,
          parsed.verse
        )
      ]
    );
  }

  return {
    map,
    unresolved
  };
}

for (const [name, file] of Object.entries({
  web: PATHS.web,
  kjv: PATHS.kjv,
  brenton: PATHS.brenton,
  hebrewCanonical: PATHS.hebrewCanonical,
  greekCanonical: PATHS.greekCanonical,
  lxxCanonical: PATHS.lxxCanonical,
  wlcGraph: PATHS.wlcGraph,
  overlayRoot: PATHS.overlayRoot
})) {
  if (!exists(file)) {
    fail(`Required ${name} path missing: ${file}`);
  }
}

console.log("");
console.log("Building Phase 1 source-breakdown verse map...");
console.log("");

const webRows =
  getReaderRows(readJson(PATHS.web));

const kjvRows =
  getReaderRows(readJson(PATHS.kjv));

const brentonRows =
  getReaderRows(readJson(PATHS.brenton));

if (webRows.length !== EXPECTED.webReader) {
  fail(
    `WEB reader count changed: ` +
    `${webRows.length} != ${EXPECTED.webReader}`
  );
}

if (kjvRows.length !== EXPECTED.kjvReader) {
  fail(
    `KJV reader count changed: ` +
    `${kjvRows.length} != ${EXPECTED.kjvReader}`
  );
}

if (
  brentonRows.length !==
  EXPECTED.brentonReader
) {
  fail(
    `Brenton reader count changed: ` +
    `${brentonRows.length} != ${EXPECTED.brentonReader}`
  );
}

/*
 * WEB/KJV OT
 *
 * Precedence is intentional:
 *   1. promoted WEB -> WLC ownership
 *   2. canonical runtime sourceReference fallback
 *   3. explicitly audited WLC v2 bridge exceptions
 *
 * No alignment is generated here.
 */
const otBuild =
  buildOtOverlayMap();

applyCanonicalHebrewFallback(
  otBuild.map
);

applyAuditedOtBridges(
  otBuild.map
);

const webOtKeys = new Set(
  webRows
    .map(readerKey)
    .filter(Boolean)
    .filter(
      key =>
        OT_BOOKS.has(
          key.split("|")[0]
        )
    )
);

const kjvOtKeys = new Set(
  kjvRows
    .map(readerKey)
    .filter(Boolean)
    .filter(
      key =>
        OT_BOOKS.has(
          key.split("|")[0]
        )
    )
);

if (
  webOtKeys.size !== EXPECTED.otReader ||
  kjvOtKeys.size !== EXPECTED.otReader
) {
  fail(
    `OT reader count drift: WEB=${webOtKeys.size}, ` +
    `KJV=${kjvOtKeys.size}`
  );
}

const webOnly = [...webOtKeys].filter(
  key => !kjvOtKeys.has(key)
);

const kjvOnly = [...kjvOtKeys].filter(
  key => !webOtKeys.has(key)
);

if (
  webOnly.length ||
  kjvOnly.length
) {
  fail(
    "WEB and KJV OT verse-reference sets are no longer identical."
  );
}

const missingOt = [...webOtKeys].filter(
  key => !otBuild.map.get(key)?.size
);

if (missingOt.length) {
  fail(
    `OT source map incomplete: ${missingOt.length} missing. ` +
    missingOt.slice(0, 20).join(", ")
  );
}

if (
  otBuild.map.size < EXPECTED.otReader
) {
  fail(
    `OT map too small: ${otBuild.map.size}`
  );
}

const hebrewOrder =
  buildHebrewOrder();

/*
 * The WLC source graph and the English reader intentionally have
 * different verse-coordinate inventories because source topology
 * preserves source-only / alternate-versification containers.
 *
 * The Phase 1 invariant is therefore NOT:
 *   WLC source verse count === English reader verse count
 *
 * The real invariant is:
 *   every WLC source verse referenced by a displayed OT verse
 *   must exist in the ordered WLC v2 source graph.
 */
const referencedOtSourceKeys = new Set();

for (const displayKey of webOtKeys) {
  const refs = otBuild.map.get(displayKey);

  for (const sourceKey of refs?.keys() || []) {
    referencedOtSourceKeys.add(sourceKey);
  }
}

const missingOrderedOtSources = [
  ...referencedOtSourceKeys
].filter(
  sourceKey => !hebrewOrder[sourceKey]
);

if (missingOrderedOtSources.length) {
  fail(
    `OT mappings reference ${missingOrderedOtSources.length} ` +
    `WLC source verses with no ordered WLC-v2 occurrences: ` +
    missingOrderedOtSources.slice(0, 20).join(", ")
  );
}

/*
 * WEB/KJV NT -> OpenGNT
 */
const greekIndex =
  buildCanonicalCorpusIndex(
    PATHS.greekCanonical,
    "greek-nt"
  );

const webNt =
  buildNtReaderMap({
    rows: webRows,
    translation: "web",
    index: greekIndex
  });

const kjvNt =
  buildNtReaderMap({
    rows: kjvRows,
    translation: "kjv",
    index: greekIndex
  });

if (
  webNt.map.size !==
    EXPECTED.webNtResolved ||
  webNt.unresolved.length !==
    EXPECTED.webNtUnresolved
) {
  fail(
    `WEB NT checkpoint changed: ` +
    `resolved=${webNt.map.size}, ` +
    `unresolved=${webNt.unresolved.length}`
  );
}

if (
  kjvNt.map.size !==
    EXPECTED.kjvNtResolved ||
  kjvNt.unresolved.length !==
    EXPECTED.kjvNtUnresolved
) {
  fail(
    `KJV NT checkpoint changed: ` +
    `resolved=${kjvNt.map.size}, ` +
    `unresolved=${kjvNt.unresolved.length}`
  );
}

/*
 * Brenton -> LXX authoritative reader ownership.
 */
const brenton =
  buildBrentonMap(brentonRows);

if (
  brenton.map.size !==
    EXPECTED.brentonResolved ||
  brenton.unresolved.length !==
    EXPECTED.brentonUnresolved
) {
  fail(
    `Brenton checkpoint changed: ` +
    `resolved=${brenton.map.size}, ` +
    `unresolved=${brenton.unresolved.length}`
  );
}

const result = {
  schemaVersion:
    "emet-phase1-source-breakdown-verse-map/v1",

  generatedAt:
    new Date().toISOString(),

  policy: {
    phase:
      "Phase 1 verse-first source breakdown",

    englishWordOwnershipRequired:
      false,

    alignmentGeneration:
      false,

    otResolutionPrecedence: [
      "promoted-web-wlc-verse-ownership",
      "canonical-sourceReference-fallback",
      "audited-wlc-v2-bridge-exception"
    ],

    sourceOrderAuthority: {
      hebrew: "WLC-v2-sourceSlotOrder",
      greekNt: "OpenGNT-canonical-source-order",
      lxx: "LXX-canonical-source-order"
    },

    brentonOwnership:
      "reader-record-authoritative-lxx-ownership",

    failClosed:
      true
  },

  provenance: {
    webWlcManifestFingerprint:
      otBuild.manifestFingerprint,

    webWlcSourceOrderAuthority:
      otBuild.sourceOrderAuthority
  },

  counts: {
    otSharedWebKjv:
      webOtKeys.size,

    webNtResolved:
      webNt.map.size,

    webNtUnresolved:
      webNt.unresolved.length,

    kjvNtResolved:
      kjvNt.map.size,

    kjvNtUnresolved:
      kjvNt.unresolved.length,

    brentonResolved:
      brenton.map.size,

    brentonUnresolved:
      brenton.unresolved.length,

    hebrewOrderedSourceVerses:
      Object.keys(hebrewOrder).length,

    otReferencedWlcSourceVerses:
      referencedOtSourceKeys.size
  },

  ot: compactMap(
    new Map(
      [...otBuild.map.entries()]
        .filter(
          ([key]) =>
            webOtKeys.has(key)
        )
    )
  ),

  nt: {
    web: compactMap(webNt.map),
    kjv: compactMap(kjvNt.map)
  },

  brenton:
    Object.fromEntries(
      [...brenton.map.entries()]
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
    ),

  hebrewOrder,

  unavailable: {
    webNt:
      webNt.unresolved,

    kjvNt:
      kjvNt.unresolved,

    brenton:
      brenton.unresolved
  }
};

const temp =
  `${PATHS.output}.tmp-${process.pid}`;

fs.writeFileSync(
  temp,
  JSON.stringify(result) + "\n",
  "utf8"
);

fs.renameSync(
  temp,
  PATHS.output
);

console.log("PASS");
console.log("");
console.log(
  `OT WEB/KJV: ${result.counts.otSharedWebKjv}/23145`
);
console.log(
  `WEB NT: ${result.counts.webNtResolved} resolved / ` +
  `${result.counts.webNtUnresolved} source-unavailable`
);
console.log(
  `KJV NT: ${result.counts.kjvNtResolved} resolved / ` +
  `${result.counts.kjvNtUnresolved} source-unavailable`
);
console.log(
  `Brenton: ${result.counts.brentonResolved} resolved / ` +
  `${result.counts.brentonUnresolved} source-unavailable`
);
console.log(
  `WLC graph source coordinates: ` +
  `${result.counts.hebrewOrderedSourceVerses}`
);
console.log(
  `WLC source verses referenced by OT reader: ` +
  `${result.counts.otReferencedWlcSourceVerses}`
);
console.log("");
console.log(
  `OUTPUT=${PATHS.output}`
);
console.log("");
console.log(
  "No existing alignment, canonical source, reader, UI, or deployment files were modified."
);
