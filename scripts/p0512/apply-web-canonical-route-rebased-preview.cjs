const fs = require("fs");
const path = require("path");

const {
  normalizeWord,
  normalizedToken,
  routeIds,
  isAligned,
  arraysEqual,
  findRecord,
  localSourceIds,
  occurrenceOrdinal,
  readPlan,
  ownsCanonicalFile,
  canonicalWebBookAlias
} = require("../p0510/p0510-canonical-utils.cjs");

const root = process.cwd();
const canonicalRoot =
  process.argv.find(value => value.startsWith("--canonical-root="))
    ?.slice("--canonical-root=".length) ||
  path.join(root, ".private", "scripture", "canonical");

const backupRoot =
  process.argv.find(value => value.startsWith("--backup-root="))
    ?.slice("--backup-root=".length) ||
  null;

const reportRoot =
  process.argv.find(value => value.startsWith("--report-root="))
    ?.slice("--report-root=".length) ||
  path.join(root, "reports", "p0510-canonical-source-repair");

const {
  tokenizeDisplayText
} = require(
  path.join(root, "scripts", "canonical", "utils", "tokenize")
);

const plan = readPlan(root);

const generatedWebFile = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedWEB.json"
);

if (!fs.existsSync(canonicalRoot)) {
  throw new Error(
    `Canonical source root is missing: ${canonicalRoot}`
  );
}

if (!fs.existsSync(generatedWebFile)) {
  throw new Error("generatedWEB.json is missing.");
}

const bookAliases = new Map(
  Object.entries({
    genesis: "Gen",
    exodus: "Exod",
    leviticus: "Lev",
    numbers: "Num",
    deuteronomy: "Deut",
    joshua: "Josh",
    judges: "Judg",
    ruth: "Ruth",
    "1 samuel": "1Sam",
    "2 samuel": "2Sam",
    "1 kings": "1Kgs",
    "2 kings": "2Kgs",
    "1 chronicles": "1Chr",
    "2 chronicles": "2Chr",
    ezra: "Ezra",
    nehemiah: "Neh",
    esther: "Esth",
    job: "Job",
    psalm: "Ps",
    psalms: "Ps",
    proverbs: "Prov",
    ecclesiastes: "Eccl",
    "song of solomon": "Song",
    "song of songs": "Song",
    isaiah: "Isa",
    jeremiah: "Jer",
    lamentations: "Lam",
    ezekiel: "Ezek",
    daniel: "Dan",
    hosea: "Hos",
    joel: "Joel",
    amos: "Amos",
    obadiah: "Obad",
    jonah: "Jonah",
    micah: "Mic",
    nahum: "Nah",
    habakkuk: "Hab",
    zephaniah: "Zeph",
    haggai: "Hag",
    zechariah: "Zech",
    malachi: "Mal",
    matthew: "Matt",
    mark: "Mark",
    luke: "Luke",
    john: "John",
    acts: "Acts",
    romans: "Rom",
    "1 corinthians": "1Cor",
    "2 corinthians": "2Cor",
    galatians: "Gal",
    ephesians: "Eph",
    philippians: "Phil",
    colossians: "Col",
    "1 thessalonians": "1Thess",
    "2 thessalonians": "2Thess",
    "1 timothy": "1Tim",
    "2 timothy": "2Tim",
    titus: "Titus",
    philemon: "Phlm",
    hebrews: "Heb",
    james: "Jas",
    "1 peter": "1Pet",
    "2 peter": "2Pet",
    "1 john": "1John",
    "2 john": "2John",
    "3 john": "3John",
    jude: "Jude",
    revelation: "Rev"
  })
);

function normalizeBookName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generatedText(record) {
  return (
    record?.sources?.find(source =>
      /world english bible/i.test(
        String(source?.sourceName ?? "")
      )
    )?.text ??
    record?.sources?.[0]?.text ??
    ""
  );
}

const generatedWeb = JSON.parse(
  fs.readFileSync(generatedWebFile, "utf8")
);

const cleanByKey = new Map();

for (const verse of generatedWeb) {
  const alias = bookAliases.get(
    normalizeBookName(verse.book)
  );

  if (!alias) {
    throw new Error(`Unsupported WEB book: ${verse.book}`);
  }

  cleanByKey.set(
    `${alias}:${Number(verse.chapter)}:${Number(verse.verse)}`,
    generatedText(verse)
  );
}

function cleanKey(corpus, filename, record) {
  const reference = String(record.reference ?? "");

  if (
    corpus === "greek-nt" &&
    filename === "Rom.json" &&
    plan.romansWebCrosswalk?.[reference]
  ) {
    return plan.romansWebCrosswalk[reference];
  }

  const bookAlias = canonicalWebBookAlias(
    record,
    filename
  );

  if (!bookAlias) {
    return null;
  }

  return `${bookAlias}:${Number(record.chapter)}:${Number(record.verse)}`;
}

