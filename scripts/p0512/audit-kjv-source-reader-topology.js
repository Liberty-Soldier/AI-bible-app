"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(`[P05.12AC KJV topology audit] ${message}`);
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

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function walkJson(directory) {
  const result = [];

  if (!fs.existsSync(directory)) {
    return result;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walkJson(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json")
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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¶*†‡]/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter(Boolean),
  );
}

function lexicalOverlap(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);

  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;

  let intersection = 0;

  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  return intersection / Math.max(a.size, b.size);
}

function buildReader(document, label) {
  if (!Array.isArray(document)) {
    fail(`${label} must be a verse array.`);
  }

  const books = new Map();
  const coordinateMap = new Map();

  for (const record of document) {
    const book = canonicalBookName(record?.book);
    const chapter = Number(record?.chapter);
    const verse = Number(record?.verse);
    const text = visibleText(record);
    const key = coordinateKey(book, chapter, verse);

    if (!book || !chapter || !verse || !text) {
      fail(`Invalid ${label} record: ${JSON.stringify(record)}`);
    }

    if (coordinateMap.has(key)) {
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
      normalizedText: normalizeText(text),
    };

    books.get(book).push(entry);
    coordinateMap.set(key, entry);
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

  if (coordinateMap.size !== 31102) {
    fail(
      `${label} inventory drift: expected 31102, found ${coordinateMap.size}`,
    );
  }

  return {
    books,
    coordinateMap,
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

function sourceReference(record, objectKey, book) {
  return String(
    record?.reference ??
      record?.sourceReference ??
      `${book} ${sourceCoordinate(record, objectKey).chapter}:${sourceCoordinate(record, objectKey).verse}`,
  );
}

function canonicalKjvText(record) {
  return String(record?.translations?.kjv?.text ?? "");
}

function canonicalWebText(record) {
  return String(record?.translations?.web?.text ?? "");
}

function collectCanonical(canonicalRoot) {
  const ownedBooks = new Map();
  const shadowCoordinates = new Map();

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(canonicalRoot, corpus),
    )) {
      const filename = path.basename(file);
      const document = readJson(file);
      const owned = ownsCanonicalFile(
        corpus,
        document,
        filename,
      );

      for (const [objectKey, record] of Object.entries(document)) {
        const book = recordBookName(record, filename);
        const coordinate = sourceCoordinate(record, objectKey);
        const key = coordinateKey(
          book,
          coordinate.chapter,
          coordinate.verse,
        );
        const kjvText = canonicalKjvText(record);

        if (!owned) {
          if (kjvText) {
            shadowCoordinates.set(key, {
              corpus,
              filename,
              objectKey,
              reference: sourceReference(
                record,
                objectKey,
                book,
              ),
              kjvText,
            });
          }
          continue;
        }

        if (!ownedBooks.has(book)) {
          ownedBooks.set(book, []);
        }

        ownedBooks.get(book).push({
          book,
          corpus,
          filename,
          objectKey,
          chapter: coordinate.chapter,
          verse: coordinate.verse,
          sourceKey: key,
          sourceReference: sourceReference(
            record,
            objectKey,
            book,
          ),
          sourceTokenCount: Array.isArray(
            record?.sourceTokens,
          )
            ? record.sourceTokens.length
            : Array.isArray(record?.tokens)
              ? record.tokens.length
              : null,
          kjvText,
          normalizedKjvText: normalizeText(kjvText),
          webText: canonicalWebText(record),
        });
      }
    }
  }

  for (const entries of ownedBooks.values()) {
    entries.sort(
      (left, right) =>
        left.chapter - right.chapter ||
        left.verse - right.verse ||
        left.objectKey.localeCompare(right.objectKey),
    );

    entries.forEach((entry, index) => {
      entry.index = index;
    });
  }

  return {
    ownedBooks,
    shadowCoordinates,
  };
}

function buildNormalizedReaderIndex(readerEntries) {
  const index = new Map();

  for (const entry of readerEntries) {
    if (!index.has(entry.normalizedText)) {
      index.set(entry.normalizedText, []);
    }

    index.get(entry.normalizedText).push(entry.index);
  }

  return index;
}

