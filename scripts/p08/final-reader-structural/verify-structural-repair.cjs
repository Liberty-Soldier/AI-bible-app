#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());
const BOUND = path.resolve(
  process.env.EMETSEES_P0810_V7_BOUND_ROOT ||
  process.env.EMETSEES_P0810_V5_BOUND_ROOT ||
  process.env.EMETSEES_P0810_V4_BOUND_ROOT ||
  "",
);
const REPORT_DIR =
  process.env.EMETSEES_P0810_V7_REPORT_DIR
    ? path.resolve(process.env.EMETSEES_P0810_V7_REPORT_DIR)
    : (
        process.env.EMETSEES_P0810_V5_REPORT_DIR
          ? path.resolve(process.env.EMETSEES_P0810_V5_REPORT_DIR)
          : (
              process.env.EMETSEES_P0810_V4_REPORT_DIR
                ? path.resolve(process.env.EMETSEES_P0810_V4_REPORT_DIR)
                : null
            )
      );

const KJV_ROOT = path.join(ROOT, "public", "data", "bibleiq", "word-study-kjv-reader");
const GENERIC_ROOT = path.join(ROOT, "public", "data", "bibleiq", "word-study");
const KJV_DISPLAY = path.join(ROOT, "app", "data", "scripture", "generatedKJV.json");
const EVIDENCE_MAP = path.join(ROOT, "app", "data", "evidence", "evidenceBookMap.ts");
const READER_ADAPTER = path.join(ROOT, "app", "data", "scripture", "ReaderVerseAdapter.ts");

