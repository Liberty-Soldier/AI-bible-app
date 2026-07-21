#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const RUNTIME_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
);
const GREEK_RUNTIME_ROOT = path.join(
  RUNTIME_ROOT,
  "greek-nt",
);
const EXPECTED_PATH = path.join(
  ROOT,
  "scripts",
  "p059",
  "runtime-preconditions.json",
);
const PLAN_PATH = path.join(
  ROOT,
  "scripts",
  "p059",
  "compound-route-plan.json",
);
const REPORT_ROOT = path.join(
  ROOT,
  "reports",
  "p059-greek-compound-routing-apply-v1",
);

function fail(message) {
  throw new Error(`[P05.9 verifier] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${filePath}`);
  }

  return JSON.parse(
    fs
      .readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/, ""),
  );
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function sha256(raw) {
  return crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex");
}

function expectedRouteId(lexicalId) {
  const routes = {
    "G4566«G4567":
      "compound:greek-nt:G4566-G4567",
    "G3535«G3536":
      "compound:greek-nt:G3535-G3536",
    "G1176+G3638":
      "compound:greek-nt:G1176-G3638",
    "G3379+G4219":
      "compound:greek-nt:G3379-G4219",
  };

  return routes[lexicalId] || "";
}

function runtimeFiles() {
  if (!fs.existsSync(GREEK_RUNTIME_ROOT)) {
    fail(`Missing Greek NT runtime: ${GREEK_RUNTIME_ROOT}`);
  }

  return fs
    .readdirSync(GREEK_RUNTIME_ROOT)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      path.join(GREEK_RUNTIME_ROOT, name),
    );
}

function loadRuntimeIndex() {
  const tokens = new Map();
  const alignedOccurrenceCount = new Map();

  for (const filePath of runtimeFiles()) {
    const document = readJson(filePath);

    for (const [verseKey, verse] of Object.entries(
      document?.verses || {},
    )) {
      for (
        let sourceIndex = 0;
        sourceIndex < (verse?.s || []).length;
        sourceIndex += 1
      ) {
        const compact = verse.s[sourceIndex];

        if (!Array.isArray(compact)) continue;

        const sourceTokenId = String(
          compact[0] || "",
        );

        if (!sourceTokenId) continue;

        if (tokens.has(sourceTokenId)) {
          fail(
            `Duplicate runtime source token: ${sourceTokenId}`,
          );
        }

        tokens.set(sourceTokenId, {
          sourceTokenId,
          sourceIndex,
          surface: String(compact[1] || ""),
          lemma: String(compact[2] || ""),
          lexicalId: String(compact[3] || ""),
          entityId: String(compact[4] || ""),
          morph: String(compact[5] || ""),
          file: path
            .relative(ROOT, filePath)
            .replace(/\\/g, "/"),
          verseKey,
        });
      }

      for (const aligned of Object.values(
        verse?.a || {},
      )) {
        for (const sourceIndex of Object.values(
          aligned || {},
        )) {
          const compact = verse?.s?.[sourceIndex];

          if (!Array.isArray(compact)) continue;

          const sourceTokenId = String(
            compact[0] || "",
          );

          if (!sourceTokenId) continue;

          alignedOccurrenceCount.set(
            sourceTokenId,
            (alignedOccurrenceCount.get(
              sourceTokenId,
            ) || 0) + 1,
          );
        }
      }
    }
  }

  return {
    tokens,
    alignedOccurrenceCount,
  };
}