function resolveAnchors(sourceEntries, readerEntries) {
  const normalizedIndex =
    buildNormalizedReaderIndex(readerEntries);
  const anchors = [];
  const unresolved = [];
  const claimedReader = new Set();

  for (const source of sourceEntries) {
    if (!source.normalizedKjvText) continue;

    const sameCoordinateIndex = readerEntries.findIndex(
      reader =>
        reader.chapter === source.chapter &&
        reader.verse === source.verse &&
        reader.normalizedText ===
          source.normalizedKjvText,
    );

    let readerIndex = -1;
    let method = null;

    if (
      sameCoordinateIndex >= 0 &&
      !claimedReader.has(sameCoordinateIndex)
    ) {
      readerIndex = sameCoordinateIndex;
      method = "same-coordinate-exact-text";
    } else {
      const candidates = (
        normalizedIndex.get(
          source.normalizedKjvText,
        ) || []
      ).filter(index => !claimedReader.has(index));

      if (candidates.length === 1) {
        readerIndex = candidates[0];
        method = "unique-book-exact-text";
      } else {
        unresolved.push({
          sourceIndex: source.index,
          sourceReference: source.sourceReference,
          sourceKjvText: source.kjvText,
          candidateReaderIndexes: candidates,
          candidateReaderReferences: candidates.map(
            index => readerEntries[index].reference,
          ),
        });
        continue;
      }
    }

    claimedReader.add(readerIndex);
    anchors.push({
      sourceIndex: source.index,
      readerIndex,
      method,
      source,
      reader: readerEntries[readerIndex],
    });
  }

  anchors.sort(
    (left, right) =>
      left.sourceIndex - right.sourceIndex,
  );

  const nonMonotonic = [];

  for (let index = 1; index < anchors.length; index += 1) {
    if (
      anchors[index].readerIndex <=
      anchors[index - 1].readerIndex
    ) {
      nonMonotonic.push({
        previous: anchors[index - 1],
        current: anchors[index],
      });
    }
  }

  return {
    anchors,
    unresolved,
    nonMonotonic,
  };
}

function classifySegment(
  sourceEntries,
  readerEntries,
  shadowCoordinates,
) {
  const sourceCount = sourceEntries.length;
  const readerCount = readerEntries.length;

  if (sourceCount === 0 && readerCount > 0) {
    const allShadow = readerEntries.every(reader =>
      shadowCoordinates.has(reader.key),
    );

    return allShadow
      ? "reader-only-shadow-verses"
      : "reader-only-without-shadow";
  }

  if (sourceCount > 0 && readerCount === 0) {
    return "source-only-records";
  }

  if (sourceCount === readerCount) {
    return sourceCount === 1
      ? "shifted-one-to-one"
      : "shifted-equal-count-sequence";
  }

  if (sourceCount === 1 && readerCount > 1) {
    return "one-source-to-reader-span";
  }

  if (sourceCount > 1 && readerCount === 1) {
    return "source-span-to-one-reader";
  }

  return "complex-unequal-sequence";
}

function segmentRows(
  book,
  sourceEntries,
  readerEntries,
  previousAnchor,
  nextAnchor,
  shadowCoordinates,
) {
  for (const [label, anchor] of [
    ["previous", previousAnchor],
    ["next", nextAnchor],
  ]) {
    if (
      anchor &&
      (
        !Object.prototype.hasOwnProperty.call(anchor, "source") ||
        !Object.prototype.hasOwnProperty.call(anchor, "reader")
      )
    ) {
      fail(
        `${label} segment anchor is not a full source/reader anchor object.`,
      );
    }

    if (
      anchor?.method !== "start" &&
      anchor?.method !== "end" &&
      anchor &&
      (!anchor.source || !anchor.reader)
    ) {
      fail(
        `${label} non-sentinel anchor is missing its source or reader record.`,
      );
    }
  }

  const classification = classifySegment(
    sourceEntries,
    readerEntries,
    shadowCoordinates,
  );

  const pairOverlap = [];

  if (
    sourceEntries.length ===
    readerEntries.length
  ) {
    for (
      let index = 0;
      index < sourceEntries.length;
      index += 1
    ) {
      pairOverlap.push({
        sourceReference:
          sourceEntries[index].sourceReference,
        readerReference:
          readerEntries[index].reference,
        webToKjvLexicalOverlap: lexicalOverlap(
          sourceEntries[index].webText,
          readerEntries[index].text,
        ),
      });
    }
  }

  return {
    book,
    classification,
    sourceCount: sourceEntries.length,
    readerCount: readerEntries.length,
    previousAnchor:
      previousAnchor?.source && previousAnchor?.reader
        ? {
            sourceReference:
              previousAnchor.source.sourceReference,
            readerReference:
              previousAnchor.reader.reference,
          }
        : null,
    nextAnchor:
      nextAnchor?.source && nextAnchor?.reader
        ? {
            sourceReference:
              nextAnchor.source.sourceReference,
            readerReference:
              nextAnchor.reader.reference,
          }
        : null,
    sourceRecords: sourceEntries.map(source => ({
      sourceReference: source.sourceReference,
      sourceKey: source.sourceKey,
      corpus: source.corpus,
      filename: source.filename,
      objectKey: source.objectKey,
      sourceTokenCount: source.sourceTokenCount,
      existingKjvText: source.kjvText || null,
      webText: source.webText || null,
    })),
    readerVerses: readerEntries.map(reader => ({
      reference: reader.reference,
      key: reader.key,
      currentText: reader.text,
      shadowRecord:
        shadowCoordinates.get(reader.key) ?? null,
    })),
    pairOverlap,
  };
}

