"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const build = require(path.join(ROOT, "scripts", "entity", "build-cached-emet-explanations.js"));

const REPAIR_VERSION = "3.0.0";
const NETWORK_ATTEMPTS = 3;

function fail(message) { throw new Error(message); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${build.stableStringify(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const options = {
    limit: 0,
    concurrency: 3,
    generationAttempts: 2,
    entityIds: [],
    plan: false,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") options.plan = true;
    else if (arg === "--self-test") options.selfTest = true;
    else if (arg === "--limit") options.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.split("=")[1] || 0);
    else if (arg === "--concurrency") options.concurrency = Number(argv[++i] || 3);
    else if (arg.startsWith("--concurrency=")) options.concurrency = Number(arg.split("=")[1] || 3);
    else if (arg === "--attempts") options.generationAttempts = Number(argv[++i] || 2);
    else if (arg.startsWith("--attempts=")) options.generationAttempts = Number(arg.split("=")[1] || 2);
    else if (arg === "--entity") options.entityIds.push(...String(argv[++i] || "").split(",").map(clean).filter(Boolean));
    else if (arg.startsWith("--entity=")) options.entityIds.push(...arg.slice(9).split(",").map(clean).filter(Boolean));
    else fail(`Unknown argument: ${arg}`);
  }
  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 0;
  options.concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency || 3)));
  options.generationAttempts = Math.max(1, Math.min(4, Math.floor(options.generationAttempts || 2)));
  return options;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function failureCode(message) {
  const text = clean(message);
  const validation = /validation:\s*([^\s]+)/iu.exec(text)?.[1];
  if (validation) return validation;
  const prohibited = /prohibited report language:\s*(.+)$/iu.exec(text)?.[1];
  if (prohibited) return `prohibited:${clean(prohibited)}`;
  const artifact = /quoted-alignment-artifact:([^\s]+)/iu.exec(text)?.[1];
  if (artifact) return `artifact:${clean(artifact)}`;
  if (/max_output_tokens/iu.test(text)) return "max-output-tokens";
  return "other";
}

function normalizePhrase(value) {
  return clean(value)
    .replace(/[“”"]/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/[.;:,]+$/u, "")
    .trim();
}

function splitMeaningPhrase(value) {
  const text = normalizePhrase(value);
  if (!text) return [];
  return text
    .split(/\s*(?:;|\/|\bor\b)\s*/iu)
    .map(normalizePhrase)
    .filter((item) => item && item.length <= 90);
}

function fallbackText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return clean(item.text) || clean(item.normalized) || clean(item.rendering);
}

function simpleDefinition(value) {
  const text = normalizePhrase(value);
  if (!text || text.length > 100) return false;
  if (/\b(?:primary particle|prolonged form|contracted form|of uncertain|probably|perhaps|by implication|figuratively|from the same as|derivation)\b/iu.test(text)) return false;
  return text.split(/\s+/u).length <= 12;
}

function approvedMeaningTerms(view) {
  const identity = view?.identity || {};
  const rendering = view?.rendering_evidence || {};
  const collected = [];

  for (const gloss of Array.isArray(identity.glosses) ? identity.glosses : []) {
    collected.push(...splitMeaningPhrase(gloss));
  }
  if (collected.length === 0) {
    for (const definition of Array.isArray(identity.short_definitions) ? identity.short_definitions : []) {
      if (simpleDefinition(definition)) collected.push(...splitMeaningPhrase(definition));
    }
  }
  if (collected.length === 0) {
    for (const candidate of Array.isArray(rendering.dominant_fallback_candidates)
      ? rendering.dominant_fallback_candidates
      : []) {
      collected.push(...splitMeaningPhrase(fallbackText(candidate)));
    }
  }

  const seen = new Set();
  const terms = [];
  for (const term of collected) {
    const key = term.toLocaleLowerCase("en-US");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= 2) break;
  }
  return terms;
}

function partOfSpeech(view) {
  const values = Array.isArray(view?.identity?.parts_of_speech)
    ? view.identity.parts_of_speech.map((value) => clean(value).toLocaleLowerCase("en-US"))
    : [];
  if (values.some((value) => /proper|name/u.test(value))) return "name";
  for (const kind of ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "particle"]) {
    if (values.some((value) => value.includes(kind))) return kind;
  }
  return "word";
}

function curlyQuote(value) {
  return `“${normalizePhrase(value).replace(/”/gu, "")}”`;
}

function titleCase(value) {
  return normalizePhrase(value)
    .replace(/^(?:a|an|the)\s+/iu, "")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => {
      if (/^[A-Z0-9]+$/u.test(word)) return word;
      return word.charAt(0).toLocaleUpperCase("en-US") + word.slice(1);
    })
    .join(" ");
}

