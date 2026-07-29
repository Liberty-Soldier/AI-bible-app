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
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function normalizeRel(p) {
  return p.replace(/\\/g, "/");
}
function rel(root, target) {
  return normalizeRel(path.relative(root, target));
}
function describeFile(repo, relativePath) {
  const abs = path.join(repo, relativePath);
  if (!fs.existsSync(abs)) return { path: relativePath, exists: false };
  const st = fs.statSync(abs);
  return {
    path: relativePath,
    exists: true,
    type: st.isFile() ? "file" : st.isDirectory() ? "directory" : "other",
    bytes: st.isFile() ? st.size : null,
    sha256: st.isFile() ? sha256File(abs) : null
  };
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function parseChecksumManifest(file) {
  if (!fs.existsSync(file)) return { exists: false, entries: [], errors: ["missing"] };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const entries = [];
  const errors = [];
  for (const [index, line] of lines.entries()) {
    const match = /^([0-9a-f]{64})\s{2}(.+)$/i.exec(line);
    if (!match) {
      errors.push(`line ${index + 1}: invalid checksum format`);
      continue;
    }
    entries.push({ expectedSha256: match[1].toLowerCase(), path: normalizeRel(match[2]) });
  }
  return { exists: true, entries, errors };
}
function verifyChecksumManifest(root, manifestFile) {
  const parsed = parseChecksumManifest(manifestFile);
  const results = [];
  for (const entry of parsed.entries) {
    const abs = path.join(root, ...entry.path.split("/"));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      results.push({ ...entry, exists: false, actualSha256: null, match: false });
      continue;
    }
    const actualSha256 = sha256File(abs);
    results.push({ ...entry, exists: true, actualSha256, match: actualSha256 === entry.expectedSha256 });
  }
  return {
    manifest: normalizeRel(manifestFile),
    exists: parsed.exists,
    parseErrors: parsed.errors,
    entries: results,
    counts: {
      declared: parsed.entries.length,
      matched: results.filter(x => x.match).length,
      missing: results.filter(x => !x.exists).length,
      mismatched: results.filter(x => x.exists && !x.match).length
    },
    passed: parsed.exists && parsed.errors.length === 0 && results.every(x => x.match)
  };
}
function snapshotFile(repo, out, relativePath) {
  const src = path.join(repo, relativePath);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return null;
  const safeName = relativePath.replace(/[\\/]/g, "__");
  const dst = path.join(out, "snapshots", safeName);
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return rel(out, dst);
}
function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    error: result.error ? {
      name: result.error.name,
      message: result.error.message,
      code: result.error.code || null
    } : null,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}
function newestMatchingFile(root, regex, fileName) {
  if (!fs.existsSync(root)) return null;
  const candidates = [];
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !regex.test(dirent.name)) continue;
    const file = path.join(root, dirent.name, fileName);
    if (fs.existsSync(file)) candidates.push(file);
  }
  candidates.sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}
