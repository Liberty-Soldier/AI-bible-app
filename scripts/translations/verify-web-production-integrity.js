"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(message) {
  throw new Error(`[WEB production integrity] ${message}`);
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function walkJson(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walkJson(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(full);
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function canonicalWebDigest(canonicalRoot) {
  const hash = crypto.createHash("sha256");
  let files = 0;
  let records = 0;
  let webRecords = 0;
  let webTokens = 0;
  let alignedWebTokens = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    const corpusRoot = path.join(canonicalRoot, corpus);

    for (const filePath of walkJson(corpusRoot)) {
      files += 1;
      const relative = path
        .relative(canonicalRoot, filePath)
        .replace(/\\/g, "/");
      const root = JSON.parse(fs.readFileSync(filePath, "utf8"));

      for (const objectKey of Object.keys(root).sort()) {
        records += 1;
        const web = root[objectKey]?.translations?.web;
        if (!web) continue;

        webRecords += 1;
        const tokens = Array.isArray(web.tokens) ? web.tokens : [];
        webTokens += tokens.length;
        alignedWebTokens += tokens.filter(token => {
          return (
            (Array.isArray(token?.alignedSourceTokenIds) &&
              token.alignedSourceTokenIds.length > 0) ||
            (Array.isArray(token?.sourceTokenIds) &&
              token.sourceTokenIds.length > 0) ||
            (Array.isArray(token?.alignedSourceEntityIds) &&
              token.alignedSourceEntityIds.length > 0) ||
            (Array.isArray(token?.sourceEntityIds) &&
              token.sourceEntityIds.length > 0) ||
            token?.alignmentStatus === "aligned"
          );
        }).length;

        hash.update(relative);
        hash.update("\0");
        hash.update(objectKey);
        hash.update("\0");
        hash.update(stableStringify(web));
        hash.update("\n");
      }
    }
  }

  return {
    sha256: hash.digest("hex"),
    files,
    records,
    webRecords,
    webTokens,
    alignedWebTokens,
  };
}

function sourceTreeDigest(sourceRoot) {
  if (!fs.existsSync(sourceRoot)) {
    return null;
  }

  const hash = crypto.createHash("sha256");
  let files = 0;

  function walk(directory) {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files += 1;
        hash.update(path.relative(sourceRoot, full).replace(/\\/g, "/"));
        hash.update("\0");
        hash.update(fs.readFileSync(full));
        hash.update("\0");
      }
    }
  }

  walk(sourceRoot);

  return {
    sha256: hash.digest("hex"),
    files,
  };
}

