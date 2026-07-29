"use strict";

const fs = require("fs");
const path = require("path");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(
    `[P05.12AF source-reference topology] ${message}`,
  );
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--canonical-root" && next) {
      args.canonicalRoot = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  if (!args.canonicalRoot) {
    fail("Missing --canonical-root.");
  }

  if (!args.output) {
    fail("Missing --output.");
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
  const text =
    value == null
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
      headers
        .map(header => escapeCsv(row[header]))
        .join(","),
    ),
  ];

  fs.writeFileSync(
    file,
    `${lines.join("\n")}\n`,
    "utf8",
  );
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
    "1ki": "1 kings",
    "1 ki": "1 kings",
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
    sng: "song of solomon",
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
    joe: "joel",
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
    mat: "matthew",
    matthew: "matthew",
    mark: "mark",
    mrk: "mark",
    luke: "luke",
    luk: "luke",
    john: "john",
    jhn: "john",
    acts: "acts",
    act: "acts",
    rom: "romans",
    romans: "romans",
    "1cor": "1 corinthians",
    "1 cor": "1 corinthians",
    "1 corinthians": "1 corinthians",
    "2cor": "2 corinthians",
    "2 cor": "2 corinthians",
    "2co": "2 corinthians",
    "2 co": "2 corinthians",
    "2 corinthians": "2 corinthians",
    gal: "galatians",
    galatians: "galatians",
    eph: "ephesians",
    ephesians: "ephesians",
    phil: "philippians",
    php: "philippians",
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
    "3jn": "3 john",
    "3 jn": "3 john",
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
  return `${canonicalBookName(book)}:${Number(
    chapter,
  )}:${Number(verse)}`;
}