function openingValidationFailure(opening) {
  const text = clean(opening);
  const lower = text.toLocaleLowerCase("en-US");
  if (!text) return "missing-first-sentence";
  if (/\b(?:H|G|L)\d{1,8}\b/u.test(text)) return "technical-id-in-opening";
  if (/\b(?:occurs?|times?|verses?|corpus|evidence|metadata|record|packet)\b/iu.test(text)) {
    return "report-style-opening";
  }
  if (!/\b(?:means?|refers?|describes?|expresses?|functions?|marks?|indicates?|makes?|is\s+(?:a|an|the)\s+[^.!?]{0,60}\b(?:word|term|particle|name|verb|noun|adjective|adverb|pronoun|preposition|conjunction))\b/iu.test(lower)) {
    return "opening-does-not-explain-meaning";
  }
  return null;
}

function headlineIsSafe(headline) {
  return !/\b(?:source word|entity|designation|lexical record)\b/iu.test(clean(headline));
}

function termIsSafeForOpening(term) {
  const text = normalizePhrase(term);
  if (!text) return false;
  return !/\b(?:occurs?|times?|verses?|corpus|evidence|metadata|record|packet)\b/iu.test(text);
}

function genericOpeningForKind(kind) {
  const openings = {
    name: "This word is a name used for a particular person, place, or thing.",
    noun: "This word is a noun that names a person, place, thing, or idea.",
    verb: "This word is a verb that expresses an action or state.",
    adjective: "This word is an adjective that describes a quality or condition.",
    adverb: "This word is an adverb that modifies how an action or statement is understood.",
    pronoun: "This word is a pronoun that stands in place of a person or thing.",
    preposition: "This word is a preposition that expresses a relationship between words or phrases.",
    conjunction: "This word is a conjunction that joins words, phrases, or statements.",
    particle: "This word is a particle that helps shape the meaning or force of a statement.",
    word: "This word expresses a limited idea whose exact sense depends on its context.",
  };
  return openings[kind] || openings.word;
}

function deterministicReaderFrame(bundle) {
  const view = bundle?.view || {};
  const terms = approvedMeaningTerms(view);
  const kind = partOfSpeech(view);
  const transliteration = normalizePhrase(view?.identity?.transliteration);
  const lemma = normalizePhrase(view?.identity?.lemma);
  const safeTerms = terms.filter(termIsSafeForOpening);

  let opening;
  let headline;
  let meaningSentence = "";

  if (safeTerms.length >= 2) {
    opening = `This word means ${curlyQuote(safeTerms[0])} or ${curlyQuote(safeTerms[1])}.`;
    headline = `${titleCase(safeTerms[0])} or ${titleCase(safeTerms[1])}`;
  } else if (safeTerms.length === 1) {
    const verb = kind === "name" ? "refers to" : "means";
    opening = `This word ${verb} ${curlyQuote(safeTerms[0])}.`;
    headline = kind === "name" ? titleCase(safeTerms[0]) : `A Word for ${titleCase(safeTerms[0])}`;
  } else {
    opening = genericOpeningForKind(kind);
    if (terms.length >= 2) {
      meaningSentence = `Its basic senses are ${curlyQuote(terms[0])} and ${curlyQuote(terms[1])}.`;
      headline = `${titleCase(terms[0])} or ${titleCase(terms[1])}`;
    } else if (terms.length === 1) {
      meaningSentence = `Its basic sense is ${curlyQuote(terms[0])}.`;
      headline = kind === "name" ? titleCase(terms[0]) : `A Word for ${titleCase(terms[0])}`;
    } else if (kind === "name" && (transliteration || lemma)) {
      const name = transliteration || lemma;
      meaningSentence = `The name is represented by ${curlyQuote(name)} in transliteration or source form.`;
      headline = `The Name ${titleCase(name)}`;
    } else {
      headline = `Understanding This ${kind === "word" ? "Word" : titleCase(kind)}`;
    }
  }

  if (openingValidationFailure(opening)) {
    opening = genericOpeningForKind(kind);
  }
  if (!headlineIsSafe(headline)) {
    headline = `Understanding This ${kind === "word" ? "Word" : titleCase(kind)}`;
  }

  return {
    terms,
    kind,
    opening,
    meaningSentence,
    headline: headline.split(/\s+/u).slice(0, 8).join(" "),
  };
}
function firstSentenceEnd(text) {
  const match = /[.!?](?:\s|$)/u.exec(text);
  return match ? match.index + 1 : 0;
}

