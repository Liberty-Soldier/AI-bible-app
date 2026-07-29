"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const EXPECTED = Object.freeze({
  milestone: "P05.12AL",
  akMilestone: "P05.12AK",
  aj: {
    blocks: 31102,
    supportedBlocks: 31085,
    readerOnlyFailClosedBlocks: 17,
    routedSourceTokens: 438452,
    sourceRouteEdges: 31091,
  },
});

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const RESOLUTION_EXTENSIONS = [...CODE_EXTENSIONS, ".json"];
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

function fail(message) { throw new Error(`[P05.12AL] ${message}`); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function sha256File(file) { const h = crypto.createHash("sha256"); h.update(fs.readFileSync(file)); return h.digest("hex"); }
function normalizeRel(value) { return String(value || "").split(path.sep).join("/"); }
function relativeFromRoot(repoRoot, target) { return normalizeRel(path.relative(repoRoot, target)); }
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}
function gitInfo(repoRoot) {
  function run(args) { return childProcess.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim(); }
  return { branch: run(["branch", "--show-current"]), commit: run(["rev-parse", "HEAD"]) };
}
function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}
function hashTree(root) {
  if (!fs.existsSync(root)) return null;
  const files = listFilesRecursive(root);
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    const rel = relativeFromRoot(root, file);
    digest.update(rel, "utf8"); digest.update("\0", "utf8");
    digest.update(sha256File(file), "utf8"); digest.update("\n", "utf8");
  }
  return { files: files.length, sha256: digest.digest("hex") };
}
function snapshotItems(repoRoot, templateItems) {
  return (templateItems || []).map((item) => {
    const rel = item.path;
    const full = path.join(repoRoot, ...String(rel).split("/"));
    if (!fs.existsSync(full)) return { path: rel, exists: false };
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      const tree = hashTree(full);
      return { path: rel, exists: true, type: "directory", files: tree.files, sha256: tree.sha256 };
    }
    return { path: rel, exists: true, type: "file", bytes: st.size, sha256: sha256File(full) };
  });
}
function compareItems(before, after) {
  const a = new Map((before || []).map((item) => [item.path, item]));
  const b = new Map((after || []).map((item) => [item.path, item]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const p of paths) {
    if (JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))) changes.push({ path: p, before: a.get(p), after: b.get(p) });
  }
  return { identical: changes.length === 0, changes };
}
function sameBytes(a, b) { return fs.readFileSync(a).equals(fs.readFileSync(b)); }

function verifyManifest(reportDir) {
  const manifestPath = path.join(reportDir, "checksums.sha256");
  if (!fs.existsSync(manifestPath)) fail(`Checksum manifest missing: ${manifestPath}`);
  const lines = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const entries = [];
  const errors = [];
  for (const line of lines) {
    const match = line.match(/^([a-fA-F0-9]{64})\s\s(.+)$/);
    if (!match) { errors.push({ type: "malformed", line }); continue; }
    const rel = match[2].replace(/\\/g, "/");
    const full = path.join(reportDir, ...rel.split("/"));
    if (!fs.existsSync(full)) { errors.push({ type: "missing", path: rel }); continue; }
    const actual = sha256File(full);
    if (actual !== match[1].toLowerCase()) errors.push({ type: "mismatch", path: rel, expected: match[1].toLowerCase(), actual });
    entries.push(rel);
  }
  const actualFiles = listFilesRecursive(reportDir)
    .map((file) => relativeFromRoot(reportDir, file))
    .filter((rel) => rel !== "checksums.sha256");
  const unexpected = actualFiles.filter((rel) => !entries.includes(rel));
  const missing = entries.filter((rel) => !actualFiles.includes(rel));
  return { manifestPath, entries: entries.length, errors, unexpected, missing, passed: errors.length === 0 && unexpected.length === 0 && missing.length === 0 };
}