function matchWeight(token) {
  let score = 10;

  if (isAligned(token)) score += 4;

  if (
    Array.isArray(token?.alignedSourceEntityIds) &&
    token.alignedSourceEntityIds.length > 0
  ) {
    score += 2;
  }

  if (
    token?.confidence === "high" ||
    token?.alignmentConfidence === "high"
  ) {
    score += 1;
  }

  return score;
}

function mapTokens(oldTokens, newTokens) {
  const oldLength = oldTokens.length;
  const newLength = newTokens.length;
  const oldNormalized = oldTokens.map(normalizedToken);
  const newNormalized = newTokens.map(normalizedToken);

  const dp = Array.from(
    { length: newLength + 1 },
    () => new Int32Array(oldLength + 1)
  );

  for (let i = newLength - 1; i >= 0; i -= 1) {
    for (let j = oldLength - 1; j >= 0; j -= 1) {
      let best = Math.max(dp[i + 1][j], dp[i][j + 1]);

      if (
        newNormalized[i] &&
        newNormalized[i] === oldNormalized[j]
      ) {
        best = Math.max(
          best,
          matchWeight(oldTokens[j]) + dp[i + 1][j + 1]
        );
      }

      dp[i][j] = best;
    }
  }

  const mapping = new Map();
  const usedOld = new Set();
  let i = 0;
  let j = 0;

  while (i < newLength && j < oldLength) {
    const canMatch =
      newNormalized[i] &&
      newNormalized[i] === oldNormalized[j];

    const matchScore = canMatch
      ? matchWeight(oldTokens[j]) + dp[i + 1][j + 1]
      : -1;

    if (canMatch && matchScore === dp[i][j]) {
      mapping.set(i, j);
      usedOld.add(j);
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i][j + 1] >= dp[i + 1][j]) {
      j += 1;
    } else {
      i += 1;
    }
  }

  return {
    mapping,
    usedOld
  };
}

function migrateTokens(oldTokens, cleanText) {
  const freshTokens = tokenizeDisplayText(cleanText);
  const { mapping, usedOld } = mapTokens(oldTokens, freshTokens);

  const migrated = freshTokens.map((freshToken, index) => {
    const oldIndex = mapping.get(index);

    if (oldIndex === undefined) {
      return {
        ...freshToken,
        index
      };
    }

    const oldToken = oldTokens[oldIndex];
    const preserved = { ...oldToken };

    delete preserved.index;
    delete preserved.text;
    delete preserved.normalized;

    return {
      ...freshToken,
      ...preserved,
      index,
      text: freshToken.text,
      normalized: freshToken.normalized
    };
  });

  const unmatchedNew = freshTokens.filter(
    (_, index) => !mapping.has(index)
  );

  const droppedOld = oldTokens.filter(
    (_, index) => !usedOld.has(index)
  );

  return {
    migrated,
    matchedCount: mapping.size,
    unmatchedNewCount: unmatchedNew.length,
    droppedOldCount: droppedOld.length,
    droppedAlignedOldCount: droppedOld.filter(isAligned).length
  };
}

const fileCache = new Map();
const changedFiles = new Set();
const backedUpFiles = new Set();