function replaceFirstSentence(text, opening) {
  const source = clean(text);
  if (!source) return opening;
  const end = firstSentenceEnd(source);
  const rest = end > 0 ? source.slice(end).trim() : source;
  if (!rest) return opening;
  return `${opening} ${rest}`.replace(/\s+/gu, " ").trim();
}

function responseOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const pieces = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") pieces.push(content.text);
      if (content?.type === "refusal" && typeof content.refusal === "string") fail(`Model refusal: ${content.refusal}`);
    }
  }
  return pieces.join("\n");
}

function sanitizeReaderText(text) {
  return clean(text)
    .replace(/\bthe record\b/giu, "the word")
    .replace(/\bshould not be expanded\b/giu, "should be understood carefully")
    .replace(/\bsource-word entity\b/giu, "source word")
    .replace(/\s+/gu, " ")
    .trim();
}

function enforceReaderFrame(body, entityId, frame) {
  const text = responseOutputText(body);
  if (!clean(text)) return body;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return body; }
  if (!Array.isArray(parsed?.explanations)) return body;
  const item = parsed.explanations.find((entry) => clean(entry?.entity_id) === entityId);
  if (!item || !item.explanation || typeof item.explanation.text !== "string") return body;

  item.headline = frame.headline;
  let rewritten = replaceFirstSentence(item.explanation.text, frame.opening);
  if (frame.meaningSentence && !rewritten.includes(frame.meaningSentence)) {
    const afterOpening = rewritten.slice(frame.opening.length).trim();
    rewritten = `${frame.opening} ${frame.meaningSentence}${afterOpening ? ` ${afterOpening}` : ""}`;
  }
  item.explanation.text = sanitizeReaderText(rewritten);
  return { ...body, output_text: JSON.stringify(parsed) };
}
function repairInstruction(entityId, message, frame, attempt) {
  const code = failureCode(message);
  const rules = [
    "Rewrite from scratch as natural Bible-study prose for an average reader.",
    `The headline MUST be exactly: ${frame.headline}`,
    `The first sentence MUST be exactly: ${frame.opening}`,
    ...(frame.meaningSentence ? [`The second sentence MUST be exactly: ${frame.meaningSentence}`] : []),
    "Copy that headline and first sentence verbatim, then continue naturally.",
    "Do not begin any later sentence with a lexical ID, corpus label, occurrence count, evidence statement, or database-style description.",
    "Use 60-120 words without padding.",
    "Use only allowed evidence IDs and never infer verse context from a bare reference.",
    "Never mention records, entities, packets, metadata, supplied evidence, supplied glosses, designations, source-word entities, or the generation process.",
  ];
  if (code.startsWith("artifact:")) rules.push(`Never quote or present '${code.slice(9)}' as a meaning.`);
  if (code.startsWith("prohibited:")) rules.push(`Never use the phrase '${code.slice(11)}'.`);
  if (code === "max-output-tokens") rules.push("Keep the body near 70-95 words and return concise valid JSON.");
  if (attempt > 1) rules.push(`The previous guided attempt still failed validation (${code}); obey the exact headline and opening above.`);

  return {
    mode: "targeted_reader_repair_v2",
    repair_version: REPAIR_VERSION,
    entity_id: entityId,
    prior_failure: code,
    required_headline: frame.headline,
    required_first_sentence: frame.opening,
    required_second_sentence: frame.meaningSentence || null,
    approved_meaning_terms: frame.terms,
    nonnegotiable_rules: rules,
  };
}

function targetedInstructions(basePrompt, repair) {
  return `${basePrompt}\n\nTARGETED FINAL REPAIR OVERRIDE — HIGHEST PRIORITY FOR THIS REQUEST\n${repair.nonnegotiable_rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}\nReturn only the required JSON schema.`;
}

async function fetchResponse(request, apiBaseUrl, attempts = NETWORK_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiBaseUrl}/responses`, {
        method: "POST",
        headers: build.apiHeaders(),
        body: JSON.stringify(request),
      });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
      if (!response.ok) {
        const message = clean(body?.error?.message) || clean(body?.message) || `HTTP ${response.status}`;
        if (![408, 409, 429].includes(response.status) && response.status < 500) fail(`OpenAI request failed (${response.status}): ${message}`);
        throw new Error(`OpenAI request failed (${response.status}): ${message}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(15000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("OpenAI request failed.");
}

