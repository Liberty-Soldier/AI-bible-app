"use strict";

const fs = require("fs");
const path = require("path");

const compiler = require("./build-cached-emet-explanations");

const ROOT = process.cwd();
const BATCH_COMPILER_ID = "P04-BATCH";
const BATCH_COMPILER_VERSION = "1.3.0";
const BATCH_SCHEMA_VERSION = "1.0.0";
const BATCH_ENDPOINT = "/v1/responses";
const COMPLETION_WINDOW = "24h";
const DEFAULT_REQUEST_SIZE = 8;
const DEFAULT_MAX_FILE_BYTES = 150 * 1024 * 1024;
const DEFAULT_MAX_REQUESTS_PER_FILE = 50000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_OUTPUT_TOKEN_RESERVE = 600;
const BATCH_ROOT = path.join(compiler.OUTPUT_DIR, "batch-jobs");
const LATEST_PATH = path.join(BATCH_ROOT, "latest.json");

function fail(message) {
  throw new Error(message);
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const options = {
    mode: null,
    all: false,
    forceNew: false,
    forceImport: false,
    entityIds: [],
    corpora: [],
    limit: null,
    samplePerCorpus: null,
    requestSize: compiler.positiveInteger(
      process.env.EMET_P04_BATCH_REQUEST_SIZE,
      DEFAULT_REQUEST_SIZE
    ),
    maxFileBytes: compiler.positiveInteger(
      process.env.EMET_P04_BATCH_MAX_FILE_BYTES,
      DEFAULT_MAX_FILE_BYTES
    ),
    maxRequestsPerFile: compiler.positiveInteger(
      process.env.EMET_P04_BATCH_MAX_REQUESTS_PER_FILE,
      DEFAULT_MAX_REQUESTS_PER_FILE
    ),
    maxEntityInputBytes: compiler.positiveInteger(
      process.env.EMET_P04_MAX_ENTITY_INPUT_BYTES,
      compiler.DEFAULT_MAX_ENTITY_INPUT_BYTES
    ),
    maxBatchInputBytes: compiler.positiveInteger(
      process.env.EMET_P04_MAX_BATCH_INPUT_BYTES,
      compiler.DEFAULT_MAX_BATCH_INPUT_BYTES
    ),
    maxAttempts: compiler.positiveInteger(
      process.env.EMET_P04_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    tokenBudget: compiler.positiveInteger(
      process.env.EMET_P04_BATCH_TOKEN_BUDGET,
      null
    ),
    inputTokenBudget: compiler.positiveInteger(
      process.env.EMET_P04_BATCH_INPUT_TOKEN_BUDGET,
      null
    ),
    outputTokenReserve: compiler.positiveInteger(
      process.env.EMET_P04_OUTPUT_TOKEN_RESERVE,
      DEFAULT_OUTPUT_TOKEN_RESERVE
    ),
    balanced: false,
    model: compiler.cleanString(process.env.EMET_P04_MODEL) || compiler.DEFAULT_MODEL,
    apiBaseUrl:
      compiler.cleanString(process.env.OPENAI_BASE_URL) ||
      compiler.DEFAULT_API_BASE_URL,
    jobId: null,
    shardIndexes: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prepare") options.mode = "prepare";
    else if (arg === "--submit") options.mode = "submit";
    else if (arg === "--status") options.mode = "status";
    else if (arg === "--import") options.mode = "import";
    else if (arg === "--cancel") options.mode = "cancel";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--all") options.all = true;
    else if (arg === "--force-new") options.forceNew = true;
    else if (arg === "--force-import") options.forceImport = true;
    else if (arg === "--balanced") options.balanced = true;
    else if (arg === "--entity") {
      const raw = compiler.cleanString(argv[++index]);
      if (!raw) fail("--entity requires an entity ID or comma-separated IDs.");
      options.entityIds.push(...raw.split(",").map((value) => value.trim()));
    } else if (arg === "--corpus") {
      const raw = compiler.cleanString(argv[++index]);
      if (!raw) fail("--corpus requires hebrew, greek-nt, or lxx.");
      options.corpora.push(...raw.split(",").map((value) => value.trim()));
    } else if (arg === "--limit") {
      options.limit = compiler.positiveInteger(argv[++index], null);
      if (!options.limit) fail("--limit requires a positive integer.");
    } else if (arg === "--sample-per-corpus") {
      options.samplePerCorpus = compiler.positiveInteger(argv[++index], null);
      if (!options.samplePerCorpus) {
        fail("--sample-per-corpus requires a positive integer.");
      }
    } else if (arg === "--request-size") {
      options.requestSize = compiler.positiveInteger(argv[++index], null);
      if (!options.requestSize) fail("--request-size requires a positive integer.");
    } else if (arg === "--max-file-bytes") {
      options.maxFileBytes = compiler.positiveInteger(argv[++index], null);
      if (!options.maxFileBytes) fail("--max-file-bytes requires a positive integer.");
    } else if (arg === "--max-requests-per-file") {
      options.maxRequestsPerFile = compiler.positiveInteger(argv[++index], null);
      if (!options.maxRequestsPerFile) {
        fail("--max-requests-per-file requires a positive integer.");
      }
    } else if (arg === "--max-entity-input-bytes") {
      options.maxEntityInputBytes = compiler.positiveInteger(argv[++index], null);
      if (!options.maxEntityInputBytes) {
        fail("--max-entity-input-bytes requires a positive integer.");
      }
    } else if (arg === "--max-batch-input-bytes") {
      options.maxBatchInputBytes = compiler.positiveInteger(argv[++index], null);
      if (!options.maxBatchInputBytes) {
        fail("--max-batch-input-bytes requires a positive integer.");
      }
    } else if (arg === "--token-budget") {
      options.tokenBudget = compiler.positiveInteger(argv[++index], null);
      if (!options.tokenBudget) fail("--token-budget requires a positive integer.");
    } else if (arg === "--input-token-budget") {
      options.inputTokenBudget = compiler.positiveInteger(argv[++index], null);
      if (!options.inputTokenBudget) {
        fail("--input-token-budget requires a positive integer.");
      }
    } else if (arg === "--output-token-reserve") {
      options.outputTokenReserve = compiler.positiveInteger(argv[++index], null);
      if (!options.outputTokenReserve) {
        fail("--output-token-reserve requires a positive integer.");
      }
    } else if (arg === "--model") {
      options.model = compiler.cleanString(argv[++index]);
      if (!options.model) fail("--model requires a model ID.");
    } else if (arg === "--api-base-url") {
      options.apiBaseUrl = compiler.cleanString(argv[++index]);
      if (!options.apiBaseUrl) fail("--api-base-url requires a URL.");
    } else if (arg === "--job") {
      options.jobId = compiler.cleanString(argv[++index]);
      if (!options.jobId) fail("--job requires a batch job ID.");
    } else if (arg === "--shard") {
      const raw = compiler.cleanString(argv[++index]);
      if (!raw) fail("--shard requires an index or comma-separated indexes.");
      for (const value of raw.split(",")) {
        const shard = compiler.nonNegativeInteger(value.trim(), -1);
        if (shard < 0) fail("--shard values must be zero-based non-negative indexes.");
        options.shardIndexes.push(shard);
      }
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (!options.mode) {
    fail("Choose one mode: --prepare, --submit, --status, --import, --cancel, or --verify.");
  }
  options.entityIds = compiler.sortedUniqueStrings(options.entityIds);
  options.corpora = compiler.sortedUniqueStrings(options.corpora);
  options.shardIndexes = [...new Set(options.shardIndexes)].sort((a, b) => a - b);
  options.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/u, "");
  if (options.maxFileBytes >= 200 * 1024 * 1024) {
    fail("--max-file-bytes must stay below the OpenAI 200 MB Batch API limit.");
  }
  if (options.maxRequestsPerFile > 50000) {
    fail("--max-requests-per-file cannot exceed the OpenAI 50,000-request limit.");
  }
  return options;
}

function loadContext(options) {
  const packetsDocument = compiler.readJson(
    compiler.INPUTS.packets,
    "P03 evidence-packets.json"
  );
  const p03 = compiler.validateP03Artifact(packetsDocument);
  const prompt = compiler.promptDescriptor();
  const previous = compiler.extractPreviousRecords();
  const plan = compiler.buildPlan({
    packets: p03.packets,
    prompt,
    model: options.model,
    previousRecords: previous.records,
    retryFailed: true,
    previousFailures: previous.failures,
  });
  return { packetsDocument, p03, prompt, previous, plan };
}

function manifestChecksum(manifest) {
  const core = { ...manifest };
  delete core.checksum;
  return compiler.sha256Text(compiler.stableStringify(core));
}

function writeManifest(jobDir, manifest) {
  const normalized = compiler.canonicalize({ ...manifest });
  delete normalized.checksum;
  normalized.checksum = manifestChecksum(normalized);
  compiler.writeStableJson(path.join(jobDir, "manifest.json"), normalized, 2);
  return normalized;
}

function readManifest(jobDir) {
  const manifestPath = path.join(jobDir, "manifest.json");
  const manifest = compiler.readJson(manifestPath, "P04 batch manifest");
  if (manifest.checksum !== manifestChecksum(manifest)) {
    fail(`Batch manifest checksum mismatch: ${compiler.relativePath(manifestPath)}`);
  }
  return manifest;
}

function resolveJobDir(options) {
  fs.mkdirSync(BATCH_ROOT, { recursive: true });
  let jobId = options.jobId;
  if (!jobId) {
    const latest = compiler.readJsonIfExists(LATEST_PATH);
    jobId = compiler.cleanString(latest?.jobId);
  }
  if (!jobId) fail("No batch job is selected. Run --prepare first or pass --job.");
  const jobDir = path.join(BATCH_ROOT, jobId);
  if (!fs.existsSync(jobDir) || !fs.statSync(jobDir).isDirectory()) {
    fail(`Batch job not found: ${jobId}`);
  }
  return { jobId, jobDir };
}

function writeLatest(jobId, manifest) {
  compiler.writeStableJson(
    LATEST_PATH,
    {
      jobId,
      manifestPath: compiler.relativePath(path.join(BATCH_ROOT, jobId, "manifest.json")),
      manifestChecksum: manifest.checksum,
    },
    2
  );
}

function deterministicSpread(values, count) {
  if (!Array.isArray(values) || values.length === 0 || count <= 0) return [];
  if (values.length <= count) return [...values];
  if (count === 1) return [values[Math.floor((values.length - 1) / 2)]];
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.round((index * (values.length - 1)) / (count - 1));
    selected.push(values[position]);
  }
  return compiler.sortedUniqueStrings(selected);
}

function selectPendingEntities(context, options) {
  const requested = new Set(options.entityIds);
  for (const entityId of requested) {
    if (!context.p03.packets[entityId]) fail(`Unknown P03 entity ID: ${entityId}`);
  }

  let candidates = [...context.plan.pending];
  if (requested.size > 0) {
    candidates = candidates.filter((entityId) => requested.has(entityId));
  }
  if (options.corpora.length > 0) {
    const allowed = new Set(options.corpora);
    candidates = candidates.filter((entityId) =>
      allowed.has(context.p03.packets[entityId]?.corpus)
    );
  }

  if (options.samplePerCorpus) {
    const byCorpus = {};
    for (const entityId of candidates) {
      const corpus = context.p03.packets[entityId]?.corpus || "unknown";
      (byCorpus[corpus] ||= []).push(entityId);
    }
    candidates = Object.keys(byCorpus)
      .sort()
      .flatMap((corpus) =>
        deterministicSpread(byCorpus[corpus].sort(), options.samplePerCorpus)
      );
  }

  candidates = compiler.sortedUniqueStrings(candidates);
  if (options.limit) candidates = candidates.slice(0, options.limit);

  const protectedSelection =
    options.all ||
    options.entityIds.length > 0 ||
    options.corpora.length > 0 ||
    options.samplePerCorpus ||
    options.limit;
  if (!protectedSelection) {
    fail(
      "Batch preparation requires an explicit scope. Use --sample-per-corpus, --entity, --corpus, --limit, or --all."
    );
  }
  if (candidates.length === 0) fail("No current pending P04 entities match the selection.");
  return candidates;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function requestCustomId(index, entityIds) {
  const hash = compiler.sha256Text(entityIds.join("\n")).slice(0, 12);
  return `p04_${String(index).padStart(6, "0")}_${hash}`;
}

function selectionByCorpus(entityIds, packets) {
  const counts = {};
  for (const entityId of entityIds) {
    const corpus = packets[entityId]?.corpus || "unknown";
    counts[corpus] = (counts[corpus] || 0) + 1;
  }
  return compiler.sortRecord(counts);
}

function balancedEntityOrder(entityIds, packets) {
  const byCorpus = {};
  for (const entityId of entityIds) {
    const corpus = packets[entityId]?.corpus || "unknown";
    (byCorpus[corpus] ||= []).push(entityId);
  }
  const corpora = Object.keys(byCorpus).sort();
  for (const corpus of corpora) byCorpus[corpus].sort();
  const result = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const corpus of corpora) {
      if (byCorpus[corpus].length > 0) {
        result.push(byCorpus[corpus].shift());
        remaining = true;
      }
    }
  }
  return result;
}

