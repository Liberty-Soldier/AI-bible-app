"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

function fail(message) {
  throw new Error(`[P05.12AB KJV coordinate gap audit] ${message}`);
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
    } else if (current === "--current-reader" && next) {
      args.currentReader = path.resolve(next);
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
    "currentReader",
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

function buildReaderState(document, label) {
  if (!Array.isArray(document)) {
    fail(`${label} must be a verse array.`);
  }

  const map = new Map();
  const ordered = [];

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
      fail(`Invalid ${label} record: ${JSON.stringify(record)}`);
    }

    if (map.has(key)) {
      fail(`Duplicate ${label} coordinate: ${key}`);
    }

    const entry = {
      key,
      book: canonicalBookName(record.book),
      chapter: Number(record.chapter),
      verse: Number(record.verse),
      reference: String(
        record.reference ??
          `${record.book} ${record.chapter}:${record.verse}`,
      ),
      text: visibleText(record),
      index: ordered.length,
    };

    map.set(key, entry);
    ordered.push(entry);
  }

  if (map.size !== 31102) {
    fail(`${label} count drift: expected 31102, found ${map.size}`);
  }

  return { map, ordered };
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

  return canonicalBookName(path.basename(filename, ".json"));
}

function recordKey(record, filename) {
  return coordinateKey(
    recordBookName(record, filename),
    record?.chapter,
    record?.verse,
  );
}

function collectCanonical(canonicalRoot) {
  const ownedKjv = new Map();
  const ownedAll = new Map();
  const nonOwnedKjv = new Map();
  const duplicates = [];
  const files = [];

  for (const corpus of ["hebrew", "greek-nt"]) {
    const corpusRoot = path.join(canonicalRoot, corpus);

    for (const file of walkJson(corpusRoot)) {
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
        const key = recordKey(record, filename);
        const location = {
          corpus,
          filename,
          objectKey,
          reference: String(record?.reference ?? objectKey),
          owned,
          hasKjv: Boolean(record?.translations?.kjv),
          kjvText: record?.translations?.kjv?.text ?? null,
          sourceTokenCount: Array.isArray(record?.sourceTokens)
            ? record.sourceTokens.length
            : Array.isArray(record?.tokens)
              ? record.tokens.length
              : null,
        };

        const targetAll = owned ? ownedAll : null;

        if (targetAll) {
          if (targetAll.has(key)) {
            duplicates.push({
              type: "owned-coordinate-duplicate",
              key,
              first: targetAll.get(key),
              second: location,
            });
          } else {
            targetAll.set(key, location);
          }
        }

        if (record?.translations?.kjv) {
          const target = owned ? ownedKjv : nonOwnedKjv;

          if (target.has(key)) {
            duplicates.push({
              type: owned
                ? "owned-kjv-coordinate-duplicate"
                : "non-owned-kjv-coordinate-duplicate",
              key,
              first: target.get(key),
              second: location,
            });
          } else {
            target.set(key, location);
          }
        }
      }
    }
  }

  return {
    ownedKjv,
    ownedAll,
    nonOwnedKjv,
    duplicates,
    files,
  };
}

function loadOptionalJson(file) {
  if (!fs.existsSync(file)) return null;

  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function flattenStrings(value, trail = [], output = []) {
  if (typeof value === "string") {
    output.push({
      trail: trail.join("."),
      value,
    });
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flattenStrings(item, [...trail, String(index)], output),
    );
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      flattenStrings(item, [...trail, key], output);
    }
  }

  return output;
}

function findPlanMentions(planStrings, entry) {
  const needles = [
    entry.key,
    entry.reference,
    `${entry.book} ${entry.chapter}:${entry.verse}`,
  ]
    .map(value => String(value).toLowerCase())
    .filter(Boolean);

  return planStrings
    .filter(item => {
      const haystack = item.value.toLowerCase();
      return needles.some(needle => haystack.includes(needle));
    })
    .slice(0, 20);
}

