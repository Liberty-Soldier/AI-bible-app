"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(message) {
  throw new Error(`[P05.12Z KJV edition lock] ${message}`);
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
  );
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function readCsv(file) {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0];

  return rows
    .slice(1)
    .filter(values => values.some(value => value !== ""))
    .map(values =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          values[index] ?? "",
        ]),
      ),
    );
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--reconciliation-root" && next) {
      args.reconciliationRoot = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  if (!args.reconciliationRoot) {
    fail("Missing --reconciliation-root.");
  }

  if (!args.output) {
    fail("Missing --output.");
  }

  return args;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(
      `${label} drift. Expected ${JSON.stringify(
        expected,
      )}, found ${JSON.stringify(actual)}.`,
    );
  }
}

function main() {
  const args = parseArgs(process.argv);
  const summaryPath = path.join(
    args.reconciliationRoot,
    "reconciliation-summary.json",
  );

  if (!fs.existsSync(summaryPath)) {
    fail(`Missing reconciliation summary: ${summaryPath}`);
  }

  const reconciliation = readJson(summaryPath);

  expectEqual(
    reconciliation.milestone,
    "P05.12H",
    "Reconciliation milestone",
  );
  expectEqual(
    reconciliation.status,
    "kjv-three-way-reconciliation-preview-complete",
    "Reconciliation status",
  );

  const expectedCurrentHash =
    "88cd85051229c0797622aacc6ef336f3e881876a46dd2033dac6c65b04e60b29";
  const expectedKjv2006Archive =
    "4ea6952590d070bfa22985aded48a49581e31b568a60aa09e25f73462e700e7d";
  const expectedKjv2006Tree =
    "8230bfc7bd2dcd38b8fc8a103f459c8518227d2d8410213fc2bb30a5bd555aac";
  const expectedCrosswireCommit =
    "d490be7e34762deb2c76cb2c1306d4808e27890d";
  const expectedCrosswireOsis =
    "2bc5c343da30125af8d4d1e27f8444019030b6350d16e69ef8645bf9e17d5963";
  const expectedCrosswireTree =
    "4e8d1c0f6c04d6958713e268a3c223aed242b6bc191af7196236d9a38d9b52ad";

  expectEqual(
    reconciliation.sources.currentKjv.sha256Before,
    expectedCurrentHash,
    "Current production KJV hash",
  );
  expectEqual(
    reconciliation.sources.currentKjv.sha256After,
    expectedCurrentHash,
    "Post-preview production KJV hash",
  );
  expectEqual(
    reconciliation.sources.kjv2006.archiveSha256,
    expectedKjv2006Archive,
    "KJV2006 archive hash",
  );
  expectEqual(
    reconciliation.sources.kjv2006.treeSha256,
    expectedKjv2006Tree,
    "KJV2006 tree hash",
  );
  expectEqual(
    reconciliation.sources.kjv2006.verifiedTreeSha256,
    expectedKjv2006Tree,
    "Verified KJV2006 tree hash",
  );
  expectEqual(
    reconciliation.sources.crosswire.pinnedCommit,
    expectedCrosswireCommit,
    "CrossWire pinned commit",
  );
  expectEqual(
    reconciliation.sources.crosswire.osisSha256,
    expectedCrosswireOsis,
    "CrossWire OSIS hash",
  );
  expectEqual(
    reconciliation.sources.crosswire.treeSha256,
    expectedCrosswireTree,
    "CrossWire tree hash",
  );
  expectEqual(
    reconciliation.sources.crosswire.verifiedTreeSha256,
    expectedCrosswireTree,
    "Verified CrossWire tree hash",
  );

  const expectedCategories = {
    "all-three-lexically-equivalent": 30757,
    "all-three-exact": 175,
    "two-authoritative-sources-agree-current-differs": 57,
    "current-agrees-kjv2006-crosswire-edition-variant": 111,
    "three-way-substantive-disagreement": 1,
    "current-agrees-crosswire-kjv2006-variant": 1,
  };

  for (const [category, expected] of Object.entries(
    expectedCategories,
  )) {
    expectEqual(
      reconciliation.threeWayCategories[category],
      expected,
      `Three-way category ${category}`,
    );
  }

  expectEqual(
    reconciliation.stagedCandidate.files.readerCandidate.records,
    31102,
    "KJV candidate verse count",
  );
  expectEqual(
    reconciliation.stagedCandidate.files.readerCandidate.sha256,
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829",
    "KJV candidate hash",
  );
  expectEqual(
    reconciliation.stagedCandidate.audit.exact,
    31102,
    "Candidate exact-to-KJV2006 count",
  );
  expectEqual(
    reconciliation.stagedCandidate.audit.substantiveDifferences,
    0,
    "Candidate substantive difference count",
  );
  expectEqual(
    reconciliation.stagedCandidate.audit.confirmedMissingWordOccurrences,
    0,
    "Candidate missing-word count",
  );

  const requiredGates = [
    "sourceTreesImmutable",
    "currentHashMatchesCertifiedCensus",
    "pairwiseCertifiedCountsReproduced",
    "deterministicRepeatedBuild",
    "candidateExactToKjv2006",
    "metadataInventoryExactToKjv2006",
  ];

  for (const gate of requiredGates) {
    expectEqual(
      reconciliation.gates[gate],
      true,
      `P05.12H gate ${gate}`,
    );
  }

  const disagreementRows = readCsv(
    path.join(
      args.reconciliationRoot,
      "three-way-substantive-disagreement.csv",
    ),
  );
  const crosswireAgreementRows = readCsv(
    path.join(
      args.reconciliationRoot,
      "current-agrees-crosswire-kjv2006-variant.csv",
    ),
  );
  const authoritativeAgreementRows = readCsv(
    path.join(
      args.reconciliationRoot,
      "two-authoritative-sources-agree-current-differs.csv",
    ),
  );
  const kjv2006AgreementRows = readCsv(
    path.join(
      args.reconciliationRoot,
      "current-agrees-kjv2006-crosswire-edition-variant.csv",
    ),
  );

  expectEqual(
    disagreementRows.length,
    1,
    "Three-way disagreement row count",
  );
  expectEqual(
    disagreementRows[0].reference,
    "Joshua 19:2",
    "Three-way disagreement reference",
  );
  expectEqual(
    crosswireAgreementRows.length,
    1,
    "Current/CrossWire agreement row count",
  );
  expectEqual(
    crosswireAgreementRows[0].reference,
    "1 Corinthians 4:15",
    "Current/CrossWire agreement reference",
  );
  expectEqual(
    authoritativeAgreementRows.length,
    57,
    "Authoritative-pair agreement row count",
  );
  expectEqual(
    kjv2006AgreementRows.length,
    111,
    "KJV2006/current agreement row count",
  );

  const readerCandidatePath = path.resolve(
    reconciliation.stagedCandidate.files.readerCandidate.path,
  );

  if (!fs.existsSync(readerCandidatePath)) {
    fail(`Staged KJV candidate is missing: ${readerCandidatePath}`);
  }

  expectEqual(
    sha256File(readerCandidatePath),
    reconciliation.stagedCandidate.files.readerCandidate.sha256,
    "On-disk staged KJV candidate hash",
  );

  const decisions = [
    {
      category: "all-three-exact",
      count: 175,
      visibleTextDecision: "kjv2006",
      reason:
        "All witnesses are exact; KJV2006 remains the locked visible edition.",
    },
    {
      category: "all-three-lexically-equivalent",
      count: 30757,
      visibleTextDecision: "kjv2006",
      reason:
        "Differences are typography, punctuation, spacing, or equivalent orthography. Use the selected visible edition consistently.",
    },
    {
      category:
        "two-authoritative-sources-agree-current-differs",
      count: 57,
      visibleTextDecision: "kjv2006",
      reason:
        "Both locked external witnesses agree against the current reader. Replace current visible text with the authoritative agreement.",
    },
    {
      category:
        "current-agrees-kjv2006-crosswire-edition-variant",
      count: 111,
      visibleTextDecision: "kjv2006",
      reason:
        "Current reader already follows the selected standardized 1769 KJV2006 visible edition; CrossWire retains edition-level spelling or orthography.",
    },
    {
      category:
        "current-agrees-crosswire-kjv2006-variant",
      count: 1,
      visibleTextDecision: "kjv2006",
      references: ["1 Corinthians 4:15"],
      reason:
        "The selected visible edition is KJV2006. CrossWire remains an independent witness, not the visible-text authority.",
    },
    {
      category: "three-way-substantive-disagreement",
      count: 1,
      visibleTextDecision: "kjv2006",
      references: ["Joshua 19:2"],
      reason:
        "KJV2006 preserves the traditional reading 'Beer-sheba, or Sheba'; the current reader and CrossWire differ separately. The selected edition must remain internally consistent rather than creating a hybrid text.",
    },
  ];

  const policy = {
    milestone: "P05.12Z",
    generatedAtUtc: new Date().toISOString(),
    status: "kjv-visible-edition-locked",
    repository: reconciliation.repository,
    selectedVisibleEdition: {
      id: "eng-kjv2006",
      name:
        "King James Authorized Version, standardized 1769",
      role: "authoritative-visible-reader-text",
      sourceArchiveSha256: expectedKjv2006Archive,
      sourceTreeSha256: expectedKjv2006Tree,
    },
    secondaryWitness: {
      id: "crosswire-kjv",
      role:
        "independent-textual-witness-and-metadata-source",
      pinnedCommit: expectedCrosswireCommit,
      osisSha256: expectedCrosswireOsis,
      sourceTreeSha256: expectedCrosswireTree,
    },
    policy: {
      noHybridVisibleText: true,
      visibleTextAlwaysFollowsSelectedEdition: true,
      crosswireDifferencesRemainAuditable: true,
      crosswireStrongAndMorphologyMetadataMayBePreservedSeparately:
        true,
      footnotesHeadingsPoetryAndStructureRemainSeparateFromVisibleVerseText:
        true,
      unresolvedAlignmentChangesFailClosed: true,
    },
    categoryDecisions: decisions,
    candidate: {
      path:
        reconciliation.stagedCandidate.files.readerCandidate.path,
      sha256:
        reconciliation.stagedCandidate.files.readerCandidate.sha256,
      verses: 31102,
      exactToSelectedEdition: true,
      deterministicFingerprint:
        reconciliation.stagedCandidate
          .deterministicFingerprint,
    },
    currentProductionDifference: {
      versesCompared: 31102,
      exact:
        reconciliation.certifiedPairwiseReproduction
          .currentVsKjv2006.exact,
      typographyOrPunctuationOnly:
        reconciliation.certifiedPairwiseReproduction
          .currentVsKjv2006
          .typographyOrPunctuationOnly,
      substantiveDifferences:
        reconciliation.certifiedPairwiseReproduction
          .currentVsKjv2006.substantiveDifferences,
      confirmedMissingWordOccurrences:
        reconciliation.certifiedPairwiseReproduction
          .currentVsKjv2006
          .confirmedMissingWordOccurrences,
      netSourceWordDeficit:
        reconciliation.certifiedPairwiseReproduction
          .currentVsKjv2006.netSourceWordDeficit,
    },
    gates: {
      priorReconciliationReproducedOnCurrentCommit: true,
      selectedEditionSourceImmutable: true,
      secondaryWitnessImmutable: true,
      all31102CandidateVersesExactToSelectedEdition: true,
      everyThreeWayCategoryHasExplicitDecision: true,
      twoExceptionalReferencesExplicitlyReviewed: true,
      productionKjvModified: false,
      webModified: false,
      brentonModified: false,
      alignmentsModified: false,
      safeToStageKjvCanonicalMigration: true,
      safeToPromoteProductionKjv: false,
    },
  };

  fs.mkdirSync(args.output, { recursive: true });
  writeJson(
    path.join(args.output, "kjv-visible-edition-policy.json"),
    policy,
  );

  const markdown = [
    "# EMETSEES KJV visible-edition decision",
    "",
    "## Locked decision",
    "",
    "EMETSEES will use **eBible KJV2006 — King James Authorized Version, standardized 1769** as the single visible KJV reader edition.",
    "",
    "CrossWire KJV remains a pinned independent witness and metadata source. EMETSEES will not create a hybrid visible KJV by selecting individual spellings or readings from different editions.",
    "",
    "## Why this is the correct next step",
    "",
    `- Current production KJV verses: 31,102`,
    `- Candidate exact to KJV2006: 31,102 / 31,102`,
    `- Current vs KJV2006 substantive differences: ${policy.currentProductionDifference.substantiveDifferences}`,
    `- Confirmed missing current word occurrences: ${policy.currentProductionDifference.confirmedMissingWordOccurrences}`,
    `- Net current word deficit: ${policy.currentProductionDifference.netSourceWordDeficit}`,
    `- External witnesses agree against current: 57 verses`,
    "",
    "## Exceptional edition decisions",
    "",
    "### Joshua 19:2",
    "",
    `- Current: ${disagreementRows[0].currentText}`,
    `- KJV2006: ${disagreementRows[0].kjv2006Text}`,
    `- CrossWire: ${disagreementRows[0].crosswireText}`,
    "- Decision: use the internally consistent KJV2006 reading.",
    "",
    "### 1 Corinthians 4:15",
    "",
    `- Current: ${crosswireAgreementRows[0].currentText}`,
    `- KJV2006: ${crosswireAgreementRows[0].kjv2006Text}`,
    `- CrossWire: ${crosswireAgreementRows[0].crosswireText}`,
    "- Decision: use KJV2006 spelling because KJV2006 is the locked visible edition.",
    "",
    "## Authorization",
    "",
    "This stage authorizes an isolated canonical/alignment-preservation preview. It does not authorize production promotion.",
    "",
  ].join("\n");

  fs.writeFileSync(
    path.join(args.output, "KJV-VISIBLE-EDITION-DECISION.md"),
    markdown,
    "utf8",
  );

  console.log(JSON.stringify(policy, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