function prepare(options) {
  const context = loadContext(options);
  let candidates = selectPendingEntities(context, options);
  if (options.balanced) {
    candidates = balancedEntityOrder(candidates, context.p03.packets);
  }

  const requestOptions = {
    model: options.model,
    maxEntityInputBytes: options.maxEntityInputBytes,
    maxBatchInputBytes: options.maxBatchInputBytes,
  };

  const preparedRequests = [];
  let candidateIndex = 0;
  let estimatedTotalInputTokens = 0;
  let estimatedTotalCombinedTokens = 0;

  const exceedsConfiguredBudget = (requestInputTokens, requestCombinedTokens) => {
    if (
      options.inputTokenBudget &&
      estimatedTotalInputTokens + requestInputTokens > options.inputTokenBudget
    ) {
      return true;
    }
    if (
      !options.inputTokenBudget &&
      options.tokenBudget &&
      estimatedTotalCombinedTokens + requestCombinedTokens > options.tokenBudget
    ) {
      return true;
    }
    return false;
  };

  while (candidateIndex < candidates.length) {
    let entityIds = candidates.slice(
      candidateIndex,
      candidateIndex + options.requestSize
    );
    let prepared = compiler.buildApiRequest(
      entityIds,
      context.p03.packets,
      context.prompt,
      requestOptions
    );
    let estimatedOutputTokens = options.outputTokenReserve * entityIds.length;
    let estimatedCombinedTokens =
      prepared.metrics.estimatedRequestTokens + estimatedOutputTokens;

    if (
      exceedsConfiguredBudget(
        prepared.metrics.estimatedRequestTokens,
        estimatedCombinedTokens
      )
    ) {
      while (entityIds.length > 1) {
        entityIds = entityIds.slice(0, -1);
        prepared = compiler.buildApiRequest(
          entityIds,
          context.p03.packets,
          context.prompt,
          requestOptions
        );
        estimatedOutputTokens = options.outputTokenReserve * entityIds.length;
        estimatedCombinedTokens =
          prepared.metrics.estimatedRequestTokens + estimatedOutputTokens;
        if (
          !exceedsConfiguredBudget(
            prepared.metrics.estimatedRequestTokens,
            estimatedCombinedTokens
          )
        ) {
          break;
        }
      }

      if (
        exceedsConfiguredBudget(
          prepared.metrics.estimatedRequestTokens,
          estimatedCombinedTokens
        )
      ) {
        if (preparedRequests.length === 0) {
          const configuredBudget = options.inputTokenBudget || options.tokenBudget;
          const requiredTokens = options.inputTokenBudget
            ? prepared.metrics.estimatedRequestTokens
            : estimatedCombinedTokens;
          const budgetType = options.inputTokenBudget
            ? "input-token"
            : "combined-token";
          fail(
            `The first request requires an estimated ${requiredTokens} ${budgetType} total, exceeding the configured ${configuredBudget}-token budget.`
          );
        }
        break;
      }
    }

    const index = preparedRequests.length;
    const customId = requestCustomId(index, entityIds);
    const lineObject = {
      custom_id: customId,
      method: "POST",
      url: BATCH_ENDPOINT,
      body: prepared.request,
    };
    const line = JSON.stringify(lineObject);
    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    preparedRequests.push({
      index,
      customId,
      entityIds,
      line,
      lineBytes,
      requestBodyChecksum: compiler.sha256Text(
        compiler.stableStringify(prepared.request)
      ),
      requestBodyBytes: prepared.metrics.requestBodyBytes,
      estimatedRequestTokens: prepared.metrics.estimatedRequestTokens,
      estimatedOutputTokens,
      estimatedCombinedTokens,
    });
    estimatedTotalInputTokens += prepared.metrics.estimatedRequestTokens;
    estimatedTotalCombinedTokens += estimatedCombinedTokens;
    candidateIndex += entityIds.length;
  }

  const selected = preparedRequests.flatMap((request) => request.entityIds);
  if (selected.length === 0) fail("Token budgeting selected no pending entities.");

  const selectionChecksum = compiler.sha256Text(selected.join("\n"));
  const jobSignature = compiler.sha256Text(
    compiler.stableStringify({
      p03ArtifactChecksum: context.p03.artifactChecksum,
      promptChecksum: context.prompt.checksum,
      promptVersion: context.prompt.version,
      model: options.model,
      generationViewVersion: compiler.GENERATION_VIEW_VERSION,
      requestSize: options.requestSize,
      maxEntityInputBytes: options.maxEntityInputBytes,
      maxBatchInputBytes: options.maxBatchInputBytes,
      tokenBudget: options.tokenBudget,
      inputTokenBudget: options.inputTokenBudget,
      outputTokenReserve: options.outputTokenReserve,
      balanced: options.balanced,
      selectionChecksum,
    })
  );
  let jobId = `p04-batch-${jobSignature.slice(0, 16)}`;
  if (options.forceNew) jobId += `-${Date.now().toString(36)}`;
  const jobDir = path.join(BATCH_ROOT, jobId);
  if (fs.existsSync(path.join(jobDir, "manifest.json")) && !options.forceNew) {
    const existing = readManifest(jobDir);
    writeLatest(jobId, existing);
    console.log(`Prepared batch job already exists: ${jobId}`);
    printManifestSummary(existing);
    return;
  }
  fs.mkdirSync(jobDir, { recursive: true });

  const shards = [];
  let current = [];
  let currentBytes = 0;
  function flushShard() {
    if (current.length === 0) return;
    const shardIndex = shards.length;
    const filename = `input-${String(shardIndex).padStart(3, "0")}.jsonl`;
    const filePath = path.join(jobDir, filename);
    const text = `${current.map((request) => request.line).join("\n")}\n`;
    fs.writeFileSync(filePath, text, "utf8");
    const requests = current.map((request) => ({
      customId: request.customId,
      entityIds: request.entityIds,
      requestBodyChecksum: request.requestBodyChecksum,
      requestBodyBytes: request.requestBodyBytes,
      estimatedRequestTokens: request.estimatedRequestTokens,
      estimatedOutputTokens: request.estimatedOutputTokens,
      estimatedCombinedTokens: request.estimatedCombinedTokens,
      importStatus: "pending",
    }));
    shards.push({
      index: shardIndex,
      inputFile: {
        path: compiler.relativePath(filePath),
        filename,
        bytes: fs.statSync(filePath).size,
        sha256: compiler.sha256File(filePath),
      },
      requestCount: requests.length,
      entityCount: requests.reduce(
        (total, request) => total + request.entityIds.length,
        0
      ),
      estimatedRequestTokens: requests.reduce(
        (total, request) => total + request.estimatedRequestTokens,
        0
      ),
      estimatedOutputTokens: requests.reduce(
        (total, request) => total + request.estimatedOutputTokens,
        0
      ),
      estimatedCombinedTokens: requests.reduce(
        (total, request) => total + request.estimatedCombinedTokens,
        0
      ),
      requests,
      submission: {
        inputFileId: null,
        batchId: null,
        status: "prepared",
        outputFileId: null,
        errorFileId: null,
        requestCounts: null,
      },
      imported: {
        successfulRequests: 0,
        failedRequests: 0,
        importedEntities: 0,
        failedEntities: 0,
        completed: false,
      },
    });
    current = [];
    currentBytes = 0;
  }

  for (const request of preparedRequests) {
    if (request.lineBytes > options.maxFileBytes) {
      fail(
        `A single JSONL request (${request.customId}) is ${request.lineBytes} bytes, exceeding the configured shard limit.`
      );
    }
    const wouldExceedBytes =
      current.length > 0 && currentBytes + request.lineBytes > options.maxFileBytes;
    const wouldExceedRequests = current.length >= options.maxRequestsPerFile;
    if (wouldExceedBytes || wouldExceedRequests) flushShard();
    current.push(request);
    currentBytes += request.lineBytes;
  }
  flushShard();

  let manifest = {
    schemaVersion: BATCH_SCHEMA_VERSION,
    batchCompiler: { id: BATCH_COMPILER_ID, version: BATCH_COMPILER_VERSION },
    p04Compiler: {
      version: compiler.COMPILER_VERSION,
      generationContractVersion: compiler.GENERATION_CONTRACT_VERSION,
      generationViewVersion: compiler.GENERATION_VIEW_VERSION,
    },
    jobId,
    jobSignature,
    status: "prepared",
    endpoint: BATCH_ENDPOINT,
    completionWindow: COMPLETION_WINDOW,
    p03ArtifactChecksum: context.p03.artifactChecksum,
    prompt: {
      id: context.prompt.id,
      version: context.prompt.version,
      checksum: context.prompt.checksum,
    },
    model: options.model,
    selection: {
      entityCount: selected.length,
      candidateCount: candidates.length,
      deferredByTokenBudget: candidates.length - selected.length,
      selectionChecksum,
      byCorpus: selectionByCorpus(selected, context.p03.packets),
      balanced: options.balanced,
    },
    requestPolicy: {
      entitiesPerRequest: options.requestSize,
      maxEntityInputBytes: options.maxEntityInputBytes,
      maxRequestBodyBytes: options.maxBatchInputBytes,
      maxFileBytes: options.maxFileBytes,
      maxRequestsPerFile: options.maxRequestsPerFile,
      tokenBudget: options.tokenBudget,
      inputTokenBudget: options.inputTokenBudget,
      outputTokenReservePerEntity: options.outputTokenReserve,
    },
    totals: {
      shards: shards.length,
      requests: preparedRequests.length,
      entities: selected.length,
      inputFileBytes: shards.reduce(
        (total, shard) => total + shard.inputFile.bytes,
        0
      ),
      estimatedRequestTokens: preparedRequests.reduce(
        (total, request) => total + request.estimatedRequestTokens,
        0
      ),
      estimatedOutputTokens: preparedRequests.reduce(
        (total, request) => total + request.estimatedOutputTokens,
        0
      ),
      estimatedCombinedTokens: preparedRequests.reduce(
        (total, request) => total + request.estimatedCombinedTokens,
        0
      ),
    },
    shards,
    operational: { preparedAt: nowIso(), lastUpdatedAt: nowIso() },
  };
  manifest = writeManifest(jobDir, manifest);
  writeLatest(jobId, manifest);

  console.log("P04 Batch job prepared\n");
  printManifestSummary(manifest);
  console.log(`Deferred by budget    : ${manifest.selection.deferredByTokenBudget}`);
  console.log(`Manifest             : ${compiler.relativePath(path.join(jobDir, "manifest.json"))}`);
  console.log("No OpenAI request was made.\n");
}

