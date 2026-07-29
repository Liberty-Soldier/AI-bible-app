"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(`[P05.12AD KJV evidence packet] ${message}`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--canonical-root" && next) {
      args.canonicalRoot = path.resolve(next);
      index += 1;
    } else if (current === "--current-reader" && next) {
      args.currentReader = path.resolve(next);
      index += 1;
    } else if (current === "--candidate" && next) {
      args.candidate = path.resolve(next);
      index += 1;
    } else if (current === "--gap-summary" && next) {
      args.gapSummary = path.resolve(next);
      index += 1;
    } else if (current === "--topology-summary" && next) {
      args.topologySummary = path.resolve(next);
      index += 1;
    } else if (current === "--tvtms" && next) {
      args.tvtms = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  for (const key of [
    "canonicalRoot",
    "currentReader",
    "candidate",
    "gapSummary",
    "topologySummary",
    "tvtms",
    "output",
  ]) {
    if (!args[key]) {
      fail(`Missing required argument: ${key}`);
    }
  }

  return args;
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
  );
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function escapeCsv(value) {
  const text = value == null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

  return `"${String(text).replace(/"/g, '""')}"`;
}

function writeCsv(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (!rows.length) {
    fs.writeFileSync(file, "", "utf8");
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map(row =>
      headers.map(header => escapeCsv(row[header])).join(","),
    ),
  ];

  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function walk(directory, predicate = () => true) {
  const result = [];

  if (!fs.existsSync(directory)) {
    return result;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walk(full, predicate));
    } else if (
      entry.isFile() &&
      predicate(full)
    ) {
      result.push(full);
    }
  }

  return result.sort();
}

