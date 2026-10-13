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
  { buildEmetAiTopicEvidence },
  { createEmetAiOpenAiProvider },
  { answerFromEmetAiEvidence },
  { createMemoryEmetAiAnswerStore },
  { buildEmetConversationContext },
  { createEmetAiPerformanceTrace },
] = await Promise.all([
  import("../app/lib/emet/EmetAiTopicEvidence.ts"),
  import("../app/lib/emet/providers/EmetAiOpenAiProvider.ts"),
  import("../app/lib/emet/EmetAiService.ts"),
  import("../app/lib/emet/EmetAiCache.ts"),
  import("../app/lib/emet/EmetAiConversation.ts"),
  import("../app/lib/emet/EmetAiPerformance.ts"),
]);

const auditDirectory = path.join(process.cwd(), ".private", "emet-live-audits");
const baselineName = fs.readdirSync(auditDirectory)
  .filter((name) => /^phase3-.*\.json$/.test(name) && name < "phase3-2026-10-12T10-51")
  .sort()
  .at(-1);
if (!baselineName) throw new Error("A preserved Phase 3 baseline artifact is required.");
const baseline = JSON.parse(fs.readFileSync(path.join(auditDirectory, baselineName), "utf8"));
const prior = baseline.results.find((result) =>
  result.question === "What happens when we die and when are the dead raised?" &&
  result.cold?.answer?.status === "complete"
);
if (!prior) throw new Error("The preserved successful death-and-resurrection answer is required.");

const evidenceReferences = new Map(prior.verifiedEvidencePacket.evidence.map((item) => [
  item.id,
  item.reference,
]));
const conversation = buildEmetConversationContext([{
  question: prior.question,
  answer: prior.cold.answer.answer,
  references: prior.cold.answer.citations
    .map((citation) => evidenceReferences.get(citation.evidenceId))
    .filter(Boolean),
  claims: prior.cold.answer.claims.map((claim) => ({
    ...claim,
    references: claim.evidenceIds
      .map((id) => evidenceReferences.get(id))
      .filter(Boolean),
  })),
  outcome: "answered",
}]);

const question = "When are they raised?";
const trace = createEmetAiPerformanceTrace();
const provider = createEmetAiOpenAiProvider({ performanceObserver: trace.observer });
if (!provider) throw new Error("OPENAI_API_KEY is unavailable.");
const plan = await trace.measureAsync("planning", () => provider.plan({
  question,
  conversation,
  context: null,
}));
const evidence = trace.measure("retrieval", () => buildEmetAiTopicEvidence({
  question,
  conversation,
  retrievalPlan: plan,
  requireSemanticPlan: true,
  builtAt: "2026-10-09T00:00:00.000Z",
}));
if (!evidence || evidence.status !== "ready") {
  throw new Error(`Follow-up evidence failed: ${JSON.stringify(evidence?.limitations || [])}`);
}
const startedAt = performance.now();
const result = await answerFromEmetAiEvidence({
  packet: evidence.packet,
  store: createMemoryEmetAiAnswerStore(),
  provider,
  allowLive: true,
  performanceObserver: trace.observer,
});
const coldMs = Math.round(performance.now() - startedAt);
const artifact = {
  schemaVersion: "emet-live-audit@1",
  scenario: "preserved-successful-turn-followed-by-live-follow-up",
  baselineArtifact: baselineName,
  priorQuestion: prior.question,
  question,
  plan,
  verifiedEvidencePacket: evidence.packet,
  cold: { source: result.source, answer: result.answer, ms: coldMs },
  failure: provider.getLastFailure?.() || [],
  providerAudit: provider.getLastAudit?.() || {},
  performance: trace.report({ fastPath: false, coldMs, warmMs: null }),
};
const outputPath = path.join(
  auditDirectory,
  `phase4-followup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));
console.log(`Saved verbatim follow-up artifact: ${outputPath}`);
