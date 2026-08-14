#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());
const STRATEGY = path.join(
  ROOT,
  "scripts",
  "canonical",
  "strategies",
  "weakSourceCollisions.js",
);
const LEXICON = path.join(
  ROOT,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json",
);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(name);
}
function fail(message) {
  throw new Error(`[canonical weak-source collision reconciliation] ${message}`);
}
function existsFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
function existsDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
function readJson(file) {
  if (!existsFile(file)) fail(`Missing required file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function writeJson(file, value, compact = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    compact ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}
function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
function normalizeBook(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^0-9A-Za-z]+/gu, "")
    .toLowerCase();
}
function stableSourceBook(id) {
  const match = /^hebrew:([^:]+):\d+:\d+:\d+$/u.exec(String(id || ""));
  return match ? match[1] : null;
}
function stableSourceVerse(id) {
  const match = /^hebrew:[^:]+:(\d+):(\d+):\d+$/u.exec(String(id || ""));
  return match ? `${Number(match[1])}:${Number(match[2])}` : null;
}
function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^0-9A-Za-z]+/gu, "")
    .toLowerCase();
}
function compactSourceId(value) {
  return Array.isArray(value) ? String(value[0] || "") : "";
}
function compactStrong(value) {
  return Array.isArray(value) ? String(value[3] || "") : "";
}
function compactEntity(value) {
  return Array.isArray(value) ? String(value[4] || "") : "";
}
function listJsonFiles(root) {
  if (!existsDir(root)) fail(`Canonical root missing: ${root}`);
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right));
}
function fixtureFromCanonical(root, verseKey, displayIndex) {
  const gen = readJson(path.join(root, "Gen.json"));
  const verse = gen?.[verseKey] || gen?.verses?.[verseKey];
  if (!verse) return null;
  const token = verse?.translations?.kjv?.tokens?.find(
    (item) => Number(item?.index) === Number(displayIndex),
  );
  const sourceId = String(token?.alignedSourceTokenIds?.[0] || "");
  const source = (verse?.sourceTokens || []).find(
    (item) => String(item?.id || "") === sourceId,
  );
  return {
    verseKey,
    displayIndex,
    displayText: token?.text ?? null,
    normalized: token?.normalized ?? null,
    method: token?.method ?? token?.alignmentMethod ?? null,
    sourceId: source?.id ?? null,
    strong: source?.strong ?? null,
    entityId: source?.entityId ?? null,
  };
}
function buildPlan(canonicalRoot, apply) {
  if (!existsFile(STRATEGY)) fail(`Permanent strategy missing: ${STRATEGY}`);
  if (!existsFile(LEXICON)) fail(`Canonical Hebrew lexicon missing: ${LEXICON}`);

  delete require.cache[require.resolve(STRATEGY)];
  const { reconcileWeakSourceCollisions } = require(STRATEGY);
  if (typeof reconcileWeakSourceCollisions !== "function") {
    fail("Permanent strategy does not export reconcileWeakSourceCollisions().");
  }

  const lexicon = readJson(LEXICON);
  const files = listJsonFiles(canonicalRoot);
  const documents = new Map();
  const verseOwner = new Map();
  const canonicalByVerse = {};

  for (const file of files) {
    const document = readJson(file);
    documents.set(file, document);

    const verseMap =
      document?.verses && typeof document.verses === "object"
        ? document.verses
        : document;

    for (const [verseKey, verse] of Object.entries(verseMap || {})) {
      if (canonicalByVerse[verseKey]) {
        fail(`Duplicate canonical verse key across Hebrew files: ${verseKey}`);
      }
      canonicalByVerse[verseKey] = verse;
      verseOwner.set(verseKey, file);
    }
  }

  const result = reconcileWeakSourceCollisions(canonicalByVerse, lexicon, {
    apply,
    translationIds: ["kjv"],
    minRemoteDisplayDistance: 5,
    minExternalSupport: 1,
  });

  const proposedRepairs = (result.proposedRepairs || []).map((proposal) => ({
    ...proposal,
    canonicalFile: path.basename(verseOwner.get(proposal.verseKey) || ""),
  }));

  const deferredEvidenceQueue = (result.deferredEvidenceQueue || []).map(
    (deferred) => ({
      ...deferred,
      canonicalFile: path.basename(verseOwner.get(deferred.verseKey) || ""),
    }),
  );

  const changedFiles = [
    ...new Set(
      proposedRepairs
        .map((proposal) => proposal.canonicalFile)
        .filter(Boolean),
    ),
  ].sort();

  if (apply) {
    for (const fileName of changedFiles) {
      const file = path.join(canonicalRoot, fileName);
      const document = documents.get(file);
      if (!document) {
        fail(`Changed canonical file was not loaded: ${fileName}`);
      }
      writeJson(file, document, true);
    }
  }

  return {
    schema: "emetsees-canonical-weak-source-collision-plan@3.0.0",
    canonicalRoot,
    apply,
    lexicalEvidence: result.lexicalEvidence || null,
    policy: result.policy || null,
    proposedRepairs,
    deferredEvidenceQueue,
    changedFiles,
  };
}

function updateManifestBookHash(manifest, fileName, filePath) {
  if (!manifest || !existsFile(filePath)) return;

  const candidates = [
    manifest?.books?.[fileName],
    manifest?.corpora?.hebrew?.books?.[fileName],
  ].filter(Boolean);

  for (const stats of candidates) {
    if (Object.prototype.hasOwnProperty.call(stats, "sha256")) {
      stats.sha256 = sha256File(filePath);
    }
    if (Object.prototype.hasOwnProperty.call(stats, "checksum")) {
      stats.checksum = sha256File(filePath);
    }
    if (Object.prototype.hasOwnProperty.call(stats, "bytes")) {
      stats.bytes = fs.statSync(filePath).size;
    }
  }
}

function syncRuntimeFromPlan(plan) {
  const genericRoot = path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "word-study",
    "hebrew",
  );
  const genericManifestFile = path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "word-study",
    "manifest.json",
  );
  const dedicatedRoot = path.join(
    ROOT,
    "public",
    "data",
    "bibleiq",
    "word-study-kjv-reader",
  );
  const dedicatedManifestFile = path.join(dedicatedRoot, "manifest.json");

  const genericDocs = new Map();
  const dedicatedDocs = new Map();
  const changedGeneric = new Set();
  const changedDedicated = new Set();

  const dedicatedManifest = readJson(dedicatedManifestFile);
  const genericManifest = existsFile(genericManifestFile)
    ? readJson(genericManifestFile)
    : null;

  const dedicatedSourceIndex = new Map();
  const dedicatedBookByStableBook = new Map();

  for (const [fileName, info] of Object.entries(dedicatedManifest?.books || {})) {
    if (String(info?.corpus || "") !== "hebrew") continue;

    const file = path.join(dedicatedRoot, fileName);
    if (!existsFile(file)) continue;

    const doc = readJson(file);
    dedicatedDocs.set(file, doc);

    for (const [verseKey, verse] of Object.entries(doc?.verses || {})) {
      for (let i = 0; i < (verse?.s || []).length; i++) {
        const id = compactSourceId(verse.s[i]);
        if (!id) continue;
        dedicatedSourceIndex.set(id, {
          fileName,
          file,
          verseKey,
          sourceIndex: i,
        });
        const stableBook = stableSourceBook(id);
        if (stableBook && !dedicatedBookByStableBook.has(stableBook)) {
          dedicatedBookByStableBook.set(stableBook, { fileName, file });
        }
      }
    }
  }

  for (const repair of plan.proposedRepairs || []) {
    const targetId = String(repair?.toSource?.id || "");
    const sourceBook = stableSourceBook(targetId);
    const sourceVerse = stableSourceVerse(targetId);
    if (!sourceBook || !sourceVerse) {
      fail(`Cannot parse target stable source ID: ${targetId}`);
    }

    const genericName = `${sourceBook}.json`;
    const genericFile = path.join(genericRoot, genericName);
    let generic = genericDocs.get(genericFile);

    if (!generic) {
      generic = readJson(genericFile);
      genericDocs.set(genericFile, generic);
    }

    const genericVerse = generic?.verses?.[sourceVerse];
    if (!genericVerse) {
      fail(`Generic Hebrew runtime verse missing for ${targetId}.`);
    }

    const genericTargetIndex = (genericVerse?.s || []).findIndex(
      (source) => compactSourceId(source) === targetId,
    );
    if (genericTargetIndex < 0) {
      fail(`Generic Hebrew runtime target source missing: ${targetId}.`);
    }

    const displayKey = String(repair.displayIndex);
    const genericCurrentIndex = Number(genericVerse?.a?.kjv?.[displayKey]);
    const genericCurrentSource = Number.isInteger(genericCurrentIndex)
      ? genericVerse?.s?.[genericCurrentIndex]
      : null;
    const expectedFromId = String(repair?.fromSource?.id || "");
    if (compactSourceId(genericCurrentSource) !== expectedFromId) {
      fail(
        `Generic runtime precondition mismatch at ${repair.verseKey} token ` +
          `${displayKey}: expected ${expectedFromId}, found ` +
          `${compactSourceId(genericCurrentSource) || "missing"}.`,
      );
    }

    genericVerse.a = genericVerse.a || {};
    genericVerse.a.kjv = genericVerse.a.kjv || {};
    genericVerse.a.kjv[displayKey] = genericTargetIndex;
    changedGeneric.add(genericName);

    let dedicatedTarget = dedicatedSourceIndex.get(targetId);
    let dedicatedFileName = dedicatedTarget?.fileName || null;
    let dedicatedFile = dedicatedTarget?.file || null;
    let dedicatedVerseKey = dedicatedTarget?.verseKey || sourceVerse;

    if (!dedicatedFile) {
      const owner = dedicatedBookByStableBook.get(sourceBook);
      if (!owner) {
        fail(`Dedicated KJV runtime book missing for stable source book ${sourceBook}.`);
      }
      dedicatedFileName = owner.fileName;
      dedicatedFile = owner.file;
    }

    const dedicated = dedicatedDocs.get(dedicatedFile);
    const dedicatedVerse = dedicated?.verses?.[dedicatedVerseKey];
    if (!dedicatedVerse) {
      fail(`Dedicated KJV runtime verse missing for ${targetId}.`);
    }

    const dedicatedCurrentIndex = Number(dedicatedVerse?.a?.kjv?.[displayKey]);
    const dedicatedCurrentSource = Number.isInteger(dedicatedCurrentIndex)
      ? dedicatedVerse?.s?.[dedicatedCurrentIndex]
      : null;
    if (compactSourceId(dedicatedCurrentSource) !== expectedFromId) {
      fail(
        `Dedicated runtime precondition mismatch at ${repair.verseKey} token ` +
          `${displayKey}: expected ${expectedFromId}, found ` +
          `${compactSourceId(dedicatedCurrentSource) || "missing"}.`,
      );
    }

    let dedicatedTargetIndex = dedicatedTarget?.sourceIndex;
    if (!Number.isInteger(dedicatedTargetIndex)) {
      dedicatedVerse.s = Array.isArray(dedicatedVerse.s) ? dedicatedVerse.s : [];
      dedicatedTargetIndex = dedicatedVerse.s.length;
      dedicatedVerse.s.push([...(genericVerse.s[genericTargetIndex] || [])]);
      dedicatedTarget = {
        fileName: dedicatedFileName,
        file: dedicatedFile,
        verseKey: dedicatedVerseKey,
        sourceIndex: dedicatedTargetIndex,
      };
      dedicatedSourceIndex.set(targetId, dedicatedTarget);
    }

    dedicatedVerse.a = dedicatedVerse.a || {};
    dedicatedVerse.a.kjv = dedicatedVerse.a.kjv || {};
    dedicatedVerse.a.kjv[displayKey] = dedicatedTargetIndex;
    changedDedicated.add(dedicatedFileName);
  }

  for (const [file, doc] of genericDocs) {
    if (changedGeneric.has(path.basename(file))) {
      writeJson(file, doc, true);
    }
  }

  for (const [file, doc] of dedicatedDocs) {
    if (changedDedicated.has(path.basename(file))) {
      writeJson(file, doc, true);
    }
  }

  for (const fileName of changedGeneric) {
    updateManifestBookHash(
      genericManifest,
      fileName,
      path.join(genericRoot, fileName),
    );
  }

  for (const fileName of changedDedicated) {
    updateManifestBookHash(
      dedicatedManifest,
      fileName,
      path.join(dedicatedRoot, fileName),
    );
  }

  if (genericManifest) {
    writeJson(genericManifestFile, genericManifest, false);
  }
  writeJson(dedicatedManifestFile, dedicatedManifest, false);

  return {
    changedGeneric: [...changedGeneric].sort(),
    changedDedicated: [...changedDedicated].sort(),
    genericManifestChanged: Boolean(genericManifest),
    dedicatedManifestChanged: true,
  };
}

function verifyRuntimeFixture() {
  const generic = readJson(
    path.join(
      ROOT,
      "public",
      "data",
      "bibleiq",
      "word-study",
      "hebrew",
      "Gen.json",
    ),
  );
  const gv = generic?.verses?.["3:16"];
  const gsaidIndex = Number(gv?.a?.kjv?.["4"]);
  const gdesireIndex = Number(gv?.a?.kjv?.["23"]);
  const gsaid = Number.isInteger(gsaidIndex) ? gv?.s?.[gsaidIndex] : null;
  const gdesire = Number.isInteger(gdesireIndex) ? gv?.s?.[gdesireIndex] : null;

  const dedicated = readJson(
    path.join(
      ROOT,
      "public",
      "data",
      "bibleiq",
      "word-study-kjv-reader",
      "Genesis.json",
    ),
  );
  const dv = dedicated?.verses?.["3:16"];
  const dsaidIndex = Number(dv?.a?.kjv?.["4"]);
  const ddesireIndex = Number(dv?.a?.kjv?.["23"]);
  const dsaid = Number.isInteger(dsaidIndex) ? dv?.s?.[dsaidIndex] : null;
  const ddesire = Number.isInteger(ddesireIndex) ? dv?.s?.[ddesireIndex] : null;

  const result = {
    generic: {
      said: {
        sourceIndex: gsaidIndex,
        sourceId: compactSourceId(gsaid),
        strong: compactStrong(gsaid),
        entityId: compactEntity(gsaid),
      },
      desire: {
        sourceIndex: gdesireIndex,
        sourceId: compactSourceId(gdesire),
        strong: compactStrong(gdesire),
        entityId: compactEntity(gdesire),
      },
    },
    dedicated: {
      said: {
        sourceIndex: dsaidIndex,
        sourceId: compactSourceId(dsaid),
        strong: compactStrong(dsaid),
        entityId: compactEntity(dsaid),
      },
      desire: {
        sourceIndex: ddesireIndex,
        sourceId: compactSourceId(ddesire),
        strong: compactStrong(ddesire),
        entityId: compactEntity(ddesire),
      },
    },
  };

  for (const runtime of ["generic", "dedicated"]) {
    if (result[runtime].said.strong !== "H559") {
      fail(`${runtime} Genesis 3:16 said expected H559.`);
    }
    if (result[runtime].desire.strong !== "H8669") {
      fail(`${runtime} Genesis 3:16 desire expected H8669.`);
    }
  }

  return result;
}

function main() {
  const canonicalRoot = path.resolve(
    arg(
      "--canonical-root",
      path.join(ROOT, "app", "data", "bibleiq", "canonical", "hebrew"),
    ),
  );
  const mirrorRootArg = arg("--mirror-root", null);
  const mirrorRoot = mirrorRootArg ? path.resolve(mirrorRootArg) : null;
  const apply = flag("--apply");
  const reportFile = arg("--report", null);

  const before = {
    said: fixtureFromCanonical(canonicalRoot, "Gen:3:16", 4),
    desire: fixtureFromCanonical(canonicalRoot, "Gen:3:16", 23),
  };

  if (!before.said || !before.desire) {
    fail("Genesis 3:16 canonical KJV hard fixture is missing.");
  }
  if (before.said.strong !== "H559") {
    fail(`Genesis 3:16 said expected H559, found ${before.said.strong}.`);
  }

  const plan = buildPlan(canonicalRoot, apply);

  const fixtureProposal = plan.proposedRepairs.find(
    (repair) =>
      repair.verseKey === "Gen:3:16" &&
      repair.translationId === "kjv" &&
      Number(repair.displayIndex) === 23,
  );

  if (before.desire.strong !== "H8669") {
    if (!fixtureProposal || fixtureProposal?.toSource?.strong !== "H8669") {
      fail(
        `Systemic canonical collision rule did not produce the required ` +
          `Genesis 3:16 desire -> H8669 repair. Current=${before.desire.strong}.`,
      );
    }
  }

  let mirror = null;
  if (mirrorRoot) {
    const mirrorBefore = {
      said: fixtureFromCanonical(mirrorRoot, "Gen:3:16", 4),
      desire: fixtureFromCanonical(mirrorRoot, "Gen:3:16", 23),
    };
    if (
      mirrorBefore?.said?.strong !== before.said.strong ||
      mirrorBefore?.desire?.strong !== before.desire.strong
    ) {
      fail("Mirror canonical Genesis 3:16 fixture does not match app canonical.");
    }

    mirror = buildPlan(mirrorRoot, apply);

    const appSignature = plan.proposedRepairs
      .map(
        (repair) =>
          `${repair.verseKey}|${repair.translationId}|${repair.displayIndex}|` +
          `${repair.fromSource?.id}|${repair.toSource?.id}`,
      )
      .sort();

    const mirrorSignature = mirror.proposedRepairs
      .map(
        (repair) =>
          `${repair.verseKey}|${repair.translationId}|${repair.displayIndex}|` +
          `${repair.fromSource?.id}|${repair.toSource?.id}`,
      )
      .sort();

    if (JSON.stringify(appSignature) !== JSON.stringify(mirrorSignature)) {
      fail("App/private canonical reconciliation plans are not identical.");
    }
  }

  let runtimeSync = null;
  if (apply && flag("--sync-runtime")) {
    runtimeSync = syncRuntimeFromPlan(plan);
  }

  const after = apply
    ? {
        said: fixtureFromCanonical(canonicalRoot, "Gen:3:16", 4),
        desire: fixtureFromCanonical(canonicalRoot, "Gen:3:16", 23),
      }
    : null;

  if (apply) {
    if (after.said.strong !== "H559") {
      fail(`Post-apply canonical said expected H559, found ${after.said.strong}.`);
    }
    if (after.desire.strong !== "H8669") {
      fail(
        `Post-apply canonical desire expected H8669, found ${after.desire.strong}.`,
      );
    }
  }

  const runtimeFixture =
    apply && flag("--sync-runtime") ? verifyRuntimeFixture() : null;

  const output = {
    schema: "emetsees-canonical-weak-source-collision-run@1.0.0",
    mode: apply ? "apply" : "plan",
    canonicalRoot,
    mirrorRoot,
    before,
    proposedRepairs: plan.proposedRepairs,
    deferredEvidenceQueue: plan.deferredEvidenceQueue,
    changedCanonicalFiles: plan.changedFiles,
    mirrorPlan: mirror
      ? {
          proposedRepairCount: mirror.proposedRepairs.length,
          changedCanonicalFiles: mirror.changedFiles,
        }
      : null,
    runtimeSync,
    after,
    runtimeFixture,
    counts: {
      proposedRepairs: plan.proposedRepairs.length,
      deferredCases: plan.deferredEvidenceQueue.length,
      changedCanonicalFiles: plan.changedFiles.length,
      changedGenericRuntimeFiles: runtimeSync?.changedGeneric?.length || 0,
      changedDedicatedRuntimeFiles: runtimeSync?.changedDedicated?.length || 0,
    },
    verdict: apply
      ? "CANONICAL_WEAK_SOURCE_COLLISIONS_RECONCILED"
      : "CANONICAL_WEAK_SOURCE_COLLISION_PLAN_READY",
  };

  if (reportFile) {
    writeJson(path.resolve(reportFile), output, false);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