function normalizeBook(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BOOK_ALIASES = new Map(
  Object.entries({
    gen: "genesis",
    genesis: "genesis",
    exod: "exodus",
    exodus: "exodus",
    lev: "leviticus",
    leviticus: "leviticus",
    num: "numbers",
    numbers: "numbers",
    deut: "deuteronomy",
    deuteronomy: "deuteronomy",
    josh: "joshua",
    joshua: "joshua",
    judg: "judges",
    judges: "judges",
    ruth: "ruth",
    "1sam": "1 samuel",
    "1 sam": "1 samuel",
    "1 samuel": "1 samuel",
    "2sam": "2 samuel",
    "2 sam": "2 samuel",
    "2 samuel": "2 samuel",
    "1kgs": "1 kings",
    "1 kgs": "1 kings",
    "1 kings": "1 kings",
    "2kgs": "2 kings",
    "2 kgs": "2 kings",
    "2 kings": "2 kings",
    "1chr": "1 chronicles",
    "1 chr": "1 chronicles",
    "1 chronicles": "1 chronicles",
    "2chr": "2 chronicles",
    "2 chr": "2 chronicles",
    "2 chronicles": "2 chronicles",
    ezra: "ezra",
    neh: "nehemiah",
    nehemiah: "nehemiah",
    esth: "esther",
    esther: "esther",
    job: "job",
    ps: "psalms",
    psalm: "psalms",
    psalms: "psalms",
    prov: "proverbs",
    proverbs: "proverbs",
    eccl: "ecclesiastes",
    ecclesiastes: "ecclesiastes",
    song: "song of solomon",
    "song of songs": "song of solomon",
    "song of solomon": "song of solomon",
    isa: "isaiah",
    isaiah: "isaiah",
    jer: "jeremiah",
    jeremiah: "jeremiah",
    lam: "lamentations",
    lamentations: "lamentations",
    ezek: "ezekiel",
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
    matthew: "matthew",
    mark: "mark",
    luke: "luke",
    john: "john",
    acts: "acts",
    rom: "romans",
    romans: "romans",
    "1cor": "1 corinthians",
    "1 cor": "1 corinthians",
    "1 corinthians": "1 corinthians",
    "2cor": "2 corinthians",
    "2 cor": "2 corinthians",
    "2 corinthians": "2 corinthians",
    gal: "galatians",
    galatians: "galatians",
    eph: "ephesians",
    ephesians: "ephesians",
    phil: "philippians",
    philippians: "philippians",
    col: "colossians",
    colossians: "colossians",
    "1thess": "1 thessalonians",
    "1 thess": "1 thessalonians",
    "1 thessalonians": "1 thessalonians",
    "2thess": "2 thessalonians",
    "2 thess": "2 thessalonians",
    "2 thessalonians": "2 thessalonians",
    "1tim": "1 timothy",
    "1 tim": "1 timothy",
    "1 timothy": "1 timothy",
    "2tim": "2 timothy",
    "2 tim": "2 timothy",
    "2 timothy": "2 timothy",
    titus: "titus",
    phlm: "philemon",
    philemon: "philemon",
    heb: "hebrews",
    hebrews: "hebrews",
    jas: "james",
    james: "james",
    "1pet": "1 peter",
    "1 pet": "1 peter",
    "1 peter": "1 peter",
    "2pet": "2 peter",
    "2 pet": "2 peter",
    "2 peter": "2 peter",
    "1john": "1 john",
    "1 john": "1 john",
    "2john": "2 john",
    "2 john": "2 john",
    "3john": "3 john",
    "3 john": "3 john",
    jude: "jude",
    rev: "revelation",
    revelation: "revelation",
  }),
);

function canonicalBookName(value) {
  const normalized = normalizeBook(value);
  return BOOK_ALIASES.get(normalized) || normalized;
}

function coordinateKey(book, chapter, verse) {
  return `${canonicalBookName(book)}:${Number(chapter)}:${Number(verse)}`;
}

function visibleText(record) {
  return String(
    record?.sources?.find(source =>
      /king james|authorized version/i.test(
        String(source?.sourceName ?? ""),
      ),
    )?.text ??
      record?.sources?.[0]?.text ??
      record?.text ??
      "",
  );
}

function buildReader(document, label) {
  if (!Array.isArray(document)) {
    fail(`${label} must be a verse array.`);
  }

  const books = new Map();
  const coordinates = new Map();

  for (const record of document) {
    const book = canonicalBookName(record?.book);
    const chapter = Number(record?.chapter);
    const verse = Number(record?.verse);
    const key = coordinateKey(book, chapter, verse);
    const text = visibleText(record);

    if (!book || !chapter || !verse || !text) {
      fail(`Invalid ${label} record: ${JSON.stringify(record)}`);
    }

    if (coordinates.has(key)) {
      fail(`Duplicate ${label} coordinate: ${key}`);
    }

    if (!books.has(book)) {
      books.set(book, []);
    }

    const entry = {
      key,
      book,
      chapter,
      verse,
      reference: String(
        record?.reference ??
          `${record?.book} ${chapter}:${verse}`,
      ),
      text,
      raw: record,
    };

    books.get(book).push(entry);
    coordinates.set(key, entry);
  }

  for (const entries of books.values()) {
    entries.sort(
      (left, right) =>
        left.chapter - right.chapter ||
        left.verse - right.verse,
    );

    entries.forEach((entry, index) => {
      entry.index = index;
    });
  }

  if (coordinates.size !== 31102) {
    fail(
      `${label} inventory drift: expected 31102, found ${coordinates.size}`,
    );
  }

  return {
    books,
    coordinates,
  };
}

function recordBookName(record, filename) {
  const direct = record?.book ?? record?.source?.book;

  if (direct) {
    return canonicalBookName(direct);
  }

  const reference = String(record?.reference ?? "");
  const match = /^(.*?)\s+\d+:\d+/.exec(reference);

  if (match) {
    return canonicalBookName(match[1]);
  }

  return canonicalBookName(
    path.basename(filename, ".json"),
  );
}

function sourceCoordinate(record, objectKey) {
  const chapter = Number(
    record?.chapter ??
      record?.source?.chapter ??
      String(objectKey).match(/:(\d+):/)?.[1],
  );
  const verse = Number(
    record?.verse ??
      record?.source?.verse ??
      String(objectKey).match(/:(\d+)$/)?.[1],
  );

  return { chapter, verse };
}

function recordReference(record, objectKey, book) {
  const coordinate = sourceCoordinate(record, objectKey);

  return String(
    record?.reference ??
      record?.sourceReference ??
      `${book} ${coordinate.chapter}:${coordinate.verse}`,
  );
}

function safeClone(value) {
  return value == null
    ? value
    : JSON.parse(JSON.stringify(value));
}

function collectCanonical(canonicalRoot) {
  const books = new Map();
  const files = [];

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walk(
      path.join(canonicalRoot, corpus),
      filePath => filePath.endsWith(".json"),
    )) {
      const filename = path.basename(file);
      const document = readJson(file);
      const owned = ownsCanonicalFile(
        corpus,
        document,
        filename,
      );

      files.push({
        corpus,
        filename,
        owned,
        records: Object.keys(document).length,
      });

      for (const [objectKey, record] of Object.entries(document)) {
        const book = recordBookName(record, filename);
        const coordinate = sourceCoordinate(record, objectKey);
        const key = coordinateKey(
          book,
          coordinate.chapter,
          coordinate.verse,
        );

        if (!books.has(book)) {
          books.set(book, []);
        }

        books.get(book).push({
          key,
          book,
          corpus,
          filename,
          objectKey,
          owned,
          chapter: coordinate.chapter,
          verse: coordinate.verse,
          reference: recordReference(
            record,
            objectKey,
            book,
          ),
          hasKjv: Boolean(record?.translations?.kjv),
          kjvText:
            record?.translations?.kjv?.text ?? null,
          webText:
            record?.translations?.web?.text ?? null,
          translationsPresent: Object.keys(
            record?.translations || {},
          ).sort(),
          sourceTokenCount: Array.isArray(
            record?.sourceTokens,
          )
            ? record.sourceTokens.length
            : Array.isArray(record?.tokens)
              ? record.tokens.length
              : null,
          raw: safeClone(record),
        });
      }
    }
  }

  for (const entries of books.values()) {
    entries.sort(
      (left, right) =>
        left.chapter - right.chapter ||
        left.verse - right.verse ||
        left.owned - right.owned ||
        left.objectKey.localeCompare(right.objectKey),
    );

    entries.forEach((entry, index) => {
      entry.index = index;
    });
  }

  return { books, files };
}