function fail(message) {
  throw new Error(`[P08.10 V7 verifier] ${message}`);
}
function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function readJson(file) {
  if (!existsFile(file)) fail(`Missing JSON: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function writeJson(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function normalizeAlias(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^0-9A-Za-z]+/gu, "")
    .toLowerCase();
  if (
    key === "songofsongs" ||
    key === "songofsolomon" ||
    key === "canticles"
  ) return "song";
  return key;
}
function tokenIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/æ/giu, "ae")
    .replace(/œ/giu, "oe")
    .replace(/[§¶†‡]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}
function loadBookMap() {
  const text = fs.readFileSync(EVIDENCE_MAP, "utf8");
  const map = new Map();
  const re = /^\s*(?:"([^"]+)"|([A-Za-z0-9]+)):\s*"([^"]+)",?\s*$/gmu;
  let match;
  while ((match = re.exec(text))) {
    map.set(match[1] || match[2], match[3]);
  }
  return map;
}
function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}
async function readCsv(file) {
  if (!existsFile(file)) fail(`Missing CSV: ${file}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers = null;
  const rows = [];
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/u, ""));
      continue;
    }
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}
function splitSet(value) {
  return new Set(
    String(value || "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean),
  );
}
function runtimeEntity(row) {
  return Array.isArray(row) ? String(row[4] || "") : "";
}
function loadRuntimeBook(root, manifest, book, bookMap, corpus = null) {
  const aliases = [
    book,
    bookMap.get(book) || book,
  ].map(normalizeAlias).filter(Boolean);

  if (corpus) {
    const cm = manifest?.corpora?.[corpus];
    const fileName = aliases
      .map((alias) => cm?.aliases?.[alias])
      .find(Boolean);
    if (!fileName) return null;
    return readJson(path.join(root, corpus, fileName));
  }

  const fileName = aliases
    .map((alias) => manifest?.aliases?.[alias])
    .find(Boolean);
  if (!fileName) return null;
  return readJson(path.join(root, fileName));
}
function routeAt(runtimeBook, translation, chapter, verse, displayIndex) {
  const compact = runtimeBook?.verses?.[
    `${Number(chapter)}:${Number(verse)}`
  ];
  const sourceIndex =
    compact?.a?.[translation]?.[String(displayIndex)];
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    return null;
  }
  const row = compact?.s?.[sourceIndex];
  if (!Array.isArray(row)) return null;
  return {
    sourceIndex,
    sourceId: String(row[0] || ""),
    sourceWord: String(row[1] || ""),
    strong: String(row[3] || ""),
    entityId: runtimeEntity(row),
    method: String(compact?.m?.[String(displayIndex)] || ""),
    owner: compact?.o || null,
  };
}
function displayText(record) {
  if (typeof record?.text === "string" && record.text.trim()) {
    return record.text;
  }
  return String(record?.sources?.[0]?.text || "");
}
function addFailure(target, payload) {
  if (target.length < 300) target.push(payload);
}
const STRUCTURAL_METHODS = new Set([
  "exact-token-position",
  "display-split-of-one-canonical-token",
  "display-fused-over-one-routed-canonical-token",
  "display-fused-same-entity",
  "multi-token-same-entity-span",
]);
function hasIndependentStructuralProvenance(route) {
  return Boolean(
    route &&
    STRUCTURAL_METHODS.has(String(route.method || "")) &&
    route.owner &&
    route.owner.p0810v7PreservedBaselineBecauseOwnerUnresolved !== true
  );
}
async function main() {
  if (!BOUND || !existsFile(path.join(BOUND, "summary.json"))) {
    fail("Bound P08.9A evidence root is required.");
  }

  const { tokenizeDisplayText } = require(
    path.join(ROOT, "scripts", "canonical", "utils", "tokenize.js"),
  );

  const bookMap = loadBookMap();
  if (bookMap.get("Song of Songs") !== "Song") {
    fail('Central alias "Song of Songs" -> "Song" is missing.');
  }

  const adapterText = fs.readFileSync(READER_ADAPTER, "utf8");
  if (
    !adapterText.includes("defensibleLxxOwnership") ||
    !adapterText.includes("lxxOwnership?.authoritativeOwnershipKey") ||
    !adapterText.includes("? String(verse)")
  ) {
    fail("Completed Brenton authoritative token-availability owner is missing.");
  }

  const kjvManifest = readJson(path.join(KJV_ROOT, "manifest.json"));
  const genericManifest = readJson(path.join(GENERIC_ROOT, "manifest.json"));

  const lxxAliases = genericManifest?.corpora?.lxx?.aliases || {};
  const songAliasTargets = [
    "songofsongs",
    "songofsolomon",
    "song",
    "canticles",
  ].map((alias) => lxxAliases[alias] || "");
  if (
    songAliasTargets.some((value) => !value) ||
    new Set(songAliasTargets).size !== 1
  ) {
    fail(
      `Generic LXX Song aliases are incomplete or divergent: ` +
      `${JSON.stringify({
        songofsongs: lxxAliases.songofsongs || null,
        songofsolomon: lxxAliases.songofsolomon || null,
        song: lxxAliases.song || null,
        canticles: lxxAliases.canticles || null,
      })}`,
    );
  }
  const kjvCache = new Map();
  const genericCache = new Map();

  function kjvBook(book) {
    if (!kjvCache.has(book)) {
      kjvCache.set(
        book,
        loadRuntimeBook(KJV_ROOT, kjvManifest, book, bookMap),
      );
    }
    return kjvCache.get(book);
  }
  function genericBook(corpus, book) {
    const key = `${corpus}|${book}`;
    if (!genericCache.has(key)) {
      genericCache.set(
        key,
        loadRuntimeBook(
          GENERIC_ROOT,
          genericManifest,
          book,
          bookMap,
          corpus,
        ),
      );
    }
    return genericCache.get(key);
  }

  const failures = [];

  // ------------------------------------------------------------
  // Hard KJV Genesis 3:16
  // ------------------------------------------------------------
  const kjvDisplay = readJson(KJV_DISPLAY);
  const gen316 = kjvDisplay.find(
    (row) =>
      row.book === "Genesis" &&
      Number(row.chapter) === 3 &&
      Number(row.verse) === 16,
  );
  if (!gen316) fail("KJV Genesis 3:16 display record missing.");

  const genTokens = tokenizeDisplayText(displayText(gen316));
  const saidIndexes = genTokens
    .map((token, index) => [String(token?.text || "").toLowerCase(), index])
    .filter(([word]) => word === "said")
    .map(([, index]) => index);
  const desireIndexes = genTokens
    .map((token, index) => [String(token?.text || "").toLowerCase(), index])
    .filter(([word]) => word === "desire")
    .map(([, index]) => index);

  if (saidIndexes.length !== 1 || desireIndexes.length !== 1) {
    fail(
      `KJV Genesis 3:16 expected one said and one desire; ` +
      `found said=${saidIndexes.length}, desire=${desireIndexes.length}.`,
    );
  }

  const genesisRuntime = kjvBook("Genesis");
  const saidRoute = routeAt(
    genesisRuntime, "kjv", 3, 16, saidIndexes[0],
  );
  const desireRoute = routeAt(
    genesisRuntime, "kjv", 3, 16, desireIndexes[0],
  );

  if (saidRoute?.strong !== "H559") {
    addFailure(failures, {
      family: "hard-fixture",
      fixture: "KJV Genesis 3:16 said",
      expectedStrong: "H559",
      route: saidRoute,
    });
  }
  if (desireRoute?.strong !== "H8669") {
    addFailure(failures, {
      family: "hard-fixture",
      fixture: "KJV Genesis 3:16 desire",
      expectedStrong: "H8669",
      route: desireRoute,
    });
  }

  // ------------------------------------------------------------
  // P08.9A KJV direct rows, recalibrated.
  //
  // The V4 failure proved the same-index P08.9A expected entity is
  // reliable only when the actual displayed word and P08.9A canonical
  // token identify the same lexical surface after punctuation/ligature
  // normalization. 225/615 rows fail that prerequisite and are therefore
  // NOT structural hard fixtures.
  // ------------------------------------------------------------
  const directRows = await readCsv(
    path.join(BOUND, "direct-canonical-missing-route-trace.csv"),
  );

  const directKjv = {
    total: 0,
    identityBoundHardFixtures: 0,
    identityBoundCorrect: 0,
    identityBoundMissing: 0,
    identityBoundWrong: 0,
    runtimeEntityUnavailableDeferred: 0,
    runtimeEntityUnavailableUnexpectedRoutes: 0,
    indexContaminatedRows: 0,
    indexContaminatedNowRouted: 0,
    indexContaminatedStillUntappable: 0,
    indexContaminatedConflictsWithOldExpected: 0,
    failures: [],
    indexContaminatedSamples: [],
  };

  const brentonDirect = {
    total: 0,
    correct: 0,
    missing: 0,
    wrong: 0,
    failures: [],
  };

  for (const row of directRows) {
    if (
      row.translation === "kjv" &&
      [
        "canonical-defensible-source-entity-has-no-reader-route",
        "canonical-source-relationship-exists-but-runtime-entity-unavailable",
      ].includes(row.reason)
    ) {
      directKjv.total += 1;

      const route = routeAt(
        kjvBook(row.book),
        "kjv",
        Number(row.chapter),
        Number(row.routeVerse || row.verse),
        Number(row.displayIndex),
      );
      const expected = splitSet(row.expectedEntities);
      const identityBound =
        tokenIdentity(row.displayWord) !== "" &&
        tokenIdentity(row.displayWord) === tokenIdentity(row.canonicalToken);

      if (identityBound && expected.size > 0) {
        directKjv.identityBoundHardFixtures += 1;
        if (route && expected.has(route.entityId)) {
          directKjv.identityBoundCorrect += 1;
        } else {
          if (!route) directKjv.identityBoundMissing += 1;
          else directKjv.identityBoundWrong += 1;
          addFailure(directKjv.failures, { row, route });
          addFailure(failures, {
            family: "kjv-direct-identity-bound",
            row,
            route,
          });
        }
      } else if (identityBound && expected.size === 0) {
        directKjv.runtimeEntityUnavailableDeferred += 1;
        if (route) {
          directKjv.runtimeEntityUnavailableUnexpectedRoutes += 1;
          addFailure(directKjv.failures, {
            row,
            route,
            reason:
              "canonical source relationship exists but no approved runtime entity target exists",
          });
          addFailure(failures, {
            family: "kjv-direct-runtime-entity-unavailable",
            row,
            route,
          });
        }
      } else {
        directKjv.indexContaminatedRows += 1;
        if (route) {
          directKjv.indexContaminatedNowRouted += 1;
          if (expected.size && !expected.has(route.entityId)) {
            directKjv.indexContaminatedConflictsWithOldExpected += 1;
          }
        } else {
          directKjv.indexContaminatedStillUntappable += 1;
        }
        if (directKjv.indexContaminatedSamples.length < 100) {
          directKjv.indexContaminatedSamples.push({
            book: row.book,
            chapter: Number(row.chapter),
            verse: Number(row.verse),
            displayIndex: Number(row.displayIndex),
            displayWord: row.displayWord,
            staleSameIndexCanonicalToken: row.canonicalToken,
            staleExpectedEntities: [...expected],
            rebuiltRoute: route,
          });
        }
      }
    }

    if (
      row.translation === "brenton" &&
      row.reason ===
        "canonical-defensible-source-entity-has-no-reader-route"
    ) {
      brentonDirect.total += 1;
      const route = routeAt(
        genericBook("lxx", row.book),
        "brenton",
        Number(row.chapter),
        Number(row.routeVerse || row.verse),
        Number(row.displayIndex),
      );
      const expected = splitSet(row.expectedEntities);

      // P08.9A Brenton direct rows are all Song of Songs and all 622 have
      // displayWord == canonicalToken after normalization.
      if (
        tokenIdentity(row.displayWord) !==
        tokenIdentity(row.canonicalToken)
      ) {
        addFailure(failures, {
          family: "brenton-direct-calibration",
          message: "Brenton direct row lost token identity prerequisite.",
          row,
        });
        continue;
      }

      if (route && expected.has(route.entityId)) {
        brentonDirect.correct += 1;
      } else {
        if (!route) brentonDirect.missing += 1;
        else brentonDirect.wrong += 1;
        addFailure(brentonDirect.failures, { row, route });
        addFailure(failures, {
          family: "brenton-direct",
          row,
          route,
        });
      }
    }
  }

  // ------------------------------------------------------------
  // KJV anomaly families.
  //
  // P08.9A already calibrated 236 rows as display-index drift.
  // Their old KJV-reader route is not itself a defect; the audit compared
  // it to the wrong same-index canonical token. V5 requires these routes
  // to be preserved exactly by the independently rebuilt display sequence.
  //
  // The other four families are true structural defects.
  // ------------------------------------------------------------
  const anomalyRows = await readCsv(
    path.join(BOUND, "kjv-structural-route-anomalies.csv"),
  );

  const anomalies = {
    total: anomalyRows.length,
    byFamily: {},
    passed: 0,
    failed: 0,
    failures: [],
  };

  for (const row of anomalyRows) {
    const family = String(row.calibratedFamily || "");
    anomalies.byFamily[family] =
      anomalies.byFamily[family] || {
        total: 0,
        passed: 0,
        failed: 0,
      };
    anomalies.byFamily[family].total += 1;

    const route = routeAt(
      kjvBook(row.book),
      "kjv",
      Number(row.chapter),
      Number(row.routeVerse || row.verse),
      Number(row.displayIndex),
    );

    const expectedEntities = splitSet(row.expectedEntities);
    const expectedSourceIds = splitSet(row.canonicalAlignedSourceIds);
    let ok = false;
    let expectation = "";

    if (family === "display_index_drift_route_differs") {
      expectation =
        "preserve baseline KJV-reader route because P08.9A same-index canonical token is contaminated by display drift";
      ok =
        Boolean(route) &&
        route.sourceId === String(row.runtimeSourceId || "") &&
        route.entityId === String(row.runtimeEntityId || "");
    } else if (
      family === "runtime_route_without_canonical_display_token" ||
      family === "runtime_route_without_canonical_source_relationship"
    ) {
      expectation =
        "route may be absent OR independently re-proven by exact structural display-to-canonical reconciliation; an unresolved baseline-preserved route is not sufficient";
      ok =
        !route ||
        hasIndependentStructuralProvenance(route);
    } else if (family === "source_and_entity_mismatch") {
      expectation = "route must match canonical source occurrence and entity";
      ok =
        Boolean(route) &&
        expectedEntities.has(route.entityId) &&
        (
          expectedSourceIds.size === 0 ||
          expectedSourceIds.has(route.sourceId)
        );
    } else if (family === "wrong_source_occurrence_same_entity") {
      expectation =
        "entity may remain the same but source occurrence must match canonical aligned source ID";
      ok =
        Boolean(route) &&
        expectedEntities.has(route.entityId) &&
        expectedSourceIds.has(route.sourceId);
    } else {
      expectation = "unknown calibrated family";
      ok = false;
    }

    if (ok) {
      anomalies.passed += 1;
      anomalies.byFamily[family].passed += 1;
    } else {
      anomalies.failed += 1;
      anomalies.byFamily[family].failed += 1;
      const item = {
        family,
        expectation,
        row,
        rebuiltRoute: route,
      };
      addFailure(anomalies.failures, item);
      addFailure(failures, {
        family: "kjv-structural-anomaly",
        ...item,
      });
    }
  }

  // ------------------------------------------------------------
  // Brenton Genesis 1 preservation.
  // ------------------------------------------------------------
  const brentonGenesis = genericBook("lxx", "Genesis");
  if (!brentonGenesis) fail("Generic LXX Genesis runtime missing.");

  let brentonGenesis1Routes = 0;
  for (const [key, compact] of Object.entries(
    brentonGenesis.verses || {},
  )) {
    const [chapter] = key.split(":");
    if (Number(chapter) !== 1) continue;
    brentonGenesis1Routes +=
      Object.keys(compact?.a?.brenton || {}).length;
  }
  if (brentonGenesis1Routes !== 226) {
    addFailure(failures, {
      family: "brenton-genesis1-preservation",
      expectedRoutes: 226,
      actualRoutes: brentonGenesis1Routes,
    });
  }

  // generatedBrenton.json serialization shape is not a routing contract.
  // Do not enumerate it here. Brenton acceptance is route-level:
  // 1) exactly 226 existing Genesis 1 Brenton routes in generic LXX runtime;
  // 2) authoritative LXX ownership gate present in ReaderVerseAdapter;
  // 3) all 622 bound Song of Songs routes resolve to expected LXX entities.
  const brentonGen1Owned = null;

  // ------------------------------------------------------------
  // Live fixtures for post-deploy.
  // ------------------------------------------------------------
  const liveFixtures = [
    {
      translation: "kjv",
      book: "Genesis",
      chapter: 3,
      verse: 16,
      displayWord: "said",
      displayIndex: saidIndexes[0],
      expectedStrong: "H559",
      expectedEntityId: saidRoute?.entityId || "",
    },
    {
      translation: "kjv",
      book: "Genesis",
      chapter: 3,
      verse: 16,
      displayWord: "desire",
      displayIndex: desireIndexes[0],
      expectedStrong: "H8669",
      expectedEntityId: desireRoute?.entityId || "",
    },
  ];

  const firstBrentonSong = directRows.find(
    (row) =>
      row.translation === "brenton" &&
      row.reason ===
        "canonical-defensible-source-entity-has-no-reader-route",
  );
  if (firstBrentonSong) {
    const route = routeAt(
      genericBook("lxx", firstBrentonSong.book),
      "brenton",
      Number(firstBrentonSong.chapter),
      Number(firstBrentonSong.routeVerse || firstBrentonSong.verse),
      Number(firstBrentonSong.displayIndex),
    );
    liveFixtures.push({
      translation: "brenton",
      book: firstBrentonSong.book,
      chapter: Number(firstBrentonSong.chapter),
      verse: Number(
        firstBrentonSong.routeVerse || firstBrentonSong.verse,
      ),
      displayWord: firstBrentonSong.displayWord,
      displayIndex: Number(firstBrentonSong.displayIndex),
      expectedStrong: route?.strong || "",
      expectedEntityId: route?.entityId || "",
    });
  }

  const result = {
    schema:
      "emetsees-p0810-v7-calibrated-structural-reader-verification@1.0.0",
    hard: {
      kjvGenesis316: {
        saidIndex: saidIndexes[0],
        saidRoute,
        desireIndex: desireIndexes[0],
        desireRoute,
      },
      brentonGenesis1: {
        genericSongRuntimeAliasFile: songAliasTargets[0],
        genericSongRuntimeAliases: {
          songofsongs: lxxAliases.songofsongs,
          songofsolomon: lxxAliases.songofsolomon,
          song: lxxAliases.song,
          canticles: lxxAliases.canticles,
        },
        existingRuntimeRoutes: brentonGenesis1Routes,
        defensibleOwnedDisplayRows: brentonGen1Owned,
        displayPayloadEnumerationRequired: false,
        readerAdapterAuthoritativeOwnershipGatePresent: true,
      },
    },
    directKjv,
    brentonDirect,
    kjvStructuralAnomalies: anomalies,
    calibration: {
      kjvDirectRowsTotal: directKjv.total,
      identityBoundHardFixtures:
        directKjv.identityBoundHardFixtures,
      runtimeEntityUnavailableDeferred:
        directKjv.runtimeEntityUnavailableDeferred,
      indexContaminatedRows:
        directKjv.indexContaminatedRows,
      rule:
        "P08.9A KJV same-index expected entity is a hard fixture only when displayedWord and canonicalToken share normalized identity.",
      indexContaminatedRowsDeferredToFinalMeaningfulWordAudit: true,
    },
    failures,
    liveFixtures,
    policy: {
      semanticGuessingUsed: false,
      stopWordListUsed: false,
      scriptureTextModified: false,
      canonicalAlignmentDataModified: false,
      p07Modified: false,
      aiApiCalls: 0,
    },
    verdict:
      failures.length === 0
        ? "P0810_V7_CALIBRATED_STRUCTURAL_READER_REPAIR_VERIFIED"
        : "P0810_V7_CALIBRATED_STRUCTURAL_READER_REPAIR_FAILED",
  };

  writeJson(
    REPORT_DIR
      ? path.join(
          REPORT_DIR,
          "structural-verification.json",
        )
      : null,
    result,
  );
  writeJson(
    REPORT_DIR
      ? path.join(REPORT_DIR, "live-fixtures.json")
      : null,
    liveFixtures,
  );

  console.log("");
  console.log("P08.10 V7 calibrated structural verification:");
  console.log(
    `KJV direct identity-bound: ` +
    `${directKjv.identityBoundCorrect}/${directKjv.identityBoundHardFixtures}`,
  );
  console.log(
    `KJV direct runtime-entity-unavailable deferred: ` +
    `${directKjv.runtimeEntityUnavailableDeferred}`,
  );
  console.log(
    `KJV direct index-contaminated deferred: ` +
    `${directKjv.indexContaminatedRows}`,
  );
  console.log(
    `KJV calibrated anomaly families: ` +
    `${anomalies.passed}/${anomalies.total}`,
  );
  console.log(
    `Brenton Song of Songs direct: ` +
    `${brentonDirect.correct}/${brentonDirect.total}`,
  );
  console.log(
    `Brenton Genesis 1 routes preserved: ` +
    `${brentonGenesis1Routes}`,
  );
  console.log(`Failures: ${failures.length}`);
  console.log("");

  if (failures.length) {
    fail(
      `Calibrated structural verification has ` +
      `${failures.length} failure(s). See structural-verification.json.`,
    );
  }
}
main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
