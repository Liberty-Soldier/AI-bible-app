import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { EMET_AI_PROMPT_VERSION, validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";
import { adaptFastEmetAnswer } from "../app/lib/emet/simple/EmetAiFastAnswerAdapter.ts";
import { validateEmetAiSimpleAnswer } from "../app/lib/emet/simple/EmetAiSimpleContract.ts";

const inputArgument = process.argv.find((value) => value.startsWith("--input="))?.slice(8);
if (!inputArgument) throw new Error("Replay requires --input=<live-evaluation.json>.");

const inputFile = path.resolve(process.cwd(), inputArgument);
const sourceText = await fs.readFile(inputFile, "utf8");
const source = JSON.parse(sourceText);
if (!Array.isArray(source.results)) throw new Error("Replay source does not contain live-evaluation results.");

function changedFields(before, after) {
  const fields = [
    "status", "conclusion", "conclusionSupport", "answer", "references",
    "claims", "componentChecks", "lexicalAnalyses", "limitations", "citations",
  ];
  return fields.flatMap((field) => {
    const previous = before?.[field];
    const current = after?.[field];
    return JSON.stringify(previous) === JSON.stringify(current)
      ? []
      : [{ field, before: previous ?? null, after: current ?? null }];
  });
}

const results = source.results.map((result) => {
  const originalDraft = result.generatedDraft ? structuredClone(result.generatedDraft) : null;
  const replayDraft = result.generatedDraft ? structuredClone(result.generatedDraft) : null;
  const simpleValidation = result.packet && replayDraft
    ? validateEmetAiSimpleAnswer({ packet: result.packet, draft: replayDraft })
    : null;
  const adaptedAnswer = result.packet && simpleValidation?.ok
    ? adaptFastEmetAnswer({ answer: simpleValidation.value, packet: result.packet })
    : null;
  const fullValidation = result.packet && adaptedAnswer
    ? validateEmetAiAnswer(result.packet, adaptedAnswer)
    : null;
  const finalAnswer = simpleValidation?.ok ? simpleValidation.value : null;
  const changes = changedFields(originalDraft, finalAnswer);
  const modelConclusionChanged = Boolean(
    originalDraft && finalAnswer &&
    (originalDraft.status !== finalAnswer.status ||
      originalDraft.conclusion !== finalAnswer.conclusion ||
      originalDraft.conclusionSupport !== finalAnswer.conclusionSupport),
  );
  const replayStatus = simpleValidation?.ok && fullValidation?.ok
    ? finalAnswer?.status
    : "insufficient-evidence";
  const acceptanceChanged = result.status !== replayStatus;

  return {
    id: result.id,
    question: result.question,
    original: {
      pipelineStatus: result.status,
      validationErrors: result.validationErrors || [],
      validatorResults: result.validatorResults || null,
      modelRawOutput: result.generatedRawOutput || "",
      modelDraft: originalDraft,
      modelCalls: result.modelCalls,
      usage: result.usage,
      stages: result.stages,
    },
    replay: {
      promptVersion: EMET_AI_PROMPT_VERSION,
      modelCalls: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      simpleValidation: simpleValidation
        ? { ok: simpleValidation.ok, errors: simpleValidation.ok ? [] : simpleValidation.errors }
        : null,
      fullValidation: fullValidation
        ? { ok: fullValidation.ok, errors: fullValidation.ok ? [] : fullValidation.errors }
        : null,
      deterministicChanges: changes,
      finalDisplayedAnswer: finalAnswer?.answer || null,
      finalPublicReferences: finalAnswer?.references || [],
      finalPublicCitations: finalAnswer?.citations || [],
      finalStructuredAnswer: finalAnswer,
      adaptedFullAnswer: adaptedAnswer,
      acceptanceChanged,
      modelConclusionChanged,
      changeClassification: modelConclusionChanged
        ? "substantive-structured-conclusion-change"
        : changes.length
          ? "presentation-citation-or-normalization-only"
          : "no-deterministic-change",
    },
  };
});

const replayArtifact = {
  schemaVersion: "emet-fast-two-path-live-replay@1",
  createdAt: new Date().toISOString(),
  replayPromptVersion: EMET_AI_PROMPT_VERSION,
  source: {
    file: inputFile,
    schemaVersion: source.schemaVersion || null,
    createdAt: source.createdAt || null,
    model: source.model || null,
    sha256: crypto.createHash("sha256").update(sourceText).digest("hex"),
  },
  execution: {
    modelCalls: 0,
    estimatedCostUsd: 0,
    note: "This artifact replays stored model drafts through deterministic validation and adaptation only.",
  },
  summary: {
    scenarios: results.length,
    simpleAccepted: results.filter((item) => item.replay.simpleValidation?.ok).length,
    fullAccepted: results.filter((item) => item.replay.fullValidation?.ok).length,
    acceptanceChanges: results.filter((item) => item.replay.acceptanceChanged).length,
    substantiveConclusionChanges: results.filter((item) => item.replay.modelConclusionChanged).length,
  },
  results,
};

const outputDir = path.join(process.cwd(), ".private", "emet-fast-retrieval-audits");
await fs.mkdir(outputDir, { recursive: true });
const outputFile = path.join(
  outputDir,
  `two-path-live-replay-${EMET_AI_PROMPT_VERSION.replace(/[^A-Za-z0-9@.-]+/g, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
await fs.writeFile(outputFile, JSON.stringify(replayArtifact, null, 2));
console.log(JSON.stringify({ outputFile, ...replayArtifact.summary }, null, 2));