function addWindow(set, entries, index, radius) {
  for (
    let offset = -radius;
    offset <= radius;
    offset += 1
  ) {
    const target = entries[index + offset];

    if (target) {
      set.add(target.index);
    }
  }
}

function affectedBooksFromReports(
  gapSummary,
  topologySummary,
) {
  const books = new Set();

  for (const row of gapSummary?.gaps?.rows || []) {
    books.add(canonicalBookName(row.book));
  }

  for (
    const segment of
    topologySummary?.nonTrivialSegments || []
  ) {
    books.add(canonicalBookName(segment.book));
  }

  return [...books].sort();
}

function selectedCanonicalRecords(
  canonical,
  affectedBooks,
  gapSummary,
  topologySummary,
) {
  const selections = new Map();

  for (const book of affectedBooks) {
    selections.set(book, new Set());
  }

  for (const row of gapSummary?.gaps?.rows || []) {
    const book = canonicalBookName(row.book);
    const entries = canonical.books.get(book) || [];
    const key = row.key;

    entries.forEach((entry, index) => {
      if (
        entry.key === key ||
        entry.reference === row.reference
      ) {
        addWindow(selections.get(book), entries, index, 2);
      }
    });
  }

  for (
    const segment of
    topologySummary?.nonTrivialSegments || []
  ) {
    const book = canonicalBookName(segment.book);
    const entries = canonical.books.get(book) || [];
    const references = new Set([
      ...(segment.sourceRecords || []).map(
        record => record.sourceReference,
      ),
      segment.previousAnchor?.sourceReference,
      segment.nextAnchor?.sourceReference,
    ].filter(Boolean));

    entries.forEach((entry, index) => {
      if (references.has(entry.reference)) {
        addWindow(selections.get(book), entries, index, 2);
      }
    });
  }

  const records = [];

  for (const book of affectedBooks) {
    const entries = canonical.books.get(book) || [];
    const selected = selections.get(book);

    for (const index of [...selected].sort((a, b) => a - b)) {
      records.push(entries[index]);
    }
  }

  return records;
}

function selectedReaderRecords(
  reader,
  candidate,
  affectedBooks,
  gapSummary,
  topologySummary,
) {
  const keys = new Set();

  for (const row of gapSummary?.gaps?.rows || []) {
    keys.add(row.key);
  }

  for (
    const segment of
    topologySummary?.nonTrivialSegments || []
  ) {
    for (const verse of segment.readerVerses || []) {
      keys.add(verse.key);
    }

    if (segment.previousAnchor?.readerReference) {
      const entry = [...reader.coordinates.values()].find(
        value =>
          value.reference ===
          segment.previousAnchor.readerReference,
      );
      if (entry) keys.add(entry.key);
    }

    if (segment.nextAnchor?.readerReference) {
      const entry = [...reader.coordinates.values()].find(
        value =>
          value.reference ===
          segment.nextAnchor.readerReference,
      );
      if (entry) keys.add(entry.key);
    }
  }

  const selected = [];

  for (const book of affectedBooks) {
    const entries = reader.books.get(book) || [];
    const selectedIndexes = new Set();

    entries.forEach((entry, index) => {
      if (keys.has(entry.key)) {
        addWindow(selectedIndexes, entries, index, 2);
      }
    });

    for (
      const index of
      [...selectedIndexes].sort((a, b) => a - b)
    ) {
      const current = entries[index];
      const nextCandidate =
        candidate.coordinates.get(current.key);

      selected.push({
        key: current.key,
        reference: current.reference,
        book: current.book,
        chapter: current.chapter,
        verse: current.verse,
        currentText: current.text,
        candidateText:
          nextCandidate?.text ?? null,
        currentMatchesCandidate:
          current.text === nextCandidate?.text,
        currentRaw: current.raw,
        candidateRaw:
          nextCandidate?.raw ?? null,
      });
    }
  }

  return selected;
}