function getFile(corpus, filename) {
  const key = `${corpus}|${filename}`;

  if (!fileCache.has(key)) {
    const filePath = path.join(canonicalRoot, corpus, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Canonical source file missing: ${filePath}`
      );
    }

    fileCache.set(key, {
      corpus,
      filename,
      filePath,
      data: JSON.parse(fs.readFileSync(filePath, "utf8"))
    });
  }

  return fileCache.get(key);
}

function markChanged(state) {
  changedFiles.add(state.filePath);

  if (backupRoot && !backedUpFiles.has(state.filePath)) {
    const destination = path.join(
      backupRoot,
      path.relative(canonicalRoot, state.filePath)
    );

    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });

    fs.copyFileSync(state.filePath, destination);
    backedUpFiles.add(state.filePath);
  }
}

const migration = {
  ownedFiles: 0,
  skippedNonOwnedFiles: 0,
  existingWebBlocks: 0,
  unchangedVerses: 0,
  changedVerses: 0,
  missingCleanSource: 0,
  matchedTokens: 0,
  unmatchedNewTokens: 0,
  droppedOldTokens: 0,
  droppedAlignedOldTokens: 0
};

for (const corpus of ["hebrew", "greek-nt"]) {
  const directory = path.join(canonicalRoot, corpus);

  for (const filename of fs
    .readdirSync(directory)
    .filter(file => file.endsWith(".json"))
    .sort()) {
    const state = getFile(corpus, filename);

    if (!ownsCanonicalFile(corpus, state.data, filename)) {
      migration.skippedNonOwnedFiles += 1;
      continue;
    }

    migration.ownedFiles += 1;

    for (const record of Object.values(state.data)) {
      const web = record?.translations?.web;

      if (!web) continue;

      migration.existingWebBlocks += 1;

      const canonicalKey = cleanKey(
        corpus,
        filename,
        record
      );

      const expectedText = canonicalKey
        ? cleanByKey.get(canonicalKey)
        : undefined;

      if (typeof expectedText !== "string") {
        migration.missingCleanSource += 1;
        continue;
      }

      if (String(web.text ?? "") === expectedText) {
        migration.unchangedVerses += 1;
        continue;
      }

      const result = migrateTokens(
        Array.isArray(web.tokens) ? web.tokens : [],
        expectedText
      );

      web.text = expectedText;
      web.tokens = result.migrated;

      markChanged(state);

      migration.changedVerses += 1;
      migration.matchedTokens += result.matchedCount;
      migration.unmatchedNewTokens += result.unmatchedNewCount;
      migration.droppedOldTokens += result.droppedOldCount;
      migration.droppedAlignedOldTokens +=
        result.droppedAlignedOldCount;
    }
  }
}

if (migration.missingCleanSource !== 0) {
  throw new Error(
    `Clean WEB migration has ${migration.missingCleanSource} missing source records.`
  );
}

const blockResult = {
  approved: plan.blocks.length,
  created: 0,
  replaced: 0,
  alreadyExact: 0
};

for (const candidate of plan.blocks) {
  const state = getFile(candidate.corpus, candidate.filename);
  const resolved = findRecord(
    state.data,
    candidate.canonicalObjectKey,
    candidate.canonicalReference
  );

  const record = resolved.record;
  record.translations ??= {};

  const expectedTokens = tokenizeDisplayText(
    candidate.generatedText
  ).map((token, index) => ({
    ...token,
    index
  }));

  const existing = record.translations[candidate.translation];
  const existingSequence = Array.isArray(existing?.tokens)
    ? existing.tokens.map(normalizedToken)
    : [];
  const expectedSequence = expectedTokens.map(normalizedToken);

  if (
    existing &&
    String(existing.text ?? "") === candidate.generatedText &&
    arraysEqual(existingSequence, expectedSequence)
  ) {
    blockResult.alreadyExact += 1;
    continue;
  }

  const existed = Boolean(existing);

  record.translations[candidate.translation] = {
    text: candidate.generatedText,
    tokens: expectedTokens
  };

  markChanged(state);

  if (existed) {
    blockResult.replaced += 1;
  } else {
    blockResult.created += 1;
  }
}

const routeResult = {
  approved: plan.routes.length,
  created: 0,
  alreadyExact: 0,
  legacyIndexExact: 0,
  rebased: 0,
  errors: [],
  resolutions: []
};

for (const candidate of plan.routes) {
  const state = getFile(candidate.corpus, candidate.filename);
  const resolved = findRecord(
    state.data,
    candidate.objectKey,
    candidate.reference
  );

  const record = resolved.record;
  const web = record.translations?.web;
  const kjv = record.translations?.kjv;

  if (!web || !Array.isArray(web.tokens)) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason: "web-block-missing"
    });
    continue;
  }

  if (!kjv || !Array.isArray(kjv.tokens)) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason: "parallel-kjv-missing"
    });
    continue;
  }

  const localIds = localSourceIds(
    candidate.corpus,
    record,
    candidate.filename
  );

  if (
    candidate.sourceTokenIds.length !== 1 ||
    !candidate.sourceTokenIds.every(id => localIds.has(id))
  ) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason: "approved-route-not-local",
      expectedRoutes: candidate.sourceTokenIds
    });
    continue;
  }

  const webMatches = web.tokens
    .map((token, index) => ({ index, token }))
    .filter(
      item =>
        normalizedToken(item.token) ===
        candidate.expectedNormalized
    );

  const kjvMatches = kjv.tokens
    .map((token, index) => ({ index, token }))
    .filter(
      item =>
        normalizedToken(item.token) ===
        candidate.expectedNormalized
    );

  const matchingKjvOrdinals = kjvMatches
    .map((item, ordinal) => ({
      ordinal,
      index: item.index,
      routes: routeIds(item.token)
    }))
    .filter(
      item =>
        item.routes.length === 1 &&
        arraysEqual(item.routes, candidate.sourceTokenIds)
    );

  if (webMatches.length !== kjvMatches.length) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason: "parallel-occurrence-count-mismatch",
      expectedNormalized: candidate.expectedNormalized,
      webOccurrences: webMatches.map(item => item.index),
      kjvOccurrences: kjvMatches.map(item => item.index),
      expectedRoutes: candidate.sourceTokenIds
    });
    continue;
  }

  if (matchingKjvOrdinals.length !== 1) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason:
        matchingKjvOrdinals.length === 0
          ? "parallel-source-route-not-found"
          : "parallel-source-route-ambiguous",
      expectedNormalized: candidate.expectedNormalized,
      matchingKjvOrdinals,
      expectedRoutes: candidate.sourceTokenIds
    });
    continue;
  }

  const ordinal = matchingKjvOrdinals[0].ordinal;
  const resolvedWeb = webMatches[ordinal];

  if (!resolvedWeb) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      reason: "resolved-web-occurrence-missing",
      ordinal,
      webOccurrences: webMatches.map(item => item.index)
    });
    continue;
  }

  const resolvedTokenIndex = resolvedWeb.index;
  const token = resolvedWeb.token;
  const normalized = normalizedToken(token);
  const parallelRoutes = routeIds(kjvMatches[ordinal].token);

  if (
    normalized !== candidate.expectedNormalized ||
    !arraysEqual(parallelRoutes, candidate.sourceTokenIds)
  ) {
    routeResult.errors.push({
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      resolvedTokenIndex,
      reason: "resolved-route-validation-failed",
      expectedNormalized: candidate.expectedNormalized,
      actualNormalized: normalized,
      parallelRoutes,
      expectedRoutes: candidate.sourceTokenIds
    });
    continue;
  }

  routeResult.resolutions.push({
    corpus: candidate.corpus,
    filename: candidate.filename,
    reference: candidate.reference,
    expectedNormalized: candidate.expectedNormalized,
    legacyTokenIndex: candidate.tokenIndex,
    resolvedTokenIndex,
    occurrenceOrdinal: ordinal,
    sourceTokenIds: candidate.sourceTokenIds,
    resolution:
      resolvedTokenIndex === candidate.tokenIndex
        ? "legacy-index-still-exact"
        : "rebased-by-parallel-source-route"
  });

  if (resolvedTokenIndex === candidate.tokenIndex) {
    routeResult.legacyIndexExact += 1;
  } else {
    routeResult.rebased += 1;
  }

  if (
    arraysEqual(routeIds(token), candidate.sourceTokenIds) &&
    token.alignmentStatus === "aligned" &&
    token.alignmentMethod === "p0510-parallel-kjv"
  ) {
    routeResult.alreadyExact += 1;
    continue;
  }

  if (
    isAligned(token) &&
    !arraysEqual(routeIds(token), candidate.sourceTokenIds)
  ) {
    routeResult.errors.push({
      reference: candidate.reference,
      tokenIndex: candidate.tokenIndex,
      reason: "conflicting-existing-route"
    });
    continue;
  }

  token.alignedSourceTokenIds = [...candidate.sourceTokenIds];

  if (candidate.sourceEntityIds.length > 0) {
    token.alignedSourceEntityIds = [...candidate.sourceEntityIds];
  }

  token.alignmentStatus = "aligned";
  token.alignmentConfidence = "high";
  token.confidence = "high";
  token.alignmentMethod = "p0510-parallel-kjv";
  token.method = "p0510-parallel-kjv";
  token.alignmentKind = "same-verse-cross-translation";

  markChanged(state);
  routeResult.created += 1;
}

if (routeResult.errors.length > 0) {
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(
    path.join(reportRoot, "route-rebase-failure.json"),
    JSON.stringify(routeResult, null, 2),
    "utf8"
  );

  throw new Error(
    `Route restoration failed for ${routeResult.errors.length} targets. See ${path.join(reportRoot, "route-rebase-failure.json")}`
  );
}

for (const state of fileCache.values()) {
  if (!changedFiles.has(state.filePath)) continue;

  fs.writeFileSync(
    state.filePath,
    JSON.stringify(state.data),
    "utf8"
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  canonicalRoot,
  backupRoot,
  migration,
  blocks: blockResult,
  routes: routeResult,
  changedFiles: [...changedFiles]
    .map(file => path.relative(root, file))
    .sort(),
  passed:
    blockResult.created +
      blockResult.replaced +
      blockResult.alreadyExact ===
      plan.blocks.length &&
    routeResult.created +
      routeResult.alreadyExact ===
      plan.routes.length &&
    routeResult.errors.length === 0
};

const reportDirectory = reportRoot;

fs.mkdirSync(reportDirectory, {
  recursive: true
});

fs.writeFileSync(
  path.join(reportDirectory, "apply-report.json"),
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exitCode = 2;
} else {
  console.log("P05.10 canonical source repair passed.");
}