function findLatestReport(repoRoot, milestone, summaryName) {
  const reportsRoot = path.join(repoRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportsRoot)) fail(`Missing P05.12 reports root: ${reportsRoot}`);
  const candidates = listFilesRecursive(reportsRoot)
    .filter((file) => path.basename(file).toLowerCase() === summaryName.toLowerCase())
    .map((file) => ({ file, summary: readJson(file), mtimeMs: fs.statSync(file).mtimeMs }))
    .filter((item) => item.summary?.milestone === milestone)
    .sort((a, b) => {
      const ad = Date.parse(a.summary.generatedAtUtc || "") || a.mtimeMs;
      const bd = Date.parse(b.summary.generatedAtUtc || "") || b.mtimeMs;
      return bd - ad;
    });
  if (!candidates.length) fail(`No ${milestone} report found under .private/reports/P05.12.`);
  return { reportDir: path.dirname(candidates[0].file), summaryPath: candidates[0].file, summary: candidates[0].summary };
}

function verifyAk(repoRoot) {
  const report = findLatestReport(repoRoot, EXPECTED.akMilestone, "p0512ak-summary.json");
  const manifest = verifyManifest(report.reportDir);
  const a = path.join(report.reportDir, "candidate-a");
  const b = path.join(report.reportDir, "candidate-b");
  const required = [
    "runtime-integration-contract.json",
    "artifact-schema-profiles.json",
    "runtime-code-references.json",
    "protected-state-current.json",
    "protected-state-vs-aj.json",
    "aj-independent-verification.json",
    "build-summary.json",
  ];
  const comparisons = required.map((name) => {
    const af = path.join(a, name); const bf = path.join(b, name);
    if (!fs.existsSync(af) || !fs.existsSync(bf)) fail(`AK repeated-build artifact missing: ${name}`);
    return { file: name, identical: sameBytes(af, bf), sha256: sha256File(af), bytes: fs.statSync(af).size };
  });
  const candidateSummary = readJson(path.join(a, "build-summary.json"));
  const contract = readJson(path.join(a, "runtime-integration-contract.json"));
  const protectedCurrent = readJson(path.join(a, "protected-state-current.json"));
  const ajVerification = readJson(path.join(a, "aj-independent-verification.json"));
  const candidateGateValues = candidateSummary.gates || {};
  const falseCandidateGates = Object.entries(candidateGateValues).filter(([, value]) => value !== true).map(([key]) => key);
  const expectedFailClosedReason = falseCandidateGates.length === 1 && falseCandidateGates[0] === "visibleReaderConsumersResolved";
  const finalGateValues = report.summary.gates || {};
  const expectedFinalFalseGates = Object.entries(finalGateValues).filter(([, value]) => value !== true).map(([key]) => key);
  const finalFailureExpected = expectedFinalFalseGates.every((key) => ["candidateAAllGatesPassed", "candidateBAllGatesPassed"].includes(key)) && expectedFinalFalseGates.length === 2;
  const gates = {
    manifestPassed: manifest.passed,
    repeatedArtifactsIdentical: comparisons.every((item) => item.identical),
    ajStillPasses: ajVerification.passed === true,
    protectedStateUnchanged: report.summary.gates?.protectedProductionStateUnchanged === true,
    stagingOnly: report.summary.gates?.stagingOnly === true,
    productionPromotionNotAuthorized: report.summary.gates?.productionPromotionNotAuthorized === true,
    failClosedReasonIsOnlyVisibleReaderConsumer: expectedFailClosedReason,
    finalVerificationFailureMatchesCandidateFailure: finalFailureExpected,
    applicationPreviewWasNotAuthorized: report.summary.authorization?.safeToCreateIsolatedKjvApplicationPreview === false,
    productionPromotionWasNotPerformed: report.summary.authorization?.productionPromotionPerformed === false,
  };
  return {
    report,
    manifest,
    comparisons,
    candidateSummary,
    contract,
    protectedCurrent,
    ajVerification,
    falseCandidateGates,
    expectedFinalFalseGates,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

function codeRoots(repoRoot) {
  return ["app", "src", "components", "lib"]
    .map((rel) => path.join(repoRoot, rel))
    .filter((full) => fs.existsSync(full));
}
function isCodeFile(file) { return CODE_EXTENSIONS.includes(path.extname(file).toLowerCase()); }
function scanRuntimeFiles(repoRoot) {
  const files = [];
  for (const root of codeRoots(repoRoot)) {
    for (const file of listFilesRecursive(root)) {
      if (!isCodeFile(file)) continue;
      const rel = relativeFromRoot(repoRoot, file);
      if (/^app\/data\/scripture\/generated(?:KJV|WEB|Brenton)\.(?:ts|js)$/i.test(rel)) {
        files.push(file);
        continue;
      }
      if (fs.statSync(file).size <= 2 * 1024 * 1024) files.push(file);
    }
  }
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function parseModuleSpecifiers(text) {
  const specs = [];
  const patterns = [
    { kind: "import-from", regex: /\bimport\s+(?:type\s+)?[\s\S]*?\sfrom\s*["']([^"']+)["']/g },
    { kind: "import-side-effect", regex: /\bimport\s*["']([^"']+)["']/g },
    { kind: "export-from", regex: /\bexport\s+(?:\*|\{[\s\S]*?\})\s+from\s*["']([^"']+)["']/g },
    { kind: "require", regex: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g },
    { kind: "dynamic-import", regex: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g },
  ];
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  function lineFor(index) {
    let lo = 0; let hi = starts.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (starts[mid] <= index) lo = mid + 1; else hi = mid - 1;
    }
    return hi + 1;
  }
  for (const { kind, regex } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) specs.push({ kind, specifier: match[1], line: lineFor(match.index) });
  }
  const unique = new Map();
  for (const item of specs) unique.set(`${item.kind}\0${item.specifier}\0${item.line}`, item);
  return [...unique.values()].sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier));
}

