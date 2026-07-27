"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[Brenton production integrity] ${message}`);
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function verseSortKey(label) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(label || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function displayKey(verse) {
  return `${verse.book}\u0000${verse.chapter}\u0000${verse.verseLabel}`;
}

function verifyRuntime(document) {
  const runtimeRoot = path.join(
    ROOT,
    "public",
    "scripture",
    "runtime",
    "brenton",
  );
  const runtimeBooks = fs
    .readdirSync(runtimeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (runtimeBooks.length !== 53) {
    fail(
      `Brenton runtime book count must remain 53; found ${runtimeBooks.length}: ${JSON.stringify(runtimeBooks)}`,
    );
  }

  const runtimePath = path.join(
    ROOT,
    "public",
    "scripture",
    "runtime",
    "brenton",
    "Psalms",
    "4.json",
  );

  if (!fs.existsSync(runtimePath)) {
    fail("Brenton Psalm 4 runtime shard is missing.");
  }

  const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));

  if (!runtime || Array.isArray(runtime)) {
    fail("Brenton runtime shard does not expose verses and superscriptions.");
  }

  const labels = (runtime.verses || []).map((verse) => verse.verseLabel);
  const expected = ["1", "2", "3", "4", "5", "6", "7", "8"];

  if (
    JSON.stringify(labels) !== JSON.stringify(expected) ||
    (runtime.superscriptions || []).length !== 1
  ) {
    fail(
      `Psalm 4 runtime mismatch: ${JSON.stringify({
        labels,
        superscriptions: (runtime.superscriptions || []).length,
      })}`,
    );
  }

  const genesisPath = path.join(
    ROOT,
    "public",
    "scripture",
    "runtime",
    "brenton",
    "Genesis",
    "1.json",
  );
  const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf8"));
  const genesisLabels = (genesis.verses || []).map(
    (verse) => verse.verseLabel,
  );
  const sorted = [...genesisLabels].sort((left, right) => {
    const a = verseSortKey(left);
    const b = verseSortKey(right);
    return a.number - b.number || a.suffix.localeCompare(b.suffix);
  });

  if (JSON.stringify(genesisLabels) !== JSON.stringify(sorted)) {
    fail("Genesis 1 runtime verse labels are not numerically ordered.");
  }
}

