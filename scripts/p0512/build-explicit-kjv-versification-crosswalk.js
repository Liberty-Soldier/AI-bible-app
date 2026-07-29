"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(`[P05.12AE explicit KJV crosswalk] ${message}`);
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
    } else if (current === "--evidence-summary" && next) {
      args.evidenceSummary = path.resolve(next);
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
    "evidenceSummary",
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
  const quote = value => {
    const text = value == null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

    return `"${String(text).replace(/"/g, '""')}"`;
  };

  const lines = [
    headers.map(quote).join(","),
    ...rows.map(row =>
      headers.map(header => quote(row[header])).join(","),
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
    .replace(/[_-]+/g, " ")
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
  return `${canonicalBookName(book)}:${Number(chapter)}:${Number(verse)}`;
}

function parseReference(value) {
  const text = String(value ?? "").trim();
  const match = /^(.*?)[.:](\d+)[.:](\d+)$/.exec(text);

  if (!match) {
    fail(`Unable to parse Scripture coordinate: ${text}`);
  }

  return {
    book: canonicalBookName(match[1]),
    chapter: Number(match[2]),
    verse: Number(match[3]),
    key: coordinateKey(match[1], match[2], match[3]),
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

function buildReader(document) {
  if (!Array.isArray(document)) {
    fail("KJV2006 candidate must be a verse array.");
  }

  const map = new Map();

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
      fail(`Invalid KJV2006 candidate record: ${JSON.stringify(record)}`);
    }

    if (map.has(key)) {
      fail(`Duplicate KJV2006 reader coordinate: ${key}`);
    }

    map.set(key, {
      key,
      reference: String(
        record?.reference ??
          `${record.book} ${record.chapter}:${record.verse}`,
      ),
      text: visibleText(record),
    });
  }

  if (map.size !== 31102) {
    fail(
      `KJV2006 reader count drift: expected 31102, found ${map.size}`,
    );
  }

  return map;
}

function sourceReferenceFor(record, objectKey) {
  const references = [
    ...new Set(
      (Array.isArray(record?.sourceTokens)
        ? record.sourceTokens
        : Array.isArray(record?.tokens)
          ? record.tokens
          : []
      )
        .map(token => token?.sourceReference)
        .filter(Boolean)
        .map(String),
    ),
  ];

  if (references.length > 1) {
    fail(
      `Canonical record ${objectKey} contains multiple source references: ${references.join(", ")}`,
    );
  }

  return references[0] ?? record?.reference ?? objectKey;
}

function collectSources(canonicalRoot) {
  const rows = [];
  const byKey = new Map();

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

      for (const [objectKey, record] of Object.entries(document)) {
        const parsed = parseReference(
          sourceReferenceFor(record, objectKey),
        );

        if (byKey.has(parsed.key)) {
          fail(
            `Duplicate source-owned coordinate ${parsed.key}: ` +
              `${byKey.get(parsed.key).location} and ` +
              `${corpus}/${filename}/${objectKey}`,
          );
        }

        const row = {
          source: parsed.key,
          corpus,
          location: `${corpus}/${filename}/${objectKey}`,
          recordReference: String(record?.reference ?? objectKey),
          sourceTokenCount: Array.isArray(record?.sourceTokens)
            ? record.sourceTokens.length
            : Array.isArray(record?.tokens)
              ? record.tokens.length
              : 0,
        };

        byKey.set(parsed.key, row);
        rows.push(row);
      }
    }
  }

  rows.sort((left, right) =>
    left.source.localeCompare(right.source),
  );

  if (rows.length !== 31086) {
    fail(
      `Source-owned coordinate count drift: expected 31086, found ${rows.length}`,
    );
  }

  return {
    rows,
    byKey,
  };
}