function resolveLocalSpecifier(repoRoot, fromFile, specifier) {
  if (!specifier || (!specifier.startsWith(".") && !specifier.startsWith("@/"))) return null;
  const base = specifier.startsWith("@/")
    ? path.join(repoRoot, ...specifier.slice(2).split("/"))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  candidates.push(base);
  for (const ext of RESOLUTION_EXTENSIONS) candidates.push(`${base}${ext}`);
  for (const ext of RESOLUTION_EXTENSIONS) candidates.push(path.join(base, `index${ext}`));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
  }
  return null;
}

function buildModuleGraph(repoRoot) {
  const runtimeFiles = scanRuntimeFiles(repoRoot);
  const nodeSet = new Set(runtimeFiles.map((file) => path.resolve(file)));
  const nodes = [];
  const edges = [];
  for (const file of runtimeFiles) {
    const rel = relativeFromRoot(repoRoot, file);
    const st = fs.statSync(file);
    const isLargeGenerated = /^app\/data\/scripture\/generated(?:KJV|WEB|Brenton)\.(?:ts|js)$/i.test(rel);
    const text = isLargeGenerated && st.size > 2 * 1024 * 1024 ? "" : fs.readFileSync(file, "utf8");
    const specifiers = text ? parseModuleSpecifiers(text) : [];
    nodes.push({ file: rel, bytes: st.size, sha256: sha256File(file), parsed: Boolean(text), specifierCount: specifiers.length });
    for (const item of specifiers) {
      const resolved = resolveLocalSpecifier(repoRoot, file, item.specifier);
      edges.push({
        from: rel,
        to: resolved ? relativeFromRoot(repoRoot, resolved) : null,
        specifier: item.specifier,
        kind: item.kind,
        line: item.line,
        local: Boolean(resolved),
        targetExists: Boolean(resolved),
      });
      if (resolved && !nodeSet.has(resolved) && isCodeFile(resolved) && fs.statSync(resolved).size <= 2 * 1024 * 1024) {
        nodeSet.add(resolved);
      }
    }
  }
  return { nodes: nodes.sort((a, b) => a.file.localeCompare(b.file)), edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line || String(a.to).localeCompare(String(b.to))) };
}

