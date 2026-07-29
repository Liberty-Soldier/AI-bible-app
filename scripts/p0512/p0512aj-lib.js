"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EXPECTED = Object.freeze({
  milestone: "P05.12AJ",
  aiMilestone: "P05.12AI",
  ownedFiles: 66,
  ownedFilesByEmbeddedCorpus: Object.freeze({ hebrew: 39, "greek-nt": 27 }),
  allCanonicalJsonFiles: 142,
  excludedNonKjvCanonicalJsonFiles: 76,
  ownedRecords: 31086,
  sourceTokens: 438452,
  readerCoordinates: 31102,
  mappedReaderCoordinates: 31085,
  unsupportedReaderCoordinates: 17,
  sourceToReaderEdges: 31091,
  multiTargetSourceCoordinates: 3,
  multiSourceReaderCoordinates: 6,
  changedTokensInAI: 910,
  aiTopologyFingerprint:
    "1fe86741c7da3d1dc0c7a6264e677c291026793314ee63ef62a6b4dd73f773e0",
});

const BOOK_ALIASES = new Map(
  Object.entries({
    gen: "genesis", genesis: "genesis",
    exod: "exodus", exodus: "exodus",
    lev: "leviticus", leviticus: "leviticus",
    num: "numbers", numbers: "numbers",
    deut: "deuteronomy", deuteronomy: "deuteronomy",
    josh: "joshua", joshua: "joshua",
    judg: "judges", judges: "judges",
    ruth: "ruth",
    "1sam": "1 samuel", "1 sam": "1 samuel", "1 samuel": "1 samuel",
    "2sam": "2 samuel", "2 sam": "2 samuel", "2 samuel": "2 samuel",
    "1kgs": "1 kings", "1 kgs": "1 kings", "1 kings": "1 kings",
    "2kgs": "2 kings", "2 kgs": "2 kings", "2 kings": "2 kings",
    "1chr": "1 chronicles", "1 chr": "1 chronicles", "1 chronicles": "1 chronicles",
    "2chr": "2 chronicles", "2 chr": "2 chronicles", "2 chronicles": "2 chronicles",
    ezra: "ezra", neh: "nehemiah", nehemiah: "nehemiah",
    esth: "esther", esther: "esther", job: "job",
    ps: "psalms", psa: "psalms", psalm: "psalms", psalms: "psalms",
    prov: "proverbs", proverbs: "proverbs",
    eccl: "ecclesiastes", ecclesiastes: "ecclesiastes",
    song: "song of solomon", "song of songs": "song of solomon", "song of solomon": "song of solomon",
    isa: "isaiah", isaiah: "isaiah", jer: "jeremiah", jeremiah: "jeremiah",
    lam: "lamentations", lamentations: "lamentations",
    ezek: "ezekiel", ezekiel: "ezekiel", dan: "daniel", daniel: "daniel",
    hos: "hosea", hosea: "hosea", joel: "joel", amos: "amos",
    obad: "obadiah", obadiah: "obadiah", jonah: "jonah",
    mic: "micah", micah: "micah", nah: "nahum", nahum: "nahum",
    hab: "habakkuk", habakkuk: "habakkuk", zeph: "zephaniah", zephaniah: "zephaniah",
    hag: "haggai", haggai: "haggai", zech: "zechariah", zechariah: "zechariah",
    mal: "malachi", malachi: "malachi",
    matt: "matthew", matthew: "matthew", mark: "mark", luke: "luke", john: "john",
    acts: "acts", rom: "romans", romans: "romans",
    "1cor": "1 corinthians", "1 cor": "1 corinthians", "1 corinthians": "1 corinthians",
    "2cor": "2 corinthians", "2 cor": "2 corinthians", "2 corinthians": "2 corinthians",
    gal: "galatians", galatians: "galatians", eph: "ephesians", ephesians: "ephesians",
    phil: "philippians", philippians: "philippians", col: "colossians", colossians: "colossians",
    "1thess": "1 thessalonians", "1 thess": "1 thessalonians", "1 thessalonians": "1 thessalonians",
    "2thess": "2 thessalonians", "2 thess": "2 thessalonians", "2 thessalonians": "2 thessalonians",
    "1tim": "1 timothy", "1 tim": "1 timothy", "1 timothy": "1 timothy",
    "2tim": "2 timothy", "2 tim": "2 timothy", "2 timothy": "2 timothy",
    titus: "titus", phlm: "philemon", philemon: "philemon", heb: "hebrews", hebrews: "hebrews",
    jas: "james", james: "james", "1pet": "1 peter", "1 pet": "1 peter", "1 peter": "1 peter",
    "2pet": "2 peter", "2 pet": "2 peter", "2 peter": "2 peter",
    "1john": "1 john", "1 john": "1 john", "2john": "2 john", "2 john": "2 john",
    "3john": "3 john", "3 john": "3 john", jude: "jude", rev: "revelation", revelation: "revelation",
  })
);

function fail(message) {
  const error = new Error(`[P05.12AJ] ${message}`);
  error.code = "P0512AJ_FAILURE";
  throw error;
}

