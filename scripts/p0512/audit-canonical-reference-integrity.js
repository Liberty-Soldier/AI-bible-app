"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(
    `[P05.12AG canonical-reference census] ${message}`,
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
    } else if (current === "--candidate" && next) {
      args.candidate = path.resolve(next);
      index += 1;
    } else if (current === "--af-summary" && next) {
      args.afSummary = path.resolve(next);
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
    "candidate",
    "afSummary",
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

function writeCsv(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (!rows.length) {
    fs.writeFileSync(file, "", "utf8");
    return;
  }

  const headers = Object.keys(rows[0]);

  function quote(value) {
    const text =
      value == null
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value);

    return `"${String(text).replace(/"/g, '""')}"`;
  }

  const lines = [
    headers.map(quote).join(","),
    ...rows.map(row =>
      headers
        .map(header => quote(row[header]))
        .join(","),
    ),
  ];

  fs.writeFileSync(
    file,
    `${lines.join("\n")}\n`,
    "utf8",
  );
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
  };
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

function buildReaderCoordinateSet(document) {
  if (!Array.isArray(document)) {
    fail("KJV2006 candidate must be a verse array.");
  }

  const coordinates = new Set();

  for (const record of document) {
    const key = coordinateKey(
      record?.book,
      record?.chapter,
      record?.verse,
    );

    if (
      !record?.book ||
      !record?.chapter ||
      !record?.verse ||
      !visibleText(record)
    ) {
      fail(
        `Invalid KJV2006 candidate record: ${JSON.stringify(
          record,
        )}`,
      );
    }

    if (coordinates.has(key)) {
      fail(`Duplicate KJV2006 coordinate: ${key}`);
    }

    coordinates.add(key);
  }

  if (coordinates.size !== 31102) {
    fail(
      `KJV2006 coordinate count drift: expected 31102, found ${coordinates.size}`,
    );
  }

  return coordinates;
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.candidate,
    args.afSummary,
    args.gapSummary,
  ]) {
    if (!fs.existsSync(required)) {
      fail(`Required input missing: ${required}`);
    }
  }

  fs.mkdirSync(args.output, { recursive: true });

  const afSummary = readJson(args.afSummary);
  const gapSummary = readJson(args.gapSummary);

  if (
    afSummary?.milestone !== "P05.12AF" ||
    afSummary?.totals?.ownedRecords !== 31086 ||
    afSummary?.totals?.uniqueTokenSourceCoordinates !==
      31088
  ) {
    fail(
      "The supplied P05.12AF summary is not the completed source-reference census.",
    );
  }

  if (
    gapSummary?.milestone !== "P05.12AB" ||
    gapSummary?.gaps?.count !== 40
  ) {
    fail(
      "The supplied P05.12AB summary is not the approved 40-coordinate report.",
    );
  }

  const expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829";
  const candidateHash = sha256File(args.candidate);

  if (candidateHash !== expectedCandidateHash) {
    fail(
      `KJV2006 candidate hash drift: expected ${expectedCandidateHash}, found ${candidateHash}`,
    );
  }

  const readerCoordinates =
    buildReaderCoordinateSet(
      readJson(args.candidate),
    );

  const sourceToCanonical = new Map();
  const canonicalToSource = new Map();
  const ruleCounts = new Map();
  const records = [];
  const invalidSourceReferences = [];
  const invalidCanonicalReferences = [];
  const missingCanonicalReferences = [];
  const tokenCanonicalReferencesOutsideReader = [];

  let ownedFiles = 0;
  let ownedRecords = 0;
  let totalTokens = 0;
  let tokensWithCanonicalReference = 0;
  let tokensWithRuleId = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(args.canonicalRoot, corpus),
    )) {
      const filename = path.basename(file);
      const document = readJson(file);

      if (
        !ownsCanonicalFile(
          corpus,
          document,
          filename,
        )
      ) {
        continue;
      }

      ownedFiles += 1;

      for (const [objectKey, record] of Object.entries(
        document,
      )) {
        ownedRecords += 1;

        const tokens = Array.isArray(record?.sourceTokens)
          ? record.sourceTokens
          : Array.isArray(record?.tokens)
            ? record.tokens
            : [];

        const edgeCounts = new Map();
        const sourceKeys = new Set();
        const canonicalKeys = new Set();
        const recordRuleIds = new Set();

        for (const token of tokens) {
          totalTokens += 1;

          const source = parseReference(
            token?.sourceReference,
          );

          if (!source.valid) {
            invalidSourceReferences.push({
              corpus,
              filename,
              objectKey,
              tokenId: token?.id ?? null,
              value:
                token?.sourceReference ?? null,
            });
            continue;
          }

          sourceKeys.add(source.key);

          const rawCanonical =
            token?.canonicalReference;

          if (!rawCanonical) {
            missingCanonicalReferences.push({
              corpus,
              filename,
              objectKey,
              tokenId: token?.id ?? null,
              sourceReference:
                token?.sourceReference ?? null,
            });
            continue;
          }

          const canonical = parseReference(
            rawCanonical,
          );

          if (!canonical.valid) {
            invalidCanonicalReferences.push({
              corpus,
              filename,
              objectKey,
              tokenId: token?.id ?? null,
              value: rawCanonical,
              sourceReference:
                token?.sourceReference ?? null,
            });
            continue;
          }

          tokensWithCanonicalReference += 1;
          canonicalKeys.add(canonical.key);

          if (
            !readerCoordinates.has(canonical.key)
          ) {
            tokenCanonicalReferencesOutsideReader.push({
              corpus,
              filename,
              objectKey,
              tokenId: token?.id ?? null,
              sourceReference: source.key,
              canonicalReference:
                canonical.key,
            });
          }

          const edgeKey =
            `${source.key}\0${canonical.key}`;

          edgeCounts.set(
            edgeKey,
            (edgeCounts.get(edgeKey) || 0) + 1,
          );

          if (!sourceToCanonical.has(source.key)) {
            sourceToCanonical.set(
              source.key,
              new Map(),
            );
          }

          const sourceTargets =
            sourceToCanonical.get(source.key);

          sourceTargets.set(
            canonical.key,
            (sourceTargets.get(canonical.key) || 0) +
              1,
          );

          if (!canonicalToSource.has(canonical.key)) {
            canonicalToSource.set(
              canonical.key,
              new Map(),
            );
          }

          const canonicalSources =
            canonicalToSource.get(canonical.key);

          canonicalSources.set(
            source.key,
            (canonicalSources.get(source.key) || 0) +
              1,
          );

          const ruleId =
            token?.versificationRuleId ?? null;

          if (ruleId) {
            tokensWithRuleId += 1;
            recordRuleIds.add(String(ruleId));
            ruleCounts.set(
              String(ruleId),
              (ruleCounts.get(String(ruleId)) ||
                0) + 1,
            );
          }
        }

        records.push({
          corpus,
          filename,
          objectKey,
          recordReference:
            record?.reference ?? null,
          hasKjv:
            Boolean(record?.translations?.kjv),
          sourceTokenCount: tokens.length,
          sourceCoordinates:
            [...sourceKeys].sort(),
          canonicalCoordinates:
            [...canonicalKeys].sort(),
          sourceCoordinateCount:
            sourceKeys.size,
          canonicalCoordinateCount:
            canonicalKeys.size,
          edgeCount: edgeCounts.size,
          ruleIds:
            [...recordRuleIds].sort(),
          edges: [...edgeCounts.entries()]
            .map(([key, tokenCount]) => {
              const [
                sourceCoordinate,
                canonicalCoordinate,
              ] = key.split("\0");

              return {
                sourceCoordinate,
                canonicalCoordinate,
                tokenCount,
              };
            })
            .sort((left, right) =>
              left.sourceCoordinate.localeCompare(
                right.sourceCoordinate,
              ) ||
              left.canonicalCoordinate.localeCompare(
                right.canonicalCoordinate,
              ),
            ),
        });
      }
    }
  }

  const sourceRows = [
    ...sourceToCanonical.entries(),
  ]
    .map(([sourceCoordinate, targets]) => ({
      sourceCoordinate,
      canonicalCoordinates:
        [...targets.entries()]
          .map(
            ([
              canonicalCoordinate,
              tokenCount,
            ]) => ({
              canonicalCoordinate,
              tokenCount,
            }),
          )
          .sort((left, right) =>
            left.canonicalCoordinate.localeCompare(
              right.canonicalCoordinate,
            ),
          ),
      canonicalCoordinateCount:
        targets.size,
    }))
    .sort((left, right) =>
      left.sourceCoordinate.localeCompare(
        right.sourceCoordinate,
      ),
    );

  const canonicalRows = [
    ...canonicalToSource.entries(),
  ]
    .map(([canonicalCoordinate, sources]) => ({
      canonicalCoordinate,
      sourceCoordinates:
        [...sources.entries()]
          .map(
            ([sourceCoordinate, tokenCount]) => ({
              sourceCoordinate,
              tokenCount,
            }),
          )
          .sort((left, right) =>
            left.sourceCoordinate.localeCompare(
              right.sourceCoordinate,
            ),
          ),
      sourceCoordinateCount:
        sources.size,
    }))
    .sort((left, right) =>
      left.canonicalCoordinate.localeCompare(
        right.canonicalCoordinate,
      ),
    );

  const multiTargetSources =
    sourceRows.filter(
      row => row.canonicalCoordinateCount > 1,
    );
  const multiSourceCanonical =
    canonicalRows.filter(
      row => row.sourceCoordinateCount > 1,
    );

  const canonicalCoordinateSet =
    new Set(
      canonicalRows.map(
        row => row.canonicalCoordinate,
      ),
    );

  const readerCoordinatesWithoutTokenSupport =
    [...readerCoordinates]
      .filter(
        coordinate =>
          !canonicalCoordinateSet.has(
            coordinate,
          ),
      )
      .sort();

  const approvedGapKeys =
    new Set(
      gapSummary.gaps.rows.map(row => row.key),
    );

  const unsupportedNotInApprovedGaps =
    readerCoordinatesWithoutTokenSupport.filter(
      coordinate =>
        !approvedGapKeys.has(coordinate),
    );

  const approvedGapsWithTokenSupport =
    [...approvedGapKeys]
      .filter(coordinate =>
        canonicalCoordinateSet.has(coordinate),
      )
      .sort();

  const ruleRows = [...ruleCounts.entries()]
    .map(([ruleId, tokenCount]) => ({
      ruleId,
      tokenCount,
    }))
    .sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId),
    );

  const report = {
    milestone: "P05.12AG",
    generatedAtUtc: new Date().toISOString(),
    inputs: {
      canonicalRoot: path
        .relative(process.cwd(), args.canonicalRoot)
        .replace(/\\/g, "/"),
      candidate: {
        path: path
          .relative(process.cwd(), args.candidate)
          .replace(/\\/g, "/"),
        sha256: candidateHash,
        readerCoordinates:
          readerCoordinates.size,
      },
      afSummary: path
        .relative(process.cwd(), args.afSummary)
        .replace(/\\/g, "/"),
      gapSummary: path
        .relative(process.cwd(), args.gapSummary)
        .replace(/\\/g, "/"),
    },
    totals: {
      ownedFiles,
      ownedRecords,
      totalTokens,
      tokensWithCanonicalReference,
      tokensMissingCanonicalReference:
        missingCanonicalReferences.length,
      tokensWithRuleId,
      uniqueRuleIds:
        ruleRows.length,
      uniqueSourceCoordinates:
        sourceRows.length,
      uniqueCanonicalCoordinates:
        canonicalRows.length,
      sourceToCanonicalEdges:
        sourceRows.reduce(
          (sum, row) =>
            sum + row.canonicalCoordinateCount,
          0,
        ),
      sourcesWithMultipleCanonicalTargets:
        multiTargetSources.length,
      canonicalCoordinatesWithMultipleSources:
        multiSourceCanonical.length,
      readerCoordinatesWithoutTokenSupport:
        readerCoordinatesWithoutTokenSupport.length,
      approvedGapCoordinates:
        approvedGapKeys.size,
      approvedGapsWithTokenSupport:
        approvedGapsWithTokenSupport.length,
      unsupportedReaderCoordinatesOutsideApprovedGaps:
        unsupportedNotInApprovedGaps.length,
      invalidSourceReferences:
        invalidSourceReferences.length,
      invalidCanonicalReferences:
        invalidCanonicalReferences.length,
      canonicalReferencesOutsideKjv2006:
        tokenCanonicalReferencesOutsideReader.length,
    },
    gates: {
      ownedFilesExact:
        ownedFiles === 66,
      ownedRecordsExact:
        ownedRecords === 31086,
      totalTokensExact:
        totalTokens === 438452,
      sourceCoordinateUniverseExact:
        sourceRows.length === 31088,
      allSourceReferencesParse:
        invalidSourceReferences.length === 0,
      allCanonicalReferencesPresent:
        missingCanonicalReferences.length === 0,
      allCanonicalReferencesParse:
        invalidCanonicalReferences.length === 0,
      allCanonicalReferencesAreKjvCoordinates:
        tokenCanonicalReferencesOutsideReader.length ===
        0,
      censusCompleted: true,
      productionDataModified: false,
      safeToEvaluateCanonicalReferenceAuthority:
        false,
      safeToPromoteProductionKjv: false,
    },
  };

  report.gates.safeToEvaluateCanonicalReferenceAuthority =
    report.gates.ownedFilesExact &&
    report.gates.ownedRecordsExact &&
    report.gates.totalTokensExact &&
    report.gates.sourceCoordinateUniverseExact &&
    report.gates.allSourceReferencesParse &&
    report.gates.allCanonicalReferencesPresent &&
    report.gates.allCanonicalReferencesParse &&
    report.gates
      .allCanonicalReferencesAreKjvCoordinates;

  writeJson(
    path.join(
      args.output,
      "canonical-reference-integrity-summary.json",
    ),
    report,
  );

  writeJson(
    path.join(
      args.output,
      "source-to-canonical-reference-map.json",
    ),
    sourceRows,
  );

  writeJson(
    path.join(
      args.output,
      "canonical-to-source-reference-map.json",
    ),
    canonicalRows,
  );

  writeJson(
    path.join(
      args.output,
      "canonical-reference-records.json",
    ),
    records,
  );

  writeJson(
    path.join(
      args.output,
      "multi-target-source-coordinates.json",
    ),
    multiTargetSources,
  );

  writeJson(
    path.join(
      args.output,
      "multi-source-canonical-coordinates.json",
    ),
    multiSourceCanonical,
  );

  writeJson(
    path.join(
      args.output,
      "reader-coordinates-without-token-support.json",
    ),
    readerCoordinatesWithoutTokenSupport,
  );

  writeJson(
    path.join(
      args.output,
      "unsupported-reader-coordinates-outside-p0512ab.json",
    ),
    unsupportedNotInApprovedGaps,
  );

  writeJson(
    path.join(
      args.output,
      "approved-gaps-with-token-support.json",
    ),
    approvedGapsWithTokenSupport,
  );

  writeJson(
    path.join(
      args.output,
      "versification-rule-id-inventory.json",
    ),
    ruleRows,
  );

  writeJson(
    path.join(
      args.output,
      "missing-canonical-references.json",
    ),
    missingCanonicalReferences,
  );

  writeJson(
    path.join(
      args.output,
      "invalid-canonical-references.json",
    ),
    invalidCanonicalReferences,
  );

  writeJson(
    path.join(
      args.output,
      "canonical-references-outside-kjv2006.json",
    ),
    tokenCanonicalReferencesOutsideReader,
  );

  writeCsv(
    path.join(
      args.output,
      "multi-target-source-coordinates.csv",
    ),
    multiTargetSources,
  );

  writeCsv(
    path.join(
      args.output,
      "multi-source-canonical-coordinates.csv",
    ),
    multiSourceCanonical,
  );

  writeCsv(
    path.join(
      args.output,
      "versification-rule-id-inventory.csv",
    ),
    ruleRows,
  );

  console.log(
    JSON.stringify(report, null, 2),
  );

  if (
    !report.gates
      .safeToEvaluateCanonicalReferenceAuthority
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
