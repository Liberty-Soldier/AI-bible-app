import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getEmetAiRequestCacheKey } from "../app/lib/emet/EmetAiCache.ts";
import { emetConversationClaimsFromAnswer } from "../app/lib/emet/EmetAiSupabaseStore.ts";
import { validateEmetAiPretrainedAdaptedContracts } from "../app/lib/emet/pretrained/EmetAiPretrainedAdapter.ts";
import {
  EMET_AI_PRETRAINED_ENGINE_PROFILE,
  EMET_AI_PRETRAINED_MODEL,
  EMET_AI_PRETRAINED_PROMPT_SHA256,
  parseEmetAiPretrainedDraft,
} from "../app/lib/emet/pretrained/EmetAiPretrainedContract.ts";
import { EMET_AI_PRETRAINED_SYSTEM_INSTRUCTION } from "../app/lib/emet/pretrained/EmetAiPretrainedProvider.ts";
import { answerWithPretrainedEmet, isEmetAiPretrainedFirstEnabled } from "../app/lib/emet/pretrained/EmetAiPretrainedService.ts";
import {
  getEmetAiPretrainedSourceIdentity,
  parseEmetAiPretrainedReference,
  verifiedLexicalIdentities,
  verifyEmetAiPretrainedDraft,
} from "../app/lib/emet/pretrained/EmetAiPretrainedVerifier.ts";

