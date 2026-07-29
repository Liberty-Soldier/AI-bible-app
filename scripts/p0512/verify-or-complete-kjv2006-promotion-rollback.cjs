#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MILESTONE = 'P05.12AP-R1';
const TARGETS = Object.freeze([
  'app/data/scripture/generatedKJV.json',
  'app/data/scripture/generatedKJV.ts',
  'public/scripture/runtime/kjv',
  'public/data/bibleiq/word-study-kjv-reader',
  'app/data/scripture/CanonicalVerseStore.ts',
]);

function die(message) { throw new Error(`[${MILESTONE}] ${message}`); }
function normalizeRel(value) {
  const s = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!s || s.startsWith('/') || /^[A-Za-z]:\//.test(s) || s.split('/').includes('..')) die(`Unsafe relative path: ${value}`);
  return s;
}
function abs(root, rel) { return path.join(root, ...normalizeRel(rel).split('/')); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(p, value) { ensureDir(path.dirname(p)); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function shaFile(p) { const h = crypto.createHash('sha256'); h.update(fs.readFileSync(p)); return h.digest('hex'); }
function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const st = fs.statSync(root);
  if (st.isFile()) return [''];
  const out = [];
  function walk(dir, prefix) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, ent.name);
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(full, rel);
      else if (ent.isFile()) out.push(rel);
      else die(`Unsupported filesystem entry: ${full}`);
    }
  }
  walk(root, '');
  return out;
}
function snapshotPath(root, rel) {
  const full = abs(root, rel);
  if (!fs.existsSync(full)) return { path: rel, exists: false };
  const st = fs.statSync(full);
  if (st.isFile()) return { path: rel, exists: true, type: 'file', bytes: st.size, sha256: shaFile(full) };
  if (!st.isDirectory()) die(`Unsupported target type: ${rel}`);
  const entries = listFiles(full).map(file => {
    const p = path.join(full, ...file.split('/'));
    return { path: file, bytes: fs.statSync(p).size, sha256: shaFile(p) };
  });
  const h = crypto.createHash('sha256');
  for (const f of entries) h.update(`${f.sha256}  ${f.path}\n`);
  return { path: rel, exists: true, type: 'directory', files: entries.length, sha256: h.digest('hex'), entries };
}
function comparableSnapshot(s) { const x = JSON.parse(JSON.stringify(s)); delete x.path; return x; }
function sameSnapshot(a, b) { return JSON.stringify(comparableSnapshot(a)) === JSON.stringify(comparableSnapshot(b)); }
function snapshotSet(root, rels) { return rels.map(rel => snapshotPath(root, rel)); }
function compareSnapshotSets(expected, actual) {
  const actualMap = new Map(actual.map(x => [x.path, x]));
  const differences = [];
  for (const e of expected) {
    const a = actualMap.get(e.path);
    if (!a || !sameSnapshot(e, a)) differences.push({ path: e.path, expected: e, actual: a || null });
  }
  return differences;
}
function copyExact(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  ensureDir(path.dirname(dst));
  const st = fs.statSync(src);
  if (st.isDirectory()) fs.cpSync(src, dst, { recursive: true, force: true, preserveTimestamps: true });
  else fs.copyFileSync(src, dst);
}
function locateLatestAp(root) {
  const base = abs(root, '.private/reports/P05.12');
  if (!fs.existsSync(base)) die('Missing .private/reports/P05.12.');
  const dirs = fs.readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory() && /-controlled-kjv2006-production-promotion$/.test(e.name))
    .map(e => e.name).sort().reverse();
  for (const name of dirs) {
    const dir = path.join(base, name);
    if (fs.existsSync(path.join(dir, 'p0512ap-summary.json')) || fs.existsSync(path.join(dir, 'rollback-payload'))) return dir;
  }
  die('No P05.12AP production-promotion report directory was found.');
}
function safeReadText(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function tailLines(text, count = 250) { const lines = String(text).split(/\r?\n/); return lines.slice(Math.max(0, lines.length - count)).join('\n'); }
function candidateMatchesExpected(root, candidateFull, expected) {
  if (!fs.existsSync(candidateFull)) return false;
  const relFromRoot = path.relative(root, candidateFull).replace(/\\/g, '/');
  if (relFromRoot.startsWith('..')) {
    const tempRoot = path.dirname(candidateFull);
    const tempRel = path.basename(candidateFull);
    const snap = snapshotPath(tempRoot, tempRel);
    snap.path = expected.path;
    return sameSnapshot(expected, snap);
  }
  const snap = snapshotPath(root, relFromRoot);
  snap.path = expected.path;
  return sameSnapshot(expected, snap);
}
function restoreOne(root, apReport, rollbackRoot, expected, absence, actions) {
  const rel = expected.path;
  const target = abs(root, rel);
  const current = snapshotPath(root, rel);
  if (sameSnapshot(expected, current)) { actions.push({ path: rel, action: 'already-restored' }); return; }

  if (!expected.exists) {
    fs.rmSync(target, { recursive: true, force: true });
    actions.push({ path: rel, action: 'deleted-created-target' });
    return;
  }

  const backup = abs(rollbackRoot, rel);
  const suffix = `.p0512ap-${path.basename(apReport)}`;
  const oldSibling = `${target}${suffix}.old`;
  let source = null;
  if (candidateMatchesExpected(rollbackRoot, backup, expected)) source = backup;
  else if (candidateMatchesExpected(root, oldSibling, expected)) source = oldSibling;

  if (!source) {
    die(`Neither the fresh rollback payload nor the transaction .old sibling matches the pre-promotion state for ${rel}.`);
  }
  copyExact(source, target);
  actions.push({ path: rel, action: 'restored', source: path.relative(root, source).replace(/\\/g, '/') });
}
function cleanupSiblings(root, apReport) {
  const suffix = `.p0512ap-${path.basename(apReport)}`;
  const removed = [];
  for (const rel of TARGETS) {
    const target = abs(root, rel);
    for (const ext of ['.new', '.old']) {
      const p = `${target}${suffix}${ext}`;
      if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(path.relative(root, p).replace(/\\/g, '/')); }
    }
  }
  return removed;
}
function copyDiagnostic(apReport, reportDir, name) {
  const src = path.join(apReport, name);
  if (!fs.existsSync(src)) return false;
  const dst = path.join(reportDir, 'source-ap-diagnostics', name);
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--report-dir');
  if (idx < 0 || !args[idx + 1]) die('Missing --report-dir.');
  const root = process.cwd();
  const reportDir = path.resolve(args[idx + 1]);
  ensureDir(reportDir);

  const output = {
    milestone: MILESTONE,
    purpose: 'VERIFY OR COMPLETE AUTOMATIC ROLLBACK AFTER FAILED P05.12AP BUILD AND RECOVER BUILD DIAGNOSTICS',
    startedAt: new Date().toISOString(),
    productionPromotionSucceeded: false,
    safeToRerunPromotion: false,
    safeToCloseP0512: false,
  };

  try {
    if (!fs.existsSync(path.join(root, 'package.json'))) die('Run from the repository root containing package.json.');
    const apReport = locateLatestAp(root);
    output.sourceApReport = path.relative(root, apReport).replace(/\\/g, '/');

    const summaryPath = path.join(apReport, 'p0512ap-summary.json');
    const apSummary = fs.existsSync(summaryPath) ? readJson(summaryPath) : null;
    output.sourceApSummaryPresent = Boolean(apSummary);
    output.sourceApState = apSummary ? {
      error: apSummary.error || null,
      promotion: apSummary.promotion || null,
      postPromotion: apSummary.postPromotion || null,
      rollback: apSummary.rollback || null,
      authorization: apSummary.authorization || null,
    } : null;

    const expectedTargetsPath = path.join(apReport, 'target-state-before.json');
    const expectedProtectedPath = path.join(apReport, 'protected-state-before.json');
    if (!fs.existsSync(expectedTargetsPath)) die('Missing target-state-before.json in the AP report.');
    if (!fs.existsSync(expectedProtectedPath)) die('Missing protected-state-before.json in the AP report.');
    const expectedTargets = readJson(expectedTargetsPath);
    const expectedProtected = readJson(expectedProtectedPath);
    if (!Array.isArray(expectedTargets) || expectedTargets.length !== TARGETS.length) die('Invalid target-state-before.json.');
    if (JSON.stringify(expectedTargets.map(x => x.path)) !== JSON.stringify(TARGETS)) die('AP target-state-before paths do not match the five approved targets.');

    const currentBefore = snapshotSet(root, TARGETS);
    const protectedCurrentBefore = snapshotSet(root, expectedProtected.map(x => x.path));
    writeJson(path.join(reportDir, 'target-state-at-recovery-start.json'), currentBefore);
    writeJson(path.join(reportDir, 'protected-state-at-recovery-start.json'), protectedCurrentBefore);
    const targetDifferencesBefore = compareSnapshotSets(expectedTargets, currentBefore);
    const protectedDifferencesBefore = compareSnapshotSets(expectedProtected, protectedCurrentBefore);
    output.initialVerification = {
      targetsRestored: targetDifferencesBefore.length === 0,
      targetDifferences: targetDifferencesBefore,
      protectedStateRestored: protectedDifferencesBefore.length === 0,
      protectedDifferences: protectedDifferencesBefore,
    };

    const actions = [];
    let wroteProductionTargets = false;
    if (targetDifferencesBefore.length > 0) {
      const rollbackRoot = path.join(apReport, 'rollback-payload');
      if (!fs.existsSync(rollbackRoot)) die('Production differs from pre-promotion state and the AP rollback-payload is missing.');
      const absencePath = path.join(apReport, 'rollback-absence.json');
      const absence = fs.existsSync(absencePath) ? readJson(absencePath) : [];
      if (!Array.isArray(absence)) die('Invalid rollback-absence.json.');
      for (const expected of expectedTargets.slice().reverse()) restoreOne(root, apReport, rollbackRoot, expected, absence, actions);
      wroteProductionTargets = true;
    }

    const currentAfter = snapshotSet(root, TARGETS);
    const protectedCurrentAfter = snapshotSet(root, expectedProtected.map(x => x.path));
    writeJson(path.join(reportDir, 'target-state-after-recovery.json'), currentAfter);
    writeJson(path.join(reportDir, 'protected-state-after-recovery.json'), protectedCurrentAfter);
    const targetDifferencesAfter = compareSnapshotSets(expectedTargets, currentAfter);
    const protectedDifferencesAfter = compareSnapshotSets(expectedProtected, protectedCurrentAfter);
    const cleanup = targetDifferencesAfter.length === 0 ? cleanupSiblings(root, apReport) : [];

    output.recovery = {
      needed: targetDifferencesBefore.length > 0,
      wroteProductionTargets,
      actions,
      transactionSiblingsRemoved: cleanup,
      targetsVerifiedRestored: targetDifferencesAfter.length === 0,
      targetDifferences: targetDifferencesAfter,
      protectedStateVerifiedRestored: protectedDifferencesAfter.length === 0,
      protectedDifferences: protectedDifferencesAfter,
    };

    const diagnostics = [
      'p0512ap-summary.json',
      'preflight-summary.json',
      'installation-journal.json',
      'production-build.stdout.log',
      'production-build.stderr.log',
      'production-build.result.json',
      'powershell-error.log',
    ];
    output.diagnosticsCopied = diagnostics.filter(name => copyDiagnostic(apReport, reportDir, name));
    const buildStdout = safeReadText(path.join(apReport, 'production-build.stdout.log'));
    const buildStderr = safeReadText(path.join(apReport, 'production-build.stderr.log'));
    fs.writeFileSync(path.join(reportDir, 'production-build-combined-tail.log'), `${tailLines(buildStdout)}\n\n--- STDERR ---\n${tailLines(buildStderr)}\n`, 'utf8');

    output.safeToRerunPromotion = output.recovery.targetsVerifiedRestored && output.recovery.protectedStateVerifiedRestored;
    output.safeToDiagnoseAndCorrectBuildFailure = output.safeToRerunPromotion;
    if (!output.safeToRerunPromotion) die('Rollback could not be verified exactly. Do not rerun promotion.');
  } catch (err) {
    output.error = { message: err.message, stack: err.stack };
  } finally {
    output.finishedAt = new Date().toISOString();
    writeJson(path.join(reportDir, 'p0512ap-r1-recovery-summary.json'), output);
  }

  if (!output.safeToRerunPromotion) {
    console.error(output.error?.stack || `[${MILESTONE}] Rollback is not verified.`);
    process.exitCode = 2;
  } else {
    console.log(`[${MILESTONE}] Pre-promotion production state is exactly restored. Build diagnostics were recovered.`);
  }
}

main();
