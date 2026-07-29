#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function rel(root, target) {
  return path.relative(root, target).replace(/\\/g, "/");
}
function describePath(repo, p) {
  const abs = path.join(repo, p);
  if (!fs.existsSync(abs)) return { path: p, exists: false };
  const st = fs.statSync(abs);
  if (st.isFile()) {
    return { path: p, exists: true, type: "file", bytes: st.size, sha256: sha256File(abs) };
  }
  return { path: p, exists: true, type: "directory" };
}
function copySnapshot(repo, out, p) {
  const src = path.join(repo, p);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return null;
  const dst = path.join(out, "snapshots", p.replace(/[\\/]/g, "__"));
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return rel(out, dst);
}
function collectJsonFacts(value, pointer = "", out = { hashes: [], paths: [], scalarCounts: {} }) {
  if (typeof value === "string") {
    if (/^[0-9a-f]{64}$/i.test(value)) out.hashes.push({ pointer: pointer || "/", value: value.toLowerCase() });
    if (/[\\/]/.test(value) || /\.(json|js|cjs|mjs|ts)$/i.test(value)) out.paths.push({ pointer: pointer || "/", value });
    return out;
  }
  if (value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectJsonFacts(v, `${pointer}/${i}`, out));
  } else {
    for (const [k, v] of Object.entries(value)) {
      collectJsonFacts(v, `${pointer}/${String(k).replace(/~/g, "~0").replace(/\//g, "~1")}`, out);
    }
  }
  return out;
}
function summarizeJson(file) {
  const raw = fs.readFileSync(file);
  const parsed = JSON.parse(raw.toString("utf8"));
  const top = Array.isArray(parsed)
    ? { type: "array", length: parsed.length }
    : { type: typeof parsed, keys: parsed && typeof parsed === "object" ? Object.keys(parsed).sort() : [] };
  return {
    bytes: raw.length,
    fileSha256: sha256Buffer(raw),
    normalizedJsonSha256: sha256Buffer(Buffer.from(JSON.stringify(parsed), "utf8")),
    topLevel: top
  };
}
function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    status: r.status,
    signal: r.signal,
    error: r.error ? { name: r.error.name, message: r.error.message, code: r.error.code || null } : null,
    stdout: r.stdout || "",
    stderr: r.stderr || ""
  };
}
function newestApSummary(repo) {
  const base = path.join(repo, ".private", "reports", "P05.12");
  if (!fs.existsSync(base)) return null;
  const found = [];
  for (const dirent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !/controlled-kjv2006-production-promotion/i.test(dirent.name)) continue;
    const f = path.join(base, dirent.name, "p0512ap-summary.json");
    if (fs.existsSync(f)) found.push(f);
  }
  found.sort();
  return found.length ? found[found.length - 1] : null;
}
function scanTextFilesForHashes(repo, hashes) {
  const base = path.join(repo, ".private", "reports", "P05.12");
  if (!fs.existsSync(base)) return [];
  const wanted = new Set(hashes.filter(Boolean).map(x => x.toLowerCase()));
  const hits = [];
  const stack = [base];
  let visited = 0;
  while (stack.length && visited < 15000) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && /(\.json|\.sha256|\.txt|\.log|\.md)$/i.test(e.name)) {
        visited++;
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.size > 5 * 1024 * 1024) continue;
        let text;
        try { text = fs.readFileSync(p, "utf8").toLowerCase(); } catch { continue; }
        for (const h of wanted) {
          if (text.includes(h)) hits.push({ hash: h, path: rel(repo, p) });
        }
      }
    }
  }
  return { filesVisited: visited, hits };
}

