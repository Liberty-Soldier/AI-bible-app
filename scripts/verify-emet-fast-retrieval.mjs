import fs from "node:fs/promises";
import path from "node:path";

import {
  resetFastScriptureIndexForTests,
  retrieveFastScriptureEvidence,
} from "../app/lib/emet/simple/EmetAiFastScriptureRetrieval.ts";

const scenarios = [
  {
    id: "creation", question: "Who created the heavens and the earth?",
    material: [["Genesis 1:1"]],
  },
  {
    id: "ten-commandments", question: "What are the Ten Commandments?",
    material: [["Exodus 20:2", "Deuteronomy 5:6"], ["Exodus 20:3", "Deuteronomy 5:7"], ["Exodus 20:7", "Deuteronomy 5:11"], ["Exodus 20:8", "Deuteronomy 5:12"], ["Exodus 20:12", "Deuteronomy 5:16"], ["Exodus 20:13", "Deuteronomy 5:17"], ["Exodus 20:14", "Deuteronomy 5:18"], ["Exodus 20:15", "Deuteronomy 5:19"], ["Exodus 20:16", "Deuteronomy 5:20"], ["Exodus 20:17", "Deuteronomy 5:21"]],
  },
  {
    id: "sabbath", question: "Should followers of Messiah keep the seventh-day Sabbath?",
    material: [["Genesis 2:2", "Genesis 2:3"], ["Exodus 20:8", "Exodus 20:9", "Exodus 20:10", "Exodus 20:11"], ["Mark 2:27", "Mark 2:28"], ["Matthew 5:17", "Matthew 5:18", "Matthew 5:19"], ["Colossians 2:16", "Colossians 2:17"]],
  },
  {
    id: "pre-sinai", question: "Did Yahweh's commandments exist before the Sinai covenant?",
    material: [["Genesis 26:5"], ["Genesis 7:2", "Genesis 7:8"], ["Exodus 16:23", "Exodus 16:28", "Exodus 16:29"], ["Exodus 19:5"]],
  },
  {
    id: "ecclesiastes", question: "What does Ecclesiastes 12:13-14 teach about humanity's responsibility to keep Yahweh's commandments?",
    material: [["Ecclesiastes 12:13"], ["Ecclesiastes 12:14"]],
  },
  {
    id: "priestly-duties", question: "Must someone who is not a priest perform priestly duties assigned to Aaron and his sons?",
    material: [["Exodus 28:1"], ["Numbers 3:10", "Numbers 18:7"]],
  },
  {
    id: "genesis-6", question: "Who are the sons of God in Genesis 6?",
    material: [["Genesis 6:2", "Genesis 6:4"], ["Job 1:6", "Job 2:1", "Job 38:7"]],
  },
  {
    id: "hebrew-one", question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?",
    material: [["Deuteronomy 6:4"]], lexicalId: "H259",
  },
  {
    id: "righteousness", question: "Romans 3:10 says none are righteous, yet Genesis 6:9 and Luke 1:6 describe righteous people. How do these passages agree?",
    material: [["Romans 3:10"], ["Genesis 6:9"], ["Luke 1:6"], ["Psalms 14:1", "Psalms 14:3"], ["Romans 3:23"]],
  },
  {
    id: "death", question: "What happens when we die?",
    material: [["Genesis 3:19", "Ecclesiastes 12:7"], ["Ecclesiastes 9:5", "Ecclesiastes 9:10"], ["Daniel 12:2"], ["1 Corinthians 15:52", "1 Thessalonians 4:16"]],
  },
  {
    id: "resurrection-follow-up", question: "When are they raised?",
    conversation: {
      recentExchanges: [{ question: "What happens when we die?", answer: "The dead await resurrection.", references: ["Daniel 12:2"], claims: [], outcome: "answered" }],
      summary: { topics: ["death", "resurrection"], passages: ["Daniel 12:2"], corrections: [], earlierQuestions: ["What happens when we die?"], establishedClaims: [] },
    },
    material: [["John 6:40", "John 6:44", "John 6:54"], ["1 Corinthians 15:52"], ["1 Thessalonians 4:16"]],
  },
  {
    id: "jeremiah-hebrews", question: "How does Jeremiah 31 connect to Hebrews 8?",
    material: [["Jeremiah 31:31"], ["Jeremiah 31:33"], ["Hebrews 8:8"], ["Hebrews 8:10"]],
  },
];

function evaluate(result, scenario) {
  const references = new Set(result.passages.map((passage) => passage.reference));
  const groups = scenario.material.map((alternatives) => ({
    alternatives,
    matches: alternatives.filter((reference) => references.has(reference)),
  }));
  const covered = groups.filter((group) => group.matches.length).length;
  const expectedReferences = new Set(scenario.material.flat());
  const irrelevant = result.passages
    .filter((passage) => !expectedReferences.has(passage.reference) && !passage.explicit && !passage.reasons.some((reason) => reason.startsWith("context:") || reason.startsWith("parallel:")))
    .map((passage) => passage.reference);
  return {
    materialGroupsCovered: `${covered}/${groups.length}`,
    coveragePercent: Math.round(covered / groups.length * 100),
    missingMaterialEvidence: groups.filter((group) => !group.matches.length).map((group) => group.alternatives.join(" or ")),
    irrelevantPassages: irrelevant,
    lexicalPass: scenario.lexicalId ? result.lexicalTerms.some((term) => term.lexicalId === scenario.lexicalId) : null,
  };
}

resetFastScriptureIndexForTests();
const results = [];
for (const scenario of scenarios) {
  const result = retrieveFastScriptureEvidence({
    question: scenario.question,
    conversation: scenario.conversation || null,
  });
  results.push({
    id: scenario.id,
    question: scenario.question,
    status: result.status,
    retrieved: result.passages.map((passage) => passage.reference),
    passages: result.passages,
    lexicalTerms: result.lexicalTerms,
    limitations: result.limitations,
    contextCoverage: result.diagnostics.testamentCoverage,
    retrievalMs: result.diagnostics.retrievalMs,
    indexLoadMs: result.diagnostics.indexLoadMs,
    estimatedEvidenceTokens: result.diagnostics.estimatedEvidenceTokens,
    assessment: evaluate(result, scenario),
  });
}

const summary = {
  schemaVersion: "emet-fast-scripture-retrieval-evaluation@1",
  createdAt: new Date().toISOString(),
  paidAiCalls: 0,
  results,
  aggregate: {
    medianWarmRetrievalMs: (() => {
      const values = results.slice(1).map((result) => result.retrievalMs).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    })(),
    maxWarmRetrievalMs: Math.max(...results.slice(1).map((result) => result.retrievalMs)),
    averageCoveragePercent: Math.round(results.reduce((sum, result) => sum + result.assessment.coveragePercent, 0) / results.length),
    sufficientByIndependentMaterialCoverage: results.filter((result) => result.assessment.coveragePercent === 100 && result.assessment.lexicalPass !== false).length,
  },
};

const outputDir = path.join(process.cwd(), ".private", "emet-fast-retrieval-audits");
await fs.mkdir(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `retrieval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(outputFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ outputFile, ...summary.aggregate, cases: results.map((result) => ({
  id: result.id,
  status: result.status,
  coverage: result.assessment.materialGroupsCovered,
  retrievalMs: result.retrievalMs,
  tokens: result.estimatedEvidenceTokens,
  retrieved: result.retrieved,
  missing: result.assessment.missingMaterialEvidence,
  irrelevant: result.assessment.irrelevantPassages,
  lexicalPass: result.assessment.lexicalPass,
  limitations: result.limitations,
})) }, null, 2));