const TVTMS_BOOK_PATTERNS = {
  "1 kings": /\$(?:1Ki|1Kgs|1Kings)\./i,
  "2 corinthians": /\$(?:2Co|2Cor)\./i,
  "3 john": /\$(?:3Jn|3John)\./i,
  acts: /\$(?:Act|Acts)\./i,
  hosea: /\$(?:Hos|Hosea)\./i,
  isaiah: /\$(?:Isa|Isaiah)\./i,
  joel: /\$(?:Joe|Joel)\./i,
  john: /\$(?:Jn|John)\./i,
  luke: /\$(?:Luk|Luke)\./i,
  mark: /\$(?:Mar|Mrk|Mark)\./i,
  matthew: /\$(?:Mat|Matt|Matthew)\./i,
  nehemiah: /\$(?:Neh|Nehemiah)\./i,
  numbers: /\$(?:Num|Numbers)\./i,
  revelation: /\$(?:Rev|Revelation)\./i,
  romans: /\$(?:Rom|Romans)\./i,
  "song of solomon": /\$(?:Sng|Song|Son)\./i,
};

function extractTvtmsEvidence(
  file,
  affectedBooks,
) {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const matched = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (
      affectedBooks.some(book =>
        TVTMS_BOOK_PATTERNS[book]?.test(line),
      )
    ) {
      for (
        let context = Math.max(0, index - 3);
        context <= Math.min(lines.length - 1, index + 3);
        context += 1
      ) {
        matched.add(context);
      }
    }
  }

  return [...matched]
    .sort((a, b) => a - b)
    .map(index => ({
      line: index + 1,
      text: lines[index],
      matchedBookPatterns:
        affectedBooks.filter(book =>
          TVTMS_BOOK_PATTERNS[book]?.test(
            lines[index],
          ),
        ),
    }));
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.currentReader,
    args.candidate,
    args.gapSummary,
    args.topologySummary,
    args.tvtms,
  ]) {
    if (!fs.existsSync(required)) {
      fail(`Required input missing: ${required}`);
    }
  }

  fs.mkdirSync(args.output, { recursive: true });

  const expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829";
  const expectedTvtmsHash =
    "cd5d8d4495a22480fc4ebab9d488f7a7de4a1e265ef7ff96b7855d709606df95";

  const candidateHash = sha256File(args.candidate);
  const tvtmsHash = sha256File(args.tvtms);

  if (candidateHash !== expectedCandidateHash) {
    fail(
      `KJV2006 candidate hash drift: expected ${expectedCandidateHash}, found ${candidateHash}`,
    );
  }

  if (tvtmsHash !== expectedTvtmsHash) {
    fail(
      `TVTMS hash drift: expected ${expectedTvtmsHash}, found ${tvtmsHash}`,
    );
  }

  const gapSummary = readJson(args.gapSummary);
  const topologySummary = readJson(
    args.topologySummary,
  );

  if (
    gapSummary?.milestone !== "P05.12AB" ||
    gapSummary?.gaps?.count !== 40
  ) {
    fail("The P05.12AB gap report is not the approved 40-coordinate report.");
  }

  if (
    topologySummary?.milestone !== "P05.12AC" ||
    topologySummary?.totals?.sourceOwnedRecords !== 31086 ||
    topologySummary?.totals?.readerVerses !== 31102
  ) {
    fail("The supplied P05.12AC topology report is not the completed V3 audit.");
  }

  const currentReader = buildReader(
    readJson(args.currentReader),
    "Current production KJV",
  );
  const candidateReader = buildReader(
    readJson(args.candidate),
    "KJV2006 candidate",
  );
  const canonical = collectCanonical(
    args.canonicalRoot,
  );
  const affectedBooks = affectedBooksFromReports(
    gapSummary,
    topologySummary,
  );

  const canonicalRecords =
    selectedCanonicalRecords(
      canonical,
      affectedBooks,
      gapSummary,
      topologySummary,
    );
  const readerRecords =
    selectedReaderRecords(
      currentReader,
      candidateReader,
      affectedBooks,
      gapSummary,
      topologySummary,
    );
  const tvtmsEvidence = extractTvtmsEvidence(
    args.tvtms,
    affectedBooks,
  );

  const report = {
    milestone: "P05.12AD",
    generatedAtUtc: new Date().toISOString(),
    inputs: {
      canonicalRoot: path
        .relative(process.cwd(), args.canonicalRoot)
        .replace(/\\/g, "/"),
      currentReader: {
        path: path
          .relative(process.cwd(), args.currentReader)
          .replace(/\\/g, "/"),
        sha256: sha256File(args.currentReader),
      },
      candidate: {
        path: path
          .relative(process.cwd(), args.candidate)
          .replace(/\\/g, "/"),
        sha256: candidateHash,
      },
      gapSummary: path
        .relative(process.cwd(), args.gapSummary)
        .replace(/\\/g, "/"),
      topologySummary: path
        .relative(process.cwd(), args.topologySummary)
        .replace(/\\/g, "/"),
      tvtms: {
        path: path
          .relative(process.cwd(), args.tvtms)
          .replace(/\\/g, "/"),
        sha256: tvtmsHash,
      },
    },
    affectedBooks,
    totals: {
      affectedBooks: affectedBooks.length,
      selectedCanonicalRecords:
        canonicalRecords.length,
      selectedReaderRecords:
        readerRecords.length,
      tvtmsEvidenceLines:
        tvtmsEvidence.length,
      approvedGapCoordinates:
        gapSummary.gaps.count,
      topologySegments:
        topologySummary.nonTrivialSegments.length,
    },
    gates: {
      candidateHashLocked: true,
      tvtmsHashLocked: true,
      approvedGapReportLoaded: true,
      completedTopologyReportLoaded: true,
      affectedCanonicalEvidenceExtracted:
        canonicalRecords.length > 0,
      affectedReaderEvidenceExtracted:
        readerRecords.length > 0,
      tvtmsEvidenceExtracted:
        tvtmsEvidence.length > 0,
      productionDataModified: false,
      safeToBuildExplicitKjvCrosswalk: true,
      safeToPromoteProductionKjv: false,
    },
  };

  writeJson(
    path.join(
      args.output,
      "kjv-versification-evidence-summary.json",
    ),
    report,
  );
  writeJson(
    path.join(
      args.output,
      "affected-canonical-records-full.json",
    ),
    canonicalRecords,
  );
  writeJson(
    path.join(
      args.output,
      "affected-reader-verses-full.json",
    ),
    readerRecords,
  );
  writeJson(
    path.join(
      args.output,
      "p0512ab-gap-summary-copy.json",
    ),
    gapSummary,
  );
  writeJson(
    path.join(
      args.output,
      "p0512ac-topology-summary-copy.json",
    ),
    topologySummary,
  );
  writeJson(
    path.join(
      args.output,
      "tvtms-evidence-lines.json",
    ),
    tvtmsEvidence,
  );
  writeCsv(
    path.join(
      args.output,
      "affected-canonical-records.csv",
    ),
    canonicalRecords.map(record => ({
      book: record.book,
      corpus: record.corpus,
      filename: record.filename,
      objectKey: record.objectKey,
      owned: record.owned,
      reference: record.reference,
      chapter: record.chapter,
      verse: record.verse,
      hasKjv: record.hasKjv,
      kjvText: record.kjvText,
      webText: record.webText,
      translationsPresent:
        record.translationsPresent,
      sourceTokenCount:
        record.sourceTokenCount,
    })),
  );
  writeCsv(
    path.join(
      args.output,
      "affected-reader-verses.csv",
    ),
    readerRecords.map(record => ({
      book: record.book,
      reference: record.reference,
      key: record.key,
      currentMatchesCandidate:
        record.currentMatchesCandidate,
      currentText: record.currentText,
      candidateText: record.candidateText,
    })),
  );
  writeCsv(
    path.join(
      args.output,
      "tvtms-evidence-lines.csv",
    ),
    tvtmsEvidence,
  );
  writeText(
    path.join(
      args.output,
      "tvtms-evidence-lines.txt",
    ),
    tvtmsEvidence
      .map(row =>
        `${String(row.line).padStart(6, " ")} | ${row.text}`,
      )
      .join("\n") + "\n",
  );

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