function compareJsonDocuments(left, right) {
  const summary = {
    sameTopLevelKeys: false,
    sameSchemaVersion: false,
    verseCounts: {},
    superscriptionCounts: {},
    differingTopLevelScalars: [],
    firstDifferingVerseIds: [],
    firstDifferingSuperscriptionIds: []
  };

  const leftKeys = left && typeof left === "object" && !Array.isArray(left) ? Object.keys(left).sort() : [];
  const rightKeys = right && typeof right === "object" && !Array.isArray(right) ? Object.keys(right).sort() : [];
  summary.sameTopLevelKeys = JSON.stringify(leftKeys) === JSON.stringify(rightKeys);
  summary.sameSchemaVersion = left?.schemaVersion === right?.schemaVersion;
  summary.verseCounts = {
    currentProduction: Array.isArray(left?.verses) ? left.verses.length : null,
    rebuiltCandidate: Array.isArray(right?.verses) ? right.verses.length : null
  };
  summary.superscriptionCounts = {
    currentProduction: Array.isArray(left?.superscriptions) ? left.superscriptions.length : null,
    rebuiltCandidate: Array.isArray(right?.superscriptions) ? right.superscriptions.length : null
  };

  const scalarKeys = [...new Set([...leftKeys, ...rightKeys])].filter(
    key => key !== "verses" && key !== "superscriptions"
  );
  for (const key of scalarKeys) {
    if (JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key])) {
      summary.differingTopLevelScalars.push(key);
    }
  }

  const leftVerses = new Map((left?.verses || []).map(v => [String(v.id), v]));
  const rightVerses = new Map((right?.verses || []).map(v => [String(v.id), v]));
  const verseIds = [...new Set([...leftVerses.keys(), ...rightVerses.keys()])].sort();
  for (const id of verseIds) {
    if (JSON.stringify(leftVerses.get(id)) !== JSON.stringify(rightVerses.get(id))) {
      summary.firstDifferingVerseIds.push(id);
      if (summary.firstDifferingVerseIds.length >= 50) break;
    }
  }

  const leftSupers = new Map((left?.superscriptions || []).map((v, i) => [String(v.id ?? i), v]));
  const rightSupers = new Map((right?.superscriptions || []).map((v, i) => [String(v.id ?? i), v]));
  const superIds = [...new Set([...leftSupers.keys(), ...rightSupers.keys()])].sort();
  for (const id of superIds) {
    if (JSON.stringify(leftSupers.get(id)) !== JSON.stringify(rightSupers.get(id))) {
      summary.firstDifferingSuperscriptionIds.push(id);
      if (summary.firstDifferingSuperscriptionIds.length >= 50) break;
    }
  }

  summary.documentsStructurallyIdentical =
    summary.sameTopLevelKeys &&
    summary.sameSchemaVersion &&
    summary.verseCounts.currentProduction === summary.verseCounts.rebuiltCandidate &&
    summary.superscriptionCounts.currentProduction === summary.superscriptionCounts.rebuiltCandidate &&
    summary.differingTopLevelScalars.length === 0 &&
    summary.firstDifferingVerseIds.length === 0 &&
    summary.firstDifferingSuperscriptionIds.length === 0;

  return summary;
}
function gitHistory(repo, relativePath) {
  const log = run("git", ["log", "--format=%H|%cI|%s", "--", relativePath], repo);
  const rows = log.status === 0
    ? log.stdout.split(/\r?\n/).filter(Boolean).slice(0, 50).map(line => {
        const [commit, date, ...subject] = line.split("|");
        return { commit, date, subject: subject.join("|") };
      })
    : [];
  return { command: log.command, status: log.status, error: log.error, stderr: log.stderr, rows };
}
function gitBlobHashes(repo, relativePath, history) {
  const rows = [];
  for (const item of history.rows || []) {
    const show = cp.spawnSync("git", ["show", `${item.commit}:${normalizeRel(relativePath)}`], {
      cwd: repo,
      encoding: null,
      windowsHide: true,
      maxBuffer: 128 * 1024 * 1024
    });
    if (show.status === 0 && Buffer.isBuffer(show.stdout)) {
      rows.push({
        ...item,
        fileSha256: sha256Buffer(show.stdout),
        bytes: show.stdout.length
      });
    }
  }
  return rows;
}