function stripBom(value) {
  return String(value).replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function listFilesRecursive(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const output = [];
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function hashTree(rootPath) {
  if (!fs.existsSync(rootPath)) return null;
  const files = listFilesRecursive(rootPath);
  const digest = crypto.createHash("sha256");
  const entries = [];
  for (const filePath of files) {
    const relative = path.relative(rootPath, filePath).split(path.sep).join("/");
    const hash = sha256File(filePath);
    const size = fs.statSync(filePath).size;
    entries.push({ path: relative, sha256: hash, bytes: size });
    digest.update(relative, "utf8");
    digest.update("\0", "utf8");
    digest.update(hash, "utf8");
    digest.update("\n", "utf8");
  }
  return { root: rootPath, files: files.length, treeSha256: digest.digest("hex"), entries };
}

function compactBookKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[_\.]+/g, " ")
    .replace(/[^0-9A-Za-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeBook(value) {
  const key = compactBookKey(value);
  const compact = key.replace(/\s+/g, "");
  return BOOK_ALIASES.get(key) || BOOK_ALIASES.get(compact) || key;
}

function normalizeCoordinate(value) {
  if (!value) return null;
  const text = String(value)
    .normalize("NFKC")
    .replace(/_/g, " ")
    .trim();
  let match = text.match(/^(.+?)[\.:](\d+)[\.:](\d+)$/u);
  if (!match) match = text.match(/^(.+?)\s+(\d+):(\d+)$/u);
  if (!match) return null;
  return `${normalizeBook(match[1])}:${Number(match[2])}:${Number(match[3])}`;
}

function coordinateParts(coordinate) {
  const match = String(coordinate || "").match(/^(.+):(\d+):(\d+)$/u);
  if (!match) fail(`Invalid normalized coordinate: ${coordinate}`);
  return { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) };
}

function verseText(verse) {
  return String(verse?.sources?.[0]?.text ?? verse?.text ?? "");
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function relativeFromRoot(repoRoot, targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function findP0512AiEvidence(repoRoot) {
  const reportsRoot = path.join(repoRoot, ".private", "reports", "P05.12");
  const summaries = listFilesRecursive(reportsRoot)
    .filter((filePath) => path.basename(filePath).toLowerCase() === "p0512ai-summary.json")
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const topSummaryPath of summaries) {
    let top;
    try { top = readJson(topSummaryPath); } catch { continue; }
    if (top?.milestone !== EXPECTED.aiMilestone) continue;
    if (!top?.gates?.safeToUseStagedTreeForKjvBlockMigrationPreview) continue;
    if (top?.gates?.safeToPromoteProductionKjv !== false) continue;
    if (top?.application?.changedTokens !== EXPECTED.changedTokensInAI) continue;
    if (top?.application?.topologyFingerprint !== EXPECTED.aiTopologyFingerprint) continue;

    const canonicalRoot = path.resolve(repoRoot, top.staging?.retainedCandidate || "");
    if (!fs.existsSync(canonicalRoot)) continue;

    const reportDir = path.dirname(topSummaryPath);
    let applicationSummaryPath = path.join(
      reportDir,
      "candidate-a",
      "isolated-token-crosswalk-application-summary.json"
    );
    let readerMapPath = path.join(
      reportDir,
      "candidate-a",
      "isolated-token-crosswalk-reader-map.json"
    );
    let sourceMapPath = path.join(
      reportDir,
      "candidate-a",
      "isolated-token-crosswalk-source-map.json"
    );

    if (![applicationSummaryPath, readerMapPath, sourceMapPath].every(fs.existsSync)) {
      const candidates = listFilesRecursive(reportsRoot);
      applicationSummaryPath = candidates.find(
        (p) => p.endsWith(`${path.sep}candidate-a${path.sep}isolated-token-crosswalk-application-summary.json`) &&
          readJson(p)?.topologyFingerprint === EXPECTED.aiTopologyFingerprint
      );
      if (!applicationSummaryPath) continue;
      const candidateDir = path.dirname(applicationSummaryPath);
      readerMapPath = path.join(candidateDir, "isolated-token-crosswalk-reader-map.json");
      sourceMapPath = path.join(candidateDir, "isolated-token-crosswalk-source-map.json");
      if (![readerMapPath, sourceMapPath].every(fs.existsSync)) continue;
    }

    const applicationSummary = readJson(applicationSummaryPath);
    const totals = applicationSummary?.totals || {};
    const exact =
      totals.ownedFiles === EXPECTED.ownedFiles &&
      totals.ownedRecords === EXPECTED.ownedRecords &&
      totals.sourceTokens === EXPECTED.sourceTokens &&
      totals.readerCoordinates === EXPECTED.readerCoordinates &&
      totals.mappedReaderCoordinates === EXPECTED.mappedReaderCoordinates &&
      totals.unsupportedReaderCoordinates === EXPECTED.unsupportedReaderCoordinates &&
      totals.sourceToReaderEdges === EXPECTED.sourceToReaderEdges &&
      totals.multiTargetSourceCoordinates === EXPECTED.multiTargetSourceCoordinates &&
      totals.multiSourceReaderCoordinates === EXPECTED.multiSourceReaderCoordinates &&
      totals.targetsOutsideReader === 0;
    if (!exact) continue;

    const candidatePath = path.resolve(repoRoot, applicationSummary.inputs?.candidate?.path || "");
    if (!fs.existsSync(candidatePath)) continue;
    const expectedCandidateSha = applicationSummary.inputs?.candidate?.sha256;
    if (!expectedCandidateSha || sha256File(candidatePath) !== expectedCandidateSha) continue;

    return {
      topSummaryPath,
      topSummary: top,
      applicationSummaryPath,
      applicationSummary,
      readerMapPath,
      sourceMapPath,
      canonicalRoot,
      kjvCandidatePath: candidatePath,
      kjvCandidateSha256: expectedCandidateSha,
    };
  }

  fail(
    "No retained passing P05.12AI candidate was found. The AJ preview refuses to rebuild from live canonical or infer a replacement path."
  );
}

function loadReaderCandidate(kjvCandidatePath) {
  const verses = readJson(kjvCandidatePath);
  if (!Array.isArray(verses)) fail("Locked KJV2006 candidate must be a JSON array.");
  const byCoordinate = new Map();
  const normalized = [];
  for (const verse of verses) {
    const coordinate = normalizeCoordinate(
      verse?.reference || `${verse?.book || ""} ${verse?.chapter || ""}:${verse?.verse || ""}`
    );
    if (!coordinate) fail(`Could not normalize KJV candidate reference: ${JSON.stringify(verse?.reference)}`);
    if (byCoordinate.has(coordinate)) fail(`Duplicate KJV reader coordinate: ${coordinate}`);
    const text = verseText(verse);
    const parts = coordinateParts(coordinate);
    const item = {
      coordinate,
      reference: String(verse.reference || `${verse.book} ${verse.chapter}:${verse.verse}`),
      book: String(verse.book || parts.book),
      chapter: Number(verse.chapter ?? parts.chapter),
      verse: Number(verse.verse ?? parts.verse),
      text,
      original: verse,
    };
    byCoordinate.set(coordinate, item);
    normalized.push(item);
  }
  if (normalized.length !== EXPECTED.readerCoordinates) {
    fail(`Locked KJV2006 candidate has ${normalized.length} coordinates; expected ${EXPECTED.readerCoordinates}.`);
  }
  return { verses: normalized, byCoordinate };
}

const KJV_SOURCE_OWNED_CORPORA = new Set(["hebrew", "greek-nt"]);

function canonicalTopLevelGroup(canonicalRoot, filePath) {
  const relative = path.relative(canonicalRoot, filePath);
  const firstSegment = relative.split(path.sep)[0];
  return String(firstSegment || "").toLowerCase();
}

function normalizedCorpusLabel(value) {
  const key = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (key === "hebrew" || key === "hebrew-ot" || key === "masoretic") return "hebrew";
  if (key === "greek-nt" || key === "greeknt" || key === "nt-greek") return "greek-nt";
  if (key === "lxx" || key === "greek-lxx" || key === "septuagint") return "lxx";
  return null;
}

function sourceTokenCorpus(token) {
  const tokenId = String(token?.id || token?.tokenId || "");
  const idPrefix = normalizedCorpusLabel(tokenId.split(":", 1)[0]);
  const declared = [token?.corpus, token?.source, token?.sourceCorpus]
    .map(normalizedCorpusLabel)
    .filter(Boolean);
  const identities = new Set([idPrefix, ...declared].filter(Boolean));
  if (identities.size > 1) {
    fail(`Conflicting source corpus identity on token ${tokenId || "(missing id)"}: ${JSON.stringify([...identities])}`);
  }
  return identities.size === 1 ? [...identities][0] : null;
}

function profileCanonicalFile(filePath) {
  const data = readJson(filePath);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    fail(`Canonical file is not an object map: ${filePath}`);
  }

  const entries = Object.entries(data);
  let sourceOwnedRecords = 0;
  let sourceTokens = 0;
  const corpora = new Set();

  for (const [, record] of entries) {
    const tokens = Array.isArray(record?.sourceTokens) ? record.sourceTokens : [];
    if (tokens.length) sourceOwnedRecords += 1;
    for (const token of tokens) {
      sourceTokens += 1;
      const corpus = sourceTokenCorpus(token);
      if (!corpus) {
        fail(
          `Could not determine explicit source corpus for token ${String(token?.id || token?.tokenId || "(missing id)")} in ${filePath}`
        );
      }
      corpora.add(corpus);
    }
  }

  return {
    filePath,
    data,
    records: entries.length,
    sourceOwnedRecords,
    sourceTokens,
    embeddedCorpora: [...corpora].sort(),
    embeddedCorpus: corpora.size === 1 ? [...corpora][0] : null,
  };
}

function inventoryCanonicalJsonFiles(canonicalRoot) {
  const allJsonFiles = listFilesRecursive(canonicalRoot)
    .filter((filePath) => filePath.toLowerCase().endsWith(".json"));
  const fileProfiles = new Map();
  const groups = new Map();

  for (const filePath of allJsonFiles) {
    const profile = profileCanonicalFile(filePath);
    fileProfiles.set(filePath, profile);
    const group = canonicalTopLevelGroup(canonicalRoot, filePath);
    if (!groups.has(group)) {
      groups.set(group, {
        group,
        files: [],
        records: 0,
        sourceOwnedRecords: 0,
        sourceTokens: 0,
        filesWithSourceTokens: 0,
        filesWithoutSourceTokens: 0,
      });
    }
    const row = groups.get(group);
    row.files.push(filePath);
    row.records += profile.records;
    row.sourceOwnedRecords += profile.sourceOwnedRecords;
    row.sourceTokens += profile.sourceTokens;
    if (profile.sourceTokens > 0) row.filesWithSourceTokens += 1;
    else row.filesWithoutSourceTokens += 1;
  }

  for (const row of groups.values()) row.files.sort((a, b) => a.localeCompare(b));

  // P05.12AI source ownership is explicit at the token/record level:
  // - include files containing Hebrew or Greek-NT source tokens;
  // - exclude zero-source-token parallel placeholders and all LXX files;
  // - count only records that actually own source tokens.
  // This reproduces AI's locked semantic inventory without treating a folder
  // name or a reader-view record as source ownership.
  const sourceOwnedFiles = [];
  const selectedFilesByEmbeddedCorpus = {};
  let sourceOwnedRecords = 0;
  let sourceTokens = 0;

  for (const filePath of allJsonFiles) {
    const profile = fileProfiles.get(filePath);
    if (profile.sourceTokens === 0) continue;
    if (!profile.embeddedCorpus) {
      fail(
        `Canonical file with source tokens has mixed corpus ownership: ${filePath}; ` +
        `found ${JSON.stringify(profile.embeddedCorpora)}`
      );
    }
    if (!KJV_SOURCE_OWNED_CORPORA.has(profile.embeddedCorpus)) continue;

    sourceOwnedFiles.push(filePath);
    sourceOwnedRecords += profile.sourceOwnedRecords;
    sourceTokens += profile.sourceTokens;
    selectedFilesByEmbeddedCorpus[profile.embeddedCorpus] =
      (selectedFilesByEmbeddedCorpus[profile.embeddedCorpus] || 0) + 1;
  }

  sourceOwnedFiles.sort((a, b) => a.localeCompare(b));
  const sourceOwnedSet = new Set(sourceOwnedFiles);
  const excludedFiles = allJsonFiles.filter((filePath) => !sourceOwnedSet.has(filePath));
  const selectedTopLevelGroups = [...new Set(
    sourceOwnedFiles.map((filePath) => canonicalTopLevelGroup(canonicalRoot, filePath))
  )].sort();

  const embeddedExact = Object.entries(EXPECTED.ownedFilesByEmbeddedCorpus).every(
    ([corpus, count]) => Number(selectedFilesByEmbeddedCorpus[corpus] || 0) === count
  ) && Object.keys(selectedFilesByEmbeddedCorpus).every((corpus) => KJV_SOURCE_OWNED_CORPORA.has(corpus));

  const exact =
    sourceOwnedFiles.length === EXPECTED.ownedFiles &&
    sourceOwnedRecords === EXPECTED.ownedRecords &&
    sourceTokens === EXPECTED.sourceTokens &&
    embeddedExact &&
    allJsonFiles.length === EXPECTED.allCanonicalJsonFiles &&
    excludedFiles.length === EXPECTED.excludedNonKjvCanonicalJsonFiles;

  return {
    allJsonFiles,
    sourceOwnedFiles,
    excludedFiles,
    fileProfiles,
    groups: [...groups.values()]
      .sort((a, b) => a.group.localeCompare(b.group))
      .map((row) => ({
        group: row.group,
        files: row.files.length,
        records: row.records,
        sourceOwnedRecords: row.sourceOwnedRecords,
        sourceTokens: row.sourceTokens,
        filesWithSourceTokens: row.filesWithSourceTokens,
        filesWithoutSourceTokens: row.filesWithoutSourceTokens,
        selectedKjvSourceOwnedFiles: row.files.filter((filePath) => sourceOwnedSet.has(filePath)).length,
      })),
    selectedTopLevelGroups,
    selectedFilesByEmbeddedCorpus: Object.fromEntries(
      Object.entries(selectedFilesByEmbeddedCorpus).sort((a, b) => a[0].localeCompare(b[0]))
    ),
    sourceOwnedRecords,
    sourceTokens,
    exact,
  };
}

function loadCanonicalStaging(canonicalRoot) {
  const inventory = inventoryCanonicalJsonFiles(canonicalRoot);
  const files = inventory.sourceOwnedFiles;
  if (!inventory.exact) {
    fail(
      `Retained P05.12AI KJV source-owned inventory mismatch after explicit token ownership discovery: ` +
      `${files.length} files, ${inventory.sourceOwnedRecords} source-owned records, ` +
      `${inventory.sourceTokens} source tokens, corpora=${JSON.stringify(inventory.selectedFilesByEmbeddedCorpus)}, ` +
      `selectedGroups=${JSON.stringify(inventory.selectedTopLevelGroups)}, ` +
      `allJsonFiles=${inventory.allJsonFiles.length}, excluded=${inventory.excludedFiles.length}, ` +
      `groups=${JSON.stringify(inventory.groups)}`
    );
  }

  const records = [];
  const sourceTokenById = new Map();
  const routesByTarget = new Map();
  let recordCount = 0;

  for (const filePath of files) {
    const profile = inventory.fileProfiles.get(filePath);
    const data = profile.data;
    const corpus = profile.embeddedCorpus;
    if (!corpus || !KJV_SOURCE_OWNED_CORPORA.has(corpus)) {
      fail(`Selected P05.12AI KJV-owned file has invalid embedded corpus: ${filePath}; found ${JSON.stringify(profile.embeddedCorpora)}`);
    }
    const filename = path.basename(filePath);
    const entries = Object.entries(data);

    for (const [objectKey, record] of entries) {
      const sourceTokens = Array.isArray(record?.sourceTokens) ? record.sourceTokens : [];
      if (!sourceTokens.length) continue;

      recordCount += 1;
      const recordInfo = { corpus, filename, filePath, objectKey, record };
      records.push(recordInfo);

      for (const token of sourceTokens) {
        const tokenId = String(token?.id || token?.tokenId || "");
        if (!tokenId) fail(`Source token without id in ${filename}:${objectKey}`);
        if (sourceTokenById.has(tokenId)) fail(`Duplicate source token id: ${tokenId}`);
        const tokenCorpus = sourceTokenCorpus(token);
        if (!tokenCorpus || tokenCorpus !== corpus || !KJV_SOURCE_OWNED_CORPORA.has(tokenCorpus)) {
          fail(`Unexpected source corpus for ${tokenId} in ${filename}:${objectKey}; file=${corpus}, token=${tokenCorpus}`);
        }
        const targetCoordinate = normalizeCoordinate(token?.canonicalReference);
        const sourceCoordinate = normalizeCoordinate(token?.sourceReference);
        if (!targetCoordinate || !sourceCoordinate) {
          fail(`Unparseable source/canonical route for ${tokenId}`);
        }
        const info = {
          tokenId,
          corpus: tokenCorpus,
          filename,
          objectKey,
          sourceCoordinate,
          targetCoordinate,
          versificationRuleId: token?.versificationRuleId ?? null,
          sourceSort: String(token?.sourceSort || ""),
        };
        sourceTokenById.set(tokenId, info);
        if (!routesByTarget.has(targetCoordinate)) routesByTarget.set(targetCoordinate, new Map());
        const bySource = routesByTarget.get(targetCoordinate);
        if (!bySource.has(sourceCoordinate)) bySource.set(sourceCoordinate, []);
        bySource.get(sourceCoordinate).push(info);
      }
    }
  }

  if (recordCount !== EXPECTED.ownedRecords) {
    fail(`Retained P05.12AI canonical tree has ${recordCount} source-owned records; expected ${EXPECTED.ownedRecords}.`);
  }
  if (sourceTokenById.size !== EXPECTED.sourceTokens) {
    fail(`Retained P05.12AI canonical tree has ${sourceTokenById.size} source tokens; expected ${EXPECTED.sourceTokens}.`);
  }

  for (const bySource of routesByTarget.values()) {
    for (const tokens of bySource.values()) {
      tokens.sort((a, b) => {
        const sortCompare = a.sourceSort.localeCompare(b.sourceSort);
        if (sortCompare) return sortCompare;
        return a.tokenId.localeCompare(b.tokenId);
      });
    }
  }

  return {
    files,
    records,
    sourceTokenById,
    routesByTarget,
    recordCount,
    inventory: {
      allJsonFiles: inventory.allJsonFiles.length,
      sourceOwnedFiles: inventory.sourceOwnedFiles.length,
      excludedNonKjvFiles: inventory.excludedFiles.length,
      selectedTopLevelGroups: inventory.selectedTopLevelGroups,
      ownedFilesByEmbeddedCorpus: inventory.selectedFilesByEmbeddedCorpus,
      sourceOwnedRecords: inventory.sourceOwnedRecords,
      sourceTokens: inventory.sourceTokens,
      topLevelGroups: inventory.groups,
      exact: inventory.exact,
    },
  };
}

function validateAiMaps(readerMapPath, sourceMapPath, readerCandidate, canonical) {
  const readerMap = readJson(readerMapPath);
  const sourceMap = readJson(sourceMapPath);
  if (!Array.isArray(readerMap) || readerMap.length !== EXPECTED.readerCoordinates) {
    fail("P05.12AI reader map is absent or has the wrong coordinate count.");
  }
  if (!Array.isArray(sourceMap) || sourceMap.length !== 31088) {
    fail("P05.12AI source map is absent or has the wrong source-coordinate count.");
  }

  const readerMapByCoordinate = new Map();
  for (const row of readerMap) {
    const coordinate = normalizeCoordinate(row.readerCoordinate);
    if (!coordinate) fail(`Invalid P05.12AI reader coordinate: ${row.readerCoordinate}`);
    readerMapByCoordinate.set(coordinate, row);
  }
  const candidateSet = new Set(readerCandidate.byCoordinate.keys());
  const readerSet = new Set(readerMapByCoordinate.keys());
  const candidateOnly = [...candidateSet].filter((x) => !readerSet.has(x));
  const mapOnly = [...readerSet].filter((x) => !candidateSet.has(x));
  if (candidateOnly.length || mapOnly.length) {
    fail(`KJV2006 and P05.12AI coordinate sets differ (candidate-only=${candidateOnly.length}, map-only=${mapOnly.length}).`);
  }

  let mapped = 0;
  let unsupported = 0;
  let edges = 0;
  let multiSource = 0;
  let readerTokenTotal = 0;
  const mismatches = [];

  for (const [coordinate, row] of readerMapByCoordinate) {
    const expectedSources = new Map(
      (row.sourceCoordinates || []).map((x) => [normalizeCoordinate(x.sourceCoordinate), Number(x.tokenCount)])
    );
    const actualSources = canonical.routesByTarget.get(coordinate) || new Map();
    if (row.readerOnly) unsupported += 1;
    else mapped += 1;
    edges += Number(row.sourceCoordinateCount || expectedSources.size);
    if (Number(row.sourceCoordinateCount || 0) > 1) multiSource += 1;

    const expectedPairs = [...expectedSources.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const actualPairs = [...actualSources.entries()]
      .map(([sourceCoordinate, tokens]) => [sourceCoordinate, tokens.length])
      .sort((a, b) => a[0].localeCompare(b[0]));
    readerTokenTotal += actualPairs.reduce((sum, [, count]) => sum + count, 0);
    if (JSON.stringify(expectedPairs) !== JSON.stringify(actualPairs)) {
      mismatches.push({ coordinate, expectedPairs, actualPairs });
    }
    if (row.readerOnly && actualPairs.length) {
      mismatches.push({ coordinate, error: "reader-only coordinate received source support" });
    }
  }

  let sourceEdges = 0;
  let multiTarget = 0;
  let sourceTokenTotal = 0;
  const sourceMapByCoordinate = new Map();
  for (const row of sourceMap) {
    const sourceCoordinate = normalizeCoordinate(row.source);
    sourceMapByCoordinate.set(sourceCoordinate, row);
    sourceEdges += Number(row.readerTargetCount || 0);
    if (Number(row.readerTargetCount || 0) > 1) multiTarget += 1;
    sourceTokenTotal += (row.readerTargets || []).reduce((sum, x) => sum + Number(x.tokenCount), 0);
  }

  const actualBySource = new Map();
  for (const [targetCoordinate, bySource] of canonical.routesByTarget) {
    for (const [sourceCoordinate, tokens] of bySource) {
      if (!actualBySource.has(sourceCoordinate)) actualBySource.set(sourceCoordinate, new Map());
      actualBySource.get(sourceCoordinate).set(targetCoordinate, tokens.length);
    }
  }
  for (const [sourceCoordinate, row] of sourceMapByCoordinate) {
    const expected = (row.readerTargets || [])
      .map((x) => [normalizeCoordinate(x.readerTarget), Number(x.tokenCount)])
      .sort((a, b) => a[0].localeCompare(b[0]));
    const actual = [...(actualBySource.get(sourceCoordinate) || new Map()).entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches.push({ sourceCoordinate, expected, actual });
    }
  }

  if (mismatches.length) {
    fail(`Retained canonical routes do not reproduce the P05.12AI maps (${mismatches.length} mismatches).`);
  }
  if (
    mapped !== EXPECTED.mappedReaderCoordinates ||
    unsupported !== EXPECTED.unsupportedReaderCoordinates ||
    edges !== EXPECTED.sourceToReaderEdges ||
    sourceEdges !== EXPECTED.sourceToReaderEdges ||
    multiSource !== EXPECTED.multiSourceReaderCoordinates ||
    multiTarget !== EXPECTED.multiTargetSourceCoordinates ||
    readerTokenTotal !== EXPECTED.sourceTokens ||
    sourceTokenTotal !== EXPECTED.sourceTokens
  ) {
    fail("P05.12AI map totals do not reproduce the locked counts.");
  }

  return { readerMap, readerMapByCoordinate, sourceMap, sourceMapByCoordinate };
}

function protectedPaths(repoRoot) {
  const relative = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/generatedKJV.integrity.json",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.ts",
    "app/data/scripture/generatedWEB.integrity.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    ".private/scripture/canonical",
    "app/data/bibleiq/canonical",
    ".private/alignment",
  ];
  return relative.map((rel) => ({ rel, full: path.join(repoRoot, ...rel.split("/")) }));
}

function snapshotProtectedState(repoRoot) {
  const items = [];
  for (const item of protectedPaths(repoRoot)) {
    if (!fs.existsSync(item.full)) {
      items.push({ path: item.rel, exists: false });
      continue;
    }
    const stat = fs.statSync(item.full);
    if (stat.isDirectory()) {
      const tree = hashTree(item.full);
      items.push({ path: item.rel, exists: true, type: "directory", files: tree.files, sha256: tree.treeSha256 });
    } else {
      items.push({ path: item.rel, exists: true, type: "file", bytes: stat.size, sha256: sha256File(item.full) });
    }
  }
  return { schemaVersion: "p0512aj-protected-state@1", items };
}

function compareProtectedStates(before, after) {
  const beforeMap = new Map((before?.items || []).map((x) => [x.path, x]));
  const afterMap = new Map((after?.items || []).map((x) => [x.path, x]));
  const paths = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const changes = [];
  for (const p of paths) {
    const a = beforeMap.get(p);
    const b = afterMap.get(p);
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ path: p, before: a, after: b });
  }
  return { identical: changes.length === 0, changes };
}