function authHeaders(contentType = true) {
  const apiKey = compiler.cleanString(process.env.OPENAI_API_KEY);
  if (!apiKey) fail("OPENAI_API_KEY is required for this Batch API operation.");
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (contentType) headers["Content-Type"] = "application/json";
  const organization = compiler.cleanString(process.env.OPENAI_ORG_ID);
  const project = compiler.cleanString(process.env.OPENAI_PROJECT_ID);
  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;
  return headers;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function apiFetch(url, init, options, expected = "json") {
  let lastError = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const text = await response.text();
      let body = null;
      if (expected === "text") body = text;
      else {
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = { raw: text };
        }
      }
      if (!response.ok) {
        const message =
          compiler.cleanString(body?.error?.message) ||
          compiler.cleanString(body?.message) ||
          `HTTP ${response.status}`;
        const retryable =
          response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500;
        if (!retryable || attempt === options.maxAttempts) {
          fail(`OpenAI API request failed (${response.status}): ${message}`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : Math.min(30000, 1000 * 2 ** (attempt - 1));
        await sleep(delay);
        continue;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) break;
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("OpenAI API request failed.");
}

function selectedShards(manifest, options) {
  if (options.shardIndexes.length === 0) return manifest.shards;
  const selected = [];
  for (const index of options.shardIndexes) {
    const shard = manifest.shards.find((candidate) => candidate.index === index);
    if (!shard) fail(`Unknown shard index: ${index}`);
    selected.push(shard);
  }
  return selected;
}

function verifyJobContract(manifest, context, options) {
  const failures = [];
  if (manifest.p03ArtifactChecksum !== context.p03.artifactChecksum) {
    failures.push("P03 artifact checksum changed");
  }
  if (manifest.prompt?.checksum !== context.prompt.checksum) {
    failures.push("prompt checksum changed");
  }
  if (manifest.prompt?.version !== context.prompt.version) {
    failures.push("prompt version changed");
  }
  if (manifest.model !== options.model) failures.push("model changed");
  if (manifest.endpoint !== BATCH_ENDPOINT) failures.push("endpoint changed");
  if (failures.length > 0) {
    fail(`Batch job is stale and cannot be used: ${failures.join("; ")}. Prepare a new job.`);
  }

  for (const shard of manifest.shards) {
    const filePath = path.join(ROOT, ...shard.inputFile.path.split("/"));
    if (!fs.existsSync(filePath)) fail(`Missing shard input file: ${shard.inputFile.path}`);
    if (fs.statSync(filePath).size !== shard.inputFile.bytes) {
      fail(`Shard byte-size mismatch: ${shard.inputFile.path}`);
    }
    if (compiler.sha256File(filePath) !== shard.inputFile.sha256) {
      fail(`Shard checksum mismatch: ${shard.inputFile.path}`);
    }
  }
}

async function uploadInputFile(filePath, options) {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([fs.readFileSync(filePath)], { type: "application/jsonl" }),
    path.basename(filePath)
  );
  return apiFetch(
    `${options.apiBaseUrl}/files`,
    {
      method: "POST",
      headers: authHeaders(false),
      body: form,
    },
    options
  );
}

async function createBatch(inputFileId, manifest, shard, options) {
  return apiFetch(
    `${options.apiBaseUrl}/batches`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        input_file_id: inputFileId,
        endpoint: BATCH_ENDPOINT,
        completion_window: COMPLETION_WINDOW,
        metadata: {
          emetsees_job: manifest.jobId,
          emetsees_shard: String(shard.index),
          compiler: `${BATCH_COMPILER_ID}@${BATCH_COMPILER_VERSION}`,
        },
      }),
    },
    options
  );
}