const ROOT = process.cwd();
const source = JSON.parse(await fs.readFile(path.join(ROOT, ".private", "approach-c-experiment", "approach-c-unseen-reviewed-2026-10-28.json"), "utf8"));
const results = [];
function test(name, operation) {
  try {
    const value = operation();
    results.push({ name, ok: true, value });
    return value;
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
async function testAsync(name, operation) {
  try {
    const value = await operation();
    results.push({ name, ok: true, value });
    return value;
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

const promptHash = crypto.createHash("sha256").update(EMET_AI_PRETRAINED_SYSTEM_INSTRUCTION).digest("hex");
test("exact Stage A instruction hash", () => assert.equal(promptHash, EMET_AI_PRETRAINED_PROMPT_SHA256));
test("disabled flag defaults off", () => {
  assert.equal(isEmetAiPretrainedFirstEnabled(undefined), false);
  assert.equal(isEmetAiPretrainedFirstEnabled("false"), false);
  assert.equal(isEmetAiPretrainedFirstEnabled("TRUE"), false);
  assert.equal(isEmetAiPretrainedFirstEnabled("true"), true);
});

const replay = [];
for (const row of source.results) {
  const draft = parseEmetAiPretrainedDraft(row.stageA.parsed);
  assert(draft, `${row.id} did not parse.`);
  const verification = verifyEmetAiPretrainedDraft({ question: row.question, draft, context: null });
  const adapted = verification.ok ? (await import("../app/lib/emet/pretrained/EmetAiPretrainedAdapter.ts")).adaptEmetAiPretrainedAnswer({ draft, verification }) : null;
  const contract = adapted ? validateEmetAiPretrainedAdaptedContracts(adapted.packet, adapted.answer) : null;
  replay.push({
    id: row.id,
    question: row.question,
    storedModel: row.stageA.model,
    storedReasoningEffort: row.stageA.reasoningEffort,
    storedRawOutput: row.stageA.rawOutput,
    storedUsage: row.stageA.usage,
    storedLatencyMs: row.stageA.latencyMs,
    storedEstimatedCostUsd: row.stageA.estimatedCostUsd,
    draft,
    parsed: Boolean(draft),
    referencesResolved: verification.referenceFindings.every((item) => item.exists),
    accepted: verification.ok && Boolean(contract?.ok),
    errors: verification.errors,
    warnings: verification.warnings,
    omissions: verification.omissions,
    referenceFindings: verification.referenceFindings,
    verifiedScripture: verification.scripture,
    verifiedLexical: verification.lexical,
    answerPreserved: adapted ? adapted.answer.answer === draft.proposedAnswer : true,
    finalDisplayedAnswer: adapted?.answer || null,
    citations: adapted?.answer.citations || [],
    packetEvidence: adapted?.packet.evidence.length || 0,
  });
}
test("all 30 stored outputs parse", () => assert.equal(replay.filter((row) => row.parsed).length, 30));
test("all 30 stored outputs resolve", () => assert.equal(replay.filter((row) => row.referencesResolved).length, 30));
test("stored prose is never rewritten", () => assert.equal(replay.filter((row) => row.answerPreserved).length, 30));
test("known safety boundary", () => {
  assert.deepEqual(replay.filter((row) => !row.accepted).map((row) => row.id), ["U08", "U25"]);
  assert(replay.find((row) => row.id === "U08")?.errors.some((error) => /subject/i.test(error)));
  assert(replay.find((row) => row.id === "U25")?.errors.some((error) => /interpretive.*categorical/i.test(error)));
});

test("Psalm and numbered-book normalization", () => {
  assert.equal(parseEmetAiPretrainedReference("Psalm 23:1").reference, "Psalms 23:1");
  assert.equal(parseEmetAiPretrainedReference("1 Corinthians 10:23-24").reference, "1 Corinthians 10:23-24");
});
test("non-contiguous and cross-chapter references", () => {
  const parsed = parseEmetAiPretrainedReference("John 1:1-3, 14, 2:1");
  assert(parsed.ok);
  assert.equal(parsed.reference, "John 1:1-3, 14, 2:1");
  assert.deepEqual(parsed.expandedReferences, ["John 1:1", "John 1:2", "John 1:3", "John 1:14", "John 2:1"]);
});
test("invalid and unbounded references fail", () => {
  assert.equal(parseEmetAiPretrainedReference("NotABook 1:1").ok, false);
  assert.equal(parseEmetAiPretrainedReference("Genesis 1:1-80").ok, false);
});
test("locked lexical identities", () => {
  assert.equal(verifiedLexicalIdentities({ corpus: "greek-nt", lookup: "logos" })[0]?.lexicalId, "G3056");
  assert.equal(verifiedLexicalIdentities({ corpus: "hebrew", lookup: "hesed" })[0]?.lexicalId, "H2617");
  assert.equal(verifiedLexicalIdentities({ corpus: "lxx", lookup: "L700001" })[0]?.lexicalId, "L700001");
  assert.equal(verifiedLexicalIdentities({ corpus: "hebrew", lookup: "H999999" }).length, 0);
});

test("exact KJV quotation is a legitimate translation variant", () => {
  const draft = parseEmetAiPretrainedDraft({
    question: "What does Genesis 1:1 say?",
    proposedAnswer: "It says, “In the beginning God created the heaven and the earth.”",
    conclusion: "not-applicable",
    conclusionSupport: "explicit-statement",
    references: ["Genesis 1:1"],
    claims: [{ claim: "Genesis states that God created the heavens and earth in the beginning.", support: "explicit-statement", references: ["Genesis 1:1"] }],
    limitations: [],
  });
  assert(draft);
  const verification = verifyEmetAiPretrainedDraft({ question: draft.question, draft, context: null });
  assert.equal(verification.ok, true, verification.errors.join("; "));
  assert.equal(verification.scripture[0].translation, "kjv");
  assert(verification.warnings.some((warning) => /translation variant/i.test(warning)));
});
test("fabricated exact quotation is rejected while paraphrase is allowed", () => {
  const make = (answer) => parseEmetAiPretrainedDraft({
    question: "What does Genesis 1:1 say?", proposedAnswer: answer, conclusion: "not-applicable", conclusionSupport: "explicit-statement", references: ["Genesis 1:1"],
    claims: [{ claim: "Genesis identifies God as creator at the beginning.", support: "explicit-statement", references: ["Genesis 1:1"] }], limitations: [],
  });
  const fabricated = make('It says, “The universe appeared from nothing without a creator.”');
  const paraphrase = make("Genesis says that God created the heavens and the earth in the beginning.");
  assert(fabricated && paraphrase);
  assert.equal(verifyEmetAiPretrainedDraft({ question: fabricated.question, draft: fabricated, context: null }).ok, false);
  assert.equal(verifyEmetAiPretrainedDraft({ question: paraphrase.question, draft: paraphrase, context: null }).ok, true);
});

test("citation mismatch is caught without a model limitation", () => {
  const draft = parseEmetAiPretrainedDraft({
    question: "Who built the ark?", proposedAnswer: "Moses built the ark.", conclusion: "qualified", conclusionSupport: "explicit-statement", references: ["Genesis 6:14"],
    claims: [{ claim: "Scripture explicitly identifies Moses as the ark's builder.", support: "explicit-statement", references: ["Genesis 6:14"] }], limitations: [],
  });
  assert(draft);
  const verification = verifyEmetAiPretrainedDraft({ question: draft.question, draft, context: null });
  assert.equal(verification.ok, false);
  assert(verification.errors.some((error) => /subject/i.test(error)));
});
test("categorical interpretation is caught without a model limitation", () => {
  const draft = parseEmetAiPretrainedDraft({
    question: "Do these passages contradict?", proposedAnswer: "No. They describe different kinds of judgment.", conclusion: "qualified", conclusionSupport: "interpretation", references: ["Deuteronomy 24:16", "Joshua 7:24-25"],
    claims: [{ claim: "The passages can be harmonized as different kinds of judgment.", support: "interpretation", references: ["Deuteronomy 24:16", "Joshua 7:24-25"] }], limitations: [],
  });
  assert(draft);
  const verification = verifyEmetAiPretrainedDraft({ question: draft.question, draft, context: null });
  assert.equal(verification.ok, false);
  assert(verification.errors.some((error) => /categorical/i.test(error)));
});

test("cache keys are architecture and source isolated", () => {
  const base = { question: "Who betrayed Yahshua?", conversation: null, context: null };
  const legacy = getEmetAiRequestCacheKey({ ...base, engineProfile: "legacy" });
  const fast = getEmetAiRequestCacheKey({ ...base, engineProfile: "fast-two-path" });
  const sourceIdentity = getEmetAiPretrainedSourceIdentity("web");
  const pretrained = getEmetAiRequestCacheKey({ ...base, engineProfile: EMET_AI_PRETRAINED_ENGINE_PROFILE, pretrainedIdentity: { model: EMET_AI_PRETRAINED_MODEL, sourceIdentity } });
  const changedSource = getEmetAiRequestCacheKey({ ...base, engineProfile: EMET_AI_PRETRAINED_ENGINE_PROFILE, pretrainedIdentity: { model: EMET_AI_PRETRAINED_MODEL, sourceIdentity: `${sourceIdentity}:changed` } });
  assert.equal(new Set([legacy, fast, pretrained, changedSource]).size, 4);
  assert.throws(() => getEmetAiRequestCacheKey({ ...base, engineProfile: EMET_AI_PRETRAINED_ENGINE_PROFILE }), /require explicit/i);
});

const sampleDraft = parseEmetAiPretrainedDraft({
  question: "Who betrayed Yahshua?", proposedAnswer: "Judas Iscariot betrayed Yahshua.", conclusion: "yes", conclusionSupport: "explicit-statement", references: ["Matthew 26:14-16"],
  claims: [{ claim: "Matthew identifies Judas Iscariot as the disciple who arranged the betrayal.", support: "explicit-statement", references: ["Matthew 26:14-16"] }], limitations: [],
});
assert(sampleDraft);
const usage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0, totalTokens: 20 };
function mockProvider(generate) { return { model: EMET_AI_PRETRAINED_MODEL, generate }; }
await testAsync("one-call success preserves reader, sharing, and ledger contracts", async () => {
  let calls = 0;
  const result = await answerWithPretrainedEmet({
    question: sampleDraft.question, conversation: null, context: null, fallbackEngine: "fast-two-path",
    provider: mockProvider(async () => { calls += 1; return { draft: sampleDraft, rawOutput: JSON.stringify(sampleDraft), latencyMs: 5, usage, estimatedCostUsd: 0.001, failureReason: null }; }),
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "complete", result.errors.join("; "));
  assert.equal(result.answer?.answer, sampleDraft.proposedAnswer);
  assert(result.answer?.citations.every((citation) => result.packet?.evidence.some((evidence) => evidence.id === citation.evidenceId)));
  assert(emetConversationClaimsFromAnswer(result.answer).length > 0);
  assert(result.answer.citations.length <= 10);
});
await testAsync("locked-source preflight failure falls back before a model call", async () => {
  let calls = 0;
  const result = await answerWithPretrainedEmet({
    question: sampleDraft.question, conversation: null, context: null, fallbackEngine: "legacy",
    preflightError: "Locked source identity is unavailable.",
    provider: mockProvider(async () => { calls += 1; throw new Error("must not run"); }),
  });
  assert.equal(calls, 0);
  assert.equal(result.status, "fallback");
  assert.equal(result.audit.fallbackReason, "local-verification-failed");
  assert.equal(result.audit.displayedEngine, "legacy");
});
await testAsync("provider, malformed-output, and invalid-reference fallbacks do not mix answers", async () => {
  const thrown = await answerWithPretrainedEmet({ question: sampleDraft.question, conversation: null, context: null, fallbackEngine: "legacy", provider: mockProvider(async () => { throw new Error("provider down"); }) });
  assert.equal(thrown.status, "fallback");
  assert.equal(thrown.answer, null);
  assert.equal(thrown.audit.fallbackReason, "provider-error");
  const malformed = await answerWithPretrainedEmet({ question: sampleDraft.question, conversation: null, context: null, fallbackEngine: "legacy", provider: mockProvider(async () => ({ draft: null, rawOutput: "{", latencyMs: 1, usage, estimatedCostUsd: 0.001, failureReason: "malformed-model-output" })) });
  assert.equal(malformed.audit.fallbackReason, "malformed-model-output");
  assert.equal(malformed.answer, null);
  const invalidDraft = { ...sampleDraft, references: ["NotABook 1:1"], claims: sampleDraft.claims.map((claim) => ({ ...claim, references: ["NotABook 1:1"] })) };
  const invalid = await answerWithPretrainedEmet({ question: sampleDraft.question, conversation: null, context: null, fallbackEngine: "fast-two-path", provider: mockProvider(async () => ({ draft: invalidDraft, rawOutput: JSON.stringify(invalidDraft), latencyMs: 1, usage, estimatedCostUsd: 0.001, failureReason: null })) });
  assert.equal(invalid.audit.fallbackReason, "local-verification-failed");
  assert.equal(invalid.answer, null);
  assert.equal(invalid.audit.displayedEngine, "fast-two-path");
});

await testAsync("route keeps auth, quota, conversation, sharing, and fallback boundaries", async () => {
  const route = await fs.readFile(path.join(ROOT, "app", "api", "emet", "ask", "route.ts"), "utf8");
  assert(route.indexOf("const userId = await getVerifiedSupabaseUserId") < route.indexOf("const usePretrainedEngine = isEmetAiPretrainedFirstEnabled"));
  assert(route.indexOf("reserveEmetAiQuestion") < route.indexOf("answerWithPretrainedEmet({"));
  assert(route.includes("setSupabaseEmetAiPretrainedRequestCache"));
  assert(route.includes("setSupabaseEmetAiRequestCache"));
  assert(route.includes("saveSharedStudyCandidate"));
  assert(route.includes("appendSupabaseEmetConversationLedger"));
  const service = await fs.readFile(path.join(ROOT, "app", "lib", "emet", "pretrained", "EmetAiPretrainedService.ts"), "utf8");
  assert(service.includes("EMET_AI_PRETRAINED_FIRST_ENABLED"));
});

const artifact = {
  schemaVersion: "emet-pretrained-first-deterministic-verification@1",
  createdAt: new Date().toISOString(),
  modelCalls: 0,
  summary: {
    tests: results.length,
    passed: results.filter((result) => result.ok).length,
    storedOutputs: replay.length,
    parsed: replay.filter((row) => row.parsed).length,
    referencesResolved: replay.filter((row) => row.referencesResolved).length,
    accepted: replay.filter((row) => row.accepted).map((row) => row.id),
    blocked: replay.filter((row) => !row.accepted).map((row) => ({ id: row.id, errors: row.errors })),
  },
  tests: results,
  replay,
};
const output = path.join(ROOT, ".private", "pretrained-first-integration", "implementation-test-results.json");
await fs.writeFile(output, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ output, summary: artifact.summary }, null, 2));

