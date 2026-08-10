#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const PHASE = "P08-P07-FINAL-RUNTIME-INTEGRATION";
const DEFAULT_REPO = String.raw`C:\Users\CreatorStudio\ai-bible-app`;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(name);
}
function fail(message) {
  throw new Error(`[${PHASE}] ${message}`);
}
function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function existsDirectory(dir) {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}
function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function readText(file) {
  if (!existsFile(file)) fail(`Required file missing: ${file}`);
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}
function readJson(file) {
  return JSON.parse(readText(file));
}
function writeText(file, value) {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, String(value), "utf8");
}
function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}
function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function sha256Text(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function relativePath(root, target) {
  return path.relative(root, target).replace(/\\/g, "/");
}
function walkFiles(root) {
  if (!existsDirectory(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}
function fingerprint(target) {
  if (!fs.existsSync(target)) {
    return { exists: false, type: null, sha256: null, bytes: 0, files: 0 };
  }
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return {
      exists: true,
      type: "file",
      sha256: sha256File(target),
      bytes: stat.size,
      files: 1,
    };
  }
  const files = walkFiles(target);
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    bytes += fs.statSync(file).size;
    hash.update(relativePath(target, file));
    hash.update("\0");
    hash.update(sha256File(file));
    hash.update("\n");
  }
  return {
    exists: true,
    type: "directory",
    sha256: hash.digest("hex"),
    bytes,
    files: files.length,
  };
}
function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}
function atomicCopy(source, destination) {
  ensureDirectory(path.dirname(destination));
  const temp = `${destination}.tmp-${process.pid}`;
  fs.copyFileSync(source, temp);
  fs.renameSync(temp, destination);
}
function hashEntityId(entityId) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < entityId.length; i += 1) {
    hash ^= entityId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function shardIdForEntity(entityId, shardCount) {
  return (hashEntityId(entityId) % shardCount).toString(16).padStart(2, "0");
}
function parseCitation(value) {
  if (typeof value === "string") {
    const clean = value.trim();

    let match = clean.match(/^(.+)\.(\d+)\.(\d+)$/u);
    if (!match) match = clean.match(/^(.+?)\s+(\d+):(\d+)$/u);

    if (match) {
      return {
        reference: `${match[1]} ${Number(match[2])}:${Number(match[3])}`,
        book: match[1],
        chapter: Number(match[2]),
        verse: Number(match[3]),
      };
    }

    return { reference: clean };
  }

  if (value && typeof value === "object") {
    const book = typeof value.book === "string" ? value.book : undefined;
    const chapter = Number.isFinite(value.chapter) ? Number(value.chapter) : undefined;
    const verse = Number.isFinite(value.verse) ? Number(value.verse) : undefined;
    const reference =
      typeof value.reference === "string" && value.reference.trim()
        ? value.reference.trim()
        : book && chapter && verse
          ? `${book} ${chapter}:${verse}`
          : "";

    if (!reference) return null;

    return {
      reference,
      book,
      chapter,
      verse,
      evidenceId:
        typeof value.evidenceId === "string"
          ? value.evidenceId
          : undefined,
      kind:
        typeof value.kind === "string"
          ? value.kind
          : undefined,
    };
  }

  return null;
}
function corpusFromEntity(entityId, record) {
  if (record?.corpus === "hebrew" || record?.corpus === "greek-nt" || record?.corpus === "lxx") {
    return record.corpus;
  }
  if (/^word:hebrew:H\d+$/u.test(entityId)) return "hebrew";
  if (/^word:greek-nt:G\d+$/u.test(entityId)) return "greek-nt";
  if (/^word:lxx:L\d+$/u.test(entityId)) return "lxx";
  fail(`Cannot determine corpus: ${entityId}`);
}
function normalizeRuntimeRecord(entityId, source) {
  const corpus = corpusFromEntity(entityId, source);
  const citations = (Array.isArray(source.citations) ? source.citations : [])
    .map(parseCitation)
    .filter(Boolean);

  if (source.status === "approved") {
    if (typeof source.explanation !== "string" || !source.explanation.trim()) {
      fail(`Approved P07 record has no explanation: ${entityId}`);
    }

    return {
      entityId,
      corpus,
      status: "approved",
      sourceKind: String(source.sourceKind || "unknown"),
      explanation: source.explanation.trim(),
      citations,
      explanationChecksum: sha256Text(source.explanation.trim()),
      viewChecksum:
        typeof source.viewChecksum === "string"
          ? source.viewChecksum
          : undefined,
      sourceRecordChecksum:
        typeof source.sourceRecordChecksum === "string"
          ? source.sourceRecordChecksum
          : undefined,
      independentReviewerApproved:
        source.independentReviewerApproved === true,
      policy: null,
    };
  }

  if (source.status === "no-explanation") {
    if (source.explanation && String(source.explanation).trim()) {
      fail(`No-explanation P07 record contains prose: ${entityId}`);
    }

    return {
      entityId,
      corpus,
      status: "no-explanation",
      sourceKind: String(source.sourceKind || "unknown"),
      citations: [],
      sourceRecordChecksum:
        typeof source.sourceRecordChecksum === "string"
          ? source.sourceRecordChecksum
          : undefined,
      policy:
        source.policy && typeof source.policy === "object"
          ? source.policy
          : null,
    };
  }

  fail(`Unsupported P07 runtime status for ${entityId}: ${source.status}`);
}
function buildShards(sourceRuntime, destination, shardCount) {
  fs.rmSync(destination, { recursive: true, force: true });
  ensureDirectory(destination);

  const buckets = {
    hebrew: new Map(),
    "greek-nt": new Map(),
    lxx: new Map(),
  };

  const counts = {
    hebrew: { entities: 0, approved: 0, noExplanation: 0 },
    "greek-nt": { entities: 0, approved: 0, noExplanation: 0 },
    lxx: { entities: 0, approved: 0, noExplanation: 0 },
  };

  for (const entityId of sourceRuntime.entityOrder) {
    const source = sourceRuntime.records[entityId];
    if (!source) fail(`P07 source runtime missing record: ${entityId}`);

    const record = normalizeRuntimeRecord(entityId, source);
    const shardId = shardIdForEntity(entityId, shardCount);
    let bucket = buckets[record.corpus].get(shardId);

    if (!bucket) {
      bucket = {};
      buckets[record.corpus].set(shardId, bucket);
    }

    if (bucket[entityId]) fail(`Duplicate runtime entity: ${entityId}`);
    bucket[entityId] = record;

    counts[record.corpus].entities += 1;
    if (record.status === "approved") counts[record.corpus].approved += 1;
    else counts[record.corpus].noExplanation += 1;
  }

  const manifestCorpora = {};

  for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
    const corpusDir = path.join(destination, corpus);
    ensureDirectory(corpusDir);
    const shardMeta = {};

    for (const [shardId, entities] of [...buckets[corpus].entries()].sort()) {
      const approved = Object.values(entities).filter(row => row.status === "approved").length;
      const noExplanation = Object.values(entities).filter(row => row.status === "no-explanation").length;
      const document = {
        version: 1,
        schemaVersion: "p07-emet-final-runtime@1.0.0",
        corpus,
        shard: shardId,
        entities,
      };
      const relative = `${corpus}/${shardId}.json`;
      const file = path.join(destination, corpus, `${shardId}.json`);
      writeJson(file, document);

      shardMeta[shardId] = {
        file: relative,
        entities: Object.keys(entities).length,
        approved,
        noExplanation,
        bytes: fs.statSync(file).size,
        checksum: sha256File(file),
      };
    }

    manifestCorpora[corpus] = {
      ...counts[corpus],
      shards: shardMeta,
    };
  }

  const totals = {
    entities:
      counts.hebrew.entities +
      counts["greek-nt"].entities +
      counts.lxx.entities,
    approved:
      counts.hebrew.approved +
      counts["greek-nt"].approved +
      counts.lxx.approved,
    noExplanation:
      counts.hebrew.noExplanation +
      counts["greek-nt"].noExplanation +
      counts.lxx.noExplanation,
    shards:
      Object.keys(manifestCorpora.hebrew.shards).length +
      Object.keys(manifestCorpora["greek-nt"].shards).length +
      Object.keys(manifestCorpora.lxx.shards).length,
    byCorpus: {
      hebrew: counts.hebrew.entities,
      "greek-nt": counts["greek-nt"].entities,
      lxx: counts.lxx.entities,
    },
  };

  const core = {
    version: 1,
    schemaVersion: "p07-emet-final-runtime@1.0.0",
    shardAlgorithm: "fnv1a-32-mod",
    shardCount,
    source: {
      runtimeCachePath:
        "public/data/bibleiq/word-study/emet-explanations.json",
      runtimeCacheSha256: sha256File(sourceRuntime.__sourceFile),
      runtimeSchemaVersion: sourceRuntime.schemaVersion,
      runtimeChecksum: sourceRuntime.checksum,
    },
    corpora: manifestCorpora,
    totals,
  };

  const manifest = { ...core, checksum: sha256Json(core) };
  writeJson(path.join(destination, "manifest.json"), manifest);

  return manifest;
}
function runBuild(reportRoot) {
  const result = cp.spawnSync(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build"]
      : ["run", "build"],
    {
      cwd: repositoryRoot,
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 1024,
    },
  );

  writeText(path.join(reportRoot, "production-build.stdout.log"), result.stdout || "");
  writeText(path.join(reportRoot, "production-build.stderr.log"), result.stderr || "");

  return result;
}
function writeManifest(root) {
  const manifestFile = path.join(root, "MANIFEST.sha256");
  const files = walkFiles(root).filter(file => path.resolve(file) !== path.resolve(manifestFile));
  writeText(
    manifestFile,
    files.map(file => `${sha256File(file)}  ${relativePath(root, file)}`).join("\n") + "\n",
  );
  return files.length;
}
function createZip(sourceRoot, zipFile) {
  if (existsFile(zipFile)) fs.rmSync(zipFile, { force: true });

  const result =
    process.platform === "win32"
      ? cp.spawnSync(
          "tar.exe",
          ["-a", "-c", "-f", zipFile, "-C", path.dirname(sourceRoot), path.basename(sourceRoot)],
          { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
        )
      : cp.spawnSync(
          "zip",
          ["-q", "-r", zipFile, path.basename(sourceRoot)],
          { cwd: path.dirname(sourceRoot), encoding: "utf8" },
        );

  if (result.status !== 0 || !existsFile(zipFile)) {
    fail(`ZIP creation failed: ${result.stderr || result.stdout}`);
  }
}

const repositoryRoot = path.resolve(arg("--repository-root", DEFAULT_REPO));
const packageRoot = path.resolve(arg(
  "--package-root",
  path.join(repositoryRoot, "scripts", "p08", "p07-final-runtime-integration"),
));
const accepted = flag("--accept-integration");

const reportRoot = path.join(
  repositoryRoot,
  ".private",
  "reports",
  "P08-P07-FINAL-RUNTIME-INTEGRATION",
  "27184-v1",
);
const stagingRoot = path.join(
  repositoryRoot,
  ".private",
  "staging",
  "P08-P07-FINAL-RUNTIME-INTEGRATION",
  "27184-v1",
);

const targetEngine = path.join(repositoryRoot, "app", "data", "lexicon", "BibleIQEngine.ts");
const targetTypes = path.join(repositoryRoot, "app", "data", "lexicon", "BibleIQTypes.ts");
const targetStore = path.join(repositoryRoot, "app", "data", "lexicon", "EmetFinalStore.ts");
const wordStudySheet = path.join(repositoryRoot, "app", "components", "WordStudySheet.tsx");
const sourceRuntime = path.join(
  repositoryRoot,
  "public", "data", "bibleiq", "word-study", "emet-explanations.json",
);
const targetRuntimeDir = path.join(
  repositoryRoot,
  "public", "data", "bibleiq", "word-study", "emet-final",
);

let mutationStarted = false;
let backupRoot = null;

function rollback() {
  if (!mutationStarted || !backupRoot) return;

  try {
    const engineBackup = path.join(backupRoot, "BibleIQEngine.ts");
    const typesBackup = path.join(backupRoot, "BibleIQTypes.ts");
    const storeBackup = path.join(backupRoot, "EmetFinalStore.ts");
    const runtimeBackup = path.join(backupRoot, "emet-final");

    if (existsFile(engineBackup)) atomicCopy(engineBackup, targetEngine);
    if (existsFile(typesBackup)) atomicCopy(typesBackup, targetTypes);

    if (existsFile(storeBackup)) atomicCopy(storeBackup, targetStore);
    else fs.rmSync(targetStore, { force: true });

    fs.rmSync(targetRuntimeDir, { recursive: true, force: true });
    if (existsDirectory(runtimeBackup)) copyTree(runtimeBackup, targetRuntimeDir);
  } catch (error) {
    writeText(
      path.join(reportRoot, "ROLLBACK-ERROR.txt"),
      `${error?.stack || String(error)}\n`,
    );
  }
}

function packageFailure(error) {
  rollback();

  try {
    ensureDirectory(reportRoot);
    writeText(path.join(reportRoot, "ERROR.txt"), `${error?.stack || String(error)}\n`);
    writeJson(path.join(reportRoot, "FAILURE.json"), {
      milestone: PHASE,
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
      mutationStarted,
      rollbackAttempted: mutationStarted,
      aiApiCallsMade: 0,
      productionCacheSourceModified: false,
    });
    writeJson(path.join(reportRoot, "verdict.json"), {
      verdict: "P08_P07_FINAL_RUNTIME_INTEGRATION_FAILED_CLOSED",
      nextSingleStep:
        "Upload this failure ZIP. The integration attempted rollback if source/runtime mutation had begun.",
    });

    const manifestEntries = writeManifest(reportRoot);
    const zipFile = path.join(
      path.dirname(reportRoot),
      "EMETSEES-P08-P07-FINAL-RUNTIME-INTEGRATION-FAILURE-27184-v1.zip",
    );
    createZip(reportRoot, zipFile);

    console.error("");
    console.error("Automatic failure ZIP created.");
    console.error(`ZIP: ${zipFile}`);
    console.error(`SHA256: ${sha256File(zipFile)}`);
    console.error(`Manifest entries: ${manifestEntries}`);
  } catch (packagingError) {
    console.error("Failure ZIP packaging also failed.");
    console.error(packagingError?.stack || String(packagingError));
    console.error(`Report folder: ${reportRoot}`);
  }
}

async function main() {
  console.log("");
  console.log("EMETSEES P08 — P07 final runtime integration");
  console.log("Purpose: wire Word Overview Across Scripture to final P07 cache");
  console.log("AI/API calls: ZERO");
  console.log("P07 source cache rewrite: ZERO");
  console.log("Transactional rollback: ENABLED");
  console.log("");

  if (!accepted) fail("Explicit integration acceptance flag is required.");

  ensureDirectory(reportRoot);
  ensureDirectory(stagingRoot);

  for (const stale of ["ERROR.txt", "FAILURE.json", "ROLLBACK-ERROR.txt"]) {
    fs.rmSync(path.join(reportRoot, stale), { force: true });
  }

  const expectedSources = {
    [targetEngine]: "e10c885a037854d3eefd4f50ea518985dbae2ea6761ea4830e3ebc8863d5777d",
    [targetTypes]: "e7424f9649cf9e99948a8669bdc3cf59a21e23c9b21a2dfb059cd5aadb24d7ed",
    [wordStudySheet]: "0e9c9c7d9d407c751afc0e9f0ab716998073ea1e978513605e9b34c98fb538f8",
    [sourceRuntime]: "3d8e36c865a7d5b6b36d894d509cd9c3d29f4a7849d48e9656c8c64e74bb9e0a",
  };

  for (const [file, expected] of Object.entries(expectedSources)) {
    if (!existsFile(file)) fail(`Required current source missing: ${file}`);
    const actual = sha256File(file);
    if (actual !== expected) {
      fail(
        `Current source changed since the diagnostic.\n` +
        `File: ${relativePath(repositoryRoot, file)}\n` +
        `Expected: ${expected}\nActual:   ${actual}`,
      );
    }
  }

  const packageManifest = path.join(packageRoot, "PACKAGE.sha256");
  for (const line of readText(packageManifest).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const match = line.match(/^([0-9a-fA-F]{64})  (.+)$/u);
    if (!match) fail(`Invalid package manifest line: ${line}`);
    const file = path.join(packageRoot, ...match[2].split("/"));
    if (!existsFile(file) || sha256File(file) !== match[1].toLowerCase()) {
      fail(`Package file checksum mismatch: ${match[2]}`);
    }
  }

  const runtime = readJson(sourceRuntime);
  runtime.__sourceFile = sourceRuntime;

  const runtimeCore = { ...runtime };
  delete runtimeCore.checksum;
  delete runtimeCore.__sourceFile;

  if (
    runtime.schemaVersion !== "p07-runtime-emet-explanations@1.0.0" ||
    runtime.activeEntityCount !== 27184 ||
    runtime.approvedExplanationCount !== 26896 ||
    runtime.noExplanationPolicyCount !== 288 ||
    !Array.isArray(runtime.entityOrder) ||
    runtime.entityOrder.length !== 27184 ||
    Object.keys(runtime.records || {}).length !== 27184 ||
    runtime.checksum !== sha256Json(runtimeCore)
  ) {
    fail("Promoted P07 runtime source failed provenance/count validation.");
  }

  const protectedPaths = [
    ".private/entity/build/P01",
    ".private/entity/build/P02",
    ".private/entity/build/P03",
    ".private/entity/build/P04",
    ".private/entity/build/P041",
    ".private/entity/build/P042",
    ".private/entity/build/P07",
    ".private/state/P07-COMPLETION/final-cache-complete.json",
    "public/data/bibleiq/word-study/emet-explanations.json",
    "app/components/WordStudySheet.tsx",
    "app/data/bibleiq/canonical",
  ];

  const protectedBefore = protectedPaths.map(relative => ({
    path: relative,
    ...fingerprint(path.join(repositoryRoot, ...relative.split("/"))),
  }));
  writeJson(path.join(reportRoot, "protected-state-before.json"), protectedBefore);

  const stagedRuntime = path.join(stagingRoot, "emet-final");
  const manifest = buildShards(runtime, stagedRuntime, 64);

  if (
    manifest.totals.entities !== 27184 ||
    manifest.totals.approved !== 26896 ||
    manifest.totals.noExplanation !== 288 ||
    manifest.totals.byCorpus.hebrew !== 8634 ||
    manifest.totals.byCorpus["greek-nt"] !== 5380 ||
    manifest.totals.byCorpus.lxx !== 13170
  ) {
    fail(`Staged P07 sharded runtime counts are invalid: ${JSON.stringify(manifest.totals)}`);
  }

  const sourceEngine = path.join(packageRoot, "files", "app", "data", "lexicon", "BibleIQEngine.ts");
  const sourceTypes = path.join(packageRoot, "files", "app", "data", "lexicon", "BibleIQTypes.ts");
  const sourceStore = path.join(packageRoot, "files", "app", "data", "lexicon", "EmetFinalStore.ts");

  backupRoot = path.join(stagingRoot, "rollback");
  fs.rmSync(backupRoot, { recursive: true, force: true });
  ensureDirectory(backupRoot);

  atomicCopy(targetEngine, path.join(backupRoot, "BibleIQEngine.ts"));
  atomicCopy(targetTypes, path.join(backupRoot, "BibleIQTypes.ts"));
  if (existsFile(targetStore)) atomicCopy(targetStore, path.join(backupRoot, "EmetFinalStore.ts"));
  if (existsDirectory(targetRuntimeDir)) copyTree(targetRuntimeDir, path.join(backupRoot, "emet-final"));

  mutationStarted = true;

  atomicCopy(sourceEngine, targetEngine);
  atomicCopy(sourceTypes, targetTypes);
  atomicCopy(sourceStore, targetStore);

  fs.rmSync(targetRuntimeDir, { recursive: true, force: true });
  copyTree(stagedRuntime, targetRuntimeDir);

  const installedEngine = readText(targetEngine);
  const installedStore = readText(targetStore);

  if (
    !installedEngine.includes('from "./EmetFinalStore"') ||
    !installedEngine.includes("loadFinalEmetRecord") ||
    installedEngine.includes("loadApprovedEmetOverride") ||
    installedEngine.includes("EmetApprovedOverrideStore") ||
    !installedEngine.includes('"approved-p07"') ||
    !installedEngine.includes('"no-explanation-p07"') ||
    !installedStore.includes('/data/bibleiq/word-study/emet-final')
  ) {
    fail("Installed source wiring verification failed.");
  }

  const installedManifest = readJson(path.join(targetRuntimeDir, "manifest.json"));

  if (
    installedManifest.checksum !== manifest.checksum ||
    installedManifest.totals.entities !== 27184 ||
    installedManifest.totals.approved !== 26896 ||
    installedManifest.totals.noExplanation !== 288 ||
    installedManifest.source.runtimeCacheSha256 !==
      "3d8e36c865a7d5b6b36d894d509cd9c3d29f4a7849d48e9656c8c64e74bb9e0a"
  ) {
    fail("Installed P07 final runtime manifest verification failed.");
  }

  // Verify one approved and one policy record from the actual installed shards.
  let approvedSample = null;
  let policySample = null;

  for (const entityId of runtime.entityOrder) {
    const source = runtime.records[entityId];
    if (!approvedSample && source.status === "approved") approvedSample = entityId;
    if (!policySample && source.status === "no-explanation") policySample = entityId;
    if (approvedSample && policySample) break;
  }

  function installedRecord(entityId) {
    const source = runtime.records[entityId];
    const corpus = corpusFromEntity(entityId, source);
    const shardId = shardIdForEntity(entityId, 64);
    const shard = readJson(path.join(targetRuntimeDir, corpus, `${shardId}.json`));
    return shard.entities?.[entityId] || null;
  }

  const approvedRecord = installedRecord(approvedSample);
  const policyRecord = installedRecord(policySample);

  if (
    !approvedRecord ||
    approvedRecord.status !== "approved" ||
    !approvedRecord.explanation?.trim()
  ) {
    fail("Installed approved P07 runtime sample failed.");
  }

  if (
    !policyRecord ||
    policyRecord.status !== "no-explanation" ||
    policyRecord.explanation
  ) {
    fail("Installed no-explanation P07 runtime sample failed.");
  }

  console.log("P07 final runtime installed.");
  console.log("Running production build...");

  const build = runBuild(reportRoot);
  if (build.status !== 0) {
    fail(`Production build failed with exit code ${build.status}.`);
  }

  const protectedAfter = protectedPaths.map(relative => ({
    path: relative,
    ...fingerprint(path.join(repositoryRoot, ...relative.split("/"))),
  }));
  writeJson(path.join(reportRoot, "protected-state-after.json"), protectedAfter);

  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) {
    fail("A protected P01-P07/cache/canonical source changed during integration.");
  }

  writeJson(path.join(reportRoot, "runtime-integration-summary.json"), {
    activeEntityCount: 27184,
    approvedExplanationCount: 26896,
    noExplanationPolicyCount: 288,
    shardCount: 64,
    generatedShardFiles: manifest.totals.shards,
    sourceRuntimeSha256: sha256File(sourceRuntime),
    runtimeManifestChecksum: installedManifest.checksum,
    approvedSample: {
      entityId: approvedSample,
      explanation: approvedRecord.explanation,
      sourceKind: approvedRecord.sourceKind,
    },
    noExplanationSample: {
      entityId: policySample,
      policy: policyRecord.policy,
    },
    engineNowUses: "EmetFinalStore",
    oldP04ApprovedOverrideUsedByBibleIQEngine: false,
    wordStudySheetModified: false,
    productionBuildExitCode: build.status,
    aiApiCallsMade: 0,
  });

  writeJson(path.join(reportRoot, "verdict.json"), {
    verdict: "P08_P07_FINAL_RUNTIME_INTEGRATION_VERIFIED",
    activeEntityCount: 27184,
    approvedExplanationCount: 26896,
    noExplanationPolicyCount: 288,
    productionBuildPassed: true,
    p07RuntimeWiredToBibleIQEngine: true,
    oldP04ApprovedOverrideDetachedFromBibleIQEngine: true,
    wordStudySheetAcrossScriptureBehaviorPreserved: true,
    aiApiCallsMade: 0,
    nextSingleStep:
      "Deploy the verified build and test one approved Across Scripture word plus one no-explanation policy word on emetsees.com.",
  });

  writeText(path.join(reportRoot, "REPORT.md"), [
    "# EMETSEES P08 — P07 Final Runtime Integration",
    "",
    "- P07 source cache: unchanged",
    "- Active entities: 27,184",
    "- Approved explanations: 26,896",
    "- No-explanation policies: 288",
    `- Runtime shards generated: ${manifest.totals.shards}`,
    "- BibleIQEngine now consumes: EmetFinalStore",
    "- Old P04.1 EmetApprovedOverrideStore detached from BibleIQEngine",
    "- WordStudySheet changed: NO",
    "- Production build: PASS",
    "- AI/API calls: 0",
    "",
  ].join("\n"));

  const manifestEntries = writeManifest(reportRoot);
  const zipFile = path.join(
    path.dirname(reportRoot),
    "EMETSEES-P08-P07-FINAL-RUNTIME-INTEGRATION-27184-v1.zip",
  );
  createZip(reportRoot, zipFile);

  console.log("");
  console.log("P08 P07 FINAL RUNTIME INTEGRATION COMPLETE");
  console.log("- BibleIQEngine -> EmetFinalStore -> final P07 runtime");
  console.log("- Active entities: 27,184");
  console.log("- Approved explanations: 26,896");
  console.log("- No-explanation policies: 288");
  console.log("- Production build: PASS");
  console.log("- AI/API calls: zero");
  console.log(`ZIP: ${zipFile}`);
  console.log(`SHA256: ${sha256File(zipFile)}`);
  console.log(`Manifest entries: ${manifestEntries}`);
}

main().catch(error => {
  console.error("");
  console.error("P08 P07 FINAL RUNTIME INTEGRATION FAILED CLOSED");
  console.error(error?.stack || String(error));
  packageFailure(error);
  process.exitCode = 1;
});