function updateSubmissionFromBatch(shard, batch) {
  shard.submission = {
    ...shard.submission,
    batchId: compiler.cleanString(batch?.id) || shard.submission.batchId,
    status: compiler.cleanString(batch?.status) || shard.submission.status,
    outputFileId:
      compiler.cleanString(batch?.output_file_id) || shard.submission.outputFileId,
    errorFileId:
      compiler.cleanString(batch?.error_file_id) || shard.submission.errorFileId,
    requestCounts: compiler.isRecord(batch?.request_counts)
      ? compiler.canonicalize(batch.request_counts)
      : shard.submission.requestCounts,
    createdAt: batch?.created_at || shard.submission.createdAt || null,
    inProgressAt: batch?.in_progress_at || shard.submission.inProgressAt || null,
    expiresAt: batch?.expires_at || shard.submission.expiresAt || null,
    completedAt: batch?.completed_at || shard.submission.completedAt || null,
    failedAt: batch?.failed_at || shard.submission.failedAt || null,
    expiredAt: batch?.expired_at || shard.submission.expiredAt || null,
    cancelledAt: batch?.cancelled_at || shard.submission.cancelledAt || null,
    errors: batch?.errors || shard.submission.errors || null,
  };
}

function deriveManifestStatus(manifest) {
  const statuses = manifest.shards.map((shard) => shard.submission.status);
  if (manifest.shards.every((shard) => shard.imported.completed)) return "imported";
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => ["validating", "in_progress", "finalizing"].includes(status))) {
    return "in_progress";
  }
  if (statuses.some((status) => ["failed", "expired", "cancelled"].includes(status))) {
    return "terminal-with-errors";
  }
  if (statuses.some((status) => status && status !== "prepared")) return "submitted";
  return "prepared";
}