function main() {
  const repo = path.resolve(argValue("--repo", process.cwd()));
  const out = path.resolve(argValue("--output"));
  if (!out) throw new Error("--output is required");
  ensureDir(out);

  const protectedPaths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.integrity.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    "public/scripture/runtime/brenton",
    ".private/scripture/canonical",
    ".private/alignment"
  ];
  const state = protectedPaths.map(p => describePath(repo, p));
  writeJson(path.join(out, "protected-state.json"), state);

  const manifestPath = path.join(repo, "app/data/scripture/generatedBrenton.integrity.json");
  const productionPath = path.join(repo, "app/data/scripture/generatedBrenton.json");
  const verifierPath = path.join(repo, "scripts/translations/verify-brenton-production-integrity.js");

  const required = [manifestPath, productionPath, verifierPath];
  const missing = required.filter(p => !fs.existsSync(p)).map(p => rel(repo, p));

  const report = {
    milestone: "P05.12AP-B1",
    purpose: "READ-ONLY BRENTON PRODUCTION-INTEGRITY BUILD-BLOCKER DIAGNOSTIC",
    generatedAt: new Date().toISOString(),
    repository: { root: repo },
    missingRequiredFiles: missing,
    rollback: { latestApSummary: null, verified: false, productionPromotionSucceeded: null },
    brenton: {
      production: describePath(repo, "app/data/scripture/generatedBrenton.json"),
      typescript: describePath(repo, "app/data/scripture/generatedBrenton.ts"),
      integrityManifest: describePath(repo, "app/data/scripture/generatedBrenton.integrity.json"),
      verifier: describePath(repo, "scripts/translations/verify-brenton-production-integrity.js"),
      manifestFacts: null,
      productionJsonSummary: null,
      directVerifier: null,
      referencedExistingFiles: []
    },
    historicalHashSearch: null,
    authorization: {
      safeToRerunKjvPromotion: false,
      safeToModifyBrentonProduction: false,
      safeToModifyBrentonIntegrityManifest: false,
      requiresBrentonIntegrityReconciliation: true
    }
  };

  const apSummaryFile = newestApSummary(repo);
  if (apSummaryFile) {
    try {
      const ap = JSON.parse(fs.readFileSync(apSummaryFile, "utf8"));
      report.rollback = {
        latestApSummary: rel(repo, apSummaryFile),
        verified: Boolean(ap.rollback && ap.rollback.verified && ap.rollback.protectedStateRestored),
        productionPromotionSucceeded: Boolean(ap.authorization && ap.authorization.productionPromotionSucceeded),
        differences: ap.rollback && Array.isArray(ap.rollback.differences) ? ap.rollback.differences : null,
        protectedDifferences: ap.rollback && Array.isArray(ap.rollback.protectedDifferences) ? ap.rollback.protectedDifferences : null
      };
      fs.copyFileSync(apSummaryFile, path.join(out, "latest-p0512ap-summary.json"));
    } catch (e) {
      report.rollback.parseError = e.message;
    }
  }

  if (!missing.length) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const facts = collectJsonFacts(manifest);
    report.brenton.manifestFacts = facts;
    report.brenton.productionJsonSummary = summarizeJson(productionPath);

    for (const item of facts.paths) {
      const raw = item.value;
      const candidates = [
        path.resolve(repo, raw),
        path.resolve(path.dirname(manifestPath), raw)
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const key = rel(repo, candidate);
          if (!report.brenton.referencedExistingFiles.some(x => x.path === key)) {
            const d = describePath(repo, key);
            if (/\.json$/i.test(candidate)) {
              try { d.jsonSummary = summarizeJson(candidate); } catch (e) { d.jsonParseError = e.message; }
            }
            report.brenton.referencedExistingFiles.push(d);
          }
        }
      }
    }

    copySnapshot(repo, out, "app/data/scripture/generatedBrenton.integrity.json");
    copySnapshot(repo, out, "scripts/translations/verify-brenton-production-integrity.js");
    copySnapshot(repo, out, "package.json");

    const direct = run(process.execPath, ["scripts/translations/verify-brenton-production-integrity.js"], repo);
    fs.writeFileSync(path.join(out, "direct-verifier.stdout.log"), direct.stdout, "utf8");
    fs.writeFileSync(path.join(out, "direct-verifier.stderr.log"), direct.stderr, "utf8");
    report.brenton.directVerifier = {
      command: direct.command,
      status: direct.status,
      signal: direct.signal,
      error: direct.error,
      passed: direct.status === 0
    };

    const stderrHashes = [...(direct.stderr.match(/[0-9a-f]{64}/ig) || [])].map(x => x.toLowerCase());
    const allHashes = [...new Set([
      report.brenton.production.sha256,
      ...facts.hashes.map(x => x.value),
      ...stderrHashes
    ].filter(Boolean))];
    report.historicalHashSearch = scanTextFilesForHashes(repo, allHashes);
  }

  report.authorization.safeToRerunKjvPromotion =
    report.rollback.verified === true &&
    report.brenton.directVerifier &&
    report.brenton.directVerifier.passed === true;

  report.authorization.requiresBrentonIntegrityReconciliation =
    !report.authorization.safeToRerunKjvPromotion;

  writeJson(path.join(out, "p0512ap-b1-summary.json"), report);

  const conclusion = {
    passedAsDiagnostic: true,
    rollbackVerified: report.rollback.verified,
    directBrentonIntegrityGatePassed: Boolean(report.brenton.directVerifier && report.brenton.directVerifier.passed),
    currentBrentonProductionSha256: report.brenton.production.sha256 || null,
    safeToRerunKjvPromotion: report.authorization.safeToRerunKjvPromotion,
    safeToModifyBrentonProduction: false,
    safeToModifyBrentonIntegrityManifest: false,
    nextStep: report.authorization.safeToRerunKjvPromotion
      ? "The Brenton gate now passes; rerun AP only after reviewing this report."
      : "Reconcile the Brenton integrity manifest and approved production artifact from retained P05.12 evidence. Do not change either from this diagnostic."
  };
  writeJson(path.join(out, "verdict.json"), conclusion);
  console.log(JSON.stringify(conclusion, null, 2));
}

try {
  main();
} catch (error) {
  const out = argValue("--output");
  if (out) {
    try {
      ensureDir(path.resolve(out));
      writeJson(path.join(path.resolve(out), "diagnostic-fatal-error.json"), {
        message: error.message,
        stack: error.stack,
        generatedAt: new Date().toISOString()
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 0; // Always allow the wrapper to package diagnostics.
}
