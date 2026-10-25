import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createEmetAiFastDiscoveryProvider } from "../app/lib/emet/simple/EmetAiFastDiscovery.ts";
import { createEmetAiSimpleOpenAiProvider } from "../app/lib/emet/simple/EmetAiSimpleProvider.ts";
import { answerWithFastTwoPathEmet } from "../app/lib/emet/simple/EmetAiFastTwoPathService.ts";

async function loadEnvFile(file) {
  try {
    const contents = await fs.readFile(file, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch {}
}

await loadEnvFile(path.join(process.cwd(), ".env.local"));
if (!process.argv.includes("--approved")) throw new Error("Paid evaluation requires explicit --approved.");

const allScenarios = [
  { id: "creation", question: "Who created the heavens and the earth?" },
  { id: "ten-commandments", question: "What are the Ten Commandments?" },
  { id: "sabbath", question: "Should followers of Messiah keep the seventh-day Sabbath?" },
  { id: "pre-sinai", question: "Did Yahweh's commandments exist before the Sinai covenant?" },
  { id: "hebrew-one", question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?" },
  {
    id: "resurrection-follow-up",
    question: "When are they raised?",
    conversation: {
      recentExchanges: [{ question: "What happens when we die?", answer: "The dead await resurrection.", references: ["Daniel 12:2"], claims: [], outcome: "answered" }],
      summary: { topics: ["death", "resurrection"], passages: ["Daniel 12:2"], corrections: [], earlierQuestions: ["What happens when we die?"], establishedClaims: [] },
    },
  },
];
const acceptanceScenarios = [
  {
    id: "ecclesiastes",
    question: "What does the Hebrew wording of Ecclesiastes 12:13–14 teach about humanity's responsibility to keep Yahweh's commandments, and is “duty” a separate Hebrew word?",
  },
  { id: "sabbath", question: "Should followers of Messiah keep the seventh-day Sabbath?" },
  {
    id: "romans-7",
    question: "Does Paul teach that Yahweh's law was abolished under the new covenant? Explain Romans 7 in light of Jeremiah 31:31–34 and Matthew 5:17–19.",
  },
];
const finalAcceptance = process.argv.includes("--final-acceptance");
const finalThree = process.argv.includes("--final-three");
const scenarios = finalAcceptance
  ? acceptanceScenarios
  : finalThree
  ? allScenarios.filter((scenario) => ["sabbath", "resurrection-follow-up", "hebrew-one"].includes(scenario.id))
  : process.argv.includes("--failed-four")
    ? allScenarios.filter((scenario) => ["sabbath", "pre-sinai", "hebrew-one", "resurrection-follow-up"].includes(scenario.id))
    : allScenarios;
const maximumCalls = finalAcceptance ? 6 : finalThree ? 5 : process.argv.includes("--failed-four") ? 7 : 9;

const model = "gpt-5.4-mini";
const answerProvider = createEmetAiSimpleOpenAiProvider({ model, reasoningEffort: "none", verifiedEvidenceOnly: true });
const discoveryProvider = createEmetAiFastDiscoveryProvider({ model });
if (!answerProvider || !discoveryProvider) throw new Error("OPENAI_API_KEY is not configured.");

const estimatedBlendedUsdPerToken = 0.0176 / 11_977;
const ceilingUsd = finalAcceptance ? 0.05 : 0.08;
let consumedTokens = 0;
let actualCalls = 0;

function meteredAnswerProvider() {
  return {
    model: answerProvider.model,
    async generate(input) {
      if (actualCalls >= maximumCalls) throw new Error(`Paid call ceiling of ${maximumCalls} reached.`);
      if ((consumedTokens + 7_000) * estimatedBlendedUsdPerToken > ceilingUsd) {
        return { draft: null, rawOutput: "", latencyMs: 0, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 } };
      }
      actualCalls += 1;
      const result = await answerProvider.generate(input);
      consumedTokens += result.usage.totalTokens;
      return result;
    },
  };
}

function meteredDiscoveryProvider() {
  return {
    model: discoveryProvider.model,
    async discover(input) {
      if (actualCalls >= maximumCalls) throw new Error(`Paid call ceiling of ${maximumCalls} reached.`);
      if ((consumedTokens + 5_000) * estimatedBlendedUsdPerToken > ceilingUsd) {
        return { draft: null, rawOutput: "", latencyMs: 0, estimatedInputCharacters: 0, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 } };
      }
      actualCalls += 1;
      const result = await discoveryProvider.discover(input);
      consumedTokens += result.usage.totalTokens;
      return result;
    },
  };
}

const results = [];
for (const scenario of scenarios) {
  const result = await answerWithFastTwoPathEmet({
    question: scenario.question,
    conversation: scenario.conversation || null,
    answerProvider: meteredAnswerProvider(),
    discoveryProvider: meteredDiscoveryProvider(),
  });
  results.push({ id: scenario.id, question: scenario.question, ...result });
}

const artifact = {
  schemaVersion: "emet-fast-two-path-live-evaluation@1",
  createdAt: new Date().toISOString(),
  model,
  reasoningEffort: "none",
  authorizedScenarios: scenarios.length,
  maximumCalls,
  actualCalls,
  consumedTokens,
  estimatedCostUsd: Math.round(consumedTokens * estimatedBlendedUsdPerToken * 100_000) / 100_000,
  ceilingUsd,
  results,
};
const outputDir = path.join(process.cwd(), ".private", "emet-fast-retrieval-audits");
await fs.mkdir(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `two-path-live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(outputFile, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({
  outputFile,
  actualCalls,
  consumedTokens,
  estimatedCostUsd: artifact.estimatedCostUsd,
  results: results.map((result) => ({
    id: result.id,
    status: result.status,
    path: result.path,
    modelCalls: result.modelCalls,
    usage: result.usage,
    stages: result.stages,
    errors: result.validationErrors,
    answer: result.answer?.answer || null,
    references: result.answer?.references || [],
    discoveredReferences: result.discovery?.references || [],
  })),
}, null, 2));