function gitInfo(repoRoot) {
  const cp = require("child_process");
  function run(args) {
    return cp.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  }
  return { branch: run(["branch", "--show-current"]), commit: run(["rev-parse", "HEAD"]) };
}

function requireTokenizer(repoRoot) {
  const tokenizerPath = path.join(repoRoot, "scripts", "canonical", "utils", "tokenize.js");
  if (!fs.existsSync(tokenizerPath)) fail(`Required canonical tokenizer not found: ${tokenizerPath}`);
  delete require.cache[require.resolve(tokenizerPath)];
  const moduleValue = require(tokenizerPath);
  if (typeof moduleValue?.tokenizeDisplayText !== "function") {
    fail("Canonical tokenizer does not export tokenizeDisplayText.");
  }
  return { tokenizerPath, tokenizerSha256: sha256File(tokenizerPath), tokenizeDisplayText: moduleValue.tokenizeDisplayText };
}

function lcsPairs(left, right) {
  const n = left.length;
  const m = right.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function compactSourceRoute(sourceCoordinate, tokenInfos) {
  const records = new Map();
  for (const token of tokenInfos) {
    const key = `${token.corpus}/${token.filename}/${token.objectKey}`;
    if (!records.has(key)) {
      records.set(key, { corpus: token.corpus, filename: token.filename, objectKey: token.objectKey, tokenCount: 0 });
    }
    records.get(key).tokenCount += 1;
  }
  return {
    sourceCoordinate,
    tokenCount: tokenInfos.length,
    sourceTokenIds: tokenInfos.map((x) => x.tokenId),
    records: [...records.values()].sort((a, b) =>
      `${a.corpus}/${a.filename}/${a.objectKey}`.localeCompare(`${b.corpus}/${b.filename}/${b.objectKey}`)
    ),
  };
}

function collectAllTranslationObservations(canonical, aiMaps) {
  const observationsByTarget = new Map();
  let serial = 0;

  for (const recordInfo of canonical.records) {
    const block = recordInfo.record?.translations?.kjv;
    if (!block || !Array.isArray(block.tokens)) continue;

    const recordSourceTargets = new Set(
      (recordInfo.record?.sourceTokens || [])
        .map((token) => canonical.sourceTokenById.get(String(token?.id || token?.tokenId || ""))?.targetCoordinate)
        .filter(Boolean)
    );

    for (const token of block.tokens) {
      const rawIds = Array.isArray(token?.alignedSourceTokenIds)
        ? token.alignedSourceTokenIds.map(String)
        : [];
      const idsByTarget = new Map();
      for (const id of rawIds) {
        const info = canonical.sourceTokenById.get(id);
        if (!info) continue;
        if (!idsByTarget.has(info.targetCoordinate)) idsByTarget.set(info.targetCoordinate, []);
        idsByTarget.get(info.targetCoordinate).push(id);
      }

      if (!idsByTarget.size && recordSourceTargets.size === 1) {
        idsByTarget.set([...recordSourceTargets][0], []);
      }

      for (const [targetCoordinate, idsRaw] of idsByTarget) {
        const ids = [...new Set(idsRaw)].sort();
        const readerRow = aiMaps.readerMapByCoordinate.get(targetCoordinate);
        if (!readerRow || readerRow.readerOnly) continue;
        const sourceOrder = new Map(
          (readerRow.sourceCoordinates || []).map((x, index) => [normalizeCoordinate(x.sourceCoordinate), index])
        );
        const sourceCoordinate = ids.length
          ? canonical.sourceTokenById.get(ids[0])?.sourceCoordinate
          : normalizeCoordinate(recordInfo.record?.sourceTokens?.[0]?.sourceReference) || "";
        const observation = {
          serial: serial += 1,
          normalized: String(token?.normalized || ""),
          text: String(token?.text || ""),
          alignedSourceTokenIds: ids,
          sourceCoordinate,
          sourceRank: sourceOrder.get(sourceCoordinate) ?? Number.MAX_SAFE_INTEGER,
          recordKey: `${recordInfo.corpus}/${recordInfo.filename}/${recordInfo.objectKey}`,
          oldIndex: Number(token?.index || 0),
          alignmentStatus: token?.alignmentStatus,
          alignmentReason: token?.alignmentReason,
          alignmentConfidence: token?.alignmentConfidence ?? token?.confidence,
          alignmentMethod: token?.alignmentMethod ?? token?.method,
          alignmentKind: token?.alignmentKind,
        };
        if (!observationsByTarget.has(targetCoordinate)) observationsByTarget.set(targetCoordinate, []);
        observationsByTarget.get(targetCoordinate).push(observation);
      }
    }
  }

  for (const observations of observationsByTarget.values()) {
    observations.sort((a, b) =>
      a.sourceRank - b.sourceRank ||
      a.recordKey.localeCompare(b.recordKey) ||
      a.oldIndex - b.oldIndex ||
      a.serial - b.serial
    );
  }
  return observationsByTarget;
}

function migrateTokens({ candidateTokens, observations, readerOnly, routeTokenIds }) {
  const output = candidateTokens.map((token) => ({
    ...token,
    alignedSourceTokenIds: [],
    alignmentStatus: readerOnly ? "unavailable" : "unaligned",
    ...(readerOnly ? { alignmentReason: "reader-only-no-source-witness" } : {}),
    tappable: false,
  }));

  if (readerOnly || !observations.length) {
    return {
      tokens: output,
      diagnostics: {
        candidateTokens: output.length,
        observations: observations.length,
        matchedObservations: 0,
        unmatchedObservations: observations.length,
        alignedCandidateTokens: 0,
      },
    };
  }

  const filtered = observations.filter((x) => x.normalized);
  const pairs = lcsPairs(
    filtered.map((x) => x.normalized),
    output.map((x) => String(x.normalized || ""))
  );
  const matchedObservationIndexes = new Set();

  for (const [observationIndex, candidateIndex] of pairs) {
    const observation = filtered[observationIndex];
    const candidate = output[candidateIndex];
    matchedObservationIndexes.add(observationIndex);
    const ids = observation.alignedSourceTokenIds.filter((id) => routeTokenIds.has(id));
    if (ids.length) {
      candidate.alignedSourceTokenIds = [...new Set([...candidate.alignedSourceTokenIds, ...ids])].sort();
      candidate.alignmentStatus = "aligned";
      candidate.alignmentMethod = "p0512aj-exact-normalized-sequence-migration";
      candidate.migrationSource = {
        sourceCoordinate: observation.sourceCoordinate,
        recordKey: observation.recordKey,
        oldTokenIndex: observation.oldIndex,
      };
      if (observation.alignmentConfidence) candidate.alignmentConfidence = observation.alignmentConfidence;
      if (observation.alignmentKind) candidate.alignmentKind = observation.alignmentKind;
      candidate.tappable = true;
    } else if (observation.alignmentStatus === "ignored") {
      candidate.alignmentStatus = "ignored";
      if (observation.alignmentReason) candidate.alignmentReason = observation.alignmentReason;
    }
  }

  const alignedCandidateTokens = output.filter((x) => x.alignedSourceTokenIds.length > 0).length;
  return {
    tokens: output,
    diagnostics: {
      candidateTokens: output.length,
      observations: filtered.length,
      matchedObservations: matchedObservationIndexes.size,
      unmatchedObservations: filtered.length - matchedObservationIndexes.size,
      alignedCandidateTokens,
    },
  };
}

function buildBlocks({ readerCandidate, canonical, aiMaps, tokenizeDisplayText, kjvCandidateSha256 }) {
  const blocks = [];
  const topology = {
    multiTargetSources: aiMaps.sourceMap
      .filter((x) => Number(x.readerTargetCount || 0) > 1)
      .map((x) => ({
        sourceCoordinate: normalizeCoordinate(x.source),
        readerTargets: (x.readerTargets || []).map((t) => ({
          readerCoordinate: normalizeCoordinate(t.readerTarget), tokenCount: Number(t.tokenCount),
        })),
      })),
    multiSourceReaders: aiMaps.readerMap
      .filter((x) => Number(x.sourceCoordinateCount || 0) > 1)
      .map((x) => ({
        readerCoordinate: normalizeCoordinate(x.readerCoordinate),
        sourceCoordinates: (x.sourceCoordinates || []).map((s) => ({
          sourceCoordinate: normalizeCoordinate(s.sourceCoordinate), tokenCount: Number(s.tokenCount),
        })),
      })),
    unsupportedReaders: aiMaps.readerMap
      .filter((x) => Boolean(x.readerOnly))
      .map((x) => normalizeCoordinate(x.readerCoordinate)),
  };

  const observationsByTarget = collectAllTranslationObservations(canonical, aiMaps);

  const totals = {
    blocks: 0,
    supportedBlocks: 0,
    readerOnlyFailClosedBlocks: 0,
    visibleTokens: 0,
    alignedVisibleTokens: 0,
    tappableVisibleTokens: 0,
    routedSourceTokens: 0,
    sourceRouteEdges: 0,
    exactMatchedObservations: 0,
    unresolvedObservations: 0,
  };

  for (const readerVerse of readerCandidate.verses) {
    const coordinate = readerVerse.coordinate;
    const readerRow = aiMaps.readerMapByCoordinate.get(coordinate);
    if (!readerRow) fail(`P05.12AI reader map missing ${coordinate}`);
    const readerOnly = Boolean(readerRow.readerOnly);
    const bySource = canonical.routesByTarget.get(coordinate) || new Map();
    const sourceRoutes = [...bySource.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sourceCoordinate, tokenInfos]) => compactSourceRoute(sourceCoordinate, tokenInfos));
    const routeTokenIds = new Set(sourceRoutes.flatMap((x) => x.sourceTokenIds));
    const candidateTokens = tokenizeDisplayText(readerVerse.text);
    const observations = observationsByTarget.get(coordinate) || [];
    const migrated = migrateTokens({ candidateTokens, observations, readerOnly, routeTokenIds });
    const sourceCoordinateCount = sourceRoutes.length;
    const sourceHasMultipleTargets = sourceRoutes.some((route) => {
      const row = aiMaps.sourceMapByCoordinate.get(route.sourceCoordinate);
      return Number(row?.readerTargetCount || 0) > 1;
    });

    const block = {
      schemaVersion: "p0512aj-kjv-translation-block@1",
      readerCoordinate: coordinate,
      reference: readerVerse.reference,
      book: readerVerse.book,
      chapter: readerVerse.chapter,
      verse: readerVerse.verse,
      edition: {
        id: "kjv2006-standardized-1769",
        candidateSha256: kjvCandidateSha256,
      },
      routeStatus: readerOnly ? "reader-only-fail-closed" : "source-supported",
      readerOnly,
      failClosed: readerOnly,
      topology: {
        sourceCoordinateCount,
        manySourceToOneReader: sourceCoordinateCount > 1,
        oneSourceToManyReader: sourceHasMultipleTargets,
      },
      sourceCoordinates: sourceRoutes.map((x) => x.sourceCoordinate),
      sourceRoutes,
      translation: {
        id: "kjv",
        text: readerVerse.text,
        alignmentText: readerVerse.text,
        tokens: migrated.tokens,
      },
      migration: {
        policy: "exact-normalized-sequence-only; unresolved tokens fail closed",
        diagnostics: migrated.diagnostics,
      },
    };
    blocks.push(block);

    totals.blocks += 1;
    if (readerOnly) totals.readerOnlyFailClosedBlocks += 1;
    else totals.supportedBlocks += 1;
    totals.visibleTokens += migrated.tokens.length;
    totals.alignedVisibleTokens += migrated.tokens.filter((x) => x.alignedSourceTokenIds.length > 0).length;
    totals.tappableVisibleTokens += migrated.tokens.filter((x) => x.tappable).length;
    totals.routedSourceTokens += sourceRoutes.reduce((sum, x) => sum + x.tokenCount, 0);
    totals.sourceRouteEdges += sourceRoutes.length;
    totals.exactMatchedObservations += migrated.diagnostics.matchedObservations;
    totals.unresolvedObservations += migrated.diagnostics.unmatchedObservations;
  }

  return { blocks, topology, totals };
}

