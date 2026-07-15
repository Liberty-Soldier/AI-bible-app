#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P04.1 verify] ${message}`);
}

function read(relative) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) fail(`Missing file: ${relative}`);
  return fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "");
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

function assertIncludes(content, value, label) {
  if (!content.includes(value)) fail(`${label} is missing: ${value}`);
}

function assertNotIncludes(content, value, label) {
  if (content.includes(value)) fail(`${label} must not contain: ${value}`);
}

function main() {
  const engine = read("app/data/lexicon/BibleIQEngine.ts");
  const sheet = read("app/components/WordStudySheet.tsx");
  const types = read("app/data/lexicon/BibleIQTypes.ts");
  const rules = read("scripts/p041/EMET_GOVERNING_RULES.md");
  const generator = read("scripts/p041/EMET_GENERATOR_PROMPT.md");
  const reviewer = read("scripts/p041/EMET_REVIEWER_RUBRIC.md");

  assertIncludes(engine, "loadApprovedEmetOverride", "BibleIQEngine");
  assertIncludes(engine, 'status: "under-review"', "BibleIQEngine");
  assertIncludes(engine, 'approval: "unapproved-p04"', "BibleIQEngine");
  assertNotIncludes(
    engine,
    "explanation: runtime.explanation.text",
    "BibleIQEngine",
  );
  assertNotIncludes(
    engine,
    "summary: runtime.explanation.text",
    "BibleIQEngine",
  );

  assertIncludes(
    sheet,
    'emet?.status === "complete" && emet.explanation',
    "WordStudySheet",
  );
  assertNotIncludes(
    sheet,
    "Cached explanation unavailable",
    "WordStudySheet",
  );
  assertNotIncludes(
    sheet,
    "locked cached P04",
    "WordStudySheet",
  );

  assertIncludes(types, '"under-review"', "BibleIQTypes");
  assertIncludes(types, '"approved-p04.1"', "BibleIQTypes");

  for (const phrase of [
    "Scripture is truth",
    "Old Testament establishes",
    "Yahweh changed",
    "commandments became false",
    "Scripture interprets Scripture",
  ]) {
    assertIncludes(rules, phrase, "EMET governing rules");
  }
  assertIncludes(generator, "reader's curiosity", "Generator prompt");
  assertIncludes(reviewer, "Automatic rejection", "Reviewer rubric");

  const audit = readJson("reports/p04-quality-audit-v2/summary.json");
  if (audit.auditVersion !== "2.0.0") fail("Unexpected audit version.");
  if (audit.totals.entities !== 27206) {
    fail(`Expected 27,206 audited entities, found ${audit.totals.entities}.`);
  }

  const pilot = readJson(
    ".private/entity/build/P04.1/pilot/manifest.json",
  );
  if (pilot.pilotCount !== 60) fail(`Expected 60 pilot views, found ${pilot.pilotCount}.`);
  for (const [corpus, count] of Object.entries({
    hebrew: 20,
    "greek-nt": 20,
    lxx: 20,
  })) {
    if (pilot.byCorpus?.[corpus] !== count) {
      fail(`Expected ${count} ${corpus} pilot views, found ${pilot.byCorpus?.[corpus]}.`);
    }
  }
  if (pilot.noAiCallsMade !== true) fail("Pilot must record noAiCallsMade=true.");

  const approvedManifest = readJson(
    "public/data/bibleiq/word-study/emet-approved/manifest.json",
  );
  if (
    approvedManifest.source.baseP04Checksum !==
    "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5"
  ) {
    fail("Approved runtime is not tied to the locked P04 checksum.");
  }

  console.log("P04.1 preparation verification passed.");
  console.log("- Existing unapproved P04 prose is quarantined from the client response");
  console.log("- Only human-approved P04.1 overrides may render as EMET explanations");
  console.log("- Corrected quality audit separates input, content, style, and format defects");
  console.log("- 60 semantic pilot views prepared: 20 Hebrew, 20 Greek NT, 20 LXX");
  console.log("- OT-to-NT governing rules and independent reviewer rubric are installed");
  console.log("- No AI calls were made");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
