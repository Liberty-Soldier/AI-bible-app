"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(
    `[P05.12AI token crosswalk application] ${message}`,
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
    } else if (current === "--ah-summary" && next) {
      args.ahSummary = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (current === "--label" && next) {
      args.label = String(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  for (const key of [
    "canonicalRoot",
    "candidate",
    "policy",
    "ahSummary",
    "output",
    "label",
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

  return {
    key: coordinateKey(
      match[1],
      match[2],
      match[3],
    ),
    book: canonicalBookName(match[1]),
    chapter: Number(match[2]),
    verse: Number(match[3]),
    rawBook: match[1],
    firstSeparator: match[0].includes(".")
      ? "."
      : ":",
  };
}

function formatLikeSourceReference(
  sourceReference,
  targetKey,
) {
  const sourceText = String(sourceReference ?? "");
  const sourceMatch =
    /^(.*?)([.:])(\d+)([.:])(\d+)$/.exec(
      sourceText,
    );

  if (!sourceMatch) {
    fail(
      `Unable to preserve reference format for ${sourceText}`,
    );
  }

  const target = parseReference(targetKey);

  return (
    `${sourceMatch[1]}` +
    `${sourceMatch[2]}${target.chapter}` +
    `${sourceMatch[4]}${target.verse}`
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

function strippedDocument(document) {
  const clone = structuredClone(document);

  for (const record of Object.values(clone)) {
    const tokens = Array.isArray(record?.sourceTokens)
      ? record.sourceTokens
      : Array.isArray(record?.tokens)
        ? record.tokens
        : [];

    for (const token of tokens) {
      delete token.canonicalReference;
      delete token.versificationRuleId;
    }
  }

  return clone;
}

function semanticDigest(canonicalRoot) {
  const hash = crypto.createHash("sha256");
  let files = 0;
  let records = 0;
  let tokens = 0;

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

      files += 1;
      records += Object.keys(document).length;

      for (const record of Object.values(document)) {
        const sourceTokens = Array.isArray(
          record?.sourceTokens,
        )
          ? record.sourceTokens
          : Array.isArray(record?.tokens)
            ? record.tokens
            : [];

        tokens += sourceTokens.length;
      }

      const relative = path
        .relative(canonicalRoot, file)
        .replace(/\\/g, "/");

      hash.update(relative);
      hash.update("\0");
      hash.update(
        stableStringify(
          strippedDocument(document),
        ),
      );
      hash.update("\n");
    }
  }

  return {
    sha256: hash.digest("hex"),
    files,
    records,
    tokens,
  };
}

function buildTopology(
  canonicalRoot,
  reader,
  readerOnly,
) {
  const sourceTargets = new Map();
  const readerSources = new Map();

  let sourceTokens = 0;
  let targetsOutsideReader = 0;

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

      for (const record of Object.values(document)) {
        const tokens = Array.isArray(
          record?.sourceTokens,
        )
          ? record.sourceTokens
          : Array.isArray(record?.tokens)
            ? record.tokens
            : [];

        for (const token of tokens) {
          sourceTokens += 1;

          const source = parseReference(
            token?.sourceReference,
          ).key;
          const target = parseReference(
            token?.canonicalReference,
          ).key;

          if (!reader.has(target)) {
            targetsOutsideReader += 1;
          }

          if (!sourceTargets.has(source)) {
            sourceTargets.set(source, new Map());
          }

          const targets = sourceTargets.get(source);
          targets.set(
            target,
            (targets.get(target) || 0) + 1,
          );

          if (!readerSources.has(target)) {
            readerSources.set(target, new Map());
          }

          const sources = readerSources.get(target);
          sources.set(
            source,
            (sources.get(source) || 0) + 1,
          );
        }
      }
    }
  }

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
    .map(([readerCoordinate, record]) => {
      const sources =
        readerSources.get(readerCoordinate) ??
        new Map();

      return {
        readerCoordinate,
        reference: record.reference,
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
          readerOnly.has(readerCoordinate),
      };
    })
    .sort((left, right) =>
      left.readerCoordinate.localeCompare(
        right.readerCoordinate,
      ),
    );

  const mappedReaders = readerRows.filter(
    row => row.sourceCoordinateCount > 0,
  );
  const unsupportedReaders = readerRows.filter(
    row => row.sourceCoordinateCount === 0,
  );
  const multiTargetSources = sourceRows.filter(
    row => row.readerTargetCount > 1,
  );
  const multiSourceReaders = readerRows.filter(
    row => row.sourceCoordinateCount > 1,
  );

  const fingerprint = crypto
    .createHash("sha256")
    .update(
      stableStringify({
        policyVersion:
          "p0512ah-token-level-kjv-crosswalk-overlay@1",
        sources: sourceRows.map(row => ({
          source: row.source,
          readers: row.readerTargets.map(
            target => target.readerTarget,
          ),
          rule:
            row.readerTargetCount > 1
              ? "token-explicit"
              : "resolved",
        })),
        readerOnly: unsupportedReaders
          .filter(row => row.readerOnly)
          .map(row => row.readerCoordinate),
      }),
    )
    .digest("hex");

  return {
    totals: {
      sourceTokens,
      uniqueSourceCoordinates:
        sourceRows.length,
      readerCoordinates: readerRows.length,
      mappedReaderCoordinates:
        mappedReaders.length,
      unsupportedReaderCoordinates:
        unsupportedReaders.length,
      sourceToReaderEdges:
        sourceRows.reduce(
          (sum, row) =>
            sum + row.readerTargetCount,
          0,
        ),
      multiTargetSourceCoordinates:
        multiTargetSources.length,
      multiSourceReaderCoordinates:
        multiSourceReaders.length,
      targetsOutsideReader,
    },
    sourceRows,
    readerRows,
    multiTargetSources,
    multiSourceReaders,
    unsupportedReaders,
    fingerprint,
  };
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.candidate,
    args.policy,
    args.ahSummary,
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
  const ahSummary = readJson(args.ahSummary);

  if (
    policy.version !==
    "p0512ah-token-level-kjv-crosswalk-overlay@1"
  ) {
    fail("Unexpected overlay policy version.");
  }

  if (
    ahSummary?.milestone !== "P05.12AH" ||
    ahSummary?.crosswalkFingerprint !==
      "f61f49a42e6efa7fefb0103b0b1105c8a4c9fdd4b206ac468c8fdac87a839636" ||
    ahSummary?.gates
      ?.safeToBuildIsolatedCanonicalMigration !==
      true
  ) {
    fail("The supplied P05.12AH report is not approved.");
  }

  const reader = buildReader(
    readJson(args.candidate),
  );
  const readerOnly = new Set(
    policy.readerOnly.map(
      reference => parseReference(reference).key,
    ),
  );

  const beforeSemantic =
    semanticDigest(args.canonicalRoot);

  const seenTokenRules = new Set();
  const seenSourceRules = new Set();
  const seenTokenIds = new Set();
  const changes = [];
  const impactedRecords = new Map();

  let ownedFiles = 0;
  let ownedRecords = 0;
  let sourceTokens = 0;
  let targetChanges = 0;
  let ruleOnlyChanges = 0;

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
      let fileChanged = false;

      for (const [objectKey, record] of Object.entries(
        document,
      )) {
        ownedRecords += 1;

        const tokens = Array.isArray(
          record?.sourceTokens,
        )
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
          ).key;
          const currentTarget = parseReference(
            token?.canonicalReference,
          ).key;
          const currentRawTarget = String(
            token?.canonicalReference ?? "",
          );
          const currentRule =
            token?.versificationRuleId ?? null;

          const tokenRule =
            policy.tokenRules[tokenId] ?? null;
          const sourceRule =
            policy.sourceWideRules[source] ?? null;

          let target = currentTarget;
          let nextRule = currentRule;
          let ruleType = "existing";
          let reason =
            "Existing destination retained.";

          if (tokenRule) {
            if (
              parseReference(tokenRule.source).key !==
              source
            ) {
              fail(
                `Token rule source mismatch for ${tokenId}.`,
              );
            }

            target = parseReference(
              tokenRule.target,
            ).key;
            nextRule = tokenRule.ruleId;
            ruleType = "token-exception";
            reason = tokenRule.reason;
            seenTokenRules.add(tokenId);
          } else if (sourceRule) {
            target = parseReference(
              sourceRule.target,
            ).key;
            nextRule = sourceRule.ruleId;
            ruleType = "source-exception";
            reason = sourceRule.reason;
            seenSourceRules.add(source);
          }

          if (!reader.has(target)) {
            fail(
              `Overlay target is not in KJV2006: ${target}`,
            );
          }

          const nextRawTarget =
            formatLikeSourceReference(
              token.sourceReference,
              target,
            );

          const targetChanged =
            currentTarget !== target;
          const ruleChanged =
            String(currentRule ?? "") !==
            String(nextRule ?? "");

          if (!targetChanged && !ruleChanged) {
            continue;
          }

          if (targetChanged) {
            targetChanges += 1;
          } else {
            ruleOnlyChanges += 1;
          }

          token.canonicalReference =
            nextRawTarget;
          token.versificationRuleId =
            nextRule;
          fileChanged = true;

          const recordKey =
            `${corpus}/${filename}/${objectKey}`;

          if (!impactedRecords.has(recordKey)) {
            impactedRecords.set(recordKey, {
              corpus,
              filename,
              objectKey,
              recordReference:
                record?.reference ?? null,
              hasKjv:
                Boolean(record?.translations?.kjv),
              existingKjvText:
                record?.translations?.kjv?.text ??
                null,
              changedTokenCount: 0,
              targetCoordinates: new Set(),
              sourceCoordinates: new Set(),
            });
          }

          const impact =
            impactedRecords.get(recordKey);
          impact.changedTokenCount += 1;
          impact.targetCoordinates.add(target);
          impact.sourceCoordinates.add(source);

          changes.push({
            tokenId,
            corpus,
            filename,
            objectKey,
            source,
            previousCanonicalReference:
              currentRawTarget,
            previousCanonicalCoordinate:
              currentTarget,
            nextCanonicalReference:
              nextRawTarget,
            nextCanonicalCoordinate: target,
            previousRuleId: currentRule,
            nextRuleId: nextRule,
            targetChanged,
            ruleChanged,
            ruleType,
            reason,
          });
        }
      }

      if (fileChanged) {
        writeJson(file, document);
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
    .map(reference => parseReference(reference).key)
    .filter(
      source => !seenSourceRules.has(source),
    );

  const afterSemantic =
    semanticDigest(args.canonicalRoot);

  if (
    beforeSemantic.sha256 !==
    afterSemantic.sha256
  ) {
    fail(
      "Fields outside canonicalReference and versificationRuleId changed.",
    );
  }

  const topology = buildTopology(
    args.canonicalRoot,
    reader,
    readerOnly,
  );

  const impacts = [...impactedRecords.values()]
    .map(impact => ({
      ...impact,
      sourceCoordinates:
        [...impact.sourceCoordinates].sort(),
      targetCoordinates:
        [...impact.targetCoordinates].sort(),
    }))
    .sort(
      (left, right) =>
        left.corpus.localeCompare(right.corpus) ||
        left.filename.localeCompare(
          right.filename,
        ) ||
        left.objectKey.localeCompare(
          right.objectKey,
        ),
    );

  const unsupportedNotReaderOnly =
    topology.unsupportedReaders
      .filter(row => !row.readerOnly)
      .map(row => row.readerCoordinate);

  const readerOnlyWithSupport =
    topology.readerRows
      .filter(
        row =>
          row.readerOnly &&
          row.sourceCoordinateCount > 0,
      )
      .map(row => row.readerCoordinate);

  const expectedMultiTarget = [
    "2 corinthians:13:12",
    "acts:19:40",
    "isaiah:63:19",
  ];
  const actualMultiTarget =
    topology.multiTargetSources
      .map(row => row.source)
      .sort();

  const expectedMultiSource = [
    "1 chronicles:11:47",
    "1 kings:22:43",
    "1 samuel:20:42",
    "3 john:1:14",
    "numbers:26:1",
    "revelation:13:1",
  ];
  const actualMultiSource =
    topology.multiSourceReaders
      .map(row => row.readerCoordinate)
      .sort();

  const gates = {
    candidateHashLocked: true,
    ahAuthorizationVerified: true,
    ownedFilesExact:
      ownedFiles === 66,
    ownedRecordsExact:
      ownedRecords === 31086,
    sourceTokensExact:
      sourceTokens === 438452,
    changedTokensExact:
      changes.length === 910,
    allTokenRulesUsed:
      unusedTokenRules.length === 0,
    allSourceRulesUsed:
      unusedSourceRules.length === 0,
    onlyAllowedFieldsChanged:
      beforeSemantic.sha256 ===
      afterSemantic.sha256,
    sourceCoordinatesExact:
      topology.totals
        .uniqueSourceCoordinates === 31088,
    readerCoordinatesExact:
      topology.totals.readerCoordinates ===
      31102,
    mappedReaderCoordinatesExact:
      topology.totals
        .mappedReaderCoordinates === 31085,
    unsupportedReaderCoordinatesExact:
      topology.totals
        .unsupportedReaderCoordinates === 17,
    sourceToReaderEdgesExact:
      topology.totals
        .sourceToReaderEdges === 31091,
    multiTargetSourcesExact:
      JSON.stringify(actualMultiTarget) ===
      JSON.stringify(expectedMultiTarget),
    multiSourceReadersExact:
      JSON.stringify(actualMultiSource) ===
      JSON.stringify(expectedMultiSource),
    noTargetOutsideKjv2006:
      topology.totals
        .targetsOutsideReader === 0,
    noUnsupportedNonReaderOnlyCoordinate:
      unsupportedNotReaderOnly.length === 0,
    noReaderOnlyCoordinateReceivesSupport:
      readerOnlyWithSupport.length === 0,
    stagingOnly: true,
    safeToRetainStagedTokenCrosswalk:
      false,
    safeToPromoteProductionKjv: false,
  };

  gates.safeToRetainStagedTokenCrosswalk =
    Object.entries(gates)
      .filter(
        ([key]) =>
          ![
            "safeToRetainStagedTokenCrosswalk",
            "safeToPromoteProductionKjv",
            "stagingOnly",
          ].includes(key),
      )
      .every(([, value]) => value === true);

  const report = {
    milestone: "P05.12AI",
    label: args.label,
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
      ahSummary: path
        .relative(process.cwd(), args.ahSummary)
        .replace(/\\/g, "/"),
    },
    semanticDigestBefore:
      beforeSemantic,
    semanticDigestAfter:
      afterSemantic,
    totals: {
      ownedFiles,
      ownedRecords,
      sourceTokens,
      changedTokens: changes.length,
      targetChanges,
      ruleOnlyChanges,
      impactedRecords: impacts.length,
      impactedRecordsWithKjv:
        impacts.filter(impact => impact.hasKjv)
          .length,
      impactedRecordsWithoutKjv:
        impacts.filter(impact => !impact.hasKjv)
          .length,
      ...topology.totals,
    },
    topologyFingerprint:
      topology.fingerprint,
    topology: {
      multiTargetSources:
        topology.multiTargetSources,
      multiSourceReaders:
        topology.multiSourceReaders,
      unsupportedReaders:
        topology.unsupportedReaders,
    },
    diagnostics: {
      unusedTokenRules,
      unusedSourceRules,
      unsupportedNotReaderOnly,
      readerOnlyWithSupport,
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
      "isolated-token-crosswalk-application-summary.json",
    ),
    report,
  );

  writeJson(
    path.join(
      args.output,
      "isolated-token-crosswalk-changes.json",
    ),
    changes,
  );

  writeCsv(
    path.join(
      args.output,
      "isolated-token-crosswalk-changes.csv",
    ),
    changes,
  );

  writeJson(
    path.join(
      args.output,
      "isolated-token-crosswalk-impact-records.json",
    ),
    impacts,
  );

  writeCsv(
    path.join(
      args.output,
      "isolated-token-crosswalk-impact-records.csv",
    ),
    impacts,
  );

  writeJson(
    path.join(
      args.output,
      "isolated-token-crosswalk-source-map.json",
    ),
    topology.sourceRows,
  );

  writeJson(
    path.join(
      args.output,
      "isolated-token-crosswalk-reader-map.json",
    ),
    topology.readerRows,
  );

  console.log(JSON.stringify(report, null, 2));

  if (!gates.safeToRetainStagedTokenCrosswalk) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
