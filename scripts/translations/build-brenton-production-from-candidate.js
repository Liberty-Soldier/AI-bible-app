"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12T V8 Brenton production builder] ${message}`);
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

  return result.sort((left, right) => left.localeCompare(right));
}

function verifyReportChecksums(reportRoot) {
  const checksumPath = path.join(reportRoot, "checksums.sha256");

  if (!fs.existsSync(checksumPath)) {
    fail(`Missing report checksums: ${relative(ROOT, checksumPath)}`);
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

function findLatestP0512P() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) =>
      path.basename(filePath) === "brenton-reader-candidate-summary.json",
  ).filter((filePath) => {
    try {
      const summary = readJson(filePath);

      return (
        summary?.milestone === "P05.12P" &&
        summary?.status ===
          "deduplicated-source-faithful-brenton-reader-candidate-v2-complete"
      );
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail("No completed P05.12P V2 candidate was found.");
  }

  candidates.sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  );

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

function verifyStagedFile(record, label) {
  if (!record?.path || !record?.sha256 || !Number.isInteger(record?.records)) {
    fail(`Incomplete staged artifact metadata for ${label}.`);
  }

  const filePath = absoluteRepoPath(record.path);

  if (!fs.existsSync(filePath)) {
    fail(`Missing staged artifact for ${label}: ${record.path}`);
  }

  const actual = sha256File(filePath);

  if (actual !== record.sha256) {
    fail(
      `${label} hash mismatch. Expected ${record.sha256}, found ${actual}`,
    );
  }

  return {
    filePath,
    records: record.records,
    sha256: actual,
  };
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

function parseArgs(argv) {
  const args = {
    output: "",
    integrityOutput: "",
    decisionOutput: "",
    noWrite: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (argument === "--integrity-output" && next) {
      args.integrityOutput = path.resolve(next);
      index += 1;
    } else if (argument === "--decision-output" && next) {
      args.decisionOutput = path.resolve(next);
      index += 1;
    } else if (argument === "--no-write") {
      args.noWrite = true;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (
    !args.noWrite &&
    (!args.output || !args.integrityOutput || !args.decisionOutput)
  ) {
    fail(
      "Missing --output, --integrity-output, or --decision-output.",
    );
  }

  return args;
}

const STANDARD_BOOK_NAMES = Object.freeze({
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
  Esg: "Esther",
  Job: "Job",
  Psa: "Psalms",
  Ps2: "Psalms",
  Pro: "Proverbs",
  Ecc: "Ecclesiastes",
  Sng: "Song of Solomon",
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
  Lje: "Letter of Jeremiah",
  Sus: "Susanna",
  Bel: "Bel and the Dragon",
  "1Ma": "1 Maccabees",
  "2Ma": "2 Maccabees",
  "3Ma": "3 Maccabees",
  "4Ma": "4 Maccabees",
  "1Es": "1 Esdras",
  Jdt: "Judith",
  Tob: "Tobit",
  Man: "Prayer of Manasseh",
  S3Y: "Prayer of Azariah",
});

function verseSortKey(label) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(label || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function compareDisplayCoordinates(left, right) {
  return (
    left.book.localeCompare(right.book) ||
    left.chapter - right.chapter ||
    verseSortKey(left.verseLabel).number -
      verseSortKey(right.verseLabel).number ||
    verseSortKey(left.verseLabel).suffix.localeCompare(
      verseSortKey(right.verseLabel).suffix,
    )
  );
}

function displayKey(coordinate) {
  return `${coordinate.book}\u0000${coordinate.chapter}\u0000${coordinate.verseLabel}`;
}

function parseStandardTarget(verse) {
  const navigation = verse?.standardNavigation;

  if (
    navigation?.status !== "tvtms-unambiguous" ||
    !Array.isArray(navigation.targets) ||
    navigation.targets.length !== 1
  ) {
    return null;
  }

  const match = /^([^.]+)\.(\d+):(\d+[A-Za-z]?)$/.exec(
    String(navigation.targets[0] || ""),
  );

  if (!match) return null;

  const book = STANDARD_BOOK_NAMES[match[1]];
  if (!book) return null;

  return {
    book,
    chapter: Number(match[2]),
    verseLabel: match[3],
  };
}

function sourceDisplayCoordinate(verse) {
  return {
    book: String(verse?.display?.book || verse?.source?.book || ""),
    chapter: Number(verse?.display?.chapter || verse?.source?.chapter || 0),
    verseLabel: String(
      verse?.display?.verseLabel || verse?.source?.verseLabel || "",
    ),
  };
}

function resolveCollisionSafeCoordinates(verses) {
  const rows = verses.map((verse) => {
    const source = sourceDisplayCoordinate(verse);
    const candidate = parseStandardTarget(verse);
    const crossBookCandidate =
      Boolean(candidate) && candidate.book !== source.book;

    return {
      verse,
      source,
      candidate,
      crossBookCandidate,
      // Reader identity remains source-book coherent. Cross-book TVTMS
      // mappings remain navigation metadata and are never used to split one
      // Brenton book across multiple visible reader books.
      useCandidate: Boolean(candidate) && !crossBookCandidate,
    };
  });

  const initialCandidates = rows.filter((row) => row.candidate).length;
  let iterations = 0;

  while (true) {
    iterations += 1;

    if (iterations > rows.length + 1) {
      fail("Reader-coordinate collision resolution did not converge.");
    }

    const fixedKeys = new Map();
    const targetGroups = new Map();

    rows.forEach((row, index) => {
      const coordinate = row.useCandidate ? row.candidate : row.source;
      const key = displayKey(coordinate);
      const map = row.useCandidate ? targetGroups : fixedKeys;
      const values = map.get(key) || [];
      values.push(index);
      map.set(key, values);
    });

    const reject = new Set();

    for (const [key, indexes] of targetGroups) {
      if (fixedKeys.has(key) || indexes.length > 1) {
        indexes.forEach((index) => reject.add(index));
      }
    }

    if (!reject.size) break;

    for (const index of reject) {
      rows[index].useCandidate = false;
    }
  }

  const finalCoordinates = rows.map((row) =>
    row.useCandidate ? row.candidate : row.source,
  );
  const finalKeys = new Set();

  for (const coordinate of finalCoordinates) {
    const key = displayKey(coordinate);

    if (finalKeys.has(key)) {
      fail(`Duplicate final reader coordinate: ${key}`);
    }

    finalKeys.add(key);
  }

  return {
    rows,
    finalCoordinates,
    initialCandidates,
    acceptedCandidates: rows.filter((row) => row.useCandidate).length,
    rejectedCandidates: rows.filter(
      (row) => row.candidate && !row.useCandidate,
    ).length,
    crossBookCandidates: rows.filter(
      (row) => row.crossBookCandidate,
    ).length,
    crossBookCandidatesAccepted: rows.filter(
      (row) => row.crossBookCandidate && row.useCandidate,
    ).length,
    iterations,
  };
}

function buildProductionCandidate() {
  const p = findLatestP0512P();
  const checksums = verifyReportChecksums(p.reportRoot);

  if (!checksums.passed) {
    fail(
      `P05.12P V2 checksum failure: ${JSON.stringify(
        checksums.failures,
        null,
        2,
      )}`,
    );
  }

  const files = p.summary.stagedCandidate?.files || {};
  const readerFile = verifyStagedFile(files.readerVerses, "reader verses");
  const titleFile = verifyStagedFile(
    files.superscriptions,
    "superscriptions",
  );
  const aliasFile = verifyStagedFile(files.aliases, "aliases");
  const footnoteFile = verifyStagedFile(files.footnotes, "footnotes");
  const crossReferenceFile = verifyStagedFile(
    files.crossReferences,
    "cross-references",
  );
  const headingFile = verifyStagedFile(files.headings, "headings");
  const structureFile = verifyStagedFile(
    files.structures,
    "paragraph and poetry",
  );

  const verses = readNdjson(readerFile.filePath);
  const superscriptions = readNdjson(titleFile.filePath);
  const aliases = readNdjson(aliasFile.filePath);

  if (
    verses.length !== 28548 ||
    superscriptions.length !== 67 ||
    aliases.length !== 389
  ) {
    fail(
      `Candidate inventory drift: ${JSON.stringify({
        verses: verses.length,
        superscriptions: superscriptions.length,
        aliases: aliases.length,
      })}`,
    );
  }

  const resolution = resolveCollisionSafeCoordinates(verses);
  const repeatedResolution = resolveCollisionSafeCoordinates(verses);

  const resolutionSignature = sha256Text(
    JSON.stringify(resolution.finalCoordinates),
  );
  const repeatedResolutionSignature = sha256Text(
    JSON.stringify(repeatedResolution.finalCoordinates),
  );

  if (resolutionSignature !== repeatedResolutionSignature) {
    fail(
      `Collision-safe coordinate resolution is not deterministic: ${resolutionSignature} versus ${repeatedResolutionSignature}`,
    );
  }

  if (
    resolution.initialCandidates !==
    resolution.acceptedCandidates + resolution.rejectedCandidates
  ) {
    fail(
      `Coordinate decision accounting does not balance: ${JSON.stringify({
        initial: resolution.initialCandidates,
        accepted: resolution.acceptedCandidates,
        rejected: resolution.rejectedCandidates,
      })}`,
    );
  }

  const coordinateDecisions = resolution.rows.map((row, index) => {
    const finalCoordinate = resolution.finalCoordinates[index];

    return {
      sourceId: row.verse.id,
      sourceReference:
        row.verse?.source?.reference ||
        row.verse?.display?.reference ||
        null,
      sourceBook: row.source.book,
      sourceChapter: row.source.chapter,
      sourceVerseLabel: row.source.verseLabel,
      standardCandidateBook: row.candidate?.book || null,
      standardCandidateChapter: row.candidate?.chapter || null,
      standardCandidateVerseLabel:
        row.candidate?.verseLabel || null,
      decision: row.candidate
        ? row.crossBookCandidate
          ? "rejected-cross-book-reader-identity"
          : row.useCandidate
            ? "accepted-unambiguous-collision-free"
            : "rejected-collision-or-conflict"
        : "no-supported-unambiguous-target",
      finalBook: finalCoordinate.book,
      finalChapter: finalCoordinate.chapter,
      finalVerseLabel: finalCoordinate.verseLabel,
    };
  });

  const acceptedDecisionRows = coordinateDecisions.filter(
    (row) => row.decision === "accepted-unambiguous-collision-free",
  );
  const rejectedDecisionRows = coordinateDecisions.filter(
    (row) =>
      row.decision === "rejected-collision-or-conflict" ||
      row.decision === "rejected-cross-book-reader-identity",
  );

  if (
    acceptedDecisionRows.length !== resolution.acceptedCandidates ||
    rejectedDecisionRows.length !== resolution.rejectedCandidates ||
    coordinateDecisions.length !== verses.length
  ) {
    fail("Coordinate decision report does not match resolution totals.");
  }

  const decisionFingerprint = sha256Text(
    coordinateDecisions.map((row) => JSON.stringify(row)).join("\n"),
  );

  const productionVerses = verses.map((verse, index) => {
    const coordinate = resolution.finalCoordinates[index];
    const sourceReaderCoordinate = sourceDisplayCoordinate(verse);
    const sort = verseSortKey(coordinate.verseLabel);
    const numericVerse = Number.isFinite(sort.number)
      ? sort.number
      : Number(verse?.display?.numericVerse || verse?.source?.numericVerse || 0);
    const sourceText = String(verse?.text || "");

    return {
      schemaVersion: "brenton-production-reader-verse@1",
      id: verse.id,
      translationId: "brenton",
      book: coordinate.book,
      chapter: coordinate.chapter,
      verse: numericVerse,
      verseLabel: coordinate.verseLabel,
      reference: `${coordinate.book} ${coordinate.chapter}:${coordinate.verseLabel}`,
      sources: [
        {
          sourceName: "Brenton Septuagint Translation",
          language: "english",
          text: sourceText,
        },
      ],
      text: sourceText,
      display: {
        bookId: verse?.display?.bookId || verse?.source?.bookId,
        book: coordinate.book,
        chapter: coordinate.chapter,
        verseLabel: coordinate.verseLabel,
        numericVerse,
        reference: `${coordinate.book} ${coordinate.chapter}:${coordinate.verseLabel}`,
      },
      sourceIdentity: verse.source,
      readerSourceIdentity: {
        book: sourceReaderCoordinate.book,
        chapter: sourceReaderCoordinate.chapter,
        verseLabel: sourceReaderCoordinate.verseLabel,
        reference: `${sourceReaderCoordinate.book} ${sourceReaderCoordinate.chapter}:${sourceReaderCoordinate.verseLabel}`,
      },
      lxxOwnership: verse.lxxOwnership,
      standardNavigation: verse.standardNavigation,
      legacyCompatibility: verse.legacyCompatibility,
      tokenAvailabilityKey: null,
    };
  });

  productionVerses.sort((left, right) =>
    compareDisplayCoordinates(left, right),
  );

  const sourceReaderBooks = new Set(
    verses.map((verse) => sourceDisplayCoordinate(verse).book),
  );
  const productionReaderBooks = new Set(
    productionVerses.map((verse) => verse.book),
  );
  const sourceReaderBookNames = [...sourceReaderBooks].sort();
  const productionReaderBookNames = [...productionReaderBooks].sort();
  const unexpectedProductionBooks = productionReaderBookNames
    .filter((book) => !sourceReaderBooks.has(book));
  const missingSourceReaderBooks = sourceReaderBookNames
    .filter((book) => !productionReaderBooks.has(book));

  if (
    sourceReaderBooks.size !== 53 ||
    productionReaderBooks.size !== 53 ||
    unexpectedProductionBooks.length !== 0 ||
    missingSourceReaderBooks.length !== 0 ||
    resolution.crossBookCandidatesAccepted !== 0
  ) {
    fail(
      `Brenton reader book coherence failed: ${JSON.stringify({
        sourceReaderBooks: sourceReaderBooks.size,
        productionReaderBooks: productionReaderBooks.size,
        unexpectedProductionBooks,
        missingSourceReaderBooks,
        crossBookCandidates: resolution.crossBookCandidates,
        crossBookCandidatesAccepted:
          resolution.crossBookCandidatesAccepted,
      })}`,
    );
  }

  const ids = new Set();
  const coordinates = new Set();

  for (const verse of productionVerses) {
    if (ids.has(verse.id)) fail(`Duplicate reader ID: ${verse.id}`);
    ids.add(verse.id);

    const key = displayKey(verse);
    if (coordinates.has(key)) {
      fail(`Duplicate production reader coordinate: ${key}`);
    }
    coordinates.add(key);
  }

  const verseIds = new Set(productionVerses.map((verse) => verse.id));

  for (const title of superscriptions) {
    if (
      title.attachBeforeVisibleSourceId &&
      !verseIds.has(title.attachBeforeVisibleSourceId)
    ) {
      fail(
        `Superscription target is not visible: ${title.attachBeforeVisibleSourceId}`,
      );
    }
  }

  for (const alias of aliases) {
    if (!verseIds.has(alias.primarySourceId)) {
      fail(`Alias target is not visible: ${alias.primarySourceId}`);
    }
  }

  const psalm4 = productionVerses.filter(
    (verse) => verse.book === "Psalms" && verse.chapter === 4,
  );
  const psalm4Labels = psalm4.map((verse) => verse.verseLabel);
  const expectedPsalm4 = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const psalm4Titles = superscriptions.filter(
    (title) =>
      title.source?.bookId === "PSA" &&
      Number(title.source?.chapter) === 4,
  );

  if (
    JSON.stringify(psalm4Labels) !== JSON.stringify(expectedPsalm4) ||
    psalm4Titles.length !== 1
  ) {
    fail(
      `Psalm 4 reader correction failed: ${JSON.stringify({
        labels: psalm4Labels,
        titles: psalm4Titles.length,
      })}`,
    );
  }

  const sourceIds = new Set([
    ...productionVerses.map((verse) => verse.id),
    ...superscriptions.map((title) => title.id),
    ...aliases.map((alias) => alias.aliasSourceId),
  ]);

  if (sourceIds.size !== 29004) {
    fail(
      `Source partition does not preserve all 29,004 segments: ${sourceIds.size}`,
    );
  }

  const document = {
    schemaVersion: "brenton-production-reader@1",
    translationId: "brenton",
    sourceCandidateFingerprint:
      p.summary.stagedCandidate?.fingerprint || null,
    sourceCandidateGeneratedAtUtc: p.summary.generatedAtUtc,
    readerCoordinatePolicy: {
      sourceIdentityPreserved: true,
      standardNavigationAuthority: "STEPBible TVTMS",
      acceptedOnlyWhenUnambiguousAndCollisionFree: true,
      readerBookIdentityMustRemainSourceBookCoherent: true,
      crossBookTargetsRemainNavigationMetadataOnly: true,
      unsupportedSubverseSyntaxFallsBackToSourceCoordinate: true,
      unresolvedOrAmbiguousNavigationFallsBackToSourceCoordinate: true,
      candidateMappingsConsidered: resolution.initialCandidates,
      candidateMappingsAccepted: resolution.acceptedCandidates,
      candidateMappingsRejected: resolution.rejectedCandidates,
      crossBookCandidatesRejected:
        resolution.crossBookCandidates,
      crossBookCandidatesAccepted:
        resolution.crossBookCandidatesAccepted,
      sourceReaderBooks: sourceReaderBooks.size,
      productionReaderBooks: productionReaderBooks.size,
      sourceReaderBookNames,
      productionReaderBookNames,
      collisionResolutionIterations: resolution.iterations,
      deterministicResolutionFingerprint: resolutionSignature,
      coordinateDecisionFingerprint: decisionFingerprint,
    },
    tappabilityPolicy: {
      status: "fail-closed-pending-display-token-rebuild",
      allCandidateVerseTokenAvailabilityKeysNull: true,
    },
    verses: productionVerses,
    superscriptions,
  };

  const serialized = `${JSON.stringify(document)}\n`;
  const productionSha256 = sha256Text(serialized);

  const integrity = {
    schemaVersion: "brenton-production-integrity@1",
    generatedAtUtc: p.summary.generatedAtUtc,
    productionSha256,
    sourceCandidate: {
      report: relative(ROOT, p.reportRoot),
      summarySha256: sha256File(p.summaryPath),
      reportChecksumsVerified: checksums.checked,
      fingerprint: p.summary.stagedCandidate?.fingerprint || null,
    },
    productionCounts: {
      sourceSegments: 29004,
      visibleVerses: productionVerses.length,
      superscriptions: superscriptions.length,
      aliasesPreservedInSourceCandidate: aliases.length,
      footnotesPreservedInSourceCandidate: footnoteFile.records,
      crossReferencesPreservedInSourceCandidate:
        crossReferenceFile.records,
      headingsPreservedInSourceCandidate: headingFile.records,
      paragraphAndPoetryEventsPreservedInSourceCandidate:
        structureFile.records,
      standardCoordinatesConsidered: resolution.initialCandidates,
      standardCoordinatesAccepted: resolution.acceptedCandidates,
      standardCoordinatesRejected: resolution.rejectedCandidates,
      crossBookCoordinatesRejected:
        resolution.crossBookCandidates,
      crossBookCoordinatesAccepted:
        resolution.crossBookCandidatesAccepted,
      sourceReaderBooks: sourceReaderBooks.size,
      productionReaderBooks: productionReaderBooks.size,
      sourceReaderBookNames,
      productionReaderBookNames,
      coordinateDecisionRows: coordinateDecisions.length,
    },
    sourceArtifactHashes: {
      readerVerses: readerFile.sha256,
      superscriptions: titleFile.sha256,
      aliases: aliasFile.sha256,
      footnotes: footnoteFile.sha256,
      crossReferences: crossReferenceFile.sha256,
      headings: headingFile.sha256,
      structures: structureFile.sha256,
    },
    gates: {
      p0512pChecksumsValid: true,
      candidateArtifactsHashVerified: true,
      all29004SourceSegmentsPreserved: true,
      all28548ReaderVersesPreserved: true,
      all67SuperscriptionsPreserved: true,
      all389AliasesRemainPreservedUpstream: true,
      noDuplicateReaderCoordinates: true,
      readerBookSetMatchesSourceExactly:
        JSON.stringify(sourceReaderBookNames) ===
        JSON.stringify(productionReaderBookNames),
      everyVerseCarriesReaderSourceIdentity:
        productionVerses.every(
          (verse) =>
            verse.readerSourceIdentity &&
            typeof verse.readerSourceIdentity.book === "string" &&
            verse.readerSourceIdentity.book.length > 0 &&
            Number.isFinite(
              Number(verse.readerSourceIdentity.chapter),
            ) &&
            typeof verse.readerSourceIdentity.verseLabel === "string" &&
            verse.readerSourceIdentity.verseLabel.length > 0,
        ),
      exactly53ProductionReaderBooks:
        productionReaderBooks.size === 53,
      noCrossBookReaderCoordinateAccepted:
        resolution.crossBookCandidatesAccepted === 0,
      coordinateDecisionsAccountExactly:
        resolution.initialCandidates ===
        resolution.acceptedCandidates + resolution.rejectedCandidates,
      collisionResolutionDeterministic:
        resolutionSignature === repeatedResolutionSignature,
      psalm4DisplaysTitlePlusVerses1Through8: true,
      candidateTappabilityFailClosed: true,
    },
  };

  return {
    document,
    integrity,
    coordinateDecisions,
    decisionFingerprint,
    serialized,
    integritySerialized: `${JSON.stringify(integrity, null, 2)}\n`,
    decisionSerialized:
      coordinateDecisions.map((row) => JSON.stringify(row)).join("\n") +
      "\n",
  };
}

function main() {
  const args = parseArgs(process.argv);
  const built = buildProductionCandidate();

  if (!args.noWrite) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.mkdirSync(path.dirname(args.integrityOutput), { recursive: true });
    fs.mkdirSync(path.dirname(args.decisionOutput), { recursive: true });
    fs.writeFileSync(args.output, built.serialized, "utf8");
    fs.writeFileSync(
      args.integrityOutput,
      built.integritySerialized,
      "utf8",
    );
    fs.writeFileSync(
      args.decisionOutput,
      built.decisionSerialized,
      "utf8",
    );
  }

  console.log("[P05.12T V8] Brenton production candidate built.");
  console.log(
    `[P05.12T V8] Visible verses: ${built.document.verses.length}`,
  );
  console.log(
    `[P05.12T V8] Superscriptions: ${built.document.superscriptions.length}`,
  );
  console.log(
    `[P05.12T V8] Standard coordinates considered: ${built.integrity.productionCounts.standardCoordinatesConsidered}`,
  );
  console.log(
    `[P05.12T V8] Same-book collision-safe coordinates accepted: ${built.document.readerCoordinatePolicy.candidateMappingsAccepted}`,
  );
  console.log(
    `[P05.12T V8] Conflicting or cross-book coordinates rejected: ${built.document.readerCoordinatePolicy.candidateMappingsRejected}`,
  );
  console.log(
    `[P05.12T V8] Cross-book reader mappings rejected: ${built.document.readerCoordinatePolicy.crossBookCandidatesRejected}`,
  );
  console.log(
    `[P05.12T V8] Production reader books: ${built.document.readerCoordinatePolicy.productionReaderBooks}`,
  );
  console.log(
    `[P05.12T V8] Coordinate-decision fingerprint: ${built.decisionFingerprint}`,
  );
  console.log("[P05.12T V8] Psalm 4 reader labels: 1-8");
  console.log(
    `[P05.12T V8] Production SHA-256: ${built.integrity.productionSha256}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildProductionCandidate,
};