function main() {
  const verifyRuntimeFlag = process.argv.includes("--verify-runtime");
  const productionPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedBrenton.json",
  );
  const integrityPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedBrenton.integrity.json",
  );

  if (!fs.existsSync(productionPath) || !fs.existsSync(integrityPath)) {
    fail("Production Brenton data or integrity manifest is missing.");
  }

  const integrity = JSON.parse(fs.readFileSync(integrityPath, "utf8"));
  const document = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  const actualSha256 = sha256File(productionPath);

  if (actualSha256 !== integrity.productionSha256) {
    fail(
      `Production hash mismatch. Expected ${integrity.productionSha256}, found ${actualSha256}`,
    );
  }

  if (
    document?.schemaVersion !== "brenton-production-reader@1" ||
    !Array.isArray(document.verses) ||
    !Array.isArray(document.superscriptions)
  ) {
    fail("Production Brenton document shape is invalid.");
  }

  if (
    document.verses.length !== 28548 ||
    document.superscriptions.length !== 67
  ) {
    fail(
      `Production count mismatch: ${JSON.stringify({
        verses: document.verses.length,
        superscriptions: document.superscriptions.length,
      })}`,
    );
  }

  const ids = new Set();
  const coordinates = new Set();
  const productionBooks = new Set(
    document.verses.map((verse) => verse.book),
  );
  const versesWithoutReaderSourceIdentity =
    document.verses.filter(
      (verse) =>
        !verse?.readerSourceIdentity ||
        typeof verse.readerSourceIdentity.book !== "string" ||
        !verse.readerSourceIdentity.book ||
        !Number.isFinite(
          Number(verse.readerSourceIdentity.chapter),
        ) ||
        typeof verse.readerSourceIdentity.verseLabel !== "string" ||
        !verse.readerSourceIdentity.verseLabel,
    );

  if (versesWithoutReaderSourceIdentity.length) {
    fail(
      `Reader source identity is missing from ${versesWithoutReaderSourceIdentity.length} verses. First IDs: ${JSON.stringify(
        versesWithoutReaderSourceIdentity
          .slice(0, 20)
          .map((verse) => verse.id),
      )}`,
    );
  }

  const sourceBooks = new Set(
    document.verses.map(
      (verse) => verse.readerSourceIdentity.book,
    ),
  );
  const productionBookNames = [...productionBooks].sort();
  const sourceBookNames = [...sourceBooks].sort();
  const integrityProductionBookNames = [
    ...(integrity?.productionCounts?.productionReaderBookNames || []),
  ].sort();
  const integritySourceBookNames = [
    ...(integrity?.productionCounts?.sourceReaderBookNames || []),
  ].sort();

  if (
    productionBooks.size !== 53 ||
    sourceBooks.size !== 53 ||
    JSON.stringify(productionBookNames) !==
      JSON.stringify(sourceBookNames) ||
    JSON.stringify(productionBookNames) !==
      JSON.stringify(integrityProductionBookNames) ||
    JSON.stringify(sourceBookNames) !==
      JSON.stringify(integritySourceBookNames)
  ) {
    fail(
      `Production reader book coherence failed: ${JSON.stringify({
        productionBooks: productionBooks.size,
        sourceBooks: sourceBooks.size,
        productionBookNames,
        sourceBookNames,
        integrityProductionBookNames,
        integritySourceBookNames,
      })}`,
    );
  }

  if (
    Number(
      document?.readerCoordinatePolicy?.crossBookCandidatesAccepted,
    ) !== 0
  ) {
    fail("Cross-book reader coordinates must never be accepted.");
  }

  for (const verse of document.verses) {
    if (ids.has(verse.id)) fail(`Duplicate reader ID: ${verse.id}`);
    ids.add(verse.id);

    const key = displayKey(verse);
    if (coordinates.has(key)) {
      fail(`Duplicate reader coordinate: ${key}`);
    }
    coordinates.add(key);

    if (verse.tokenAvailabilityKey !== null) {
      fail(
        `Candidate tappability is not fail-closed at ${verse.reference}`,
      );
    }
  }

  const psalm4 = document.verses.filter(
    (verse) => verse.book === "Psalms" && verse.chapter === 4,
  );
  const labels = psalm4.map((verse) => verse.verseLabel);

  if (
    JSON.stringify(labels) !==
    JSON.stringify(["1", "2", "3", "4", "5", "6", "7", "8"])
  ) {
    fail(`Psalm 4 labels are incorrect: ${JSON.stringify(labels)}`);
  }

  const privateCandidateExists = fs.existsSync(
    path.join(ROOT, ".private", "generated", "P05.12"),
  );

  if (privateCandidateExists) {
    const {
      buildProductionCandidate,
    } = require("./build-brenton-production-from-candidate.js");
    const rebuilt = buildProductionCandidate();
    const rebuiltHash = crypto
      .createHash("sha256")
      .update(rebuilt.serialized, "utf8")
      .digest("hex");

    if (rebuiltHash !== actualSha256) {
      fail(
        `Production data differs from the verified source candidate. Expected ${rebuiltHash}, found ${actualSha256}`,
      );
    }
  }

  if (verifyRuntimeFlag) {
    verifyRuntime(document);
  }

  console.log("Brenton production integrity verified.");
  console.log("- Visible verses: 28,548");
  console.log("- Superscriptions: 67");
  console.log("- Reader books: 53");
  console.log("- Exact reader book-name set verified: YES");
  console.log("- Explicit reader source identity on every verse: YES");
  console.log("- Cross-book reader mappings accepted: 0");
  console.log("- Psalm 4: title + verses 1-8");
  console.log("- Candidate word taps: fail closed");
  console.log(
    `- Full source-candidate comparison: ${
      privateCandidateExists ? "passed" : "not available; manifest hash passed"
    }`,
  );
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