function validateBuiltBlocks({ blocks, readerCandidate, canonical, aiMaps }) {
  const errors = [];
  const blockByCoordinate = new Map();
  let supported = 0;
  let readerOnly = 0;
  let routedTokens = 0;
  let routeEdges = 0;
  let multiSource = 0;
  const seenSourceTokenRoutes = new Map();
  const observedTargetsBySource = new Map();

  for (const block of blocks) {
    if (blockByCoordinate.has(block.readerCoordinate)) errors.push(`duplicate block ${block.readerCoordinate}`);
    blockByCoordinate.set(block.readerCoordinate, block);
    const candidate = readerCandidate.byCoordinate.get(block.readerCoordinate);
    if (!candidate) errors.push(`block outside KJV2006 ${block.readerCoordinate}`);
    if (candidate && block.translation?.text !== candidate.text) errors.push(`visible text mismatch ${block.readerCoordinate}`);
    if (block.readerOnly) readerOnly += 1; else supported += 1;
    if (block.sourceRoutes.length > 1) multiSource += 1;
    routeEdges += block.sourceRoutes.length;
    const routeIds = new Set();
    for (const route of block.sourceRoutes) {
      routedTokens += route.sourceTokenIds.length;
      if (!observedTargetsBySource.has(route.sourceCoordinate)) {
        observedTargetsBySource.set(route.sourceCoordinate, new Set());
      }
      observedTargetsBySource.get(route.sourceCoordinate).add(block.readerCoordinate);
      for (const id of route.sourceTokenIds) {
        routeIds.add(id);
        if (!seenSourceTokenRoutes.has(id)) seenSourceTokenRoutes.set(id, []);
        seenSourceTokenRoutes.get(id).push(block.readerCoordinate);
        const info = canonical.sourceTokenById.get(id);
        if (!info) errors.push(`unknown routed source token ${id}`);
        else if (info.targetCoordinate !== block.readerCoordinate) {
          errors.push(`route target mismatch ${id}: ${info.targetCoordinate} != ${block.readerCoordinate}`);
        }
      }
    }
    for (const token of block.translation?.tokens || []) {
      for (const id of token.alignedSourceTokenIds || []) {
        if (!canonical.sourceTokenById.has(id)) errors.push(`unknown aligned source token ${id}`);
        if (!routeIds.has(id)) errors.push(`cross-verse alignment leak ${block.readerCoordinate}:${id}`);
      }
      if (token.tappable !== ((token.alignedSourceTokenIds || []).length > 0)) {
        errors.push(`tappability classification mismatch ${block.readerCoordinate}:${token.index}`);
      }
    }
    if (block.readerOnly) {
      if (block.sourceRoutes.length) errors.push(`reader-only block has source route ${block.readerCoordinate}`);
      if ((block.translation?.tokens || []).some((t) => (t.alignedSourceTokenIds || []).length)) {
        errors.push(`reader-only block has aligned token ${block.readerCoordinate}`);
      }
      if (!block.failClosed) errors.push(`reader-only block not fail closed ${block.readerCoordinate}`);
    }
  }

  const duplicateSourceRoutes = [...seenSourceTokenRoutes.entries()].filter(([, targets]) => targets.length !== 1);
  if (duplicateSourceRoutes.length) errors.push(`${duplicateSourceRoutes.length} source tokens routed other than exactly once`);
  const missingSourceRoutes = [...canonical.sourceTokenById.keys()].filter((id) => !seenSourceTokenRoutes.has(id));
  if (missingSourceRoutes.length) errors.push(`${missingSourceRoutes.length} source tokens absent from blocks`);

  const expectedTargetsBySource = new Map(
    aiMaps.sourceMap.map((row) => [
      normalizeCoordinate(row.source),
      new Set((row.readerTargets || []).map((target) => normalizeCoordinate(target.readerTarget))),
    ])
  );
  for (const [sourceCoordinate, expectedTargets] of expectedTargetsBySource) {
    const observedTargets = observedTargetsBySource.get(sourceCoordinate) || new Set();
    const expected = [...expectedTargets].sort();
    const observed = [...observedTargets].sort();
    if (JSON.stringify(expected) !== JSON.stringify(observed)) {
      errors.push(`explicit source topology mismatch ${sourceCoordinate}`);
    }
  }
  const multiTargetSourceCoordinates = [...observedTargetsBySource.values()].filter(
    (targets) => targets.size > 1
  ).length;

  const counts = {
    blocks: blocks.length,
    supportedBlocks: supported,
    readerOnlyFailClosedBlocks: readerOnly,
    routedSourceTokens: routedTokens,
    sourceRouteEdges: routeEdges,
    multiSourceReaderCoordinates: multiSource,
    multiTargetSourceCoordinates,
    uniqueRoutedSourceTokens: seenSourceTokenRoutes.size,
  };

  const gates = {
    kjv2006CoordinatesExact: blocks.length === EXPECTED.readerCoordinates && blockByCoordinate.size === EXPECTED.readerCoordinates,
    kjv2006VisibleTextExact: !errors.some((x) => x.startsWith("visible text mismatch")),
    supportedReaderCoordinatesExact: supported === EXPECTED.mappedReaderCoordinates,
    readerOnlyFailClosedCoordinatesExact: readerOnly === EXPECTED.unsupportedReaderCoordinates,
    allSourceTokensRoutedExactlyOnce:
      routedTokens === EXPECTED.sourceTokens &&
      seenSourceTokenRoutes.size === EXPECTED.sourceTokens &&
      duplicateSourceRoutes.length === 0 &&
      missingSourceRoutes.length === 0,
    sourceRouteEdgesExact: routeEdges === EXPECTED.sourceToReaderEdges,
    oneSourceToManyTopologyExplicit:
      multiTargetSourceCoordinates === EXPECTED.multiTargetSourceCoordinates &&
      !errors.some((x) => x.startsWith("explicit source topology mismatch")),
    manySourceToOneTopologyExplicit: multiSource === EXPECTED.multiSourceReaderCoordinates,
    noRouteOutsideKjv2006: !errors.some((x) => x.startsWith("block outside KJV2006")),
    p0510SourceOwnershipGate:
      !errors.some((x) => x.includes("unknown routed source token") || x.includes("route target mismatch")),
    p0511AlignedRouteGate:
      !errors.some((x) => x.includes("unknown aligned source token") || x.includes("cross-verse alignment leak")),
    p0511ReaderOnlyFailClosedGate:
      !errors.some((x) => x.includes("reader-only block")),
    p0511TappabilityClassificationGate:
      !errors.some((x) => x.includes("tappability classification mismatch")),
  };
  return { counts, gates, errors };
}

module.exports = {
  EXPECTED,
  fail,
  readJson,
  writeJson,
  ensureDir,
  sha256File,
  hashTree,
  listFilesRecursive,
  normalizeCoordinate,
  coordinateParts,
  parseArgs,
  relativeFromRoot,
  findP0512AiEvidence,
  loadReaderCandidate,
  inventoryCanonicalJsonFiles,
  loadCanonicalStaging,
  validateAiMaps,
  snapshotProtectedState,
  compareProtectedStates,
  gitInfo,
  requireTokenizer,
  buildBlocks,
  validateBuiltBlocks,
};
