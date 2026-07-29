"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(
    `[P05.12AH token-level KJV overlay] ${message}`,
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
    } else if (current === "--policy" && next) {
      args.policy = path.resolve(next);
      index += 1;
    } else if (current === "--gap-summary" && next) {
      args.gapSummary = path.resolve(next);
      index += 1;
    } else if (current === "--ag-summary" && next) {
      args.agSummary = path.resolve(next);
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
    "policy",
    "gapSummary",
    "agSummary",
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

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      key =>
        `${JSON.stringify(key)}:${stableStringify(value[key])}`,
    )
    .join(",")}}`;
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
    fail(`Unable to parse Scripture coordinate: ${text}`);
  }

  return coordinateKey(
    match[1],
    match[2],
    match[3],
  );
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

function buildReader(document) {
  if (!Array.isArray(document)) {
    fail("KJV2006 candidate must be a verse array.");
  }

  const coordinates = new Map();

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

    coordinates.set(key, {
      key,
      reference: String(
        record?.reference ??
          `${record.book} ${record.chapter}:${record.verse}`,
      ),
      text: visibleText(record),
    });
  }

  if (coordinates.size !== 31102) {
    fail(
      `KJV2006 coordinate count drift: expected 31102, found ${coordinates.size}`,
    );
  }

  return coordinates;
}

function buildOverlay({
  canonicalRoot,
  reader,
  policy,
}) {
  const sourceTargets = new Map();
  const readerSources = new Map();
  const changedTokens = [];
  const tokenRows = [];
  const seenTokenRules = new Set();
  const seenSourceRules = new Set();
  const seenTokenIds = new Set();

  let ownedFiles = 0;
  let ownedRecords = 0;
  let sourceTokens = 0;
  let tokensOutsideReaderBefore = 0;
  let tokensOutsideReaderAfter = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(canonicalRoot, corpus),
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

        for (const token of tokens) {
          sourceTokens += 1;

          const tokenId = String(
            token?.id ?? token?.tokenId ?? "",
          );

          if (!tokenId) {
            fail(
              `Source token has no stable ID in ${corpus}/${filename}/${objectKey}.`,
            );
          }

          if (seenTokenIds.has(tokenId)) {
            fail(`Duplicate source token ID: ${tokenId}`);
          }
          seenTokenIds.add(tokenId);

          const source = parseReference(
            token?.sourceReference,
          );
          const currentTarget = parseReference(
            token?.canonicalReference,
          );

          if (!reader.has(currentTarget)) {
            tokensOutsideReaderBefore += 1;
          }

          const tokenRule =
            policy.tokenRules[tokenId] ?? null;
          const sourceRule =
            policy.sourceWideRules[source] ?? null;

          let target = currentTarget;
          let ruleId =
            token?.versificationRuleId ?? null;
          let reason =
            "Existing canonicalReference retained.";
          let ruleType = "existing";

          if (tokenRule) {
            if (
              parseReference(tokenRule.source) !== source
            ) {
              fail(
                `Token rule source mismatch for ${tokenId}.`,
              );
            }

            target = parseReference(
              tokenRule.target,
            );
            ruleId = tokenRule.ruleId;
            reason = tokenRule.reason;
            ruleType = "token-exception";
            seenTokenRules.add(tokenId);
          } else if (sourceRule) {
            target = parseReference(
              sourceRule.target,
            );
            ruleId = sourceRule.ruleId;
            reason = sourceRule.reason;
            ruleType = "source-exception";
            seenSourceRules.add(source);
          }

          if (!reader.has(target)) {
            tokensOutsideReaderAfter += 1;
          }

          if (!sourceTargets.has(source)) {
            sourceTargets.set(source, new Map());
          }

          const targets =
            sourceTargets.get(source);

          targets.set(
            target,
            (targets.get(target) || 0) + 1,
          );

          if (!readerSources.has(target)) {
            readerSources.set(target, new Map());
          }

          const sources =
            readerSources.get(target);

          sources.set(
            source,
            (sources.get(source) || 0) + 1,
          );

          const changed =
            currentTarget !== target ||
            String(
              token?.versificationRuleId ?? "",
            ) !== String(ruleId ?? "");

          if (changed) {
            changedTokens.push({
              tokenId,
              corpus,
              filename,
              objectKey,
              source,
              currentTarget,
              overlayTarget: target,
              currentRuleId:
                token?.versificationRuleId ?? null,
              overlayRuleId: ruleId,
              ruleType,
              reason,
            });
          }

          tokenRows.push({
            tokenId,
            corpus,
            filename,
            objectKey,
            source,
            currentTarget,
            overlayTarget: target,
            currentRuleId:
              token?.versificationRuleId ?? null,
            overlayRuleId: ruleId,
            ruleType,
          });
        }
      }
    }
  }

  const unusedTokenRules = Object.keys(
    policy.tokenRules,
  ).filter(
    tokenId => !seenTokenRules.has(tokenId),
  );

  const unusedSourceRules = Object.keys(
    policy.sourceWideRules,
  )
    .map(parseReference)
    .filter(
      source => !seenSourceRules.has(source),
    );

  const sourceRows = [
    ...sourceTargets.entries(),
  ]
    .map(([source, targets]) => ({
      source,
      readerTargets: [...targets.entries()]
        .map(([readerTarget, tokenCount]) => ({
          readerTarget,
          tokenCount,
        }))
        .sort((left, right) =>
          left.readerTarget.localeCompare(
            right.readerTarget,
          ),
        ),
      readerTargetCount: targets.size,
    }))
    .sort((left, right) =>
      left.source.localeCompare(right.source),
    );

  const readerRows = [...reader]
    .map(([readerCoordinate, readerRecord]) => {
      const sources =
        readerSources.get(readerCoordinate) ??
        new Map();

      return {
        readerCoordinate,
        reference: readerRecord.reference,
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
        sourceCoordinateCount: sources.size,
        readerOnly:
          policy.readerOnly.includes(
            readerCoordinate,
          ),
      };
    })
    .sort((left, right) =>
      left.readerCoordinate.localeCompare(
        right.readerCoordinate,
      ),
    );

  const mappedReaderRows =
    readerRows.filter(
      row => row.sourceCoordinateCount > 0,
    );
  const unsupportedReaderRows =
    readerRows.filter(
      row => row.sourceCoordinateCount === 0,
    );
  const readerOnlyRows =
    readerRows.filter(row => row.readerOnly);
  const unsupportedNotReaderOnly =
    unsupportedReaderRows.filter(
      row => !row.readerOnly,
    );
  const readerOnlyWithSupport =
    readerOnlyRows.filter(
      row => row.sourceCoordinateCount > 0,
    );
  const multiTargetSources =
    sourceRows.filter(
      row => row.readerTargetCount > 1,
    );
  const multiSourceReaders =
    readerRows.filter(
      row => row.sourceCoordinateCount > 1,
    );
  const sourceToReaderEdges =
    sourceRows.reduce(
      (sum, row) =>
        sum + row.readerTargetCount,
      0,
    );

  const fingerprint = crypto
    .createHash("sha256")
    .update(
      stableStringify({
        sourceRows,
        readerOnly:
          [...policy.readerOnly].sort(),
      }),
    )
    .digest("hex");

  return {
    totals: {
      ownedFiles,
      ownedRecords,
      sourceTokens,
      uniqueSourceCoordinates:
        sourceRows.length,
      readerCoordinates:
        readerRows.length,
      mappedReaderCoordinates:
        mappedReaderRows.length,
      unsupportedReaderCoordinates:
        unsupportedReaderRows.length,
      readerOnlyCoordinates:
        readerOnlyRows.length,
      sourceToReaderEdges,
      multiTargetSourceCoordinates:
        multiTargetSources.length,
      multiSourceReaderCoordinates:
        multiSourceReaders.length,
      changedTokens:
        changedTokens.length,
      tokensOutsideReaderBefore,
      tokensOutsideReaderAfter,
    },
    sourceRows,
    readerRows,
    tokenRows,
    changedTokens,
    multiTargetSources,
    multiSourceReaders,
    unsupportedReaderRows,
    diagnostics: {
      unusedTokenRules,
      unusedSourceRules,
      unsupportedNotReaderOnly:
        unsupportedNotReaderOnly.map(
          row => row.readerCoordinate,
        ),
      readerOnlyWithSupport:
        readerOnlyWithSupport.map(
          row => row.readerCoordinate,
        ),
    },
    fingerprint,
  };
}

function sortedValues(rows, key) {
  return rows.map(row => row[key]).sort();
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.candidate,
    args.policy,
    args.gapSummary,
    args.agSummary,
  ]) {
    if (!fs.existsSync(required)) {
      fail(`Required input missing: ${required}`);
    }
  }

  fs.mkdirSync(args.output, { recursive: true });

  const expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829";
  const candidateHash = sha256File(args.candidate);

  if (candidateHash !== expectedCandidateHash) {
    fail(
      `KJV2006 candidate hash drift: expected ${expectedCandidateHash}, found ${candidateHash}`,
    );
  }

  const policy = readJson(args.policy);
  const gapSummary = readJson(args.gapSummary);
  const agSummary = readJson(args.agSummary);

  if (
    policy.version !==
    "p0512ah-token-level-kjv-crosswalk-overlay@1"
  ) {
    fail("Unexpected P05.12AH policy version.");
  }

  if (
    gapSummary?.milestone !== "P05.12AB" ||
    gapSummary?.gaps?.count !== 40
  ) {
    fail("The P05.12AB gap summary is not approved.");
  }

  if (
    agSummary?.milestone !== "P05.12AG" ||
    agSummary?.totals?.sourceToCanonicalEdges !==
      31088 ||
    agSummary?.totals
      ?.canonicalReferencesOutsideKjv2006 !== 276
  ) {
    fail("The supplied P05.12AG census is not the completed report.");
  }

  const reader = buildReader(
    readJson(args.candidate),
  );

  const buildA = buildOverlay({
    canonicalRoot: args.canonicalRoot,
    reader,
    policy,
  });

  const buildB = buildOverlay({
    canonicalRoot: args.canonicalRoot,
    reader,
    policy,
  });

  const expected =
    policy.expected;

  const expectedMultiTarget =
    [...expected.multiTargetSourceCoordinates].sort();
  const actualMultiTarget =
    sortedValues(
      buildA.multiTargetSources,
      "source",
    );

  const expectedMultiSource =
    [...expected.multiSourceReaderCoordinates].sort();
  const actualMultiSource =
    sortedValues(
      buildA.multiSourceReaders,
      "readerCoordinate",
    );

  const approvedGapKeys =
    new Set(
      gapSummary.gaps.rows.map(
        row => parseReference(row.key),
      ),
    );

  const readerRowsByCoordinate =
    new Map(
      buildA.readerRows.map(row => [
        row.readerCoordinate,
        row,
      ]),
    );

  const unexplainedApprovedGaps =
    [...approvedGapKeys]
      .filter(key => {
        const row =
          readerRowsByCoordinate.get(key);

        return (
          !row ||
          (
            row.sourceCoordinateCount === 0 &&
            !row.readerOnly
          )
        );
      })
      .sort();

  const gates = {
    candidateHashLocked: true,
    policyHashRecorded: true,
    ownedFilesExact:
      buildA.totals.ownedFiles ===
      expected.sourceOwnedFiles,
    ownedRecordsExact:
      buildA.totals.ownedRecords ===
      expected.sourceOwnedRecords,
    sourceTokensExact:
      buildA.totals.sourceTokens ===
      expected.sourceTokens,
    sourceCoordinatesExact:
      buildA.totals.uniqueSourceCoordinates ===
      expected.uniqueSourceCoordinates,
    readerCoordinatesExact:
      buildA.totals.readerCoordinates ===
      expected.kjv2006ReaderCoordinates,
    mappedReaderCoordinatesExact:
      buildA.totals.mappedReaderCoordinates ===
      expected.mappedReaderCoordinates,
    readerOnlyCoordinatesExact:
      buildA.totals.readerOnlyCoordinates ===
      expected.readerOnlyCoordinates,
    sourceToReaderEdgesExact:
      buildA.totals.sourceToReaderEdges ===
      expected.sourceToReaderEdges,
    multiTargetSourcesExact:
      JSON.stringify(actualMultiTarget) ===
      JSON.stringify(expectedMultiTarget),
    multiSourceReadersExact:
      JSON.stringify(actualMultiSource) ===
      JSON.stringify(expectedMultiSource),
    allTokenRulesUsed:
      buildA.diagnostics.unusedTokenRules.length ===
      0,
    allSourceRulesUsed:
      buildA.diagnostics.unusedSourceRules.length ===
      0,
    noUnsupportedNonReaderOnlyCoordinates:
      buildA.diagnostics
        .unsupportedNotReaderOnly.length === 0,
    noReaderOnlyCoordinateReceivesSourceSupport:
      buildA.diagnostics
        .readerOnlyWithSupport.length === 0,
    noOverlayTargetOutsideKjv2006:
      buildA.totals.tokensOutsideReaderAfter ===
      0,
    all40ApprovedGapsExplained:
      unexplainedApprovedGaps.length === 0,
    repeatedBuildDeterministic:
      buildA.fingerprint ===
      buildB.fingerprint,
    productionDataModified: false,
    safeToBuildIsolatedCanonicalMigration:
      false,
    safeToPromoteProductionKjv: false,
  };

  gates.safeToBuildIsolatedCanonicalMigration =
    Object.entries(gates)
      .filter(
        ([key]) =>
          ![
            "safeToBuildIsolatedCanonicalMigration",
            "safeToPromoteProductionKjv",
            "productionDataModified",
          ].includes(key),
      )
      .every(([, value]) => value === true);

  const report = {
    milestone: "P05.12AH",
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
      },
      policy: {
        path: path
          .relative(process.cwd(), args.policy)
          .replace(/\\/g, "/"),
        sha256: sha256File(args.policy),
        version: policy.version,
      },
      gapSummary: path
        .relative(process.cwd(), args.gapSummary)
        .replace(/\\/g, "/"),
      agSummary: path
        .relative(process.cwd(), args.agSummary)
        .replace(/\\/g, "/"),
    },
    crosswalkFingerprint:
      buildA.fingerprint,
    totals: buildA.totals,
    topology: {
      multiTargetSources:
        buildA.multiTargetSources,
      multiSourceReaders:
        buildA.multiSourceReaders,
      unsupportedReaderCoordinates:
        buildA.unsupportedReaderRows,
    },
    diagnostics: {
      ...buildA.diagnostics,
      unexplainedApprovedGaps,
      expectedMultiTarget,
      actualMultiTarget,
      expectedMultiSource,
      actualMultiSource,
    },
    gates,
  };

  writeJson(
    path.join(
      args.output,
      "token-level-kjv-overlay-summary.json",
    ),
    report,
  );

  writeJson(
    path.join(
      args.output,
      "token-level-kjv-overlay-source-map.json",
    ),
    buildA.sourceRows,
  );

  writeJson(
    path.join(
      args.output,
      "token-level-kjv-overlay-reader-map.json",
    ),
    buildA.readerRows,
  );

  writeJson(
    path.join(
      args.output,
      "token-level-kjv-overlay-changes.json",
    ),
    buildA.changedTokens,
  );

  writeJson(
    path.join(
      args.output,
      "token-level-kjv-overlay-policy-copy.json",
    ),
    policy,
  );

  writeCsv(
    path.join(
      args.output,
      "token-level-kjv-overlay-changes.csv",
    ),
    buildA.changedTokens,
  );

  writeCsv(
    path.join(
      args.output,
      "token-level-kjv-overlay-multi-target-sources.csv",
    ),
    buildA.multiTargetSources,
  );

  writeCsv(
    path.join(
      args.output,
      "token-level-kjv-overlay-multi-source-readers.csv",
    ),
    buildA.multiSourceReaders,
  );

  console.log(
    JSON.stringify(report, null, 2),
  );

  if (
    !gates.safeToBuildIsolatedCanonicalMigration
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