function adjacency(graph) {
  const out = new Map();
  for (const edge of graph.edges) {
    if (!edge.to) continue;
    if (!out.has(edge.from)) out.set(edge.from, []);
    out.get(edge.from).push(edge);
  }
  for (const list of out.values()) list.sort((a, b) => a.line - b.line || a.to.localeCompare(b.to));
  return out;
}
function shortestPath(graph, start, targetPredicate) {
  const adj = adjacency(graph);
  const queue = [start];
  const prev = new Map([[start, null]]);
  const via = new Map();
  let found = null;
  while (queue.length) {
    const current = queue.shift();
    if (targetPredicate(current)) { found = current; break; }
    for (const edge of adj.get(current) || []) {
      if (prev.has(edge.to)) continue;
      prev.set(edge.to, current); via.set(edge.to, edge); queue.push(edge.to);
    }
  }
  if (!found) return null;
  const files = [];
  const edges = [];
  let cursor = found;
  while (cursor !== null) {
    files.push(cursor);
    const edge = via.get(cursor);
    if (edge) edges.push(edge);
    cursor = prev.get(cursor) ?? null;
  }
  files.reverse(); edges.reverse();
  return { files, edges };
}
function allEntryPoints(repoRoot) {
  const preferred = [
    "app/read/[book]/[chapter]/page.tsx",
    "app/components/ScriptureText.tsx",
    "app/components/ReaderWordStudyController.tsx",
    "app/api/word-study/route.ts",
  ];
  return preferred.filter((rel) => fs.existsSync(path.join(repoRoot, ...rel.split("/"))));
}
function exactArtifactPredicate(file) {
  return /^app\/data\/scripture\/generatedKJV\.(?:json|ts|js)$/i.test(file);
}
function canonicalStorePredicate(file) {
  return /(?:^|\/)CanonicalVerseStore\.(?:ts|tsx|js|jsx)$/i.test(file);
}
function findDataflowPaths(repoRoot, graph) {
  const entries = allEntryPoints(repoRoot);
  const visiblePaths = [];
  const canonicalPaths = [];
  for (const entry of entries) {
    const visible = shortestPath(graph, entry, exactArtifactPredicate);
    if (visible) visiblePaths.push({ entry, ...visible });
    const canonical = shortestPath(graph, entry, canonicalStorePredicate);
    if (canonical) canonicalPaths.push({ entry, ...canonical });
  }
  const directArtifactReferences = graph.edges.filter((edge) => edge.to && exactArtifactPredicate(edge.to));
  const canonicalStoreReferences = graph.edges.filter((edge) => edge.to && canonicalStorePredicate(edge.to));
  return {
    entryPoints: entries,
    visibleKjvPaths: visiblePaths,
    canonicalAvailabilityPaths: canonicalPaths,
    directArtifactReferences,
    canonicalStoreReferences,
  };
}

function sourceContext(file, lines, radius = 4) {
  const text = fs.readFileSync(file, "utf8");
  const split = text.split(/\r?\n/);
  const ranges = [];
  for (const line of lines) {
    const start = Math.max(1, line - radius);
    const end = Math.min(split.length, line + radius);
    ranges.push({ start, end, lines: split.slice(start - 1, end).map((value, index) => ({ line: start + index, text: value })) });
  }
  const merged = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      const byLine = new Map(last.lines.map((item) => [item.line, item]));
      for (const item of range.lines) byLine.set(item.line, item);
      last.end = Math.max(last.end, range.end);
      last.lines = [...byLine.values()].sort((a, b) => a.line - b.line);
    } else merged.push(range);
  }
  return merged;
}
function collectSnapshotFiles(paths) {
  const files = new Set();
  for (const collection of [paths.visibleKjvPaths, paths.canonicalAvailabilityPaths]) {
    for (const item of collection) for (const file of item.files) files.add(file);
  }
  for (const edge of [...paths.directArtifactReferences, ...paths.canonicalStoreReferences]) files.add(edge.from);
  return [...files].sort();
}
function writeSourceSnapshots(repoRoot, outputDir, graph, paths) {
  const graphEdgesByFrom = new Map();
  for (const edge of graph.edges) {
    if (!graphEdgesByFrom.has(edge.from)) graphEdgesByFrom.set(edge.from, []);
    graphEdgesByFrom.get(edge.from).push(edge);
  }
  const files = collectSnapshotFiles(paths);
  const index = [];
  for (const rel of files) {
    const full = path.join(repoRoot, ...rel.split("/"));
    if (!fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    const relevantLines = (graphEdgesByFrom.get(rel) || []).map((edge) => edge.line);
    const record = { path: rel, bytes: st.size, sha256: sha256File(full), copied: false, context: [] };
    if (st.size <= 512 * 1024 && isCodeFile(full)) {
      const target = path.join(outputDir, "source-snapshots", ...rel.split("/"));
      ensureDir(path.dirname(target));
      fs.copyFileSync(full, target);
      record.copied = true;
      record.snapshotPath = relativeFromRoot(outputDir, target);
      record.context = sourceContext(full, relevantLines.length ? relevantLines : [1]);
    }
    index.push(record);
  }
  return index;
}

function profileGeneratedKjv(repoRoot) {
  const candidates = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
  ];
  return candidates.map((rel) => {
    const full = path.join(repoRoot, ...rel.split("/"));
    if (!fs.existsSync(full)) return { path: rel, exists: false };
    const st = fs.statSync(full);
    return { path: rel, exists: true, bytes: st.size, sha256: sha256File(full) };
  });
}