function buildBookTopology(
  book,
  sourceEntries,
  readerEntries,
  shadowCoordinates,
) {
  const anchorState = resolveAnchors(
    sourceEntries,
    readerEntries,
  );

  if (anchorState.unresolved.length) {
    return {
      book,
      passed: false,
      reason: "unresolved-existing-kjv-anchors",
      anchorState,
      segments: [],
    };
  }

  if (anchorState.nonMonotonic.length) {
    return {
      book,
      passed: false,
      reason: "non-monotonic-existing-kjv-anchors",
      anchorState,
      segments: [],
    };
  }

  const sentinels = [
    {
      sourceIndex: -1,
      readerIndex: -1,
      source: null,
      reader: null,
      method: "start",
    },
    ...anchorState.anchors,
    {
      sourceIndex: sourceEntries.length,
      readerIndex: readerEntries.length,
      source: null,
      reader: null,
      method: "end",
    },
  ];

  const segments = [];

  for (let index = 0; index < sentinels.length - 1; index += 1) {
    const previous = sentinels[index];
    const next = sentinels[index + 1];
    const sourceGap = sourceEntries.slice(
      previous.sourceIndex + 1,
      next.sourceIndex,
    );
    const readerGap = readerEntries.slice(
      previous.readerIndex + 1,
      next.readerIndex,
    );

    if (!sourceGap.length && !readerGap.length) {
      continue;
    }

    segments.push(
      segmentRows(
        book,
        sourceGap,
        readerGap,
        previous,
        next,
        shadowCoordinates,
      ),
    );
  }

  const accountedSource =
    anchorState.anchors.length +
    segments.reduce(
      (sum, segment) => sum + segment.sourceCount,
      0,
    );
  const accountedReader =
    anchorState.anchors.length +
    segments.reduce(
      (sum, segment) => sum + segment.readerCount,
      0,
    );

  return {
    book,
    passed:
      accountedSource === sourceEntries.length &&
      accountedReader === readerEntries.length,
    anchorCount: anchorState.anchors.length,
    anchorsByMethod: anchorState.anchors.reduce(
      (counts, anchor) => {
        counts[anchor.method] =
          (counts[anchor.method] || 0) + 1;
        return counts;
      },
      {},
    ),
    sourceRecords: sourceEntries.length,
    readerVerses: readerEntries.length,
    accountedSource,
    accountedReader,
    unresolvedAnchors:
      anchorState.unresolved,
    nonMonotonicAnchors:
      anchorState.nonMonotonic,
    segments,
  };
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.currentReader,
    args.candidate,
    args.gapSummary,
  ]) {
    if (!fs.existsSync(required)) {
      fail(`Required input missing: ${required}`);
    }
  }

  fs.mkdirSync(args.output, { recursive: true });

  const candidateHash = sha256File(args.candidate);
  const expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829";

  if (candidateHash !== expectedCandidateHash) {
    fail(
      `KJV2006 candidate hash drift: expected ${expectedCandidateHash}, found ${candidateHash}`,
    );
  }

  const current = buildReader(
    readJson(args.currentReader),
    "Current production KJV",
  );
  const candidate = buildReader(
    readJson(args.candidate),
    "KJV2006 candidate",
  );
  const gapSummary = readJson(args.gapSummary);

  if (
    gapSummary?.milestone !== "P05.12AB" ||
    gapSummary?.gaps?.count !== 40
  ) {
    fail("The supplied P05.12AB gap summary is not the approved 40-coordinate audit.");
  }

  const currentKeys = [...current.coordinateMap.keys()].sort();
  const candidateKeys = [...candidate.coordinateMap.keys()].sort();

  if (
    JSON.stringify(currentKeys) !==
    JSON.stringify(candidateKeys)
  ) {
    fail("Current KJV and KJV2006 candidate coordinate sets differ.");
  }

  const canonical = collectCanonical(
    args.canonicalRoot,
  );
  const books = [...new Set([
    ...current.books.keys(),
    ...canonical.ownedBooks.keys(),
  ])].sort();

  const bookReports = [];
  const allSegments = [];

  for (const book of books) {
    const sourceEntries =
      canonical.ownedBooks.get(book) || [];
    const readerEntries =
      current.books.get(book) || [];

    const report = buildBookTopology(
      book,
      sourceEntries,
      readerEntries,
      canonical.shadowCoordinates,
    );

    bookReports.push(report);

    for (const segment of report.segments || []) {
      allSegments.push(segment);
    }
  }

  const nonTrivialSegments = allSegments.filter(
    segment =>
      segment.sourceCount > 0 ||
      segment.readerCount > 0,
  );
  const classificationCounts =
    nonTrivialSegments.reduce(
      (counts, segment) => {
        counts[segment.classification] =
          (counts[segment.classification] || 0) + 1;
        return counts;
      },
      {},
    );

  const readerOnlyShadowCoordinates =
    nonTrivialSegments
      .filter(
        segment =>
          segment.classification ===
          "reader-only-shadow-verses",
      )
      .flatMap(segment =>
        segment.readerVerses.map(verse => verse.key),
      );

  const readerOnlyWithoutShadow =
    nonTrivialSegments
      .filter(
        segment =>
          segment.classification ===
          "reader-only-without-shadow",
      )
      .flatMap(segment =>
        segment.readerVerses.map(verse => verse.key),
      );

  const mappedShiftedReaderCoordinates =
    nonTrivialSegments
      .filter(segment =>
        [
          "shifted-one-to-one",
          "shifted-equal-count-sequence",
          "one-source-to-reader-span",
          "source-span-to-one-reader",
        ].includes(segment.classification),
      )
      .flatMap(segment =>
        segment.readerVerses.map(verse => verse.key),
      );

  const sourceOnlyRecords =
    nonTrivialSegments
      .filter(
        segment =>
          segment.classification ===
          "source-only-records",
      )
      .flatMap(segment => segment.sourceRecords);

  const complexSegments =
    nonTrivialSegments.filter(
      segment =>
        segment.classification ===
        "complex-unequal-sequence",
    );

  const approvedGapKeys = new Set(
    gapSummary.gaps.rows.map(row => row.key),
  );
  const topologyGapKeys = new Set([
    ...readerOnlyShadowCoordinates,
    ...readerOnlyWithoutShadow,
    ...mappedShiftedReaderCoordinates,
  ]);

  const missingApprovedGapKeys = [
    ...approvedGapKeys,
  ].filter(key => !topologyGapKeys.has(key));
  const unexpectedTopologyGapKeys = [
    ...topologyGapKeys,
  ].filter(key => !approvedGapKeys.has(key));

  const totalSourceRecords = bookReports.reduce(
    (sum, report) => sum + report.sourceRecords,
    0,
  );
  const totalReaderVerses = bookReports.reduce(
    (sum, report) => sum + report.readerVerses,
    0,
  );
  const accountedSource = bookReports.reduce(
    (sum, report) => sum + report.accountedSource,
    0,
  );
  const accountedReader = bookReports.reduce(
    (sum, report) => sum + report.accountedReader,
    0,
  );

  const report = {
    milestone: "P05.12AC",
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
        verses: current.coordinateMap.size,
      },
      candidate: {
        path: path
          .relative(process.cwd(), args.candidate)
          .replace(/\\/g, "/"),
        sha256: candidateHash,
        verses: candidate.coordinateMap.size,
      },
      gapSummary: path
        .relative(process.cwd(), args.gapSummary)
        .replace(/\\/g, "/"),
    },
    totals: {
      books: bookReports.length,
      sourceOwnedRecords: totalSourceRecords,
      readerVerses: totalReaderVerses,
      accountedSourceRecords: accountedSource,
      accountedReaderVerses: accountedReader,
      nonOwnedShadowKjvCoordinates:
        canonical.shadowCoordinates.size,
      approvedGapCoordinates: approvedGapKeys.size,
      readerOnlyShadowCoordinates:
        readerOnlyShadowCoordinates.length,
      readerOnlyWithoutShadow:
        readerOnlyWithoutShadow.length,
      shiftedReaderCoordinatesMapped:
        mappedShiftedReaderCoordinates.length,
      sourceOnlyRecords: sourceOnlyRecords.length,
      complexSegments: complexSegments.length,
      classificationCounts,
    },
    gapReconciliation: {
      approvedGapKeys: [...approvedGapKeys].sort(),
      topologyGapKeys: [...topologyGapKeys].sort(),
      missingApprovedGapKeys,
      unexpectedTopologyGapKeys,
    },
    bookReports,
    nonTrivialSegments,
    gates: {
      currentAndCandidateCoordinateSetsExact: true,
      allBooksAccounted:
        bookReports.every(book => book.passed),
      allSourceOwnedRecordsAccounted:
        accountedSource === totalSourceRecords,
      allReaderVersesAccounted:
        accountedReader === totalReaderVerses,
      noUnresolvedExistingKjvAnchors:
        bookReports.every(
          book =>
            (book.unresolvedAnchors || []).length === 0,
        ),
      noNonMonotonicExistingKjvAnchors:
        bookReports.every(
          book =>
            (book.nonMonotonicAnchors || []).length === 0,
        ),
      noComplexUnequalSegments:
        complexSegments.length === 0,
      all40ApprovedGapCoordinatesExplained:
        missingApprovedGapKeys.length === 0 &&
        unexpectedTopologyGapKeys.length === 0 &&
        topologyGapKeys.size === 40,
      allReaderOnlyCoordinatesHaveShadowSupport:
        readerOnlyWithoutShadow.length === 0,
      productionDataModified: false,
      safeToDesignKjvVersificationCrosswalk: false,
      safeToPromoteProductionKjv: false,
    },
  };

  report.gates.safeToDesignKjvVersificationCrosswalk =
    report.gates.allBooksAccounted &&
    report.gates.allSourceOwnedRecordsAccounted &&
    report.gates.allReaderVersesAccounted &&
    report.gates.noUnresolvedExistingKjvAnchors &&
    report.gates.noNonMonotonicExistingKjvAnchors &&
    report.gates.noComplexUnequalSegments &&
    report.gates.all40ApprovedGapCoordinatesExplained &&
    report.gates.allReaderOnlyCoordinatesHaveShadowSupport;

  writeJson(
    path.join(
      args.output,
      "kjv-source-reader-topology-summary.json",
    ),
    report,
  );

  writeJson(
    path.join(
      args.output,
      "kjv-source-reader-topology-segments.json",
    ),
    nonTrivialSegments,
  );

  writeCsv(
    path.join(
      args.output,
      "kjv-source-reader-topology-segments.csv",
    ),
    nonTrivialSegments.map(segment => ({
      book: segment.book,
      classification: segment.classification,
      sourceCount: segment.sourceCount,
      readerCount: segment.readerCount,
      previousAnchor: segment.previousAnchor,
      nextAnchor: segment.nextAnchor,
      sourceReferences: segment.sourceRecords.map(
        record => record.sourceReference,
      ),
      readerReferences: segment.readerVerses.map(
        verse => verse.reference,
      ),
      pairOverlap: segment.pairOverlap,
    })),
  );

  console.log(
    JSON.stringify(
      {
        milestone: report.milestone,
        totals: report.totals,
        gapReconciliation: {
          missingApprovedGapKeys:
            report.gapReconciliation
              .missingApprovedGapKeys,
          unexpectedTopologyGapKeys:
            report.gapReconciliation
              .unexpectedTopologyGapKeys,
        },
        nonTrivialSegments:
          nonTrivialSegments.map(segment => ({
            book: segment.book,
            classification:
              segment.classification,
            sourceReferences:
              segment.sourceRecords.map(
                record =>
                  record.sourceReference,
              ),
            readerReferences:
              segment.readerVerses.map(
                verse => verse.reference,
              ),
          })),
        gates: report.gates,
      },
      null,
      2,
    ),
  );

  if (
    !report.gates
      .safeToDesignKjvVersificationCrosswalk
  ) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
