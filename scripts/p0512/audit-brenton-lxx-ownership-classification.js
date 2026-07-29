#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12M V2 Brenton ownership audit] ${message}`);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relative(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function sha256Text(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];

  const result = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        result.push(fullPath);
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv) {
  const args = {
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");

  return args;
}

function git(args) {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      .trim();
  } catch {
    return "";
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function writeCsv(filePath, rows, columns) {
  ensureDir(path.dirname(filePath));
  const lines = [columns.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }

  fs.writeFileSync(filePath, lines.join("\r\n") + "\r\n", "utf8");
}

function readNdjson(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(
          `Invalid NDJSON at ${relative(ROOT, filePath)}:${index + 1}: ${error.message}`,
        );
      }
    });
}

function verifyReportChecksums(reportRoot) {
  const checksumPath = path.join(reportRoot, "checksums.sha256");

  if (!fs.existsSync(checksumPath)) {
    fail(`Missing checksums.sha256 in ${relative(ROOT, reportRoot)}`);
  }

  const failures = [];
  let checked = 0;

  for (const line of readText(checksumPath).split(/\r?\n/)) {
    if (!line.trim()) continue;

    const match = /^([a-f0-9]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line, reason: "invalid-checksum-line" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const normalized = normalizeSlashes(match[2]);
    const exactPath = path.join(
      reportRoot,
      normalized.replace(/\//g, path.sep),
    );

    const filePath = fs.existsSync(exactPath)
      ? exactPath
      : walk(reportRoot).find(
          (candidate) => relative(reportRoot, candidate) === normalized,
        );

    if (!filePath) {
      failures.push({ path: normalized, reason: "missing" });
      continue;
    }

    checked += 1;
    const actual = sha256File(filePath);

    if (actual !== expected) {
      failures.push({ path: normalized, expected, actual });
    }
  }

  return {
    checked,
    failures,
    passed: failures.length === 0,
  };
}

function findLatestP0512L() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) =>
      path.basename(filePath) === "brenton-dual-coordinate-summary.json",
  ).filter((filePath) => {
    try {
      return readJson(filePath)?.milestone === "P05.12L";
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail("No completed P05.12L summary was found.");
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const summaryPath = candidates[0];

  return {
    summaryPath,
    reportRoot: path.dirname(summaryPath),
    summary: readJson(summaryPath),
  };
}

function absoluteRepoPath(value) {
  return path.isAbsolute(value)
    ? value
    : path.join(ROOT, normalizeSlashes(value).replace(/\//g, path.sep));
}

function verifyStagedFile(record, expectedName) {
  if (!record?.path || !record?.sha256 || !Number.isInteger(record?.records)) {
    fail(`P05.12L staged artifact is incomplete: ${expectedName}`);
  }

  const filePath = absoluteRepoPath(record.path);

  if (!fs.existsSync(filePath)) {
    fail(`Missing P05.12L staged artifact: ${record.path}`);
  }

  const actualSha256 = sha256File(filePath);

  if (actualSha256 !== record.sha256) {
    fail(
      `P05.12L staged artifact hash mismatch for ${expectedName}: expected ${record.sha256}, found ${actualSha256}`,
    );
  }

  return {
    filePath,
    records: record.records,
    sha256: actualSha256,
  };
}

function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function loadCanonicalLxx(directory) {
  if (!fs.existsSync(directory)) {
    fail(`Missing LXX canonical directory: ${relative(ROOT, directory)}`);
  }

  const keys = new Set();
  const brentonTextIndex = new Map();
  const files = walk(directory, (filePath) => /\.json$/i.test(filePath));

  for (const filePath of files) {
    const document = readJson(filePath);

    if (!document || Array.isArray(document) || typeof document !== "object") {
      fail(`Unexpected canonical LXX file shape: ${relative(ROOT, filePath)}`);
    }

    for (const [verseKey, verse] of Object.entries(document)) {
      keys.add(verseKey);

      const text = verse?.translations?.brenton?.text;
      const signature = normalizeEnglish(text);

      if (!signature) continue;
      if (!brentonTextIndex.has(signature)) brentonTextIndex.set(signature, []);

      brentonTextIndex.get(signature).push({
        verseKey,
        text,
        originalBook:
          verse?.translations?.brenton?.originalBook || null,
      });
    }
  }

  return {
    keys,
    brentonTextIndex,
    files,
  };
}

const TRANSLATION_ONLY_BOOK_IDS = new Set(["1ES", "JDT", "TOB", "MAN"]);

const RAW_BOOK_TO_CANONICAL = {
  "Daniel Greek": "Daniel",
  "Esther Greek": "Esther",
  "Letter of Jeremiah": "Epistle of Jeremiah",
  "Song of Solomon": "Song of Songs",
};

const OSIS_TO_CANONICAL = {
  Gen: "Genesis",
  Exo: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deu: "Deuteronomy",
  Jos: "Joshua",
  Jdg: "Judges",
  Rut: "Ruth",
  "1Sa": "1 Samuel",
  "2Sa": "2 Samuel",
  "1Ki": "1 Kings",
  "2Ki": "2 Kings",
  "1Ch": "1 Chronicles",
  "2Ch": "2 Chronicles",
  Ezr: "Ezra",
  Neh: "Nehemiah",
  Est: "Esther",
  Job: "Job",
  Psa: "Psalms",
  Pro: "Proverbs",
  Ecc: "Ecclesiastes",
  Sng: "Song of Songs",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezk: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Jol: "Joel",
  Amo: "Amos",
  Oba: "Obadiah",
  Jon: "Jonah",
  Mic: "Micah",
  Nam: "Nahum",
  Hab: "Habakkuk",
  Zep: "Zephaniah",
  Hag: "Haggai",
  Zec: "Zechariah",
  Mal: "Malachi",
  Wis: "Wisdom",
  Sir: "Sirach",
  Bar: "Baruch",
  Lje: "Epistle of Jeremiah",
  Sus: "Susanna",
  Bel: "Bel and the Dragon",
  "1Ma": "1 Maccabees",
  "2Ma": "2 Maccabees",
  "3Ma": "3 Maccabees",
  "4Ma": "4 Maccabees",
};

function parseNavigationTarget(value) {
  const match = /^([1-4A-Za-z]{3})\.(\d+):(\d+)$/i.exec(String(value || ""));

  if (!match) return null;

  const rawBookId =
    match[1][0].match(/[1-4]/)
      ? `${match[1][0]}${match[1].slice(1, 3).toLowerCase()}`
      : `${match[1][0].toUpperCase()}${match[1].slice(1, 3).toLowerCase()}`;

  const book = OSIS_TO_CANONICAL[rawBookId];
  if (!book) return null;

  return {
    book,
    chapter: Number(match[2]),
    verse: Number(match[3]),
    canonicalKey: `${book}.${Number(match[2])}.${Number(match[3])}`,
  };
}

function directCoordinate(segment) {
  return String(segment?.lxxOwnership?.coordinate || "");
}

function readerCanonicalKey(segment) {
  const compatibility = segment?.readerCompatibility;

  if (!compatibility) return null;

  const rawBook = String(compatibility.book || "");
  const book = RAW_BOOK_TO_CANONICAL[rawBook] || rawBook;

  if (!book || !Number.isFinite(Number(compatibility.chapter))) return null;
  if (!Number.isFinite(Number(compatibility.verse))) return null;

  return `${book}.${Number(compatibility.chapter)}.${Number(
    compatibility.verse,
  )}`;
}

function continuousEzraNehemiahCandidate(segment) {
  const sourceBookId = String(segment?.source?.bookId || "").toUpperCase();
  const sourceBook = String(segment?.source?.book || "");
  const chapter = Number(segment?.source?.chapter);
  const verse = Number(segment?.source?.numericVerse);
  const readerBook = String(segment?.readerCompatibility?.book || "");
  const readerChapter = Number(segment?.readerCompatibility?.chapter);

  // The locked Brenton source stores Ezra and Nehemiah as one continuous
  // EZR book. Chapters 1-10 correspond to Ezra; chapters 11-23 correspond
  // to Nehemiah 1-13. The current reader preserves the raw book as "Ezra".
  const isContinuousBrentonEzra =
    sourceBookId === "EZR" &&
    sourceBook === "Ezra" &&
    chapter >= 11 &&
    chapter <= 23 &&
    Number.isInteger(verse) &&
    (readerBook === "Ezra" || readerBook === "2 Esdras") &&
    readerChapter === chapter;

  if (!isContinuousBrentonEzra) return null;

  return {
    book: "Nehemiah",
    chapter: chapter - 10,
    verse,
    canonicalKey: `Nehemiah.${chapter - 10}.${verse}`,
    rule:
      "Brenton-continuous-EZR-chapters-11-23-to-Nehemiah-1-13",
    sourceIdentity: {
      sourceBookId,
      sourceBook,
      sourceChapter: chapter,
      readerBook,
      readerChapter,
    },
  };
}

function uniqueLegacyTextCandidate(segment, canonical) {
  const signature = normalizeEnglish(segment?.visibleText);
  if (!signature) return null;

  const matches = canonical.brentonTextIndex.get(signature) || [];

  if (matches.length !== 1) {
    return {
      unique: false,
      matches,
    };
  }

  return {
    unique: true,
    matches,
    canonicalKey: matches[0].verseKey,
  };
}

function candidateAgreement(candidates) {
  const values = Object.entries(candidates)
    .filter(([, value]) => value)
    .map(([source, value]) => ({
      source,
      canonicalKey:
        typeof value === "string" ? value : value.canonicalKey,
    }))
    .filter((row) => row.canonicalKey);

  const distinct = Array.from(
    new Set(values.map((row) => row.canonicalKey)),
  );

  return {
    evidence: values,
    distinctCandidates: distinct,
    consensus: distinct.length === 1 ? distinct[0] : null,
  };
}

function groupGapRuns(rows) {
  const sorted = [...rows].sort(
    (left, right) =>
      left.sourceBookId.localeCompare(right.sourceBookId) ||
      Number(left.sourceChapter) - Number(right.sourceChapter) ||
      Number(left.sourceNumericVerse) - Number(right.sourceNumericVerse) ||
      String(left.sourceVerseLabel).localeCompare(
        String(right.sourceVerseLabel),
        "en",
        { numeric: true },
      ),
  );

  const runs = [];
  let current = null;

  for (const row of sorted) {
    const consecutive =
      current &&
      current.sourceBookId === row.sourceBookId &&
      current.sourceChapter === Number(row.sourceChapter) &&
      Number(row.sourceNumericVerse) === current.lastNumericVerse + 1 &&
      current.classification === row.classification;

    if (!consecutive) {
      if (current) runs.push(current);

      current = {
        sourceBookId: row.sourceBookId,
        sourceBook: row.sourceBook,
        sourceChapter: Number(row.sourceChapter),
        startReference: row.sourceReference,
        endReference: row.sourceReference,
        startVerseLabel: row.sourceVerseLabel,
        endVerseLabel: row.sourceVerseLabel,
        classification: row.classification,
        rows: 1,
        lastNumericVerse: Number(row.sourceNumericVerse),
      };
    } else {
      current.endReference = row.sourceReference;
      current.endVerseLabel = row.sourceVerseLabel;
      current.rows += 1;
      current.lastNumericVerse = Number(row.sourceNumericVerse);
    }
  }

  if (current) runs.push(current);

  return runs.map(({ lastNumericVerse, ...run }) => run);
}

function scanReaderDependencies() {
  const roots = ["app", "components", "lib", "scripts"]
    .map((name) => path.join(ROOT, name))
    .filter((directory) => fs.existsSync(directory));

  const patterns = [
    {
      id: "generated-brenton-reference",
      regex: /generatedBrenton|brenton-source|Brenton/gi,
    },
    {
      id: "numeric-verse-type",
      regex: /\bverse\s*:\s*number\b/g,
    },
    {
      id: "numeric-chapter-type",
      regex: /\bchapter\s*:\s*number\b/g,
    },
    {
      id: "verse-number-render",
      regex: /\b(?:verse|v)\.verse\b|\.verse\}\b/g,
    },
    {
      id: "verse-numeric-sort",
      regex: /\.verse\s*-\s*.*\.verse|Number\([^)]*\.verse/gi,
    },
    {
      id: "chapter-verse-key",
      regex: /\$\{[^}]*chapter[^}]*\}.*\$\{[^}]*verse[^}]*\}/gi,
    },
  ];

  const rows = [];

  for (const root of roots) {
    for (const filePath of walk(
      root,
      (candidate) =>
        /\.(?:js|cjs|mjs|ts|tsx|json)$/i.test(candidate) &&
        !normalizeSlashes(candidate).includes("/node_modules/") &&
        !normalizeSlashes(candidate).includes("/.next/"),
    )) {
      const stat = fs.statSync(filePath);
      if (stat.size > 5 * 1024 * 1024) continue;

      let text;
      try {
        text = readText(filePath);
      } catch {
        continue;
      }

      const lines = text.split(/\r?\n/);

      for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;

        for (let index = 0; index < lines.length; index += 1) {
          pattern.regex.lastIndex = 0;

          if (!pattern.regex.test(lines[index])) continue;

          rows.push({
            file: relative(ROOT, filePath),
            line: index + 1,
            pattern: pattern.id,
            excerpt: lines[index].trim().slice(0, 500),
          });
        }
      }
    }
  }

  return rows;
}