function main() {
  const repo = path.resolve(argValue("--repo", process.cwd()));
  const out = path.resolve(argValue("--output"));
  if (!out) throw new Error("--output is required");
  ensureDir(out);

  const manifestRel = "app/data/scripture/generatedBrenton.integrity.json";
  const productionRel = "app/data/scripture/generatedBrenton.json";
  const verifierRel = "scripts/translations/verify-brenton-production-integrity.js";
  const builderRel = "scripts/translations/build-brenton-production-from-candidate.js";
  const reportsRoot = path.join(repo, ".private", "reports", "P05.12");

  const report = {
    milestone: "P05.12AP-B2",
    purpose: "EXACT BRENTON ARTIFACT RECONCILIATION — READ ONLY",
    generatedAt: new Date().toISOString(),
    repository: { root: repo },
    rollback: {},
    currentState: {},
    retainedSourceCandidate: {},
    rebuiltCandidate: {},
    comparisons: {},
    gitEvidence: {},
    authorization: {
      safeToModifyBrentonProduction: false,
      safeToModifyBrentonIntegrityManifest: false,
      safeToCreateManifestOnlyCorrectionCandidate: false,
      safeToCreateProductionRestoreCandidate: false,
      safeToRerunKjvPromotion: false
    }
  };

  const required = [manifestRel, productionRel, verifierRel, builderRel];
  report.currentState.requiredFiles = required.map(p => describeFile(repo, p));
  const missing = report.currentState.requiredFiles.filter(x => !x.exists).map(x => x.path);
  report.currentState.missingRequiredFiles = missing;

  const latestAp = newestMatchingFile(
    reportsRoot,
    /controlled-kjv2006-production-promotion/i,
    "p0512ap-summary.json"
  );
  if (latestAp) {
    try {
      const ap = readJson(latestAp);
      report.rollback = {
        summaryPath: rel(repo, latestAp),
        rollbackAttempted: Boolean(ap.rollback?.attempted),
        rollbackVerified: Boolean(ap.rollback?.verified),
        protectedStateRestored: Boolean(ap.rollback?.protectedStateRestored),
        differences: ap.rollback?.differences || [],
        protectedDifferences: ap.rollback?.protectedDifferences || [],
        productionPromotionSucceeded: Boolean(ap.authorization?.productionPromotionSucceeded)
      };
      fs.copyFileSync(latestAp, path.join(out, "latest-p0512ap-summary.json"));
    } catch (error) {
      report.rollback = { summaryPath: rel(repo, latestAp), parseError: error.message };
    }
  } else {
    report.rollback = { summaryPath: null, rollbackVerified: false };
  }

  if (missing.length === 0) {
    const integrityPath = path.join(repo, manifestRel);
    const productionPath = path.join(repo, productionRel);
    const integrity = readJson(integrityPath);
    const currentBytes = fs.readFileSync(productionPath);
    const currentDocument = JSON.parse(currentBytes.toString("utf8"));

    report.currentState.integrityManifest = {
      path: manifestRel,
      fileSha256: sha256File(integrityPath),
      expectedProductionSha256: String(integrity.productionSha256 || "").toLowerCase(),
      sourceCandidate: integrity.sourceCandidate || null,
      productionCounts: integrity.productionCounts || null,
      gates: integrity.gates || null
    };
    report.currentState.production = {
      path: productionRel,
      bytes: currentBytes.length,
      fileSha256: sha256Buffer(currentBytes),
      normalizedJsonSha256: sha256Buffer(Buffer.from(JSON.stringify(currentDocument), "utf8")),
      schemaVersion: currentDocument.schemaVersion || null,
      verses: Array.isArray(currentDocument.verses) ? currentDocument.verses.length : null,
      superscriptions: Array.isArray(currentDocument.superscriptions) ? currentDocument.superscriptions.length : null,
      books: Array.isArray(currentDocument.verses)
        ? new Set(currentDocument.verses.map(v => v.book)).size
        : null
    };

    snapshotFile(repo, out, manifestRel);
    snapshotFile(repo, out, verifierRel);
    snapshotFile(repo, out, builderRel);

    const sourceReportRel = normalizeRel(integrity?.sourceCandidate?.report || "");
    const sourceReportAbs = sourceReportRel ? path.resolve(repo, ...sourceReportRel.split("/")) : null;
    report.retainedSourceCandidate.reportPath = sourceReportRel || null;
    report.retainedSourceCandidate.exists = Boolean(sourceReportAbs && fs.existsSync(sourceReportAbs));
    report.retainedSourceCandidate.type = report.retainedSourceCandidate.exists
      ? (fs.statSync(sourceReportAbs).isDirectory() ? "directory" : "file")
      : null;

    if (report.retainedSourceCandidate.exists && fs.statSync(sourceReportAbs).isDirectory()) {
      const fileNames = fs.readdirSync(sourceReportAbs).sort();
      report.retainedSourceCandidate.topLevelFiles = fileNames;
      const checksumCandidates = fileNames.filter(name => /checksum.*sha256|checksums\.sha256/i.test(name));
      const checksumReports = [];
      for (const name of checksumCandidates) {
        const full = path.join(sourceReportAbs, name);
        if (fs.statSync(full).isFile()) {
          checksumReports.push(verifyChecksumManifest(sourceReportAbs, full));
          fs.copyFileSync(full, path.join(out, `source-report-${name}`));
        }
      }
      report.retainedSourceCandidate.checksumReports = checksumReports;

      const summaryCandidates = fileNames.filter(name => /summary.*\.json$|report.*\.json$/i.test(name));
      report.retainedSourceCandidate.summaryFiles = [];
      for (const name of summaryCandidates.slice(0, 20)) {
        const full = path.join(sourceReportAbs, name);
        if (!fs.statSync(full).isFile()) continue;
        try {
          const parsed = readJson(full);
          const descriptor = {
            path: rel(repo, full),
            fileSha256: sha256File(full),
            topLevelKeys: parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? Object.keys(parsed).sort()
              : null
          };
          report.retainedSourceCandidate.summaryFiles.push(descriptor);
          fs.copyFileSync(full, path.join(out, `source-report-${name}`));
        } catch (error) {
          report.retainedSourceCandidate.summaryFiles.push({
            path: rel(repo, full),
            parseError: error.message
          });
        }
      }

      const expectedSummaryHash = String(integrity?.sourceCandidate?.summarySha256 || "").toLowerCase();
      const summaryMatches = [];
      const stack = [sourceReportAbs];
      let visited = 0;
      while (stack.length && visited < 5000) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile()) {
            visited++;
            if (sha256File(full) === expectedSummaryHash) {
              summaryMatches.push(rel(repo, full));
            }
          }
        }
      }
      report.retainedSourceCandidate.expectedSummarySha256 = expectedSummaryHash || null;
      report.retainedSourceCandidate.expectedSummaryHashMatches = summaryMatches;
      report.retainedSourceCandidate.filesVisitedForSummaryHash = visited;
    }

    let rebuiltSerialized = null;
    try {
      const builderAbs = path.join(repo, builderRel);
      delete require.cache[require.resolve(builderAbs)];
      const builder = require(builderAbs);
      if (!builder || typeof builder.buildProductionCandidate !== "function") {
        throw new Error("Builder does not export buildProductionCandidate().");
      }
      const rebuilt = builder.buildProductionCandidate();
      if (!rebuilt || typeof rebuilt.serialized !== "string") {
        throw new Error("Builder returned no serialized candidate.");
      }
      rebuiltSerialized = rebuilt.serialized;
      const rebuiltDocument = JSON.parse(rebuiltSerialized);
      report.rebuiltCandidate = {
        succeeded: true,
        bytes: Buffer.byteLength(rebuiltSerialized, "utf8"),
        fileSha256: sha256Buffer(Buffer.from(rebuiltSerialized, "utf8")),
        normalizedJsonSha256: sha256Buffer(Buffer.from(JSON.stringify(rebuiltDocument), "utf8")),
        schemaVersion: rebuiltDocument.schemaVersion || null,
        verses: Array.isArray(rebuiltDocument.verses) ? rebuiltDocument.verses.length : null,
        superscriptions: Array.isArray(rebuiltDocument.superscriptions)
          ? rebuiltDocument.superscriptions.length
          : null,
        books: Array.isArray(rebuiltDocument.verses)
          ? new Set(rebuiltDocument.verses.map(v => v.book)).size
          : null
      };
      report.comparisons.currentVsRebuilt = compareJsonDocuments(currentDocument, rebuiltDocument);
    } catch (error) {
      report.rebuiltCandidate = {
        succeeded: false,
        error: error.message,
        stack: error.stack
      };
    }

    const directVerifier = run(process.execPath, [verifierRel], repo);
    fs.writeFileSync(path.join(out, "direct-verifier.stdout.log"), directVerifier.stdout, "utf8");
    fs.writeFileSync(path.join(out, "direct-verifier.stderr.log"), directVerifier.stderr, "utf8");
    report.currentState.directVerifier = {
      command: directVerifier.command,
      status: directVerifier.status,
      error: directVerifier.error,
      passed: directVerifier.status === 0
    };

    const productionHistory = gitHistory(repo, productionRel);
    const manifestHistory = gitHistory(repo, manifestRel);
    report.gitEvidence.productionHistory = productionHistory;
    report.gitEvidence.manifestHistory = manifestHistory;
    report.gitEvidence.productionBlobHashes = gitBlobHashes(repo, productionRel, productionHistory);
    report.gitEvidence.manifestBlobHashes = gitBlobHashes(repo, manifestRel, manifestHistory);

    const expected = report.currentState.integrityManifest.expectedProductionSha256;
    const current = report.currentState.production.fileSha256;
    const rebuilt = report.rebuiltCandidate.succeeded ? report.rebuiltCandidate.fileSha256 : null;

    report.comparisons.hashDecision = {
      manifestExpectedSha256: expected,
      currentProductionSha256: current,
      rebuiltCandidateSha256: rebuilt,
      currentMatchesManifest: current === expected,
      rebuiltMatchesManifest: rebuilt === expected,
      currentMatchesRebuilt: rebuilt !== null && current === rebuilt
    };

    const sourceChecksumsPassed =
      Array.isArray(report.retainedSourceCandidate.checksumReports) &&
      report.retainedSourceCandidate.checksumReports.length > 0 &&
      report.retainedSourceCandidate.checksumReports.every(x => x.passed);

    const summaryEvidencePassed =
      Array.isArray(report.retainedSourceCandidate.expectedSummaryHashMatches) &&
      report.retainedSourceCandidate.expectedSummaryHashMatches.length === 1;

    const rollbackSafe =
      report.rollback.rollbackVerified === true &&
      report.rollback.protectedStateRestored === true &&
      (report.rollback.differences || []).length === 0 &&
      (report.rollback.protectedDifferences || []).length === 0;

    report.authorization.safeToCreateManifestOnlyCorrectionCandidate =
      rollbackSafe &&
      report.rebuiltCandidate.succeeded === true &&
      sourceChecksumsPassed &&
      summaryEvidencePassed &&
      current === rebuilt &&
      current !== expected &&
      report.comparisons.currentVsRebuilt?.documentsStructurallyIdentical === true;

    report.authorization.safeToCreateProductionRestoreCandidate =
      rollbackSafe &&
      report.rebuiltCandidate.succeeded === true &&
      sourceChecksumsPassed &&
      summaryEvidencePassed &&
      rebuilt === expected &&
      current !== expected;

    report.authorization.safeToRerunKjvPromotion =
      rollbackSafe && directVerifier.status === 0;

    report.authorization.safeToModifyBrentonIntegrityManifest = false;
    report.authorization.safeToModifyBrentonProduction = false;
  }

  writeJson(path.join(out, "p0512ap-b2-summary.json"), report);

  const hashDecision = report.comparisons.hashDecision || {};
  let verdictName = "FAIL_CLOSED";
  let nextStep = "Retained evidence is insufficient or inconsistent. Do not modify Brenton or rerun AP.";
  if (report.authorization.safeToCreateManifestOnlyCorrectionCandidate) {
    verdictName = "AUTHORIZE_MANIFEST_ONLY_CORRECTION_CANDIDATE";
    nextStep = "Create a separate isolated package that changes only the Brenton integrity manifest to the exact rebuilt/current production hash, then reruns the Brenton gate twice. Do not alter Brenton production.";
  } else if (report.authorization.safeToCreateProductionRestoreCandidate) {
    verdictName = "AUTHORIZE_PRODUCTION_RESTORE_CANDIDATE";
    nextStep = "Create a separate isolated package that restores Brenton production from the retained approved candidate while preserving the manifest, then reruns all Brenton gates. Do not apply it yet.";
  } else if (report.authorization.safeToRerunKjvPromotion) {
    verdictName = "BRENTON_GATE_ALREADY_PASSES";
    nextStep = "The Brenton gate now passes; AP may be rerun only after reviewing this report.";
  }

  writeJson(path.join(out, "verdict.json"), {
    milestone: "P05.12AP-B2",
    verdict: verdictName,
    rollbackVerified: report.rollback.rollbackVerified === true,
    manifestExpectedSha256: hashDecision.manifestExpectedSha256 || null,
    currentProductionSha256: hashDecision.currentProductionSha256 || null,
    rebuiltCandidateSha256: hashDecision.rebuiltCandidateSha256 || null,
    currentMatchesManifest: Boolean(hashDecision.currentMatchesManifest),
    rebuiltMatchesManifest: Boolean(hashDecision.rebuiltMatchesManifest),
    currentMatchesRebuilt: Boolean(hashDecision.currentMatchesRebuilt),
    safeToModifyBrentonIntegrityManifest: false,
    safeToModifyBrentonProduction: false,
    safeToRerunKjvPromotion: report.authorization.safeToRerunKjvPromotion,
    nextStep
  });

  console.log(JSON.stringify(readJson(path.join(out, "verdict.json")), null, 2));
}

try {
  main();
} catch (error) {
  const out = argValue("--output");
  if (out) {
    try {
      ensureDir(path.resolve(out));
      writeJson(path.join(path.resolve(out), "diagnostic-fatal-error.json"), {
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 0;
}
