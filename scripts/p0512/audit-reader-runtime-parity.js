"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(message) {
  throw new Error(`[P05.12Y reader runtime parity] ${message}`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  if (!args.output) {
    fail("Missing --output");
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
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

function safeBook(book) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function verseSortKey(label) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(
    String(label || ""),
  );

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function compareVerseLabels(left, right) {
  const a = verseSortKey(left);
  const b = verseSortKey(right);

  return (
    a.number - b.number ||
    a.suffix.localeCompare(b.suffix)
  );
}

function normalizeRuntimeVerse(verse) {
  const book = String(
    verse?.book ?? verse?.display?.book ?? "",
  );
  const chapter = Number(
    verse?.chapter ?? verse?.display?.chapter ?? 0,
  );
  const verseLabel = String(
    verse?.verseLabel ??
      verse?.display?.verseLabel ??
      verse?.verse ??
      "",
  );
  const numericVerse = Number(
    verse?.verse ??
      verse?.display?.numericVerse ??
      verseSortKey(verseLabel).number,
  );

  return {
    ...verse,
    book,
    chapter,
    verse: Number.isFinite(numericVerse)
      ? numericVerse
      : 0,
    verseLabel,
  };
}

function unwrapTranslationDocument(document) {
  if (Array.isArray(document)) {
    return {
      verses: document,
      superscriptions: [],
      structured: false,
    };
  }

  if (
    document &&
    typeof document === "object" &&
    Array.isArray(document.verses)
  ) {
    return {
      verses: document.verses,
      superscriptions: Array.isArray(document.superscriptions)
        ? document.superscriptions
        : [],
      structured: true,
    };
  }

  fail(
    "Translation document must be an array or structured reader object.",
  );
}

function buildExpected(document) {
  const {
    verses,
    superscriptions,
    structured,
  } = unwrapTranslationDocument(document);

  const byBookChapter = new Map();
  const titlesByBookChapter = new Map();

  for (const rawVerse of verses) {
    const verse = normalizeRuntimeVerse(rawVerse);

    if (
      !verse.book ||
      !verse.chapter ||
      !verse.verseLabel
    ) {
      continue;
    }

    const key = `${safeBook(verse.book)}\0${verse.chapter}`;

    if (!byBookChapter.has(key)) {
      byBookChapter.set(key, []);
    }

    byBookChapter.get(key).push(verse);
  }

  for (const title of superscriptions) {
    const book = String(title?.source?.book || "");
    const chapter = Number(title?.source?.chapter || 0);

    if (!book || !chapter) {
      continue;
    }

    const key = `${safeBook(book)}\0${chapter}`;

    if (!titlesByBookChapter.has(key)) {
      titlesByBookChapter.set(key, []);
    }

    titlesByBookChapter.get(key).push(title);
  }

  const keys = new Set([
    ...byBookChapter.keys(),
    ...titlesByBookChapter.keys(),
  ]);

  const expected = new Map();

  for (const key of [...keys].sort()) {
    const [bookKey, chapterKey] = key.split("\0");
    const chapterVerses = [
      ...(byBookChapter.get(key) || []),
    ];
    const chapterTitles = [
      ...(titlesByBookChapter.get(key) || []),
    ];

    chapterVerses.sort((left, right) =>
      compareVerseLabels(
        left.verseLabel,
        right.verseLabel,
      ),
    );

    expected.set(
      `${bookKey}/${chapterKey}.json`,
      structured || chapterTitles.length
        ? {
            verses: chapterVerses,
            superscriptions: chapterTitles,
          }
        : chapterVerses,
    );
  }

  return {
    expected,
    verses: verses.length,
    superscriptions: superscriptions.length,
    structured,
  };
}

function walkJson(root) {
  const result = [];

  if (!fs.existsSync(root)) {
    return result;
  }

  for (const entry of fs.readdirSync(root, {
    withFileTypes: true,
  })) {
    const full = path.join(root, entry.name);

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

function chapterVerseCount(payload) {
  return Array.isArray(payload)
    ? payload.length
    : Array.isArray(payload?.verses)
      ? payload.verses.length
      : 0;
}

function chapterTitleCount(payload) {
  return Array.isArray(payload?.superscriptions)
    ? payload.superscriptions.length
    : 0;
}

function auditTranslation({
  translation,
  sourceFile,
  runtimeRoot,
}) {
  if (!fs.existsSync(sourceFile)) {
    fail(`Missing source translation: ${sourceFile}`);
  }

  if (!fs.existsSync(runtimeRoot)) {
    fail(`Missing runtime directory: ${runtimeRoot}`);
  }

  const sourceDocument = readJson(sourceFile);
  const expectedState = buildExpected(sourceDocument);
  const actualFiles = walkJson(runtimeRoot);
  const actualRelative = new Set(
    actualFiles.map(file =>
      path
        .relative(runtimeRoot, file)
        .replace(/\\/g, "/"),
    ),
  );

  const missingRuntimeFiles = [];
  const extraRuntimeFiles = [];
  const chapterMismatches = [];
  let actualVerses = 0;
  let actualSuperscriptions = 0;

  for (const [relative, expectedPayload] of
    expectedState.expected) {
    const actualFile = path.join(
      runtimeRoot,
      relative.replace(/\//g, path.sep),
    );

    if (!fs.existsSync(actualFile)) {
      missingRuntimeFiles.push(relative);
      continue;
    }

    const actualPayload = readJson(actualFile);
    actualVerses += chapterVerseCount(actualPayload);
    actualSuperscriptions +=
      chapterTitleCount(actualPayload);

    const expectedStable =
      stableStringify(expectedPayload);
    const actualStable =
      stableStringify(actualPayload);

    if (expectedStable !== actualStable) {
      chapterMismatches.push({
        file: relative,
        expectedVerses:
          chapterVerseCount(expectedPayload),
        actualVerses:
          chapterVerseCount(actualPayload),
        expectedSuperscriptions:
          chapterTitleCount(expectedPayload),
        actualSuperscriptions:
          chapterTitleCount(actualPayload),
        expectedSha256: crypto
          .createHash("sha256")
          .update(expectedStable)
          .digest("hex"),
        actualSha256: crypto
          .createHash("sha256")
          .update(actualStable)
          .digest("hex"),
      });
    }
  }

  for (const relative of actualRelative) {
    if (!expectedState.expected.has(relative)) {
      extraRuntimeFiles.push(relative);
    }
  }

  const expectedBooks = new Set(
    [...expectedState.expected.keys()].map(relative =>
      relative.split("/")[0],
    ),
  ).size;

  const actualBooks = new Set(
    [...actualRelative].map(relative =>
      relative.split("/")[0],
    ),
  ).size;

  const report = {
    translation,
    sourceFile: path
      .relative(process.cwd(), sourceFile)
      .replace(/\\/g, "/"),
    sourceSha256: sha256File(sourceFile),
    runtimeRoot: path
      .relative(process.cwd(), runtimeRoot)
      .replace(/\\/g, "/"),
    structured: expectedState.structured,
    expected: {
      books: expectedBooks,
      chapters: expectedState.expected.size,
      verses: expectedState.verses,
      superscriptions:
        expectedState.superscriptions,
    },
    actual: {
      books: actualBooks,
      chapters: actualRelative.size,
      verses: actualVerses,
      superscriptions: actualSuperscriptions,
    },
    missingRuntimeFiles,
    extraRuntimeFiles,
    chapterMismatches,
  };

  report.passed =
    missingRuntimeFiles.length === 0 &&
    extraRuntimeFiles.length === 0 &&
    chapterMismatches.length === 0 &&
    report.expected.books === report.actual.books &&
    report.expected.chapters ===
      report.actual.chapters &&
    report.expected.verses === report.actual.verses &&
    report.expected.superscriptions ===
      report.actual.superscriptions;

  return report;
}

function auditReaderCachePolicy() {
  const readerFile =
    "app/read/[book]/[chapter]/page.tsx";
  const canonicalStoreFile =
    "app/data/scripture/CanonicalVerseStore.ts";

  if (!fs.existsSync(readerFile)) {
    fail(`Missing reader page: ${readerFile}`);
  }

  if (!fs.existsSync(canonicalStoreFile)) {
    fail(
      `Missing canonical store: ${canonicalStoreFile}`,
    );
  }

  const reader = fs.readFileSync(readerFile, "utf8");
  const canonicalStore = fs.readFileSync(
    canonicalStoreFile,
    "utf8",
  );

  const checks = {
    readerIsForceDynamic: reader.includes(
      'export const dynamic = "force-dynamic"',
    ),
    readerUsesNoStore: reader.includes(
      'cache: "no-store"',
    ),
    readerDoesNotUseForceCache:
      !reader.includes('cache: "force-cache"'),
    canonicalStoreUsesNoStore:
      canonicalStore.includes('cache: "no-store"'),
    canonicalStoreDoesNotUseForceCache:
      !canonicalStore.includes(
        'cache: "force-cache"',
      ),
  };

  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.output, { recursive: true });

  const translations = [
    {
      translation: "web",
      sourceFile:
        "app/data/scripture/generatedWEB.json",
      runtimeRoot:
        "public/scripture/runtime/web",
    },
    {
      translation: "kjv",
      sourceFile:
        "app/data/scripture/generatedKJV.json",
      runtimeRoot:
        "public/scripture/runtime/kjv",
    },
    {
      translation: "brenton",
      sourceFile:
        "app/data/scripture/generatedBrenton.json",
      runtimeRoot:
        "public/scripture/runtime/brenton",
    },
  ];

  const translationReports = translations.map(
    auditTranslation,
  );
  const readerCachePolicy =
    auditReaderCachePolicy();

  const report = {
    milestone: "P05.12Y",
    generatedAtUtc: new Date().toISOString(),
    repository: {
      branch:
        process.env.P0512_BRANCH || null,
      commit:
        process.env.P0512_COMMIT || null,
    },
    translations: translationReports,
    readerCachePolicy,
    gates: {
      allTranslationRuntimeParityPassed:
        translationReports.every(
          translation => translation.passed,
        ),
      readerCachePolicyPassed:
        readerCachePolicy.passed,
      safeToLockWebAndBrenton: false,
      safeToProceedToKjvIntegrity: false,
    },
  };

  report.gates.safeToLockWebAndBrenton =
    report.gates
      .allTranslationRuntimeParityPassed &&
    report.gates.readerCachePolicyPassed;

  report.gates.safeToProceedToKjvIntegrity =
    report.gates.safeToLockWebAndBrenton;

  fs.writeFileSync(
    path.join(
      args.output,
      "reader-runtime-parity-summary.json",
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  for (const translation of translationReports) {
    fs.writeFileSync(
      path.join(
        args.output,
        `${translation.translation}-runtime-parity.json`,
      ),
      `${JSON.stringify(translation, null, 2)}\n`,
      "utf8",
    );
  }

  fs.writeFileSync(
    path.join(
      args.output,
      "reader-cache-policy.json",
    ),
    `${JSON.stringify(
      readerCachePolicy,
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        milestone: report.milestone,
        translations: translationReports.map(
          translation => ({
            translation:
              translation.translation,
            passed: translation.passed,
            expected:
              translation.expected,
            actual: translation.actual,
            missingRuntimeFiles:
              translation.missingRuntimeFiles.length,
            extraRuntimeFiles:
              translation.extraRuntimeFiles.length,
            chapterMismatches:
              translation.chapterMismatches.length,
          }),
        ),
        readerCachePolicy,
        gates: report.gates,
      },
      null,
      2,
    ),
  );

  if (
    !report.gates
      .safeToProceedToKjvIntegrity
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