function countBy(rows, field) {
  const counts = {};

  for (const row of rows) {
    const key = String(row[field] ?? "");
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function writeChecksums(outputRoot) {
  const checksumPath = path.join(outputRoot, "checksums.sha256");
  const files = walk(
    outputRoot,
    (filePath) => filePath !== checksumPath && fs.statSync(filePath).isFile(),
  );

  const lines = files.map(
    (filePath) => `${sha256File(filePath)}  ${relative(outputRoot, filePath)}`,
  );

  fs.writeFileSync(checksumPath, lines.join("\n") + "\n", "ascii");
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  const p0512l = findLatestP0512L();
  const reportChecksums = verifyReportChecksums(p0512l.reportRoot);

  if (!reportChecksums.passed) {
    fail(
      `P05.12L checksum failure: ${JSON.stringify(
        reportChecksums.failures,
        null,
        2,
      )}`,
    );
  }

  const staged = p0512l.summary?.stagedArtifacts?.files;
  const sourceSegmentsFile = verifyStagedFile(
    staged?.sourceSegments,
    "sourceSegments",
  );
  const lxxOwnershipFile = verifyStagedFile(
    staged?.lxxOwnership,
    "lxxOwnership",
  );
  const navigationFile = verifyStagedFile(
    staged?.standardNavigation,
    "standardNavigation",
  );
  const compatibilityFile = verifyStagedFile(
    staged?.readerCompatibility,
    "readerCompatibility",
  );

  const sourceSegments = readNdjson(sourceSegmentsFile.filePath);
  const ownershipRows = readNdjson(lxxOwnershipFile.filePath);
  const navigationRows = readNdjson(navigationFile.filePath);
  const compatibilityRows = readNdjson(compatibilityFile.filePath);

  const expectedSegments = Number(p0512l.summary?.corpus?.sourceSegments);

  for (const [label, records] of [
    ["sourceSegments", sourceSegments],
    ["lxxOwnership", ownershipRows],
    ["standardNavigation", navigationRows],
    ["readerCompatibility", compatibilityRows],
  ]) {
    if (records.length !== expectedSegments) {
      fail(
        `${label} record count mismatch: expected ${expectedSegments}, found ${records.length}`,
      );
    }
  }

  const sourceById = new Map(sourceSegments.map((row) => [row.id, row]));
  const ownershipById = new Map(ownershipRows.map((row) => [row.sourceId, row]));
  const navigationById = new Map(
    navigationRows.map((row) => [row.sourceId, row]),
  );
  const compatibilityById = new Map(
    compatibilityRows.map((row) => [row.sourceId, row]),
  );

  for (const [label, map] of [
    ["source", sourceById],
    ["ownership", ownershipById],
    ["navigation", navigationById],
    ["compatibility", compatibilityById],
  ]) {
    if (map.size !== expectedSegments) {
      fail(`Duplicate ${label} IDs detected.`);
    }
  }

  const lxxDirectory = path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "lxx",
  );
  const canonical = loadCanonicalLxx(lxxDirectory);

  const currentBrentonPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedBrenton.json",
  );
  const currentHashBefore = sha256File(currentBrentonPath);
  const approvedCurrentHash =
    p0512l.summary?.sources?.currentReader?.sha256Before;

  if (currentHashBefore !== approvedCurrentHash) {
    fail(
      `generatedBrenton.json changed after P05.12L. Expected ${approvedCurrentHash}, found ${currentHashBefore}`,
    );
  }

  const continuousEzraPreflightRows = sourceSegments.filter((segment) =>
    Boolean(continuousEzraNehemiahCandidate(segment)),
  );

  if (continuousEzraPreflightRows.length !== 389) {
    fail(
      `Brenton continuous-EZR structural preflight failed: expected 389 chapters 11-23 rows, found ${continuousEzraPreflightRows.length}`,
    );
  }

  console.log(
    `[P05.12M V2] Continuous EZR chapters 11-23 rows verified: ${continuousEzraPreflightRows.length}`,
  );
  console.log("[P05.12M V2] Classifying all Brenton source segments...");

  const classifications = [];

  for (const segment of sourceSegments) {
    const ownership = ownershipById.get(segment.id);
    const navigation = navigationById.get(segment.id);
    const compatibility = compatibilityById.get(segment.id);

    if (!ownership || !navigation || !compatibility) {
      fail(`Incomplete P05.12L evidence for ${segment.id}`);
    }

    const directKey = directCoordinate(segment);
    const directExists = canonical.keys.has(directKey);
    const translationOnly =
      TRANSLATION_ONLY_BOOK_IDS.has(segment.source.bookId);
    const continuousEzra = continuousEzraNehemiahCandidate(segment);
    const readerKey = readerCanonicalKey(segment);
    const readerKeyExists = readerKey
      ? canonical.keys.has(readerKey)
      : false;

    const unambiguousNavigationTarget =
      navigation.navigationStatus === "tvtms-unambiguous" &&
      Array.isArray(navigation.navigationTargets) &&
      navigation.navigationTargets.length === 1
        ? parseNavigationTarget(navigation.navigationTargets[0])
        : null;

    const navigationKeyExists =
      unambiguousNavigationTarget?.canonicalKey
        ? canonical.keys.has(unambiguousNavigationTarget.canonicalKey)
        : false;

    const legacyText = uniqueLegacyTextCandidate(segment, canonical);
    const legacyTextKey =
      legacyText?.unique === true ? legacyText.canonicalKey : null;

    let classification;
    let authoritativeOwnershipKey = null;
    let authority = null;
    let eligibility = null;

    if (directExists) {
      classification =
        ownership.ownershipStatus ===
        "many-brenton-segments-to-one-lxx-verse"
          ? "direct-shared-lxx-coordinate"
          : "direct-exact-lxx-coordinate";
      authoritativeOwnershipKey = directKey;
      authority = "locked-rhlfs-lxx-source-coordinate";
      eligibility = "eligible-for-source-token-ownership";
    } else if (translationOnly) {
      classification = "translation-only-no-locked-greek-source";
      authority = "locked-corpus-ownership-policy";
      eligibility = "not-tappable-until-greek-source-is-added";
    } else if (continuousEzra) {
      classification = canonical.keys.has(continuousEzra.canonicalKey)
        ? "continuous-ezr-nehemiah-structural-candidate"
        : "continuous-ezr-nehemiah-target-missing";
      authoritativeOwnershipKey = canonical.keys.has(continuousEzra.canonicalKey)
        ? continuousEzra.canonicalKey
        : null;
      authority =
        "book-split-candidate-requires-text-and-run-validation";
      eligibility = canonical.keys.has(continuousEzra.canonicalKey)
        ? "candidate-not-yet-authorized"
        : "unresolved";
    } else {
      classification = "remaining-versification-coordinate-gap";
      authority = "none";
      eligibility = "unresolved";
    }

    const candidateEvidence = candidateAgreement({
      readerCoordinate:
        readerKeyExists && readerKey !== directKey ? readerKey : null,
      tvtmsNavigation:
        navigationKeyExists &&
        unambiguousNavigationTarget?.canonicalKey !== directKey
          ? unambiguousNavigationTarget.canonicalKey
          : null,
      legacyCanonicalText:
        legacyTextKey && legacyTextKey !== directKey
          ? legacyTextKey
          : null,
      continuousEzra:
        continuousEzra && canonical.keys.has(continuousEzra.canonicalKey)
          ? continuousEzra.canonicalKey
          : null,
    });

    classifications.push({
      sourceId: segment.id,
      segmentType: segment.segmentType,
      sourceBookId: segment.source.bookId,
      sourceBook: segment.source.book,
      sourceChapter: segment.source.chapter,
      sourceVerseLabel: segment.source.verseLabel,
      sourceNumericVerse: segment.source.numericVerse,
      sourceReference: segment.source.reference,
      directLxxCoordinate: directKey,
      directLxxCoordinateExists: directExists,
      p0512lOwnershipStatus: ownership.ownershipStatus,
      classification,
      authority,
      eligibility,
      authoritativeOwnershipKey,
      readerCompatibilityReference: compatibility.readerReference,
      readerCompatibilityCanonicalKey: readerKey,
      readerCompatibilityCanonicalKeyExists: readerKeyExists,
      tvtmsNavigationStatus: navigation.navigationStatus,
      tvtmsNavigationTargets: navigation.navigationTargets,
      tvtmsCanonicalCandidate:
        unambiguousNavigationTarget?.canonicalKey || null,
      tvtmsCanonicalCandidateExists: navigationKeyExists,
      legacyCanonicalTextMatches:
        legacyText?.matches?.length || 0,
      legacyCanonicalTextUniqueKey: legacyTextKey,
      candidateEvidence: candidateEvidence.evidence,
      candidateDistinctKeys: candidateEvidence.distinctCandidates,
      candidateConsensusKey: candidateEvidence.consensus,
      visibleText: segment.visibleText,
    });
  }

  if (classifications.length !== expectedSegments) {
    fail("Not all source segments were classified.");
  }

  const classificationCounts = countBy(classifications, "classification");
  const eligibilityCounts = countBy(classifications, "eligibility");

  const directRows = classifications.filter((row) =>
    row.classification.startsWith("direct-"),
  );
  const translationOnlyRows = classifications.filter(
    (row) =>
      row.classification ===
      "translation-only-no-locked-greek-source",
  );
  const continuousEzraRows = classifications.filter((row) =>
    row.classification.startsWith("continuous-ezr-"),
  );
  const remainingGapRows = classifications.filter(
    (row) =>
      row.classification ===
      "remaining-versification-coordinate-gap",
  );

  const accountingTotal =
    directRows.length +
    translationOnlyRows.length +
    continuousEzraRows.length +
    remainingGapRows.length;

  if (accountingTotal !== expectedSegments) {
    fail(
      `Ownership accounting does not balance: expected ${expectedSegments}, found ${accountingTotal}`,
    );
  }

  if (
    translationOnlyRows.length !== 1047 ||
    continuousEzraRows.length !== 389 ||
    remainingGapRows.length !== 285
  ) {
    fail(
      `Locked ownership classification drift: ${JSON.stringify({
        translationOnly: translationOnlyRows.length,
        continuousEzra: continuousEzraRows.length,
        remainingGaps: remainingGapRows.length,
      })}`,
    );
  }

  const continuousEzraMissingTargets = continuousEzraRows.filter(
    (row) => !row.authoritativeOwnershipKey,
  );
  const remainingGapConsensus = remainingGapRows.filter(
    (row) => row.candidateConsensusKey,
  );
  const remainingGapConflicts = remainingGapRows.filter(
    (row) => row.candidateDistinctKeys.length > 1,
  );
  const remainingGapNoCandidate = remainingGapRows.filter(
    (row) => row.candidateDistinctKeys.length === 0,
  );

  const gapRuns = groupGapRuns(remainingGapRows);
  const dependencyRows = scanReaderDependencies();

  const currentHashAfter = sha256File(currentBrentonPath);
  if (currentHashAfter !== currentHashBefore) {
    fail("Production generatedBrenton.json changed during P05.12M.");
  }

  const summary = {
    milestone: "P05.12M",
    generatedAtUtc: new Date().toISOString(),
    status:
      "brenton-lxx-ownership-classification-v2-and-reader-dependency-audit-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      p0512l: {
        report: relative(ROOT, p0512l.reportRoot),
        summarySha256: sha256File(p0512l.summaryPath),
        reportChecksumsVerified: reportChecksums.checked,
        stagedFingerprint:
          p0512l.summary?.stagedArtifacts?.fingerprint || null,
      },
      lxxCanonical: {
        path: relative(ROOT, lxxDirectory),
        files: canonical.files.length,
        verseKeys: canonical.keys.size,
      },
      currentBrenton: {
        path: relative(ROOT, currentBrentonPath),
        sha256Before: currentHashBefore,
        sha256After: currentHashAfter,
      },
    },
    structuralPreflight: {
      continuousEzraChapters11To23Rows:
        continuousEzraPreflightRows.length,
      expectedRows: 389,
      readerBookIdentities: Array.from(
        new Set(
          continuousEzraPreflightRows.map(
            (segment) => segment.readerCompatibility?.book,
          ),
        ),
      ).sort(),
    },
    accounting: {
      totalBrentonSourceSegments: expectedSegments,
      directLxxCoordinateRows: directRows.length,
      translationOnlyNoLockedGreekSourceRows:
        translationOnlyRows.length,
      continuousEzraNehemiahStructuralCandidateRows:
        continuousEzraRows.length,
      remainingVersificationCoordinateGapRows:
        remainingGapRows.length,
      balancedTotal: accountingTotal,
      p0512lReportedUnresolvedDirectCoordinates:
        p0512l.summary?.lxxOwnership?.unresolvedCoordinateRows,
      p0512lGateReasonStaleCountDetected:
        String(p0512l.summary?.gates?.reason || "").includes(
          "180 source segments",
        ),
    },
    classificationCounts,
    eligibilityCounts,
    continuousEzra: {
      candidates: continuousEzraRows.length,
      targetCoordinatesPresent:
        continuousEzraRows.length - continuousEzraMissingTargets.length,
      missingTargetCoordinates: continuousEzraMissingTargets.length,
    },
    remainingGaps: {
      rows: remainingGapRows.length,
      books: Object.keys(
        countBy(remainingGapRows, "sourceBookId"),
      ).length,
      contiguousRuns: gapRuns.length,
      candidateConsensusRows: remainingGapConsensus.length,
      conflictingCandidateRows: remainingGapConflicts.length,
      noCandidateRows: remainingGapNoCandidate.length,
    },
    readerSchemaDependencies: {
      matches: dependencyRows.length,
      files: new Set(dependencyRows.map((row) => row.file)).size,
      patternCounts: countBy(dependencyRows, "pattern"),
    },
    gates: {
      p0512lChecksumsValid: true,
      stagedArtifactsHashVerified: true,
      allSourceSegmentsClassifiedExactlyOnce: true,
      ownershipAccountingBalanced: true,
      translationOnlyBooksSeparatedFromOwnershipFailures: true,
      continuousEzraContinuationTargetsInventoried: true,
      remainingCoordinateGapsIsolated: true,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToBuildBrentonReaderAdapter: false,
      safeToRebuildBrentonAlignments: false,
      reason:
        "The 1,721 missing direct coordinates are now correctly separated into 1,047 translation-only verses without a locked Greek source, 389 continuous EZR chapters 11-23 to Nehemiah structural candidates, and 285 genuine versification gaps. The structural candidates and remaining gaps must be validated before alignment ownership can be rebuilt; the reader also has numeric-only schema dependencies.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-lxx-ownership-classification-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-all-ownership-classifications.csv"),
    classifications,
    [
      "sourceId",
      "segmentType",
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceNumericVerse",
      "sourceReference",
      "directLxxCoordinate",
      "directLxxCoordinateExists",
      "p0512lOwnershipStatus",
      "classification",
      "authority",
      "eligibility",
      "authoritativeOwnershipKey",
      "readerCompatibilityReference",
      "readerCompatibilityCanonicalKey",
      "readerCompatibilityCanonicalKeyExists",
      "tvtmsNavigationStatus",
      "tvtmsNavigationTargets",
      "tvtmsCanonicalCandidate",
      "tvtmsCanonicalCandidateExists",
      "legacyCanonicalTextMatches",
      "legacyCanonicalTextUniqueKey",
      "candidateEvidence",
      "candidateDistinctKeys",
      "candidateConsensusKey",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-translation-only-no-greek-source.csv"),
    translationOnlyRows,
    [
      "sourceId",
      "sourceBookId",
      "sourceBook",
      "sourceReference",
      "classification",
      "eligibility",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-continuous-ezr-nehemiah-candidates.csv"),
    continuousEzraRows,
    [
      "sourceId",
      "sourceReference",
      "sourceChapter",
      "sourceVerseLabel",
      "classification",
      "authoritativeOwnershipKey",
      "readerCompatibilityReference",
      "candidateEvidence",
      "candidateDistinctKeys",
      "candidateConsensusKey",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-remaining-coordinate-gaps.csv"),
    remainingGapRows,
    [
      "sourceId",
      "segmentType",
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceReference",
      "readerCompatibilityReference",
      "readerCompatibilityCanonicalKey",
      "readerCompatibilityCanonicalKeyExists",
      "tvtmsNavigationStatus",
      "tvtmsNavigationTargets",
      "tvtmsCanonicalCandidate",
      "tvtmsCanonicalCandidateExists",
      "legacyCanonicalTextMatches",
      "legacyCanonicalTextUniqueKey",
      "candidateEvidence",
      "candidateDistinctKeys",
      "candidateConsensusKey",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-remaining-gap-runs.csv"),
    gapRuns,
    [
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "startReference",
      "endReference",
      "startVerseLabel",
      "endVerseLabel",
      "classification",
      "rows",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-reader-schema-dependencies.csv"),
    dependencyRows,
    ["file", "line", "pattern", "excerpt"],
  );

  const readme = [
    "# EMETSEES P05.12M V2 Brenton LXX Ownership Classification Audit",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "P05.12L successfully built a source-faithful corpus, but its final gate text retained an obsolete count. P05.12M corrects the ownership accounting without changing production.",
    "",
    "## Correct ownership accounting",
    "",
    `- Total Brenton source segments: ${summary.accounting.totalBrentonSourceSegments}`,
    `- Direct exact/shared LXX coordinates: ${summary.accounting.directLxxCoordinateRows}`,
    `- Translation-only verses with no locked Greek source: ${summary.accounting.translationOnlyNoLockedGreekSourceRows}`,
    `- Continuous Brenton EZR chapters 11-23 → Nehemiah structural candidates: ${summary.accounting.continuousEzraNehemiahStructuralCandidateRows}`,
    `- Genuine remaining coordinate gaps: ${summary.accounting.remainingVersificationCoordinateGapRows}`,
    "",
    "The 1,047 translation-only rows are not alignment failures. They belong to 1 Esdras, Judith, Tobit, and Prayer of Manasseh, which are intentionally absent from the locked 49-book Greek LXX corpus.",
    "",
    "## Remaining work",
    "",
    `- Continuous EZR target coordinates missing: ${summary.continuousEzra.missingTargetCoordinates}`,
    `- Remaining gap runs: ${summary.remainingGaps.contiguousRuns}`,
    `- Remaining-gap rows with candidate consensus: ${summary.remainingGaps.candidateConsensusRows}`,
    `- Remaining-gap rows with conflicting candidates: ${summary.remainingGaps.conflictingCandidateRows}`,
    `- Remaining-gap rows with no candidate: ${summary.remainingGaps.noCandidateRows}`,
    `- Numeric-reader dependency matches: ${summary.readerSchemaDependencies.matches}`,
    "",
    "## Safety",
    "",
    "- Production generatedBrenton.json was not modified.",
    "- Greek LXX canonical data was not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No reader adapter or alignment apply step is authorized.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12M V2] Brenton ownership classification audit complete.");
  console.log(`[P05.12M V2] Direct LXX coordinates: ${directRows.length}`);
  console.log(
    `[P05.12M V2] Translation-only without Greek source: ${translationOnlyRows.length}`,
  );
  console.log(
    `[P05.12M V2] Continuous EZR → Nehemiah candidates: ${continuousEzraRows.length}`,
  );
  console.log(
    `[P05.12M V2] Genuine remaining coordinate gaps: ${remainingGapRows.length}`,
  );
  console.log("[P05.12M V2] Production Brenton modified: NO");
  console.log("[P05.12M V2] Alignments modified: NO");
  console.log(`OUTPUT_DIR=${args.output}`);
}

try {
  main();
} catch (error) {
  const rendered = error?.stack || String(error);
  console.error(rendered);

  try {
    const outputIndex = process.argv.indexOf("--output");
    const output =
      outputIndex >= 0 && process.argv[outputIndex + 1]
        ? path.resolve(process.argv[outputIndex + 1])
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512m-fatal");

    ensureDir(output);
    fs.writeFileSync(
      path.join(output, "fatal-error.txt"),
      rendered + "\n",
      "utf8",
    );
  } catch {
    // Preserve the original error.
  }

  process.exit(1);
}