function buildAdapterContract(repoRoot, ak, graph, paths, snapshots) {
  const visiblePath = paths.visibleKjvPaths.find((item) => item.entry === "app/read/[book]/[chapter]/page.tsx") || paths.visibleKjvPaths[0] || null;
  const canonicalPath = paths.canonicalAvailabilityPaths.find((item) => item.entry === "app/read/[book]/[chapter]/page.tsx") || paths.canonicalAvailabilityPaths[0] || null;
  const visibleConsumer = visiblePath?.files?.length >= 2 ? visiblePath.files[visiblePath.files.length - 2] : null;
  const canonicalConsumer = canonicalPath?.files?.length >= 2 ? canonicalPath.files[canonicalPath.files.length - 2] : null;
  return {
    milestone: EXPECTED.milestone,
    purpose: "EXACT KJV READER DATAFLOW AND ADAPTER CONTRACT",
    repository: gitInfo(repoRoot),
    retainedAkReport: relativeFromRoot(repoRoot, ak.report.reportDir),
    finding: {
      akStatus: "valid-fail-closed",
      akBlockedReason: "The prior lexical scan did not follow indirect imports to the visible KJV artifact.",
      visibleTextFlowResolved: Boolean(visiblePath),
      canonicalAvailabilityFlowResolved: Boolean(canonicalPath),
      visibleReaderEntry: visiblePath?.entry || null,
      visibleArtifact: visiblePath?.files?.at(-1) || null,
      visibleConsumer,
      canonicalStore: canonicalPath?.files?.at(-1) || null,
      canonicalConsumer,
    },
    exactFlows: {
      visibleKjv: visiblePath,
      canonicalAvailability: canonicalPath,
    },
    applicationContract: {
      nextMilestone: "P05.12AM — ISOLATED KJV RUNTIME ADAPTER APPLICATION PREVIEW",
      requirements: [
        "Apply only to a staging copy of the exact modules and artifacts identified by this contract.",
        "Keep KJV2006 visible text exact at all 31,102 coordinates.",
        "Use retained P05.12AJ reader-coordinate translation blocks as the sole route input.",
        "Keep 31,085 supported coordinates routed and 17 reader-only coordinates visible but fail closed.",
        "Preserve explicit one-source-to-many and many-source-to-one topology.",
        "Do not infer or create token alignments that are absent from P05.12AJ.",
        "Prove the existing WEB and Brenton reader flows are byte-unchanged.",
        "Prove live canonical, production KJV, and alignments are byte-unchanged.",
        "Build the staging adapter twice independently and compare byte-for-byte.",
        "Run the actual reader and word-study route gates against the staging adapter.",
        "Do not authorize or perform production promotion.",
      ],
      sourceSnapshotIndex: snapshots,
      generatedKjvArtifacts: profileGeneratedKjv(repoRoot),
    },
    stagingOnly: true,
    productionPromotionAuthorized: false,
  };
}

module.exports = {
  EXPECTED,
  fail,
  ensureDir,
  readJson,
  writeJson,
  sha256File,
  normalizeRel,
  relativeFromRoot,
  parseArgs,
  gitInfo,
  listFilesRecursive,
  hashTree,
  snapshotItems,
  compareItems,
  sameBytes,
  verifyManifest,
  verifyAk,
  scanRuntimeFiles,
  parseModuleSpecifiers,
  resolveLocalSpecifier,
  buildModuleGraph,
  allEntryPoints,
  findDataflowPaths,
  writeSourceSnapshots,
  profileGeneratedKjv,
  buildAdapterContract,
};