async function submit(options) {
  const { jobId, jobDir } = resolveJobDir(options);
  let manifest = readManifest(jobDir);
  const context = loadContext({ ...options, model: manifest.model });
  options.model = manifest.model;
  verifyJobContract(manifest, context, options);

  const shardIndexes = selectedShards(manifest, options).map((shard) => shard.index);
  for (const shardIndex of shardIndexes) {
    let shard = manifest.shards.find((candidate) => candidate.index === shardIndex);
    if (shard.submission.batchId) {
      console.log(`Shard ${shard.index}: already submitted as ${shard.submission.batchId}`);
      continue;
    }
    const filePath = path.join(ROOT, ...shard.inputFile.path.split("/"));
    if (!shard.submission.inputFileId) {
      console.log(`Shard ${shard.index}: uploading ${shard.inputFile.filename}...`);
      const file = await uploadInputFile(filePath, options);
      shard.submission.inputFileId = compiler.cleanString(file?.id);
      if (!shard.submission.inputFileId) fail("Files API returned no file ID.");
      shard.submission.uploadedFile = compiler.canonicalize(file);
      manifest.operational.lastUpdatedAt = nowIso();
      manifest = writeManifest(jobDir, manifest);
      writeLatest(jobId, manifest);
      shard = manifest.shards.find((candidate) => candidate.index === shardIndex);
    }

    console.log(`Shard ${shard.index}: creating OpenAI batch...`);
    const batch = await createBatch(
      shard.submission.inputFileId,
      manifest,
      shard,
      options
    );
    updateSubmissionFromBatch(shard, batch);
    manifest.status = deriveManifestStatus(manifest);
    manifest.operational.lastUpdatedAt = nowIso();
    manifest = writeManifest(jobDir, manifest);
    writeLatest(jobId, manifest);
    shard = manifest.shards.find((candidate) => candidate.index === shardIndex);
    console.log(
      `Shard ${shard.index}: ${shard.submission.batchId} (${shard.submission.status})`
    );
  }

  console.log("\nP04 Batch submission complete\n");
  printManifestSummary(manifest);
}

