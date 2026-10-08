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
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnvironment(".env.local");
loadLocalEnvironment(".env.development.local");
if (process.env.EMET_SMOKE_MODEL?.trim()) {
  process.env.EMET_AI_MODEL = process.env.EMET_SMOKE_MODEL.trim();
  process.env.EMET_AI_ANSWER_MODEL = process.env.EMET_SMOKE_MODEL.trim();
}
if (process.env.EMET_SMOKE_PLANNER_MODEL?.trim()) {
  process.env.EMET_AI_PLANNER_MODEL =
    process.env.EMET_SMOKE_PLANNER_MODEL.trim();
}

const [
  { buildEmetAiTopicEvidence },
  { buildEmetAiWordEvidence },
  { validateEmetAiAnswer },
  { createEmetAiOpenAiProvider },
  { buildEmetConversationContext },
] =
  await Promise.all([
    import("../app/lib/emet/EmetAiTopicEvidence.ts"),
    import("../app/lib/emet/EmetAiEvidenceBuilder.ts"),
    import("../app/lib/emet/EmetAiContract.ts"),
    import("../app/lib/emet/providers/EmetAiOpenAiProvider.ts"),
    import("../app/lib/emet/EmetAiConversation.ts"),
  ]);

const wordMode = process.argv.includes("--word");
let evidence;
let retrievalPlan = null;
const provider = createEmetAiOpenAiProvider();

if (wordMode) {
  const origin = process.env.EMET_SMOKE_ORIGIN || "http://localhost:3002";
  const corpusOption = process.argv
    .find((argument) => argument.startsWith("--corpus="))
    ?.slice("--corpus=".length);
  const fixtures = {
    hebrew: {
      entityId: "word:hebrew:H430",
      displayWord: "אֱלֹהִ֑ים",
      book: "Genesis",
      chapter: "1",
      verse: "1",
      translation: "web",
      sourceOccurrenceId: "wlc:Gen:1:1:2",
      sourceLexicalId: "H430",
      sourceCorpus: "hebrew",
      sourceResolutionAuthority: "canonical-source-breakdown-occurrence",
      sourceResolutionMethod: "exact-source-occurrence",
    },
    lxx: {
      entityId: "word:lxx:L704340",
      displayWord: "ἕκτῃ",
      book: "Genesis",
      chapter: "2",
      verse: "2",
      translation: "brenton",
      sourceOccurrenceId: "lxx:Genesis.2.2:8",
      sourceLexicalId: "L704340",
      sourceCorpus: "lxx",
      sourceResolutionAuthority: "LXX_final_main.csv occurrence stream",
      sourceResolutionMethod: "exact-occurrence-stream",
    },
    "greek-nt": {
      entityId: "word:greek-nt:G3056",
      displayWord: "λόγος",
      book: "John",
      chapter: "1",
      verse: "1",
      translation: "web",
      sourceOccurrenceId: "greek-nt:John.1.1:4",
      sourceLexicalId: "G3056",
      sourceCorpus: "greek-nt",
      sourceResolutionAuthority: "canonical-source-breakdown-occurrence",
      sourceResolutionMethod: "exact-source-occurrence",
    },
  };
  const fixture = fixtures[corpusOption || "hebrew"];
  if (!fixture) throw new Error(`Unsupported word smoke corpus: ${corpusOption}`);
  const params = new URLSearchParams({
    ...fixture,
    displayTokenIndex: "-1",
  });
  const response = await fetch(`${origin}/api/word-study?${params}`);
  if (!response.ok) {
    throw new Error(`Word-study smoke fixture failed: ${response.status}`);
  }
  const wordStudy = await response.json();
  const scriptureIndexes = new Map();
  const loadVerse = async (reference) => {
    const translation = reference.routeTranslation || "web";
    let index = scriptureIndexes.get(translation);
    if (!index) {
      index = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "public", "scripture", "search", `${translation}.json`),
          "utf8",
        ),
      );
      scriptureIndexes.set(translation, index);
    }
    const record = index.records.find(
      (item) =>
        item[0] === reference.book &&
        Number(item[1]) === Number(reference.chapter) &&
        String(item[2]) === String(reference.verse),
    );
    return record
      ? {
          reference: `${record[0]} ${record[1]}:${record[2]}`,
          text: record[3],
          translation,
          sourceId: `${translation}:${record[0]}.${record[1]}.${record[2]}`,
          checksum: index.sourceFingerprint,
        }
      : null;
  };
  evidence = await buildEmetAiWordEvidence({
    question: "What does this word mean here?",
    wordStudy,
    loadVerse,
    builtAt: "2026-01-01T00:00:00.000Z",
  });
} else {
  const topicQuestion =
    process.env.EMET_SMOKE_QUESTION ||
    "What does Scripture establish about the Sabbath?";
  const priorQuestion = process.env.EMET_SMOKE_PRIOR_QUESTION?.trim();
  const conversation = priorQuestion
    ? buildEmetConversationContext([
        {
          question: priorQuestion,
          answer: "Earlier answer prose is intentionally excluded from retrieval.",
          references: (process.env.EMET_SMOKE_PRIOR_REFERENCES || "")
            .split("|")
            .map((reference) => reference.trim())
            .filter(Boolean),
        },
      ])
    : null;
  retrievalPlan = provider?.plan
    ? await provider.plan({
        question: topicQuestion,
        conversation,
        context: null,
      })
    : null;
  evidence = buildEmetAiTopicEvidence({
    question: topicQuestion,
    conversation,
    retrievalPlan,
    requireSemanticPlan: true,
    builtAt: "2026-01-01T00:00:00.000Z",
  });
}

if (evidence.status !== "ready") {
  console.error("EMET live smoke failed before generation.", evidence.limitations);
  if (retrievalPlan) {
    console.error("Retrieval plan:", JSON.stringify(retrievalPlan, null, 2));
  }
  process.exitCode = 1;
} else {
  if (!provider) {
    console.error("EMET live smoke is not configured.");
    process.exitCode = 1;
  } else {
    const rawAnswer = await provider.generate(evidence.packet);
    const validation = rawAnswer
      ? validateEmetAiAnswer(evidence.packet, rawAnswer)
      : { ok: false, errors: ["The provider returned no answer."] };

    if (!validation.ok) {
      console.error("EMET live smoke answer failed validation.", validation.errors);
      console.error(JSON.stringify(rawAnswer, null, 2));
      process.exitCode = 1;
    } else {
      console.log("EMET live AI smoke passed.");
      console.log(`- Model: ${provider.model}`);
      console.log(`- Status: ${validation.value.status}`);
      console.log(`- Claims: ${validation.value.claims.length}`);
      console.log(`- Citations: ${validation.value.citations.length}`);
      console.log(`- Evidence packet items: ${evidence.packet.evidence.length}`);
      if (retrievalPlan) {
        console.log(`- Resolved subject: ${retrievalPlan.subject}`);
        console.log(`- Reasoning mode: ${retrievalPlan.analysisMode}`);
        console.log(`- Proposition: ${retrievalPlan.proposition}`);
        console.log(
          `- Planned passages: ${retrievalPlan.passages
            .map((item) => `${item.reference} [${item.role}]`)
            .join("; ")}`,
        );
      }
      console.log(
        `- Evidence: ${evidence.packet.evidence
          .map(
            (item) =>
              `${item.reference || item.id} [${item.provenance.retrieval?.method || item.kind}/${item.provenance.retrieval?.role || "support"}]`,
          )
          .join("; ")}`,
      );
      console.log(`- Answer: ${validation.value.answer}`);
    }
  }
}