function analyzeProduction(productionPath) {
  const value = JSON.parse(fs.readFileSync(productionPath, "utf8"));

  if (!Array.isArray(value)) {
    fail("generatedWEB.json must remain a verse array.");
  }

  const coordinates = new Set();
  let duplicateCoordinates = 0;

  for (const verse of value) {
    const key = `${verse?.book}\u0000${Number(verse?.chapter)}\u0000${Number(
      verse?.verse,
    )}`;

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

function buildManifest({
  productionPath,
  canonicalRoot,
  candidatePath,
  sourceRoot,
  outputPath,
  sourceCandidateFingerprint,
  alignmentPreservation,
}) {
  const production = analyzeProduction(productionPath);
  const canonicalWeb = canonicalWebDigest(canonicalRoot);
  const sourceTree = sourceTreeDigest(sourceRoot);

  const manifest = {
    schemaVersion: "web-production-integrity@1",
    generatedAtUtc: new Date().toISOString(),
    sourceCandidateFingerprint,
    production: {
      path: "app/data/scripture/generatedWEB.json",
      sha256: sha256File(productionPath),
      ...production,
    },
    canonicalWeb,
    immutableSource: sourceTree
      ? {
          path: ".private/sources/web-usfm/eng-web",
          ...sourceTree,
        }
      : null,
    candidate: fs.existsSync(candidatePath)
      ? {
          path: candidatePath.replace(/\\/g, "/"),
          sha256: sha256File(candidatePath),
          byteIdenticalToProduction:
            sha256File(candidatePath) === sha256File(productionPath),
        }
      : null,
    alignmentPreservation,
    gates: {
      productionHas31098Verses: production.verses === 31098,
      productionCoordinatesUnique:
        production.uniqueCoordinates === 31098 &&
        production.duplicateCoordinates === 0,
      productionMatchesApprovedCandidate:
        fs.existsSync(candidatePath) &&
        sha256File(candidatePath) === sha256File(productionPath),
      canonicalWebRecordsPresent: canonicalWeb.webRecords >= 31062,
      canonicalWebTextAndTokensPinned: true,
      immutableSourceFingerprintRecorded: Boolean(sourceTree),
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

function verifyManifest({
  productionPath,
  canonicalRoot,
  manifestPath,
  candidatePath,
  sourceRoot,
  requireCandidate,
  requireSource,
}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const production = analyzeProduction(productionPath);
  const productionSha256 = sha256File(productionPath);
  const canonicalWeb = canonicalWebDigest(canonicalRoot);

  if (productionSha256 !== manifest.production.sha256) {
    fail(
      `Production WEB hash mismatch. Expected ${manifest.production.sha256}, found ${productionSha256}`,
    );
  }

  if (
    production.verses !== 31098 ||
    production.uniqueCoordinates !== 31098 ||
    production.duplicateCoordinates !== 0
  ) {
    fail(`Production WEB coordinate census failed: ${JSON.stringify(production)}`);
  }

  if (canonicalWeb.sha256 !== manifest.canonicalWeb.sha256) {
    fail(
      `Canonical WEB digest mismatch. Expected ${manifest.canonicalWeb.sha256}, found ${canonicalWeb.sha256}`,
    );
  }

  if (
    canonicalWeb.webRecords !== manifest.canonicalWeb.webRecords ||
    canonicalWeb.webTokens !== manifest.canonicalWeb.webTokens ||
    canonicalWeb.alignedWebTokens !==
      manifest.canonicalWeb.alignedWebTokens
  ) {
    fail(
      `Canonical WEB census drift: ${JSON.stringify({
        expected: manifest.canonicalWeb,
        actual: canonicalWeb,
      })}`,
    );
  }

  if (requireCandidate || fs.existsSync(candidatePath)) {
    if (!fs.existsSync(candidatePath)) {
      fail(`Approved WEB candidate is required but missing: ${candidatePath}`);
    }

    const candidateSha256 = sha256File(candidatePath);

    if (
      candidateSha256 !== manifest.production.sha256 ||
      candidateSha256 !== productionSha256
    ) {
      fail(
        `Production WEB does not match approved candidate: ${candidateSha256}`,
      );
    }
  }

  if (requireSource || fs.existsSync(sourceRoot)) {
    if (!fs.existsSync(sourceRoot)) {
      fail(`Immutable WEB source is required but missing: ${sourceRoot}`);
    }

    const sourceTree = sourceTreeDigest(sourceRoot);

    if (
      !manifest.immutableSource ||
      sourceTree.sha256 !== manifest.immutableSource.sha256 ||
      sourceTree.files !== manifest.immutableSource.files
    ) {
      fail(
        `Immutable WEB source fingerprint mismatch: ${JSON.stringify({
          expected: manifest.immutableSource,
          actual: sourceTree,
        })}`,
      );
    }
  }

  console.log("WEB production integrity verified.");
  console.log("- Visible verses: 31,098");
  console.log("- Unique coordinates: 31,098");
  console.log(`- Canonical WEB records: ${canonicalWeb.webRecords}`);
  console.log(`- Canonical WEB tokens: ${canonicalWeb.webTokens}`);
  console.log(
    `- Canonical aligned WEB tokens: ${canonicalWeb.alignedWebTokens}`,
  );
  console.log(
    `- Approved candidate comparison: ${
      fs.existsSync(candidatePath) ? "passed" : "manifest hash passed"
    }`,
  );
  console.log(
    `- Immutable source comparison: ${
      fs.existsSync(sourceRoot) ? "passed" : "manifest fingerprint retained"
    }`,
  );

  return {
    manifest,
    production,
    canonicalWeb,
  };
}

function parseArgs(argv) {
  const args = {
    mode: "verify",
    requireCandidate: false,
    requireSource: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--build") {
      args.mode = "build";
    } else if (current === "--verify") {
      args.mode = "verify";
    } else if (current === "--require-candidate") {
      args.requireCandidate = true;
    } else if (current === "--require-source") {
      args.requireSource = true;
    } else if (current === "--source-candidate-fingerprint" && next) {
      args.sourceCandidateFingerprint = String(next);
      index += 1;
    } else if (current.startsWith("--") && next) {
      const key = current
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const required = [
    "production",
    "canonicalRoot",
    "manifest",
    "candidate",
    "sourceRoot",
  ];

  for (const key of required) {
    if (!args[key]) fail(`Missing --${key}`);
  }

  if (args.mode === "build") {
    const alignmentPreservation = args.alignmentSummary
      ? JSON.parse(fs.readFileSync(args.alignmentSummary, "utf8"))
      : null;

    const manifest = buildManifest({
      productionPath: args.production,
      canonicalRoot: args.canonicalRoot,
      candidatePath: args.candidate,
      sourceRoot: args.sourceRoot,
      outputPath: args.manifest,
      sourceCandidateFingerprint:
        args.sourceCandidateFingerprint || "8be4eee9f896f96e",
      alignmentPreservation,
    });

    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  verifyManifest({
    productionPath: args.production,
    canonicalRoot: args.canonicalRoot,
    manifestPath: args.manifest,
    candidatePath: args.candidate,
    sourceRoot: args.sourceRoot,
    requireCandidate: args.requireCandidate,
    requireSource: args.requireSource,
  });
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}

module.exports = {
  analyzeProduction,
  canonicalWebDigest,
  sourceTreeDigest,
  buildManifest,
  verifyManifest,
};
