import fs from "node:fs";
import path from "node:path";

for (const fileName of [".env.local", ".env.development.local"]) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) continue;
  for (const sourceLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

const [
  { buildEmetAiTopicEvidence, isEmetAiDeterministicFastPathEligible },
  { createEmetAiOpenAiProvider },
  { answerFromEmetAiEvidence },
  { createMemoryEmetAiAnswerStore },
  { createEmetAiPerformanceTrace },
] = await Promise.all([
  import("../app/lib/emet/EmetAiTopicEvidence.ts"),
  import("../app/lib/emet/providers/EmetAiOpenAiProvider.ts"),
  import("../app/lib/emet/EmetAiService.ts"),
  import("../app/lib/emet/EmetAiCache.ts"),
  import("../app/lib/emet/EmetAiPerformance.ts"),
]);

const questions = process.argv.slice(2);
if (!questions.length) throw new Error("Supply at least one question argument.");

for (const question of questions) {
  const trace = createEmetAiPerformanceTrace();
  const provider = createEmetAiOpenAiProvider({ performanceObserver: trace.observer });
  if (!provider) throw new Error("OPENAI_API_KEY is unavailable.");
  const eligible = isEmetAiDeterministicFastPathEligible({ question });
  let fastPath = false;
  let plan = null;
  let evidence = eligible
    ? trace.measure("retrieval", () => buildEmetAiTopicEvidence({
        question,
        deterministicFastPath: true,
        builtAt: "2026-10-09T00:00:00.000Z",
      }))
    : null;
  fastPath = evidence?.status === "ready";
  if (!fastPath) {
    plan = await trace.measureAsync("planning", () => provider.plan({
      question,
      conversation: null,
      context: null,
    }));
    evidence = trace.measure("retrieval", () => buildEmetAiTopicEvidence({
      question,
      retrievalPlan: plan,
      requireSemanticPlan: true,
      builtAt: "2026-10-09T00:00:00.000Z",
    }));
  }
  if (!evidence || evidence.status !== "ready") {
    console.log(JSON.stringify({ question, fastPath, status: evidence?.status, limitations: evidence?.limitations }, null, 2));
    continue;
  }

  const store = createMemoryEmetAiAnswerStore();
  const coldStartedAt = performance.now();
  const cold = await answerFromEmetAiEvidence({
    packet: evidence.packet,
    store,
    provider,
    allowLive: true,
    performanceObserver: trace.observer,
  });
  const coldMs = performance.now() - coldStartedAt;
  const warmStartedAt = performance.now();
  const warm = await answerFromEmetAiEvidence({
    packet: evidence.packet,
    store,
    provider,
    allowLive: true,
    performanceObserver: trace.observer,
  });
  const warmMs = performance.now() - warmStartedAt;
  const performanceReport = trace.report({ fastPath, coldMs: Math.round(coldMs), warmMs: Math.round(warmMs) });
  console.log(JSON.stringify({
    question,
    fastPath,
    planMode: plan?.analysisMode || "deterministic-direct",
    evidence: evidence.packet.evidence.map((item) => item.reference || item.id),
    cold: { source: cold.source, answer: cold.answer.answer, citations: cold.answer.citations, ms: Math.round(coldMs) },
    warm: { source: warm.source, answer: warm.answer.answer, ms: Math.round(warmMs) },
    performance: performanceReport,
  }, null, 2));
}