function buildCrosswalk({
  sources,
  reader,
  policy,
}) {
  const exceptionMap = new Map();
  const readerOnlyMap = new Map();

  for (const exception of policy.sourceExceptions) {
    const parsedSource = parseReference(exception.source);

    if (exceptionMap.has(parsedSource.key)) {
      fail(`Duplicate policy source exception: ${parsedSource.key}`);
    }

    const readers = exception.readers.map(
      readerReference =>
        parseReference(readerReference).key,
    );

    exceptionMap.set(parsedSource.key, {
      ...exception,
      source: parsedSource.key,
      readers,
    });
  }

  for (const entry of policy.readerOnly) {
    const parsed = parseReference(entry.reader);

    if (readerOnlyMap.has(parsed.key)) {
      fail(`Duplicate reader-only policy coordinate: ${parsed.key}`);
    }

    readerOnlyMap.set(parsed.key, {
      ...entry,
      reader: parsed.key,
    });
  }

  const sourceRows = [];
  const readerSources = new Map();

  for (const source of sources.rows) {
    const exception = exceptionMap.get(source.source);
    const targets = exception
      ? exception.readers
      : [source.source];
    const rule = exception
      ? exception.topology
      : "identity";

    if (!targets.length) {
      fail(`Source ${source.source} has no reader target.`);
    }

    for (const target of targets) {
      if (!reader.has(target)) {
        fail(
          `Source ${source.source} maps to missing KJV reader coordinate ${target}.`,
        );
      }

      if (!readerSources.has(target)) {
        readerSources.set(target, []);
      }

      readerSources.get(target).push(source.source);
    }

    sourceRows.push({
      ...source,
      readers: targets,
      rule,
      explicit: Boolean(exception),
      evidence: exception?.evidence ?? [],
      reason:
        exception?.reason ??
        "Identity source-to-reader coordinate.",
    });
  }

  const unusedExceptions = [
    ...exceptionMap.keys(),
  ].filter(source => !sources.byKey.has(source));

  const readerRows = [];
  const uncoveredReaders = [];
  const readerOnlyButMapped = [];

  for (const [readerKey, readerRecord] of reader) {
    const sourceKeys = [
      ...(readerSources.get(readerKey) || []),
    ].sort();
    const readerOnly = readerOnlyMap.get(readerKey) ?? null;

    if (!sourceKeys.length && !readerOnly) {
      uncoveredReaders.push(readerKey);
    }

    if (sourceKeys.length && readerOnly) {
      readerOnlyButMapped.push(readerKey);
    }

    readerRows.push({
      reader: readerKey,
      reference: readerRecord.reference,
      sourceCoordinates: sourceKeys,
      sourceCount: sourceKeys.length,
      readerOnly: Boolean(readerOnly),
      readerOnlyClassification:
        readerOnly?.classification ?? null,
      readerOnlyReason: readerOnly?.reason ?? null,
    });
  }

  const unusedReaderOnly = [
    ...readerOnlyMap.keys(),
  ].filter(readerKey => !reader.has(readerKey));

  const multiSourceReaders = readerRows.filter(
    row => row.sourceCount > 1,
  );
  const multiReaderSources = sourceRows.filter(
    row => row.readers.length > 1,
  );
  const readerOnlyRows = readerRows.filter(
    row => row.readerOnly,
  );
  const uniqueMappedReaders = readerRows.filter(
    row => row.sourceCount > 0,
  ).length;
  const edges = sourceRows.reduce(
    (sum, row) => sum + row.readers.length,
    0,
  );

  const fingerprintPayload = {
    policyVersion: policy.version,
    sources: sourceRows.map(row => ({
      source: row.source,
      readers: row.readers,
      rule: row.rule,
    })),
    readerOnly: readerOnlyRows.map(row => row.reader),
  };
  const fingerprint = crypto
    .createHash("sha256")
    .update(stableStringify(fingerprintPayload))
    .digest("hex");

  return {
    sourceRows,
    readerRows,
    stats: {
      sourceCoordinates: sourceRows.length,
      readerCoordinates: readerRows.length,
      sourceToReaderEdges: edges,
      uniqueMappedReaders,
      readerOnlyCoordinates: readerOnlyRows.length,
      explicitSourceExceptions:
        sourceRows.filter(row => row.explicit).length,
      identitySourceMappings:
        sourceRows.filter(row => !row.explicit).length,
      multiSourceReaders: multiSourceReaders.length,
      multiReaderSources: multiReaderSources.length,
    },
    multiSourceReaders,
    multiReaderSources,
    readerOnlyRows,
    diagnostics: {
      unusedExceptions,
      unusedReaderOnly,
      uncoveredReaders,
      readerOnlyButMapped,
    },
    fingerprint,
  };
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.candidate,
    args.policy,
    args.gapSummary,
    args.evidenceSummary,
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

  const policy = readJson(args.policy);
  const gapSummary = readJson(args.gapSummary);
  const evidenceSummary = readJson(args.evidenceSummary);

  if (
    policy.version !==
    "p0512ae-kjv-explicit-versification-crosswalk@1"
  ) {
    fail("Unexpected explicit crosswalk policy version.");
  }

  if (
    gapSummary?.milestone !== "P05.12AB" ||
    gapSummary?.gaps?.count !== 40
  ) {
    fail("The supplied P05.12AB gap summary is not approved.");
  }

  if (
    evidenceSummary?.milestone !== "P05.12AD" ||
    evidenceSummary?.gates?.safeToBuildExplicitKjvCrosswalk !== true
  ) {
    fail("The supplied P05.12AD evidence packet is not approved.");
  }

  const reader = buildReader(readJson(args.candidate));
  const sources = collectSources(args.canonicalRoot);
  const buildA = buildCrosswalk({
    sources,
    reader,
    policy,
  });
  const buildB = buildCrosswalk({
    sources,
    reader,
    policy,
  });

  if (buildA.fingerprint !== buildB.fingerprint) {
    fail("Repeated explicit crosswalk build was not deterministic.");
  }

  const approvedGapKeys = new Set(
    gapSummary.gaps.rows.map(
      row => parseReference(row.key).key,
    ),
  );
  const readerRowsByKey = new Map(
    buildA.readerRows.map(row => [row.reader, row]),
  );
  const unexplainedGapKeys = [
    ...approvedGapKeys,
  ].filter(key => {
    const row = readerRowsByKey.get(key);

    return (
      !row ||
      (!row.sourceCount && !row.readerOnly)
    );
  });

  const expectedMultiSourceReaders = [
    "1 kings:22:43",
    "numbers:26:1",
    "3 john:1:14",
    "revelation:13:1",
  ].sort();
  const actualMultiSourceReaders =
    buildA.multiSourceReaders
      .map(row => row.reader)
      .sort();

  const expectedMultiReaderSources = [
    "isaiah:63:19",
    "acts:19:40",
    "2 corinthians:13:12",
  ].sort();
  const actualMultiReaderSources =
    buildA.multiReaderSources
      .map(row => row.source)
      .sort();

  const gates = {
    candidateHashLocked: true,
    policyLoaded: true,
    sourceOwnedCoordinatesExact:
      buildA.stats.sourceCoordinates === 31086,
    readerCoordinatesExact:
      buildA.stats.readerCoordinates === 31102,
    sourceToReaderEdgesExact:
      buildA.stats.sourceToReaderEdges === 31089,
    uniqueMappedReadersExact:
      buildA.stats.uniqueMappedReaders === 31085,
    readerOnlyCoordinatesExact:
      buildA.stats.readerOnlyCoordinates === 17,
    multiSourceReadersExact:
      JSON.stringify(actualMultiSourceReaders) ===
      JSON.stringify(expectedMultiSourceReaders),
    multiReaderSourcesExact:
      JSON.stringify(actualMultiReaderSources) ===
      JSON.stringify(expectedMultiReaderSources),
    noUnusedSourceExceptions:
      buildA.diagnostics.unusedExceptions.length === 0,
    noUnusedReaderOnlyRules:
      buildA.diagnostics.unusedReaderOnly.length === 0,
    noUncoveredReaders:
      buildA.diagnostics.uncoveredReaders.length === 0,
    noReaderOnlyCoordinateMapped:
      buildA.diagnostics.readerOnlyButMapped.length === 0,
    all40P0512abGapCoordinatesExplained:
      unexplainedGapKeys.length === 0,
    repeatedBuildDeterministic:
      buildA.fingerprint === buildB.fingerprint,
    productionDataModified: false,
    safeToBuildKjvCanonicalMigrationPreview: false,
    safeToPromoteProductionKjv: false,
  };

  gates.safeToBuildKjvCanonicalMigrationPreview =
    Object.entries(gates)
      .filter(
        ([key]) =>
          ![
            "safeToBuildKjvCanonicalMigrationPreview",
            "safeToPromoteProductionKjv",
            "productionDataModified",
          ].includes(key),
      )
      .every(([, value]) => value === true);

  const report = {
    milestone: "P05.12AE",
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
      evidenceSummary: path
        .relative(process.cwd(), args.evidenceSummary)
        .replace(/\\/g, "/"),
    },
    crosswalkFingerprint: buildA.fingerprint,
    stats: buildA.stats,
    expectedTopology: {
      multiSourceReaders: expectedMultiSourceReaders,
      multiReaderSources: expectedMultiReaderSources,
      readerOnly: policy.readerOnly.map(
        entry => parseReference(entry.reader).key,
      ).sort(),
    },
    actualTopology: {
      multiSourceReaders: buildA.multiSourceReaders,
      multiReaderSources: buildA.multiReaderSources,
      readerOnly: buildA.readerOnlyRows,
    },
    diagnostics: {
      ...buildA.diagnostics,
      unexplainedGapKeys,
    },
    gates,
  };

  writeJson(
    path.join(
      args.output,
      "kjv-explicit-crosswalk-summary.json",
    ),
    report,
  );
  writeJson(
    path.join(
      args.output,
      "kjv-explicit-source-to-reader-crosswalk.json",
    ),
    buildA.sourceRows,
  );
  writeJson(
    path.join(
      args.output,
      "kjv-explicit-reader-ownership.json",
    ),
    buildA.readerRows,
  );
  writeJson(
    path.join(
      args.output,
      "kjv-explicit-crosswalk-policy-copy.json",
    ),
    policy,
  );
  writeCsv(
    path.join(
      args.output,
      "kjv-explicit-exceptions.csv",
    ),
    buildA.sourceRows
      .filter(row => row.explicit)
      .map(row => ({
        source: row.source,
        readers: row.readers,
        rule: row.rule,
        evidence: row.evidence,
        reason: row.reason,
        location: row.location,
      })),
  );
  writeCsv(
    path.join(
      args.output,
      "kjv-reader-only-verses.csv",
    ),
    buildA.readerOnlyRows.map(row => ({
      reader: row.reader,
      reference: row.reference,
      classification:
        row.readerOnlyClassification,
      reason: row.readerOnlyReason,
    })),
  );

  console.log(JSON.stringify(report, null, 2));

  if (!gates.safeToBuildKjvCanonicalMigrationPreview) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