async function repairOne(entityId, packet, prompt, promptModule, model, failure, options) {
  const compilerOptions = {
    model,
    apiBaseUrl: clean(process.env.OPENAI_API_BASE_URL) || build.DEFAULT_API_BASE_URL,
    maxAttempts: 1,
    maxEntityInputBytes: build.DEFAULT_MAX_ENTITY_INPUT_BYTES,
    maxBatchInputBytes: build.DEFAULT_MAX_BATCH_INPUT_BYTES,
  };
  const basePrepared = build.buildApiRequest([entityId], { [entityId]: packet }, prompt, compilerOptions);
  const frame = deterministicReaderFrame(basePrepared.bundles[entityId]);
  let priorMessage = clean(failure?.message);
  let lastError;

  for (let generationAttempt = 1; generationAttempt <= options.generationAttempts; generationAttempt += 1) {
    const prepared = build.buildApiRequest([entityId], { [entityId]: packet }, prompt, compilerOptions);
    const repair = repairInstruction(entityId, priorMessage, frame, generationAttempt);
    const inputObject = JSON.parse(prepared.request.input);
    inputObject.targeted_repair = repair;
    prepared.request.input = build.stableStringify(inputObject);
    prepared.request.instructions = targetedInstructions(promptModule.SYSTEM_PROMPT, repair);
    prepared.request.max_output_tokens = 1800;
    prepared.request.text.verbosity = "low";
    if (prepared.request.reasoning) {
      prepared.request.reasoning.effort = clean(process.env.EMET_P04_REPAIR_REASONING_EFFORT) || "low";
    }
    const requestText = JSON.stringify(prepared.request);
    prepared.metrics.requestBodyBytes = Buffer.byteLength(requestText, "utf8");
    prepared.metrics.estimatedRequestTokens = Math.ceil(prepared.metrics.requestBodyBytes / 3);

    try {
      const rawBody = await fetchResponse(prepared.request, compilerOptions.apiBaseUrl);
      const body = enforceReaderFrame(rawBody, entityId, frame);
      return build.processApiResponse({
        batch: [entityId],
        packets: { [entityId]: packet },
        prompt,
        options: compilerOptions,
        prepared,
        body,
        transportAudit: {
          transport: "synchronous-responses-api-guided-repair",
          repairVersion: REPAIR_VERSION,
          repairAttempt: generationAttempt,
          repairFailure: failureCode(priorMessage),
          deterministicHeadline: frame.headline,
          deterministicOpening: frame.opening,
          deterministicMeaningSentence: frame.meaningSentence || null,
        },
      });
    } catch (error) {
      lastError = error;
      priorMessage = clean(error?.message) || String(error);
      if (generationAttempt < options.generationAttempts) await sleep(500);
    }
  }
  throw lastError || new Error(`Targeted repair failed for ${entityId}.`);
}