function main() {
  const expected = readJson(EXPECTED_PATH);
  const plan = readJson(PLAN_PATH);

  if (!Array.isArray(expected) || expected.length !== 40) {
    fail(
      `Expected 40 locked source tokens; found ${
        Array.isArray(expected)
          ? expected.length
          : "invalid input"
      }.`,
    );
  }

  if (
    !Array.isArray(plan?.routeDefinitions) ||
    plan.routeDefinitions.length !== 4
  ) {
    fail("Expected four locked route definitions.");
  }

  const sidecarPath = path.join(
    RUNTIME_ROOT,
    "compound-routes.json",
  );
  const manifestPath = path.join(
    RUNTIME_ROOT,
    "manifest.json",
  );
  const sidecar = readJson(sidecarPath);
  const manifest = readJson(manifestPath);

  if (
    Object.keys(sidecar?.routes || {}).length !== 4
  ) {
    fail("Compound route sidecar does not contain four routes.");
  }

  if (
    Number(manifest?.compoundRoutes?.count) !== 4
  ) {
    fail("Runtime manifest does not report four compound routes.");
  }

  const runtime = loadRuntimeIndex();
  const records = [];
  const failures = [];
  let totalAlignedOccurrences = 0;

  for (const expectedRow of expected) {
    const actual = runtime.tokens.get(
      expectedRow.sourceTokenId,
    );
    const routeId = expectedRouteId(
      expectedRow.lexicalId,
    );
    const alignedOccurrences =
      runtime.alignedOccurrenceCount.get(
        expectedRow.sourceTokenId,
      ) || 0;

    totalAlignedOccurrences += alignedOccurrences;

    const reasons = [];

    if (!actual) {
      reasons.push("missing-runtime-source-token");
    } else {
      if (
        actual.lexicalId !==
        expectedRow.lexicalId
      ) {
        reasons.push("lexical-id-mismatch");
      }

      if (actual.entityId !== routeId) {
        reasons.push("compound-route-id-mismatch");
      }
    }

    if (alignedOccurrences < 1) {
      reasons.push("no-aligned-display-occurrence");
    }

    const record = {
      sourceTokenId:
        expectedRow.sourceTokenId,
      lexicalId: expectedRow.lexicalId,
      expectedRouteId: routeId,
      actualRouteId: actual?.entityId || "",
      alignedDisplayOccurrences:
        alignedOccurrences,
      status:
        reasons.length === 0
          ? "verified"
          : "failed",
      reasons,
    };

    records.push(record);

    if (reasons.length) failures.push(record);
  }

  if (totalAlignedOccurrences !== 78) {
    failures.push({
      status: "failed",
      reasons: [
        `expected-78-aligned-display-occurrences-found-${totalAlignedOccurrences}`,
      ],
    });
  }

  const report = {
    version:
      "p059-greek-compound-routing-verifier@1",
    generatedAt: new Date().toISOString(),
    sourceTokensExpected: 40,
    sourceTokensVerified:
      records.filter(
        (record) =>
          record.status === "verified",
      ).length,
    alignedDisplayOccurrencesExpected: 78,
    alignedDisplayOccurrencesVerified:
      totalAlignedOccurrences,
    routeDefinitionsExpected: 4,
    routeDefinitionsVerified: Object.keys(
      sidecar.routes || {},
    ).length,
    failures: failures.length,
    runtimeManifest: {
      checksum: manifest.checksum,
      compoundRoutes:
        manifest.compoundRoutes,
    },
    compoundRouteSidecar: {
      file: path
        .relative(ROOT, sidecarPath)
        .replace(/\\/g, "/"),
      checksum: sha256(
        fs.readFileSync(sidecarPath),
      ),
    },
    records,
  };

  writeJson(
    path.join(REPORT_ROOT, "report.json"),
    report,
  );

  if (failures.length) {
    writeJson(
      path.join(REPORT_ROOT, "failures.json"),
      failures,
    );

    fail(
      `${failures.length} compound-route verification failures found.`,
    );
  }

  console.log("");
  console.log(
    "P05.9 COMPOUND ROUTING VERIFIED.",
  );
  console.log(
    "- Source tokens: 40 / 40",
  );
  console.log(
    "- Display occurrences: 78 / 78",
  );
  console.log(
    "- Route definitions: 4 / 4",
  );
  console.log(
    "- Failures: 0",
  );
  console.log(
    `- Report: ${path.join(
      REPORT_ROOT,
      "report.json",
    )}`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.stack
      : error,
  );
  process.exitCode = 1;
}
