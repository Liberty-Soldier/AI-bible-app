"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const compiler = require("./build-cached-emet-explanations");

const ROOT = process.cwd();
const SCHEDULER_ID = "P04-SCHEDULER";
const SCHEDULER_VERSION = "1.2.0";
const SCHEMA_VERSION = "1.0.0";
const DEFAULT_BATCH_QUEUE_LIMIT = 5_000_000;
const DEFAULT_BUDGET_RATIO = 0.9;
const DEFAULT_REQUEST_SIZE = 1;
const DEFAULT_COOLDOWN_HOURS = 0;
const DEFAULT_OUTPUT_TOKEN_RESERVE = 600;
const DEFAULT_POLL_SECONDS = 60;
const STATE_PATH = path.join(compiler.OUTPUT_DIR, "scheduler-state.json");
const AUDIT_PATH = path.join(compiler.OUTPUT_DIR, "scheduler-audit.json");
const BATCH_SCRIPT = path.join(
  ROOT,
  "scripts",
  "entity",
  "batch-cached-emet-explanations.js"
);
const BATCH_ROOT = path.join(compiler.OUTPUT_DIR, "batch-jobs");
const LATEST_PATH = path.join(BATCH_ROOT, "latest.json");

function fail(message) {
  throw new Error(message);
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const batchQueueLimit = compiler.positiveInteger(
    process.env.EMET_P04_BATCH_QUEUE_LIMIT ||
      process.env.EMET_P04_TIER_DAILY_TOKEN_LIMIT,
    DEFAULT_BATCH_QUEUE_LIMIT
  );
  const options = {
    mode: "run",
    batchQueueLimit,
    inputTokenBudget: compiler.positiveInteger(
      process.env.EMET_P04_SCHEDULER_INPUT_TOKEN_BUDGET ||
        process.env.EMET_P04_SCHEDULER_TOKEN_BUDGET,
      Math.floor(batchQueueLimit * DEFAULT_BUDGET_RATIO)
    ),
    requestSize: compiler.positiveInteger(
      process.env.EMET_P04_SCHEDULER_REQUEST_SIZE,
      DEFAULT_REQUEST_SIZE
    ),
    cooldownHours: Number(
      process.env.EMET_P04_SCHEDULER_COOLDOWN_HOURS ||
        DEFAULT_COOLDOWN_HOURS
    ),
    outputTokenReserve: compiler.positiveInteger(
      process.env.EMET_P04_OUTPUT_TOKEN_RESERVE,
      DEFAULT_OUTPUT_TOKEN_RESERVE
    ),
    forceSubmit: false,
    prepareOnly: false,
    watch: false,
    pollSeconds: compiler.positiveInteger(
      process.env.EMET_P04_SCHEDULER_POLL_SECONDS,
      DEFAULT_POLL_SECONDS
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run") options.mode = "run";
    else if (arg === "--plan") options.mode = "plan";
    else if (arg === "--status") options.mode = "status";
    else if (arg === "--reset") options.mode = "reset";
    else if (arg === "--force-submit") options.forceSubmit = true;
    else if (arg === "--prepare-only") options.prepareOnly = true;
    else if (arg === "--watch") options.watch = true;
    else if (arg === "--batch-queue-limit" || arg === "--tier-token-limit") {
      options.batchQueueLimit = compiler.positiveInteger(argv[++index], null);
      if (!options.batchQueueLimit) {
        fail("--batch-queue-limit requires a positive integer.");
      }
    } else if (arg === "--input-token-budget" || arg === "--token-budget") {
      options.inputTokenBudget = compiler.positiveInteger(argv[++index], null);
      if (!options.inputTokenBudget) {
        fail("--input-token-budget requires a positive integer.");
      }
    } else if (arg === "--request-size") {
      options.requestSize = compiler.positiveInteger(argv[++index], null);
      if (!options.requestSize) fail("--request-size requires a positive integer.");
    } else if (arg === "--cooldown-hours") {
      options.cooldownHours = Number(argv[++index]);
      if (!Number.isFinite(options.cooldownHours) || options.cooldownHours < 0) {
        fail("--cooldown-hours requires a non-negative number.");
      }
    } else if (arg === "--output-token-reserve") {
      options.outputTokenReserve = compiler.positiveInteger(argv[++index], null);
      if (!options.outputTokenReserve) {
        fail("--output-token-reserve requires a positive integer.");
      }
    } else if (arg === "--poll-seconds") {
      options.pollSeconds = compiler.positiveInteger(argv[++index], null);
      if (!options.pollSeconds) fail("--poll-seconds requires a positive integer.");
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (options.inputTokenBudget >= options.batchQueueLimit) {
    fail(
      `The scheduler input-token budget (${options.inputTokenBudget}) must remain below the configured Batch queue limit (${options.batchQueueLimit}).`
    );
  }
  return options;
}

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    scheduler: { id: SCHEDULER_ID, version: SCHEDULER_VERSION },
    activeJobId: null,
    lastSubmittedAt: null,
    nextEligibleSubmitAt: null,
    completedJobs: [],
    history: [],
    updatedAt: nowIso(),
  };
}

function loadState() {
  const value = compiler.readJsonIfExists(STATE_PATH);
  if (!compiler.isRecord(value)) return emptyState();
  return {
    ...emptyState(),
    ...value,
    completedJobs: Array.isArray(value.completedJobs) ? value.completedJobs : [],
    history: Array.isArray(value.history) ? value.history : [],
  };
}

function saveState(state) {
  state.updatedAt = nowIso();
  state.completedJobs = [...new Set(state.completedJobs || [])];
  state.history = (state.history || []).slice(-500);
  compiler.writeStableJson(STATE_PATH, state, 2);
}

function addHistory(state, action, details = {}) {
  state.history.push({ at: nowIso(), action, ...compiler.canonicalize(details) });
}

function runNode(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${path.basename(scriptPath)} exited with code ${result.status}.`);
  }
}

function readManifest(jobId) {
  if (!jobId) return null;
  const manifestPath = path.join(BATCH_ROOT, jobId, "manifest.json");
  const manifest = compiler.readJsonIfExists(manifestPath);
  if (!compiler.isRecord(manifest)) fail(`Batch manifest not found for ${jobId}.`);
  return manifest;
}

function latestJobId() {
  return compiler.cleanString(compiler.readJsonIfExists(LATEST_PATH)?.jobId);
}

function currentPlan() {
  const packetsDocument = compiler.readJson(
    compiler.INPUTS.packets,
    "P03 evidence-packets.json"
  );
  const p03 = compiler.validateP03Artifact(packetsDocument);
  const prompt = compiler.promptDescriptor();
  const previous = compiler.extractPreviousRecords();
  const model = compiler.cleanString(process.env.EMET_P04_MODEL) || compiler.DEFAULT_MODEL;
  const plan = compiler.buildPlan({
    packets: p03.packets,
    prompt,
    model,
    previousRecords: previous.records,
    retryFailed: true,
    previousFailures: previous.failures,
  });
  return { packetsDocument, p03, prompt, previous, model, plan };
}

function usageMetrics(previous) {
  const input = [];
  const output = [];
  for (const record of Object.values(previous.records || {})) {
    const api = record?.generation?.apiUsage;
    const inputTokens = Number(
      api?.reportedInputTokensAllocated ?? api?.inputTokens ?? api?.reportedInputTokens
    );
    const outputTokens = Number(
      api?.reportedOutputTokensAllocated ?? api?.outputTokens ?? api?.reportedOutputTokens
    );
    if (Number.isFinite(inputTokens) && inputTokens > 0) input.push(inputTokens);
    if (Number.isFinite(outputTokens) && outputTokens > 0) output.push(outputTokens);
  }
  const average = (values) =>
    values.length > 0
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : 0;
  const percentile = (values, ratio) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  };
  return {
    samples: Math.max(input.length, output.length),
    averageInputTokens: average(input),
    averageOutputTokens: average(output),
    p95OutputTokens: percentile(output, 0.95),
  };
}

function effectiveOutputReserve(options, usage) {
  return Math.max(
    options.outputTokenReserve,
    usage.p95OutputTokens > 0 ? Math.ceil(usage.p95OutputTokens * 1.15) : 0
  );
}

function nextEligibleDate(state, options) {
  if (!state.lastSubmittedAt || options.cooldownHours === 0) return null;
  const submitted = new Date(state.lastSubmittedAt).getTime();
  if (!Number.isFinite(submitted)) return null;
  return new Date(submitted + options.cooldownHours * 60 * 60 * 1000);
}

function submissionAllowed(state, options) {
  if (options.forceSubmit) return true;
  const eligible = nextEligibleDate(state, options);
  return !eligible || Date.now() >= eligible.getTime();
}

function prepareJob(state, options, outputReserve) {
  runNode(BATCH_SCRIPT, [
    "--prepare",
    "--all",
    "--balanced",
    "--force-new",
    "--request-size",
    String(options.requestSize),
    "--input-token-budget",
    String(options.inputTokenBudget),
    "--output-token-reserve",
    String(outputReserve),
  ]);
  const jobId = latestJobId();
  if (!jobId) fail("Batch preparation did not write a latest job ID.");
  state.activeJobId = jobId;
  addHistory(state, "prepared", {
    jobId,
    inputTokenBudget: options.inputTokenBudget,
  });
  saveState(state);
  return readManifest(jobId);
}

function submitJob(state, options) {
  if (!state.activeJobId) fail("No active scheduler job is prepared.");
  if (!submissionAllowed(state, options)) {
    const eligible = nextEligibleDate(state, options);
    state.nextEligibleSubmitAt = eligible ? eligible.toISOString() : null;
    saveState(state);
    console.log(`Submission held until : ${state.nextEligibleSubmitAt}`);
    console.log("Run npm run emet:generate after that time.\n");
    return readManifest(state.activeJobId);
  }
  runNode(BATCH_SCRIPT, ["--submit", "--job", state.activeJobId]);
  state.lastSubmittedAt = nowIso();
  const eligible = nextEligibleDate(state, options);
  state.nextEligibleSubmitAt = eligible ? eligible.toISOString() : null;
  addHistory(state, "submitted", { jobId: state.activeJobId });
  saveState(state);
  return readManifest(state.activeJobId);
}

function refreshJob(state) {
  if (!state.activeJobId) return null;
  runNode(BATCH_SCRIPT, ["--status", "--job", state.activeJobId]);
  return readManifest(state.activeJobId);
}

function terminalStatus(status) {
  return ["completed", "terminal-with-errors", "failed", "expired", "cancelled"].includes(status);
}

function importJob(state) {
  const jobId = state.activeJobId;
  runNode(BATCH_SCRIPT, ["--import", "--job", jobId]);
  runNode(BATCH_SCRIPT, ["--verify", "--job", jobId]);
  state.completedJobs.push(jobId);
  addHistory(state, "imported", { jobId });
  state.activeJobId = null;
  saveState(state);
}

function writeAudit(state, options, context, usage, outputReserve, activeManifest) {
  const audit = {
    schemaVersion: SCHEMA_VERSION,
    scheduler: { id: SCHEDULER_ID, version: SCHEDULER_VERSION },
    generatedAt: nowIso(),
    config: {
      batchQueueLimit: options.batchQueueLimit,
      inputTokenBudget: options.inputTokenBudget,
      requestSize: options.requestSize,
      cooldownHours: options.cooldownHours,
      outputTokenReserve: outputReserve,
      safetyPromptTokens:
        options.batchQueueLimit - options.inputTokenBudget,
    },
    prompt: {
      id: context.prompt.id,
      version: context.prompt.version,
      checksum: context.prompt.checksum,
      wordRange: {
        minimum: compiler.MIN_TOTAL_WORDS,
        maximum: compiler.MAX_TOTAL_WORDS,
      },
    },
    coverage: {
      totalPackets: context.plan.entityIds.length,
      reusable: Object.keys(context.plan.reusable).length,
      pending: context.plan.pending.length,
      failures: Object.keys(context.previous.failures || {}).length,
      reasons: context.plan.reasons,
    },
    measuredUsage: usage,
    activeJob: activeManifest
      ? {
          jobId: activeManifest.jobId,
          status: activeManifest.status,
          entities: activeManifest.totals?.entities,
          requests: activeManifest.totals?.requests,
          estimatedInputTokens: activeManifest.totals?.estimatedRequestTokens,
          estimatedOutputTokens: activeManifest.totals?.estimatedOutputTokens,
          estimatedCombinedTokens: activeManifest.totals?.estimatedCombinedTokens,
          queueUtilization:
            activeManifest.totals?.estimatedRequestTokens /
            options.batchQueueLimit,
        }
      : null,
    state: {
      activeJobId: state.activeJobId,
      lastSubmittedAt: state.lastSubmittedAt,
      nextEligibleSubmitAt: state.nextEligibleSubmitAt,
      completedJobCount: state.completedJobs.length,
    },
  };
  compiler.writeStableJson(AUDIT_PATH, audit, 2);
  return audit;
}

function printSummary(state, options, context, usage, outputReserve, manifest) {
  console.log("P04 Tier-safe scheduler\n");
  console.log(`Prompt               : ${context.prompt.id}@${context.prompt.version}`);
  console.log(`Required words       : ${compiler.MIN_TOTAL_WORDS}-${compiler.MAX_TOTAL_WORDS}`);
  console.log(`Reusable             : ${Object.keys(context.plan.reusable).length}`);
  console.log(`Pending              : ${context.plan.pending.length}`);
  console.log(`Existing failures    : ${Object.keys(context.previous.failures || {}).length}`);
  console.log(`Batch queue limit    : ${options.batchQueueLimit}`);
  console.log(`Safe input budget    : ${options.inputTokenBudget}`);
  console.log(
    `Prompt-token reserve : ${options.batchQueueLimit - options.inputTokenBudget}`
  );
  console.log(`Entities per request : ${options.requestSize}`);
  console.log(`Output reserve/entity: ${outputReserve}`);
  console.log(`Measured samples     : ${usage.samples}`);
  console.log(`Measured avg input   : ${usage.averageInputTokens}`);
  console.log(`Measured avg output  : ${usage.averageOutputTokens}`);
  console.log(`Active job           : ${state.activeJobId || "none"}`);
  if (manifest) {
    console.log(`Active status        : ${manifest.status}`);
    console.log(`Active entities      : ${manifest.totals?.entities || 0}`);
    console.log(
      `Active est. input    : ${manifest.totals?.estimatedRequestTokens || 0}`
    );
    console.log(
      `Active est. output   : ${manifest.totals?.estimatedOutputTokens || 0}`
    );
  }
  if (state.nextEligibleSubmitAt) {
    console.log(`Next eligible submit : ${state.nextEligibleSubmitAt}`);
  }
  console.log(`Scheduler state      : ${compiler.relativePath(STATE_PATH)}`);
  console.log(`Scheduler audit      : ${compiler.relativePath(AUDIT_PATH)}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runScheduler(options) {
  fs.mkdirSync(compiler.OUTPUT_DIR, { recursive: true });
  if (options.mode === "reset") {
    if (fs.existsSync(STATE_PATH)) fs.rmSync(STATE_PATH);
    if (fs.existsSync(AUDIT_PATH)) fs.rmSync(AUDIT_PATH);
    console.log(
      "P04 scheduler state reset. Batch jobs and generated records were preserved.\n"
    );
    return;
  }

  const state = loadState();
  if (options.cooldownHours === 0 && state.nextEligibleSubmitAt) {
    state.nextEligibleSubmitAt = null;
    addHistory(state, "cooldown-disabled", {
      reason: "Batch queue capacity replaces the prior daily cooldown.",
    });
    saveState(state);
  }

  if (options.mode === "plan" || options.mode === "status") {
    const context = currentPlan();
    const usage = usageMetrics(context.previous);
    const outputReserve = effectiveOutputReserve(options, usage);
    let manifest = state.activeJobId ? readManifest(state.activeJobId) : null;
    if (
      options.mode === "status" &&
      state.activeJobId &&
      manifest?.status !== "prepared"
    ) {
      manifest = refreshJob(state);
    }
    writeAudit(state, options, context, usage, outputReserve, manifest);
    printSummary(state, options, context, usage, outputReserve, manifest);
    return;
  }

  while (true) {
    let context = currentPlan();
    const usage = usageMetrics(context.previous);
    const outputReserve = effectiveOutputReserve(options, usage);
    let manifest = state.activeJobId ? readManifest(state.activeJobId) : null;

    if (context.plan.pending.length === 0) {
      runNode(
        path.join(
          ROOT,
          "scripts",
          "entity",
          "build-cached-emet-explanations.js"
        ),
        ["--verify"]
      );
      writeAudit(state, options, context, usage, outputReserve, null);
      printSummary(state, options, context, usage, outputReserve, null);
      console.log("P04 generation is complete.\n");
      return;
    }

    if (!manifest) {
      manifest = prepareJob(state, options, outputReserve);
      if (options.prepareOnly) {
        writeAudit(state, options, context, usage, outputReserve, manifest);
        printSummary(state, options, context, usage, outputReserve, manifest);
        return;
      }
      manifest = submitJob(state, options);
      if (!options.watch) break;
    } else if (manifest.status === "prepared") {
      if (options.prepareOnly) break;
      manifest = submitJob(state, options);
      if (!options.watch) break;
    } else {
      manifest = refreshJob(state);
      if (!terminalStatus(manifest.status)) {
        if (!options.watch) break;
        console.log(
          `Batch still ${manifest.status}; checking again in ${options.pollSeconds}s...`
        );
        await sleep(options.pollSeconds * 1000);
        continue;
      }

      importJob(state);
      if (!options.watch) {
        context = currentPlan();
        if (context.plan.pending.length > 0) {
          const refreshedUsage = usageMetrics(context.previous);
          const refreshedReserve = effectiveOutputReserve(
            options,
            refreshedUsage
          );
          manifest = prepareJob(state, options, refreshedReserve);
          if (!options.prepareOnly) manifest = submitJob(state, options);
        } else {
          manifest = null;
        }
        break;
      }

      // In watch mode, immediately continue: recalculate remaining entities,
      // prepare the next queue-safe job, and submit it without a daily delay.
      continue;
    }

    if (options.watch && manifest && !terminalStatus(manifest.status)) {
      console.log(
        `Batch ${manifest.status}; checking again in ${options.pollSeconds}s...`
      );
      await sleep(options.pollSeconds * 1000);
    }
  }

  const finalContext = currentPlan();
  const finalUsage = usageMetrics(finalContext.previous);
  const finalReserve = effectiveOutputReserve(options, finalUsage);
  const activeManifest = state.activeJobId
    ? readManifest(state.activeJobId)
    : null;
  writeAudit(
    state,
    options,
    finalContext,
    finalUsage,
    finalReserve,
    activeManifest
  );
  printSummary(
    state,
    options,
    finalContext,
    finalUsage,
    finalReserve,
    activeManifest
  );
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P04 Tier-Safe Generation Scheduler");
  console.log("========================================\n");
  await runScheduler(options);
}

main().catch((error) => {
  console.error("\nP04 SCHEDULER FAILED\n");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