function main() {
  const args = parseArgs(process.argv);

  for (const required of [
    args.canonicalRoot,
    args.candidate,
    args.currentReader,
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

  const candidate = buildReaderState(
    readJson(args.candidate),
    "KJV2006 candidate",
  );
  const current = buildReaderState(
    readJson(args.currentReader),
    "Current production KJV",
  );

  const coordinateSetMismatch = [
    ...candidate.map.keys(),
  ]
    .filter(key => !current.map.has(key))
    .concat(
      [...current.map.keys()].filter(key => !candidate.map.has(key)),
    );

  if (coordinateSetMismatch.length) {
    fail(
      `Current and candidate KJV coordinate sets differ: ${coordinateSetMismatch
        .slice(0, 20)
        .join(", ")}`,
    );
  }

  const canonical = collectCanonical(args.canonicalRoot);

  const planPath = path.resolve(
    "scripts/p0510/p0510-canonical-source-plan.json",
  );
  const p0511PlanPath = path.resolve(
    "scripts/p0511/p0511-safe-parallel-plan.json",
  );
  const p0510Plan = loadOptionalJson(planPath);
  const p0511Plan = loadOptionalJson(p0511PlanPath);
  const planStrings = [
    ...flattenStrings(p0510Plan),
    ...flattenStrings(p0511Plan),
  ];

  const missingKeys = [...candidate.map.keys()]
    .filter(key => !canonical.ownedKjv.has(key))
    .sort((left, right) => {
      const a = candidate.map.get(left);
      const b = candidate.map.get(right);

      return (
        a.book.localeCompare(b.book) ||
        a.chapter - b.chapter ||
        a.verse - b.verse
      );
    });

  const extraOwnedKeys = [...canonical.ownedKjv.keys()]
    .filter(key => !candidate.map.has(key));

  const gaps = missingKeys.map(key => {
    const candidateEntry = candidate.map.get(key);
    const currentEntry = current.map.get(key);
    const previous = current.ordered[currentEntry.index - 1] ?? null;
    const next = current.ordered[currentEntry.index + 1] ?? null;
    const ownedRecord = canonical.ownedAll.get(key) ?? null;
    const shadowRecord = canonical.nonOwnedKjv.get(key) ?? null;

    let classification = "reader-only-no-canonical-record";

    if (ownedRecord && !ownedRecord.hasKjv) {
      classification = "owned-source-record-without-kjv";
    } else if (shadowRecord) {
      classification = "non-owned-shadow-kjv-only";
    }

    return {
      key,
      reference: candidateEntry.reference,
      book: candidateEntry.book,
      chapter: candidateEntry.chapter,
      verse: candidateEntry.verse,
      classification,
      candidateText: candidateEntry.text,
      currentText: currentEntry.text,
      currentMatchesCandidate:
        currentEntry.text === candidateEntry.text,
      ownedRecord,
      nonOwnedShadowRecord: shadowRecord,
      previousCoordinate: previous
        ? {
            key: previous.key,
            reference: previous.reference,
            text: previous.text,
            ownedKjvCanonical:
              canonical.ownedKjv.has(previous.key),
          }
        : null,
      nextCoordinate: next
        ? {
            key: next.key,
            reference: next.reference,
            text: next.text,
            ownedKjvCanonical:
              canonical.ownedKjv.has(next.key),
          }
        : null,
      p05PlanMentions: findPlanMentions(
        planStrings,
        candidateEntry,
      ),
    };
  });

  const classifications = {};

  for (const gap of gaps) {
    classifications[gap.classification] =
      (classifications[gap.classification] || 0) + 1;
  }

  const gapsByBook = {};

  for (const gap of gaps) {
    gapsByBook[gap.book] =
      (gapsByBook[gap.book] || 0) + 1;
  }

  const currentTextDifferences = gaps.filter(
    gap => !gap.currentMatchesCandidate,
  );

  const report = {
    milestone: "P05.12AB",
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
        verses: candidate.map.size,
      },
      currentReader: {
        path: path
          .relative(process.cwd(), args.currentReader)
          .replace(/\\/g, "/"),
        sha256: sha256File(args.currentReader),
        verses: current.map.size,
      },
      p0510PlanPresent: Boolean(p0510Plan),
      p0511PlanPresent: Boolean(p0511Plan),
    },
    canonical: {
      ownedKjvCoordinates: canonical.ownedKjv.size,
      ownedSourceCoordinates: canonical.ownedAll.size,
      nonOwnedShadowKjvCoordinates:
        canonical.nonOwnedKjv.size,
      duplicateCoordinates: canonical.duplicates.length,
      files: canonical.files,
    },
    gaps: {
      count: gaps.length,
      classifications,
      byBook: gapsByBook,
      currentTextDifferences:
        currentTextDifferences.length,
      rows: gaps,
    },
    extraOwnedCoordinates: extraOwnedKeys,
    duplicateCoordinates: canonical.duplicates,
    gates: {
      candidateAndCurrentCoordinateSetsExact:
        coordinateSetMismatch.length === 0,
      canonicalOwnedKjvCountIs31062:
        canonical.ownedKjv.size === 31062,
      exactly40ReaderCoordinatesLackOwnedKjvBlock:
        gaps.length === 40,
      noOwnedCanonicalCoordinatesOutsideReader:
        extraOwnedKeys.length === 0,
      noCanonicalCoordinateDuplicates:
        canonical.duplicates.length === 0,
      everyGapClassified:
        gaps.every(gap => Boolean(gap.classification)),
      productionDataModified: false,
      safeToDesignKjvCanonicalMigration: true,
      safeToPromoteProductionKjv: false,
    },
  };

  writeJson(
    path.join(
      args.output,
      "kjv-canonical-coordinate-gap-summary.json",
    ),
    report,
  );

  writeJson(
    path.join(
      args.output,
      "kjv-canonical-coordinate-gaps.json",
    ),
    gaps,
  );

  writeCsv(
    path.join(
      args.output,
      "kjv-canonical-coordinate-gaps.csv",
    ),
    gaps.map(gap => ({
      reference: gap.reference,
      key: gap.key,
      classification: gap.classification,
      currentMatchesCandidate:
        gap.currentMatchesCandidate,
      candidateText: gap.candidateText,
      currentText: gap.currentText,
      ownedRecord: gap.ownedRecord,
      nonOwnedShadowRecord:
        gap.nonOwnedShadowRecord,
      previousCoordinate:
        gap.previousCoordinate,
      nextCoordinate: gap.nextCoordinate,
      p05PlanMentions: gap.p05PlanMentions,
    })),
  );

  console.log(
    JSON.stringify(
      {
        milestone: report.milestone,
        canonical: {
          ownedKjvCoordinates:
            report.canonical.ownedKjvCoordinates,
          ownedSourceCoordinates:
            report.canonical.ownedSourceCoordinates,
          nonOwnedShadowKjvCoordinates:
            report.canonical.nonOwnedShadowKjvCoordinates,
          duplicateCoordinates:
            report.canonical.duplicateCoordinates,
        },
        gaps: {
          count: report.gaps.count,
          classifications:
            report.gaps.classifications,
          byBook: report.gaps.byBook,
          currentTextDifferences:
            report.gaps.currentTextDifferences,
          references: gaps.map(gap => gap.reference),
        },
        extraOwnedCoordinates:
          report.extraOwnedCoordinates.length,
        gates: report.gates,
      },
      null,
      2,
    ),
  );

  if (
    !report.gates.candidateAndCurrentCoordinateSetsExact ||
    !report.gates.canonicalOwnedKjvCountIs31062 ||
    !report.gates.exactly40ReaderCoordinatesLackOwnedKjvBlock ||
    !report.gates.noOwnedCanonicalCoordinatesOutsideReader ||
    !report.gates.noCanonicalCoordinateDuplicates ||
    !report.gates.everyGapClassified
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