async function refreshStatuses(manifest, options) {
  for (const shard of selectedShards(manifest, options)) {
    if (!shard.submission.batchId) continue;
    const batch = await apiFetch(
      `${options.apiBaseUrl}/batches/${encodeURIComponent(shard.submission.batchId)}`,
      { method: "GET", headers: authHeaders(true) },
      options
    );
    updateSubmissionFromBatch(shard, batch);
  }
  manifest.status = deriveManifestStatus(manifest);
  manifest.operational.lastUpdatedAt = nowIso();
  return manifest;
}

async function status(options) {
  const { jobId, jobDir } = resolveJobDir(options);
  let manifest = readManifest(jobDir);
  options.model = manifest.model;
  const context = loadContext(options);
  verifyJobContract(manifest, context, options);
  manifest = await refreshStatuses(manifest, options);
  manifest = writeManifest(jobDir, manifest);
  writeLatest(jobId, manifest);
  console.log("P04 Batch status\n");
  printManifestSummary(manifest, true);
}

async function cancel(options) {
  const { jobId, jobDir } = resolveJobDir(options);
  let manifest = readManifest(jobDir);
  for (const shard of selectedShards(manifest, options)) {
    if (!shard.submission.batchId) continue;
    if (["completed", "failed", "expired", "cancelled"].includes(shard.submission.status)) {
      continue;
    }
    const batch = await apiFetch(
      `${options.apiBaseUrl}/batches/${encodeURIComponent(shard.submission.batchId)}/cancel`,
      { method: "POST", headers: authHeaders(true), body: "{}" },
      options
    );
    updateSubmissionFromBatch(shard, batch);
  }
  manifest.status = deriveManifestStatus(manifest);
  manifest.operational.lastUpdatedAt = nowIso();
  manifest = writeManifest(jobDir, manifest);
  writeLatest(jobId, manifest);
  printManifestSummary(manifest, true);
}

async function downloadFile(fileId, options) {
  return apiFetch(
    `${options.apiBaseUrl}/files/${encodeURIComponent(fileId)}/content`,
    { method: "GET", headers: authHeaders(false) },
    options,
    "text"
  );
}

