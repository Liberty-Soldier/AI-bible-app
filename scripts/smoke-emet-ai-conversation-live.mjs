import fs from "node:fs";
import path from "node:path";

function loadLocalEnvironment(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const sourceLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadLocalEnvironment(".env.local");
loadLocalEnvironment(".env.development.local");

const [
  { buildEmetConversationContext },
  { validateEmetAiAnswer },
  { buildEmetAiTopicEvidence },
  { createEmetAiOpenAiProvider },
] = await Promise.all([
  import("../app/lib/emet/EmetAiConversation.ts"),
  import("../app/lib/emet/EmetAiContract.ts"),
  import("../app/lib/emet/EmetAiTopicEvidence.ts"),
  import("../app/lib/emet/providers/EmetAiOpenAiProvider.ts"),
]);

const provider = createEmetAiOpenAiProvider();
if (!provider?.plan) throw new Error("EMET live provider and planner are required.");

const defaultQuestions = [
  "What evidence in the Bible proves the Trinity?",
  "The Messiah is the Son of Yahweh. He is now the high priest of Yahweh. How would that be a coequal Trinity?",
  "So is the Trinity biblical?",
];
const questions = process.env.EMET_SMOKE_QUESTIONS_JSON
  ? JSON.parse(process.env.EMET_SMOKE_QUESTIONS_JSON)
  : defaultQuestions;
if (
  !Array.isArray(questions) ||
  questions.length < 2 ||
  questions.some((question) => typeof question !== "string" || !question.trim())
) throw new Error("EMET_SMOKE_QUESTIONS_JSON must be an array of questions.");

const exchanges = [];
for (const [index, question] of questions.entries()) {
  const conversation = buildEmetConversationContext(exchanges);
  const retrievalPlan = await provider.plan({
    question,
    conversation,
    context: null,
  });
  const evidence = buildEmetAiTopicEvidence({
    question,
    conversation,
    retrievalPlan,
    requireSemanticPlan: true,
    builtAt: "2026-01-01T00:00:00.000Z",
  });
  if (evidence.status !== "ready") {
    throw new Error(
      `Turn ${index + 1} evidence failed: ${evidence.limitations.join("; ")}\n${JSON.stringify(retrievalPlan, null, 2)}`,
    );
  }

  const rawAnswer = await provider.generate(evidence.packet);
  const validation = rawAnswer
    ? validateEmetAiAnswer(evidence.packet, rawAnswer)
    : { ok: false, errors: ["The provider returned no answer."] };
  if (!validation.ok) {
    throw new Error(
      `Turn ${index + 1} answer failed: ${validation.errors.join("; ")}\n${JSON.stringify(rawAnswer, null, 2)}`,
    );
  }

  const answer = validation.value;
  const referenceByEvidenceId = new Map(
    answer.citations.map((citation) => [
      citation.evidenceId,
      citation.reference || "",
    ]),
  );
  exchanges.push({
    question,
    answer: answer.answer,
    outcome: "answered",
    references: answer.citations
      .map((citation) => citation.reference || "")
      .filter(Boolean),
    claims: answer.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      support: claim.support,
      category: claim.category,
      polarity: claim.polarity,
      scope: claim.scope,
      timing: claim.timing,
      references: claim.evidenceIds
        .map((evidenceId) => referenceByEvidenceId.get(evidenceId) || "")
        .filter(Boolean),
    })),
  });

  console.log(`\nTURN ${index + 1}`);
  console.log(`Question: ${question}`);
  console.log(`Mode: ${retrievalPlan?.analysisMode}`);
  console.log(`Proposition: ${retrievalPlan?.proposition}`);
  console.log(`Conclusion support: ${answer.conclusionSupport}`);
  console.log(`Evidence: ${evidence.packet.scope.references.join("; ")}`);
  console.log(`Answer: ${answer.answer}`);
}

console.log("\nEMET live conversation smoke passed.");
console.log(`- Model: ${provider.model}`);
console.log(`- Turns: ${questions.length}`);
console.log("- Each follow-up was replanned from current Scripture evidence.");
console.log("- Prior structured claims were continuity checks, not evidence.");
