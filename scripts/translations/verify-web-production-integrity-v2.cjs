#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALIGNMENT_MUTABLE_KEYS = new Set([
  "alignedSourceTokenIds",
  "sourceTokenIds",
  "alignedSourceEntityIds",
  "sourceEntityIds",
  "alignmentStatus",
  "confidence",
  "method",
  "alignmentMethod",
  "alignmentConfidence",
]);

function fail(message) {
  throw new Error(`[WEB production integrity v2] ${message}`);
}
function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
function walkJson(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkJson(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) result.push(full);
  }
  return result.sort((a, b) => a.localeCompare(b));
}
function immutableTokenProjection(token) {
  const output = {};
  for (const key of Object.keys(token || {}).sort()) {
    if (ALIGNMENT_MUTABLE_KEYS.has(key)) continue;
    output[key] = token[key];
  }
  return output;
}
function immutableWebProjection(web) {
  const source = web && typeof web === "object" ? web : {};
  const output = {};
  for (const key of Object.keys(source).sort()) {
    if (key === "tokens") {
      output.tokens = Array.isArray(source.tokens)
        ? source.tokens.map(immutableTokenProjection)
        : [];
      continue;
    }
    // Preserve every translation-level field except known alignment-only fields.
    if (ALIGNMENT_MUTABLE_KEYS.has(key)) continue;
    output[key] = source[key];
  }
  return output;
}
function canonicalWebState(canonicalRoot) {
  const fullHash = crypto.createHash("sha256");
  const immutableHash = crypto.createHash("sha256");
  let files = 0;
  let records = 0;
  let webRecords = 0;
  let webTokens = 0;
  let alignedWebTokens = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    const corpusRoot = path.join(canonicalRoot, corpus);
    for (const filePath of walkJson(corpusRoot)) {
      files += 1;
      const relative = path.relative(canonicalRoot, filePath).replace(/\\/g, "/");
      const root = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const objectKey of Object.keys(root).sort()) {
        records += 1;
        const web = root[objectKey]?.translations?.web;
        if (!web) continue;
        webRecords += 1;
        const tokens = Array.isArray(web.tokens) ? web.tokens : [];
        webTokens += tokens.length;
        alignedWebTokens += tokens.filter((token) => {
          return (
            (Array.isArray(token?.alignedSourceTokenIds) && token.alignedSourceTokenIds.length > 0) ||
            (Array.isArray(token?.sourceTokenIds) && token.sourceTokenIds.length > 0) ||
            (Array.isArray(token?.alignedSourceEntityIds) && token.alignedSourceEntityIds.length > 0) ||
            (Array.isArray(token?.sourceEntityIds) && token.sourceEntityIds.length > 0) ||
            token?.alignmentStatus === "aligned"
          );
        }).length;

        const prefix = `${relative}\0${objectKey}\0`;
        fullHash.update(prefix);
        fullHash.update(stableStringify(web));
        fullHash.update("\n");
        immutableHash.update(prefix);
        immutableHash.update(stableStringify(immutableWebProjection(web)));
        immutableHash.update("\n");
      }
    }
  }

  return {
    sha256: fullHash.digest("hex"),
    immutableSha256: immutableHash.digest("hex"),
    files,
    records,
    webRecords,
    webTokens,
    alignedWebTokens,
  };
}
function sourceTreeDigest(sourceRoot) {
  if (!fs.existsSync(sourceRoot)) return null;
  const hash = crypto.createHash("sha256");
  let files = 0;
  function walk(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        hash.update(path.relative(sourceRoot, full).replace(/\\/g, "/"));
        hash.update("\0");
        hash.update(fs.readFileSync(full));
        hash.update("\0");
      }
    }
  }
  walk(sourceRoot);
  return { sha256: hash.digest("hex"), files };
}
function analyzeProduction(productionPath) {
  const value = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  if (!Array.isArray(value)) fail("generatedWEB.json must remain a verse array.");
  const coordinates = new Set();
  let duplicateCoordinates = 0;
  for (const verse of value) {
    const key = `${verse?.book}\0${Number(verse?.chapter)}\0${Number(verse?.verse)}`;
    if (coordinates.has(key)) duplicateCoordinates += 1;
    coordinates.add(key);
  }
  return {
    verses: value.length,
    uniqueCoordinates: coordinates.size,
    duplicateCoordinates,
    firstReference: value[0]?.reference ?? null,
    lastReference: value[value.length - 1]?.reference ?? null,
  };
}
function verifyProductionAndOptionalSources(args, manifest) {
  const production = analyzeProduction(args.production);
  const productionSha256 = sha256File(args.production);
  if (productionSha256 !== manifest.production?.sha256) {
    fail(`Production WEB hash mismatch. Expected ${manifest.production?.sha256}, found ${productionSha256}`);
  }
  if (production.verses !== 31098 || production.uniqueCoordinates !== 31098 || production.duplicateCoordinates !== 0) {
    fail(`Production WEB coordinate census failed: ${JSON.stringify(production)}`);
  }

  if (args.requireCandidate || fs.existsSync(args.candidate)) {
    if (!fs.existsSync(args.candidate)) fail(`Approved WEB candidate is required but missing: ${args.candidate}`);
    const candidateSha = sha256File(args.candidate);
    if (candidateSha !== manifest.production.sha256 || candidateSha !== productionSha256) {
      fail(`Production WEB does not match approved candidate: ${candidateSha}`);
    }
  }

  if (args.requireSource || fs.existsSync(args.sourceRoot)) {
    if (!fs.existsSync(args.sourceRoot)) fail(`Immutable WEB source is required but missing: ${args.sourceRoot}`);
    const sourceTree = sourceTreeDigest(args.sourceRoot);
    if (!manifest.immutableSource || sourceTree.sha256 !== manifest.immutableSource.sha256 || sourceTree.files !== manifest.immutableSource.files) {
      fail(`Immutable WEB source fingerprint mismatch: ${JSON.stringify({ expected: manifest.immutableSource, actual: sourceTree })}`);
    }
  }

  return { production, productionSha256 };
}
function verifyV2(args) {
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  if (manifest.schemaVersion !== "web-production-integrity@2") {
    fail(`Expected web-production-integrity@2 manifest; found ${manifest.schemaVersion || "unknown"}`);
  }
  verifyProductionAndOptionalSources(args, manifest);
  const state = canonicalWebState(args.canonicalRoot);
  const expected = manifest.canonicalWeb || {};
  if (state.immutableSha256 !== expected.immutableSha256) {
    fail(`Canonical WEB immutable digest mismatch. Expected ${expected.immutableSha256}, found ${state.immutableSha256}`);
  }
  if (state.sha256 !== expected.sha256) {
    fail(`Canonical WEB alignment-state digest mismatch. Expected ${expected.sha256}, found ${state.sha256}`);
  }
  for (const key of ["files", "records", "webRecords", "webTokens", "alignedWebTokens"]) {
    if (Number(state[key]) !== Number(expected[key])) {
      fail(`Canonical WEB census drift for ${key}. Expected ${expected[key]}, found ${state[key]}`);
    }
  }
  console.log("WEB production integrity v2 verified.");
  console.log("- Visible verses: 31,098");
  console.log(`- Canonical WEB records: ${state.webRecords}`);
  console.log(`- Canonical WEB tokens: ${state.webTokens}`);
  console.log(`- Canonical aligned WEB tokens: ${state.alignedWebTokens}`);
  console.log("- Immutable text/token projection: sealed");
  console.log("- Audited alignment state: sealed");
  return { manifest, state };
}
function migrateAfterAuditedAlignment(args) {
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  if (!["web-production-integrity@1", "web-production-integrity@2"].includes(manifest.schemaVersion)) {
    fail(`Unsupported existing WEB integrity manifest: ${manifest.schemaVersion || "unknown"}`);
  }
  verifyProductionAndOptionalSources(args, manifest);
  const current = canonicalWebState(args.canonicalRoot);
  const expectedImmutable = String(args.expectedImmutableSha256 || "").trim();
  if (!expectedImmutable) fail("--expected-immutable-sha256 is required for audited migration.");
  if (current.immutableSha256 !== expectedImmutable) {
    fail(`Audited migration immutable projection mismatch. Expected ${expectedImmutable}, found ${current.immutableSha256}`);
  }
  const priorCanonical = manifest.canonicalWeb ? { ...manifest.canonicalWeb } : null;
  if (!priorCanonical) fail("Existing WEB integrity manifest has no canonicalWeb contract.");
  for (const key of ["files", "records", "webRecords", "webTokens"]) {
    if (Number(current[key]) !== Number(priorCanonical[key])) {
      fail(`Audited migration canonical census drift for ${key}. Expected ${priorCanonical[key]}, found ${current[key]}`);
    }
  }
  const auditSummarySha256 =
    args.auditSummary && fs.existsSync(args.auditSummary)
      ? sha256File(args.auditSummary)
      : null;
  const migrated = {
    ...manifest,
    schemaVersion: "web-production-integrity@2",
    generatedAtUtc: new Date().toISOString(),
    canonicalWeb: current,
    alignmentRevision: {
      milestone: args.milestone || "P08.12R1",
      migratedAtUtc: new Date().toISOString(),
      priorCanonicalWeb: priorCanonical,
      immutableProjectionPreserved: true,
      auditedAlignmentStateSealed: true,
      auditSummarySha256,
    },
    gates: {
      ...(manifest.gates || {}),
      canonicalWebTextAndTokensPinned: true,
      canonicalWebAlignmentStatePinned: true,
    },
  };
  fs.writeFileSync(args.manifest, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
  console.log("WEB production integrity manifest migrated to v2 after audited alignment repair.");
  console.log(`- Immutable digest: ${current.immutableSha256}`);
  console.log(`- Alignment-state digest: ${current.sha256}`);
  console.log(`- Aligned WEB tokens: ${current.alignedWebTokens}`);
  return migrated;
}
function parseArgs(argv) {
  const args = { mode: "verify", requireCandidate: false, requireSource: false };
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === "--verify") args.mode = "verify";
    else if (current === "--state") args.mode = "state";
    else if (current === "--migrate-after-audited-alignment") args.mode = "migrate";
    else if (current === "--require-candidate") args.requireCandidate = true;
    else if (current === "--require-source") args.requireSource = true;
    else if (current.startsWith("--") && next !== undefined) {
      const key = current.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = ["expectedImmutableSha256", "milestone"].includes(key) ? String(next) : path.resolve(next);
      i += 1;
    } else fail(`Unknown or incomplete argument: ${current}`);
  }
  return args;
}
function requireArgs(args, keys) {
  for (const key of keys) if (!args[key]) fail(`Missing --${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`);
}
function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "state") {
    requireArgs(args, ["canonicalRoot"]);
    const state = canonicalWebState(args.canonicalRoot);
    if (args.output) {
      fs.mkdirSync(path.dirname(args.output), { recursive: true });
      fs.writeFileSync(args.output, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    } else console.log(JSON.stringify(state, null, 2));
    return;
  }
  requireArgs(args, ["production", "canonicalRoot", "manifest", "candidate", "sourceRoot"]);
  if (args.mode === "migrate") migrateAfterAuditedAlignment(args);
  else verifyV2(args);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error?.stack || String(error)); process.exit(1); }
}

module.exports = {
  ALIGNMENT_MUTABLE_KEYS,
  stableStringify,
  immutableTokenProjection,
  immutableWebProjection,
  canonicalWebState,
  analyzeProduction,
  migrateAfterAuditedAlignment,
  verifyV2,
};