function parseJsonl(text, label) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      fail(`${label} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  }
  return rows;
}

function failureRecord(entityId, packet, prompt, model, previous, message, terminal) {
  return {
    entityId,
    packetChecksum: packet.checksum,
    promptChecksum: prompt.checksum,
    model,
    attempts: compiler.nonNegativeInteger(previous?.attempts) + 1,
    terminal: Boolean(terminal),
    message: String(message || "Unknown Batch API failure").slice(0, 2000),
  };
}

function requestMapForShard(shard) {
  return Object.fromEntries(shard.requests.map((request) => [request.customId, request]));
}

function prepareRequestForImport(request, context, manifest) {
  const prepared = compiler.buildApiRequest(
    request.entityIds,
    context.p03.packets,
    context.prompt,
    {
      model: manifest.model,
      maxEntityInputBytes: manifest.requestPolicy.maxEntityInputBytes,
      maxBatchInputBytes: manifest.requestPolicy.maxRequestBodyBytes,
    }
  );
  const checksum = compiler.sha256Text(compiler.stableStringify(prepared.request));
  if (checksum !== request.requestBodyChecksum) {
    fail(`Request body checksum changed for ${request.customId}. The job is stale.`);
  }
  return prepared;
}

async function importResults(options) {
  const { jobId, jobDir } = resolveJobDir(options);
  let manifest = readManifest(jobDir);
  options.model = manifest.model;
  const context = loadContext(options);
  verifyJobContract(manifest, context, options);
  manifest = await refreshStatuses(manifest, options);

  const state = compiler.initialState({
    p03Checksum: context.p03.artifactChecksum,
    prompt: context.prompt,
    model: manifest.model,
    records: context.plan.reusable,
    failures: context.previous.failures,
  });

  let importedEntities = 0;
  let failedEntities = 0;
  const shardIndexes = selectedShards(manifest, options).map((shard) => shard.index);
  for (const shardIndex of shardIndexes) {
    let shard = manifest.shards.find((candidate) => candidate.index === shardIndex);
    if (shard.imported.completed && !options.forceImport) {
      console.log(`Shard ${shard.index}: already imported.`);
      continue;
    }
    const terminal = ["completed", "failed", "expired", "cancelled"].includes(
      shard.submission.status
    );
    if (!terminal) {
      console.log(`Shard ${shard.index}: status is ${shard.submission.status}; not ready to import.`);
      continue;
    }

    const outputText = shard.submission.outputFileId
      ? await downloadFile(shard.submission.outputFileId, options)
      : "";
    const errorText = shard.submission.errorFileId
      ? await downloadFile(shard.submission.errorFileId, options)
      : "";
    const outputPath = path.join(jobDir, `output-${String(shard.index).padStart(3, "0")}.jsonl`);
    const errorPath = path.join(jobDir, `errors-${String(shard.index).padStart(3, "0")}.jsonl`);
    if (outputText) fs.writeFileSync(outputPath, outputText, "utf8");
    if (errorText) fs.writeFileSync(errorPath, errorText, "utf8");

    const requestMap = requestMapForShard(shard);
    const handled = new Set();
    let successfulRequests = 0;
    let failedRequests = 0;

    for (const row of parseJsonl(outputText, `Shard ${shard.index} output`)) {
      const customId = compiler.cleanString(row?.custom_id);
      const request = requestMap[customId];
      if (!request) fail(`Unknown Batch output custom_id: ${customId}`);
      handled.add(customId);
      try {
        const statusCode = compiler.nonNegativeInteger(row?.response?.status_code);
        if (statusCode !== 200 || !compiler.isRecord(row?.response?.body)) {
          fail(
            `Batch request returned status ${statusCode || "unknown"}: ${compiler.cleanString(row?.error?.message) || "no response body"}`
          );
        }
        const prepared = prepareRequestForImport(request, context, manifest);
        const result = compiler.processApiResponse({
          batch: request.entityIds,
          packets: context.p03.packets,
          prompt: context.prompt,
          options: { model: manifest.model },
          prepared,
          body: row.response.body,
          transportAudit: {
            transport: "openai-batch-api",
            batchDiscountEligible: true,
            batchJobId: manifest.jobId,
            batchShardIndex: shard.index,
            batchId: shard.submission.batchId,
            batchCustomId: customId,
            inputFileId: shard.submission.inputFileId,
            outputFileId: shard.submission.outputFileId,
            responseRequestId: compiler.cleanString(row?.response?.request_id),
            responseStatusCode: statusCode,
          },
        });
        for (const [entityId, record] of Object.entries(result.records)) {
          const validation = compiler.validateRecord(
            record,
            context.p03.packets[entityId],
            context.prompt,
            manifest.model
          );
          if (!validation.valid) {
            fail(`Imported record validation failed for ${entityId}: ${validation.reason}`);
          }
          state.records[entityId] = record;
          delete state.failures[entityId];
          importedEntities += 1;
        }
        request.importStatus = "imported";
        request.importedEntityCount = request.entityIds.length;
        successfulRequests += 1;
      } catch (error) {
        request.importStatus = "failed";
        request.importError = String(error?.message || error).slice(0, 2000);
        for (const entityId of request.entityIds) {
          state.failures[entityId] = failureRecord(
            entityId,
            context.p03.packets[entityId],
            context.prompt,
            manifest.model,
            state.failures[entityId],
            request.importError,
            false
          );
          failedEntities += 1;
        }
        failedRequests += 1;
      }
    }

    for (const row of parseJsonl(errorText, `Shard ${shard.index} errors`)) {
      const customId = compiler.cleanString(row?.custom_id);
      const request = requestMap[customId];
      if (!request) fail(`Unknown Batch error custom_id: ${customId}`);
      if (handled.has(customId)) continue;
      handled.add(customId);
      const message =
        compiler.cleanString(row?.error?.message) ||
        compiler.cleanString(row?.error?.code) ||
        "Batch API request failed.";
      request.importStatus = "failed";
      request.importError = message;
      for (const entityId of request.entityIds) {
        state.failures[entityId] = failureRecord(
          entityId,
          context.p03.packets[entityId],
          context.prompt,
          manifest.model,
          state.failures[entityId],
          message,
          true
        );
        failedEntities += 1;
      }
      failedRequests += 1;
    }

    for (const request of shard.requests) {
      if (handled.has(request.customId)) continue;
      const message = `No result was returned for ${request.customId}; batch status is ${shard.submission.status}.`;
      request.importStatus = "failed";
      request.importError = message;
      for (const entityId of request.entityIds) {
        state.failures[entityId] = failureRecord(
          entityId,
          context.p03.packets[entityId],
          context.prompt,
          manifest.model,
          state.failures[entityId],
          message,
          true
        );
        failedEntities += 1;
      }
      failedRequests += 1;
    }

    shard.imported = {
      successfulRequests,
      failedRequests,
      importedEntities: shard.requests.reduce(
        (total, request) =>
          total + (request.importStatus === "imported" ? request.entityIds.length : 0),
        0
      ),
      failedEntities: shard.requests.reduce(
        (total, request) =>
          total + (request.importStatus === "failed" ? request.entityIds.length : 0),
        0
      ),
      completed: true,
      importedAt: nowIso(),
      outputFile: outputText
        ? {
            path: compiler.relativePath(outputPath),
            bytes: Buffer.byteLength(outputText, "utf8"),
            sha256: compiler.sha256Text(outputText),
          }
        : null,
      errorFile: errorText
        ? {
            path: compiler.relativePath(errorPath),
            bytes: Buffer.byteLength(errorText, "utf8"),
            sha256: compiler.sha256Text(errorText),
          }
        : null,
    };
    state.records = compiler.sortRecord(state.records);
    state.failures = compiler.sortRecord(state.failures);
    compiler.checkpointState(state);
    manifest.operational.lastUpdatedAt = nowIso();
    manifest.status = deriveManifestStatus(manifest);
    manifest = writeManifest(jobDir, manifest);
    writeLatest(jobId, manifest);
    console.log(
      `Shard ${shard.index}: imported ${shard.imported.importedEntities} entities; ${shard.imported.failedEntities} failed.`
    );
  }

  const finalPlan = compiler.buildPlan({
    packets: context.p03.packets,
    prompt: context.prompt,
    model: manifest.model,
    previousRecords: state.records,
    retryFailed: true,
    previousFailures: state.failures,
  });

  if (finalPlan.pending.length === 0) {
    compiler.writeFinalOutputs({
      packetsDocument: context.packetsDocument,
      packets: context.p03.packets,
      p03Checksum: context.p03.artifactChecksum,
      prompt: context.prompt,
      model: manifest.model,
      records: finalPlan.reusable,
    });
    state.records = finalPlan.reusable;
    state.failures = {};
    compiler.checkpointState(state);
    console.log("\nP04 final artifacts were written and verified.\n");
  }

  manifest.status = deriveManifestStatus(manifest);
  manifest.operational.lastUpdatedAt = nowIso();
  manifest = writeManifest(jobDir, manifest);
  writeLatest(jobId, manifest);

  console.log("\nP04 Batch import complete\n");
  console.log(`Imported this run    : ${importedEntities}`);
  console.log(`Failed this run      : ${failedEntities}`);
  console.log(`Valid cached records : ${Object.keys(finalPlan.reusable).length}`);
  console.log(`Still pending        : ${finalPlan.pending.length}`);
  console.log(`Generation state     : ${compiler.relativePath(compiler.STATE_PATH)}\n`);
}

function verify(options) {
  const { jobId, jobDir } = resolveJobDir(options);
  const manifest = readManifest(jobDir);
  options.model = manifest.model;
  const context = loadContext(options);
  verifyJobContract(manifest, context, options);
  const customIds = new Set();
  let entities = 0;
  let requests = 0;
  for (const shard of manifest.shards) {
    if (shard.requestCount !== shard.requests.length) {
      fail(`Shard ${shard.index} request-count mismatch.`);
    }
    for (const request of shard.requests) {
      if (customIds.has(request.customId)) fail(`Duplicate custom_id: ${request.customId}`);
      customIds.add(request.customId);
      requests += 1;
      entities += request.entityIds.length;
      prepareRequestForImport(request, context, manifest);
    }
  }
  if (requests !== manifest.totals.requests) fail("Manifest total request count mismatch.");
  if (entities !== manifest.totals.entities) fail("Manifest total entity count mismatch.");
  console.log(`Batch job     : ${jobId}`);
  console.log(`Shards        : ${manifest.shards.length}`);
  console.log(`Requests      : ${requests}`);
  console.log(`Entities      : ${entities}`);
  console.log(`Manifest SHA  : ${manifest.checksum}`);
  console.log("Status        : verified\n");
}

function printManifestSummary(manifest, includeShards = false) {
  console.log(`Job ID               : ${manifest.jobId}`);
  console.log(`Status               : ${manifest.status}`);
  console.log(`Model                : ${manifest.model}`);
  console.log(`Entities             : ${manifest.totals.entities}`);
  console.log(`Requests             : ${manifest.totals.requests}`);
  console.log(`Shards               : ${manifest.totals.shards}`);
  console.log(`Input JSONL bytes    : ${manifest.totals.inputFileBytes}`);
  console.log(`Estimated input tokens: ${manifest.totals.estimatedRequestTokens}`);
  console.log(`Estimated output reserve: ${manifest.totals.estimatedOutputTokens || 0}`);
  console.log(`Estimated total tokens: ${manifest.totals.estimatedCombinedTokens || manifest.totals.estimatedRequestTokens}`);
  console.log(`Input token budget   : ${manifest.requestPolicy.inputTokenBudget || "none"}`);
  console.log(`Legacy total budget  : ${manifest.requestPolicy.tokenBudget || "none"}`);
  console.log(`By corpus            : ${JSON.stringify(manifest.selection.byCorpus)}`);
  if (includeShards) {
    console.log("");
    for (const shard of manifest.shards) {
      const counts = shard.submission.requestCounts || {};
      console.log(
        `Shard ${shard.index}: ${shard.submission.status}; requests ${shard.requestCount}; completed ${counts.completed || 0}; failed ${counts.failed || 0}; imported ${shard.imported.importedEntities || 0}`
      );
    }
  }
  console.log("");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(BATCH_ROOT, { recursive: true });
  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P04 OpenAI Batch Generation");
  console.log("========================================\n");

  if (options.mode === "prepare") prepare(options);
  else if (options.mode === "submit") await submit(options);
  else if (options.mode === "status") await status(options);
  else if (options.mode === "import") await importResults(options);
  else if (options.mode === "cancel") await cancel(options);
  else if (options.mode === "verify") verify(options);
}

main().catch((error) => {
  console.error("\nP04 BATCH GENERATION FAILED\n");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