function runSelfTest() {
  const bundle = {
    view: {
      identity: {
        glosses: ["contest", "struggle"],
        short_definitions: [],
        parts_of_speech: ["noun"],
      },
      rendering_evidence: { dominant_fallback_candidates: [] },
    },
  };
  const frame = deterministicReaderFrame(bundle);
  if (frame.opening !== "This word means “contest” or “struggle”.") fail(`Self-test opening mismatch: ${frame.opening}`);
  if (frame.headline !== "Contest or Struggle") fail(`Self-test headline mismatch: ${frame.headline}`);
  const body = {
    output_text: JSON.stringify({
      explanations: [{
        entity_id: "word:greek-nt:G0119",
        headline: "Greek New Testament Lexical Record",
        explanation: {
          text: "Greek New Testament lexical ID G0119 occurs once. It describes a difficult contest or struggle and names the struggle itself rather than the act of struggling. Its exact role in a verse depends on the surrounding passage and should be understood without adding unsupported details.",
          evidence_ids: ["p03:test:identity"],
        },
      }],
    }),
  };
  const fixed = enforceReaderFrame(body, "word:greek-nt:G0119", frame);
  const parsed = JSON.parse(fixed.output_text);
  const item = parsed.explanations[0];
  if (item.headline !== frame.headline) fail("Self-test did not enforce headline.");
  if (!item.explanation.text.startsWith(frame.opening)) fail("Self-test did not enforce opening.");

  const unsafeFrame = deterministicReaderFrame({ view: { identity: { glosses: ["record"], short_definitions: [], parts_of_speech: ["noun"] }, rendering_evidence: { dominant_fallback_candidates: [] } } });
  if (openingValidationFailure(unsafeFrame.opening)) fail(`Unsafe-term opening did not pass preflight: ${unsafeFrame.opening}`);
  if (!unsafeFrame.meaningSentence.includes("record")) fail("Unsafe-term meaning was not retained in the second sentence.");
  console.log(`Targeted repair v${REPAIR_VERSION} self-test passed.`);
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }

  const statePath = build.STATE_PATH;
  if (!fs.existsSync(statePath)) fail(`Missing P04 state: ${statePath}`);
  const state = readJson(statePath);
  const artifact = readJson(build.INPUTS.packets);
  build.validateP03Artifact(artifact);
  const packets = artifact.packets;
  const promptModule = require(build.INPUTS.prompt);
  const prompt = build.promptDescriptor(promptModule);
  const model = clean(process.env.EMET_P04_MODEL) || build.DEFAULT_MODEL;

  const failures = state.failures && typeof state.failures === "object" ? state.failures : {};
  let ids = Object.keys(failures).filter((id) => packets[id]).sort((a, b) => a.localeCompare(b));
  if (options.entityIds.length) {
    const requested = new Set(options.entityIds);
    ids = ids.filter((id) => requested.has(id));
  }
  if (options.limit) ids = ids.slice(0, options.limit);

  const byReason = {};
  for (const id of ids) {
    const code = failureCode(failures[id]?.message);
    byReason[code] = (byReason[code] || 0) + 1;
  }

  console.log("\n========================================");
  console.log(" EMETSEES P04 Targeted Final Repair v3");
  console.log("========================================\n");
  console.log(`Prompt               : ${prompt.id}@${prompt.version}`);
  console.log(`Model                : ${model}`);
  console.log(`Accepted preserved   : ${Object.keys(state.records || {}).length}`);
  console.log(`Failures selected    : ${ids.length}`);
  console.log(`Concurrency          : ${options.concurrency}`);
  console.log(`Generation attempts  : ${options.generationAttempts}`);
  console.log(`Repair version       : ${REPAIR_VERSION}`);
  console.log(`Reasons              : ${JSON.stringify(byReason)}\n`);

  if (options.plan) {
    console.log("Plan only. No OpenAI request was made.\n");
    return;
  }
  if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY is required.");
  if (!ids.length) {
    console.log("No failed entities require repair.\n");
    return;
  }

  let cursor = 0;
  let repaired = 0;
  let failed = 0;
  const runWorker = async (worker) => {
    while (true) {
      const index = cursor++;
      if (index >= ids.length) return;
      const entityId = ids[index];
      const prior = failures[entityId];
      try {
        const result = await repairOne(entityId, packets[entityId], prompt, promptModule, model, prior, options);
        state.records[entityId] = result.records[entityId];
        delete state.failures[entityId];
        repaired += 1;
        console.log(`  Worker ${worker}: repaired ${entityId} (${repaired}/${ids.length})`);
      } catch (error) {
        const previousAttempts = Number(prior?.attempts || 0);
        state.failures[entityId] = {
          attempts: previousAttempts + options.generationAttempts,
          terminal: false,
          message: clean(error?.message) || String(error),
          lastAttemptAt: new Date().toISOString(),
          repairMode: `guided-final-repair-v${REPAIR_VERSION}`,
        };
        failed += 1;
        console.log(`  Worker ${worker}: failed ${entityId}: ${state.failures[entityId].message}`);
      }
      state.records = build.sortRecord(state.records || {});
      state.failures = build.sortRecord(state.failures || {});
      writeJson(statePath, state);
    }
  };

  await Promise.all(Array.from({ length: options.concurrency }, (_, i) => runWorker(i + 1)));

  console.log("\nP04 targeted repair v3 complete\n");
  console.log(`Repaired this run     : ${repaired}`);
  console.log(`Failed this run       : ${failed}`);
  console.log(`Valid cached records  : ${Object.keys(state.records || {}).length}`);
  console.log(`Still failed          : ${Object.keys(state.failures || {}).length}`);
  console.log(`State                 : ${path.relative(ROOT, statePath)}\n`);

  if (Object.keys(state.failures || {}).length === 0) {
    console.log("All failures repaired. Publishing and verifying final P04 artifacts...\n");
    const result = spawnSync(process.execPath, [
      "--max-old-space-size=4096",
      path.join(ROOT, "scripts", "entity", "build-cached-emet-explanations.js"),
    ], { cwd: ROOT, stdio: "inherit", env: process.env });
    if (result.status !== 0) fail("Final P04 publication/verification failed after repairs.");
  } else {
    console.log("Run the same repair command again for remaining failures. Accepted records are preserved.\n");
  }
}

module.exports = {
  approvedMeaningTerms,
  deterministicReaderFrame,
  enforceReaderFrame,
  failureCode,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("\nP04 TARGETED FINAL REPAIR V3 FAILED\n");
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