function parseReference(value) {
  const text = String(value ?? "").trim();
  const match = /^(.*?)[.:](\d+)[.:](\d+)$/.exec(text);

  if (!match) {
    return {
      raw: text,
      valid: false,
      key: null,
      book: null,
      chapter: null,
      verse: null,
    };
  }

  return {
    raw: text,
    valid: true,
    key: coordinateKey(
      match[1],
      match[2],
      match[3],
    ),
    book: canonicalBookName(match[1]),
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function recordCoordinateCandidates(
  record,
  objectKey,
) {
  const values = [
    objectKey,
    record?.reference,
    record?.sourceReference,
  ]
    .filter(Boolean)
    .map(String);

  const parsed = [];

  for (const value of values) {
    const result = parseReference(value);

    if (
      result.valid &&
      !parsed.some(entry => entry.key === result.key)
    ) {
      parsed.push(result);
    }
  }

  return parsed;
}

function tokenSourceReferences(record) {
  const tokens = Array.isArray(record?.sourceTokens)
    ? record.sourceTokens
    : Array.isArray(record?.tokens)
      ? record.tokens
      : [];

  const counts = new Map();
  let tokensWithoutSourceReference = 0;

  for (const token of tokens) {
    const raw = token?.sourceReference;

    if (!raw) {
      tokensWithoutSourceReference += 1;
      continue;
    }

    const text = String(raw);
    counts.set(text, (counts.get(text) || 0) + 1);
  }

  return {
    tokens,
    counts,
    tokensWithoutSourceReference,
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.canonicalRoot)) {
    fail(
      `Canonical root is missing: ${args.canonicalRoot}`,
    );
  }

  fs.mkdirSync(args.output, { recursive: true });

  const records = [];
  const ownedFiles = [];
  const sourceCoordinateLocations = new Map();
  const invalidSourceReferences = [];

  let ownedRecordCount = 0;
  let totalSourceTokens = 0;
  let totalTokensWithoutSourceReference = 0;
  let sourceReferenceEdges = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(args.canonicalRoot, corpus),
    )) {
      const filename = path.basename(file);
      const document = readJson(file);
      const owned = ownsCanonicalFile(
        corpus,
        document,
        filename,
      );

      if (!owned) {
        continue;
      }

      ownedFiles.push({
        corpus,
        filename,
        records: Object.keys(document).length,
      });

      for (const [objectKey, record] of Object.entries(
        document,
      )) {
        ownedRecordCount += 1;

        const tokenState =
          tokenSourceReferences(record);
        totalSourceTokens +=
          tokenState.tokens.length;
        totalTokensWithoutSourceReference +=
          tokenState.tokensWithoutSourceReference;

        const parsedTokenReferences = [];
        const validTokenKeys = [];

        for (const [raw, tokenCount] of [
          ...tokenState.counts.entries(),
        ].sort((left, right) =>
          left[0].localeCompare(right[0]),
        )) {
          const parsed = parseReference(raw);
          const detail = {
            ...parsed,
            tokenCount,
          };

          parsedTokenReferences.push(detail);

          if (!parsed.valid) {
            invalidSourceReferences.push({
              corpus,
              filename,
              objectKey,
              raw,
              tokenCount,
            });
            continue;
          }

          validTokenKeys.push(parsed.key);

          if (!sourceCoordinateLocations.has(parsed.key)) {
            sourceCoordinateLocations.set(
              parsed.key,
              [],
            );
          }

          sourceCoordinateLocations
            .get(parsed.key)
            .push({
              corpus,
              filename,
              objectKey,
              recordReference:
                record?.reference ?? null,
              rawSourceReference: raw,
              tokenCount,
            });
        }

        const uniqueValidTokenKeys = [
          ...new Set(validTokenKeys),
        ].sort();
        sourceReferenceEdges +=
          uniqueValidTokenKeys.length;

        const recordCoordinates =
          recordCoordinateCandidates(
            record,
            objectKey,
          );
        const recordCoordinateKeys =
          recordCoordinates.map(entry => entry.key);

        let classification;

        if (!parsedTokenReferences.length) {
          classification =
            "no-token-source-reference";
        } else if (
          uniqueValidTokenKeys.length === 1 &&
          invalidSourceReferences.length === 0
        ) {
          classification =
            "single-token-source-coordinate";
        } else if (
          uniqueValidTokenKeys.length > 1
        ) {
          classification =
            "multi-token-source-coordinate";
        } else {
          classification =
            "invalid-token-source-reference";
        }

        records.push({
          corpus,
          filename,
          objectKey,
          recordReference:
            record?.reference ?? null,
          translationsPresent: Object.keys(
            record?.translations || {},
          ).sort(),
          sourceTokenCount:
            tokenState.tokens.length,
          tokensWithoutSourceReference:
            tokenState.tokensWithoutSourceReference,
          tokenSourceReferenceCount:
            parsedTokenReferences.length,
          validTokenSourceCoordinateCount:
            uniqueValidTokenKeys.length,
          tokenSourceCoordinates:
            uniqueValidTokenKeys,
          tokenSourceReferences:
            parsedTokenReferences,
          recordCoordinateKeys,
          recordCoordinateIncludedInTokenSources:
            recordCoordinateKeys.some(key =>
              uniqueValidTokenKeys.includes(key),
            ),
          classification,
        });
      }
    }
  }

  const duplicateSourceCoordinates = [
    ...sourceCoordinateLocations.entries(),
  ]
    .filter(([, locations]) => {
      const uniqueRecords = new Set(
        locations.map(
          location =>
            `${location.corpus}/${location.filename}/${location.objectKey}`,
        ),
      );

      return uniqueRecords.size > 1;
    })
    .map(([sourceCoordinate, locations]) => ({
      sourceCoordinate,
      recordCount: new Set(
        locations.map(
          location =>
            `${location.corpus}/${location.filename}/${location.objectKey}`,
        ),
      ).size,
      locations,
    }))
    .sort((left, right) =>
      left.sourceCoordinate.localeCompare(
        right.sourceCoordinate,
      ),
    );

  const classificationCounts =
    records.reduce((counts, record) => {
      counts[record.classification] =
        (counts[record.classification] || 0) + 1;
      return counts;
    }, {});

  const multiReferenceRecords = records.filter(
    record =>
      record.classification ===
      "multi-token-source-coordinate",
  );
  const noReferenceRecords = records.filter(
    record =>
      record.classification ===
      "no-token-source-reference",
  );
  const coordinateDisagreements = records.filter(
    record =>
      record.recordCoordinateKeys.length > 0 &&
      record.validTokenSourceCoordinateCount > 0 &&
      !record.recordCoordinateIncludedInTokenSources,
  );

  const report = {
    milestone: "P05.12AF",
    generatedAtUtc: new Date().toISOString(),
    canonicalRoot: path
      .relative(process.cwd(), args.canonicalRoot)
      .replace(/\\/g, "/"),
    totals: {
      ownedFiles: ownedFiles.length,
      ownedRecords: ownedRecordCount,
      totalSourceTokens,
      totalTokensWithoutSourceReference,
      sourceReferenceEdges,
      uniqueTokenSourceCoordinates:
        sourceCoordinateLocations.size,
      duplicateTokenSourceCoordinatesAcrossRecords:
        duplicateSourceCoordinates.length,
      invalidSourceReferences:
        invalidSourceReferences.length,
      multiReferenceRecords:
        multiReferenceRecords.length,
      noReferenceRecords:
        noReferenceRecords.length,
      recordCoordinateDisagreements:
        coordinateDisagreements.length,
      classificationCounts,
    },
    gates: {
      ownedFilesExact:
        ownedFiles.length === 66,
      ownedRecordsExact:
        ownedRecordCount === 31086,
      everyRecordClassified:
        Object.values(
          classificationCounts,
        ).reduce((sum, count) => sum + count, 0) ===
        ownedRecordCount,
      allTokenSourceReferencesParse:
        invalidSourceReferences.length === 0,
      censusCompleted: true,
      productionDataModified: false,
      safeToDesignSourceCoordinateCrosswalk:
        false,
      safeToPromoteProductionKjv: false,
    },
  };

  report.gates.safeToDesignSourceCoordinateCrosswalk =
    report.gates.ownedFilesExact &&
    report.gates.ownedRecordsExact &&
    report.gates.everyRecordClassified &&
    report.gates.allTokenSourceReferencesParse;

  writeJson(
    path.join(
      args.output,
      "canonical-source-reference-topology-summary.json",
    ),
    report,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-source-reference-records.json",
    ),
    records,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-multi-source-reference-records.json",
    ),
    multiReferenceRecords,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-source-coordinate-duplicates.json",
    ),
    duplicateSourceCoordinates,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-no-source-reference-records.json",
    ),
    noReferenceRecords,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-record-token-coordinate-disagreements.json",
    ),
    coordinateDisagreements,
  );
  writeJson(
    path.join(
      args.output,
      "canonical-invalid-source-references.json",
    ),
    invalidSourceReferences,
  );

  writeCsv(
    path.join(
      args.output,
      "canonical-multi-source-reference-records.csv",
    ),
    multiReferenceRecords.map(record => ({
      corpus: record.corpus,
      filename: record.filename,
      objectKey: record.objectKey,
      recordReference:
        record.recordReference,
      sourceTokenCount:
        record.sourceTokenCount,
      tokenSourceCoordinates:
        record.tokenSourceCoordinates,
      tokenSourceReferences:
        record.tokenSourceReferences,
      recordCoordinateKeys:
        record.recordCoordinateKeys,
      recordCoordinateIncludedInTokenSources:
        record.recordCoordinateIncludedInTokenSources,
    })),
  );

  writeCsv(
    path.join(
      args.output,
      "canonical-source-coordinate-duplicates.csv",
    ),
    duplicateSourceCoordinates.map(row => ({
      sourceCoordinate:
        row.sourceCoordinate,
      recordCount: row.recordCount,
      locations: row.locations,
    })),
  );

  console.log(
    JSON.stringify(report, null, 2),
  );

  if (
    !report.gates
      .safeToDesignSourceCoordinateCrosswalk
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
