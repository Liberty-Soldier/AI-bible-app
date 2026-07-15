#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const TEST_VERSION = "0.3.4";
const DEFAULT_ENTITY = "word:hebrew:H1077";

function fail(message) {
  throw new Error(message);
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseArgs(argv) {
  const options = { entityId: DEFAULT_ENTITY, model: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--entity") options.entityId = cleanString(argv[++index]);
    else if (arg.startsWith("--entity=")) options.entityId = cleanString(arg.slice(9));
    else if (arg === "--model") options.model = cleanString(argv[++index]);
    else if (arg.startsWith("--model=")) options.model = cleanString(arg.slice(8));
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/entity/test-emet-reader-explanation.js [--entity ${DEFAULT_ENTITY}] [--model MODEL]`);
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  if (!options.entityId) fail("--entity requires an entity ID.");
  return options;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  loadDotEnv(path.join(root, ".env"));
  loadDotEnv(path.join(root, ".env.local"));

  const compilerPath = path.join(root, "scripts", "entity", "build-cached-emet-explanations.js");
  const compiler = require(compilerPath);
  const p03Path = path.join(root, ".private", "entity", "build", "P03", "evidence-packets.json");
  const p03Document = compiler.readJson(p03Path, "P03 evidence packets");
  const p03 = compiler.validateP03Artifact(p03Document);
  const packet = p03.packets[options.entityId];
  if (!packet) fail(`P03 entity not found: ${options.entityId}`);

  const prompt = compiler.promptDescriptor();
  const model = options.model || compiler.cleanString(process.env.EMET_P04_MODEL) || compiler.DEFAULT_MODEL;
  const apiKey = compiler.cleanString(process.env.OPENAI_API_KEY);
  if (!apiKey) fail("OPENAI_API_KEY was not found in .env.local or the current environment.");

  const result = await compiler.callOpenAI(
    [options.entityId],
    { [options.entityId]: packet },
    prompt,
    {
      model,
      apiBaseUrl:
        compiler.cleanString(process.env.OPENAI_API_BASE_URL) ||
        compiler.cleanString(process.env.OPENAI_BASE_URL) ||
        compiler.DEFAULT_API_BASE_URL,
      maxAttempts: 2,
      maxEntityInputBytes: compiler.DEFAULT_MAX_ENTITY_INPUT_BYTES,
      maxBatchInputBytes: compiler.DEFAULT_MAX_BATCH_INPUT_BYTES,
    }
  );

  const record = result.records[options.entityId];

  const reviewDir = path.join(compiler.OUTPUT_DIR, "review-tests");
  fs.mkdirSync(reviewDir, { recursive: true });
  const safeName = options.entityId.replace(/[^A-Za-z0-9._-]+/gu, "_");
  const reviewPath = path.join(reviewDir, `${safeName}-reader-first-context-safe-repair-${TEST_VERSION}.json`);
  compiler.writeStableJson(reviewPath, record, 2);

  console.log("\n========================================");
  console.log(" EMETSEES P04 Context-Safe Reader Test + Repair");
  console.log("========================================\n");
  console.log(`Entity               : ${record.entityId}`);
  console.log(`Corpus               : ${record.corpus}`);
  console.log(`Model                : ${record.generation.model}`);
  console.log(`Prompt               : ${prompt.id}@${prompt.version}`);
  console.log(`Generation view bytes: ${record.generation.inputAudit.generationViewBytes}`);
  console.log(`Allowed evidence IDs : ${record.generation.inputAudit.allowedEvidenceCount}`);
  const reviewBundle = compiler.buildGenerationBundle(packet, { enforceLimit: true });
  const renderingPolicy = reviewBundle.view.rendering_evidence;
  console.log(`Meaning source        : ${renderingPolicy.explicit_lexical_meaning_available ? "glosses / definitions" : "filtered dominant fallback"}`);
  const fallbackTerms = Array.isArray(renderingPolicy.dominant_fallback_candidates)
    ? renderingPolicy.dominant_fallback_candidates.map((item) => item.text).filter(Boolean)
    : [];
  console.log(`Fallback terms        : ${fallbackTerms.length ? fallbackTerms.join(", ") : "none"}`);
  console.log("Quality gates         : passed");
  console.log("\nHEADLINE");
  console.log(record.explanation.headline);
  console.log("\nEXPLANATION");
  console.log(record.explanation.text);
  console.log(`\nWords                : ${record.statistics.wordCount}`);
  console.log(`Citations            : ${record.statistics.citationCount}`);
  console.log(`Input tokens         : ${record.generation.apiUsage.reportedInputTokensAllocated}`);
  console.log(`Output tokens        : ${record.generation.apiUsage.reportedOutputTokensAllocated}`);
  console.log(`Review file          : ${compiler.relativePath(reviewPath)}\n`);
  console.log("This context-safe reader review used up to two bounded attempts, did not modify generation-state.json, and did not submit a Batch job.\n");
}

main().catch((error) => {
  console.error("\nP04 READER TEST FAILED\n");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
