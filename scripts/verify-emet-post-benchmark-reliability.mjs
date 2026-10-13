import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  parseEmetAiAnswer,
  validateEmetAiAnswer,
} from "../app/lib/emet/EmetAiContract.ts";
import { normalizeEmetAiMechanicalAnswerText } from "../app/lib/emet/EmetAiAnswerNormalization.ts";

const auditDirectory = path.join(process.cwd(), ".private", "emet-live-audits");
const artifacts = [
  "phase3-2026-10-12T12-48-12-303Z.json",
  "phase3-2026-10-12T12-55-28-258Z.json",
  "phase3-2026-10-12T13-26-41-247Z.json",
].flatMap((name) =>
  JSON.parse(fs.readFileSync(path.join(auditDirectory, name), "utf8")).results,
);

function replay(question, draftName) {
  const result = artifacts.findLast((item) =>
    item.question === question && item.providerAudit?.[draftName]?.rawOutput
  );
  assert.ok(result, `Missing artifact for ${question}`);
  const raw = JSON.parse(result.providerAudit[draftName].rawOutput);
  raw.answer = normalizeEmetAiMechanicalAnswerText(
    raw.answer,
    result.verifiedEvidencePacket.evidence,
  );
  const answer = parseEmetAiAnswer(raw);
  assert.ok(answer, `${question}: normalized draft must parse`);
  return validateEmetAiAnswer(result.verifiedEvidencePacket, answer);
}

const echad = replay(
  "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean there?",
  "answerDraft",
);
assert.equal(echad.ok, true, echad.ok ? "" : echad.errors.join(" | "));

const righteousness = replay(
  "Romans 3:10 calls none righteous, but Genesis 6:9 and Luke 1:6 call people righteous. Examine the Hebrew and Greek terms and explain whether these passages conflict.",
  "answerDraft",
);
assert.equal(
  righteousness.ok,
  true,
  righteousness.ok ? "" : righteousness.errors.join(" | "),
);

const acts = replay(
  "What was the historical setting of the decree in Acts 15?",
  "repairDraft",
);
assert.equal(acts.ok, true, acts.ok ? "" : acts.errors.join(" | "));

const jeremiahHebrews = replay(
  "How does Jeremiah 31 connect to Hebrews 8?",
  "answerDraft",
);
assert.equal(
  jeremiahHebrews.ok,
  true,
  jeremiahHebrews.ok ? "" : jeremiahHebrews.errors.join(" | "),
);

const sabbath = replay(
  "Does Scripture require believers to keep the seventh-day Sabbath? Present the strongest evidence for and against.",
  "repairDraft",
);
assert.equal(sabbath.ok, false);
assert.ok(sabbath.errors.some((error) =>
  /modern-audience or covenant-code restatement test/i.test(error)
));

assert.equal(
  normalizeEmetAiMechanicalAnswerText("The verified lexical meaning in the packet is one."),
  "The verified lexical meaning is one.",
);
assert.equal(
  normalizeEmetAiMechanicalAnswerText("The passages provided establish the point."),
  "The cited passages establish the point.",
);

const visibleEvidence = [
  { id: "scripture:web:19723", kind: "scripture", reference: "Jeremiah 31:31" },
  { id: "scripture:web:30097", kind: "scripture", reference: "Hebrews 8:8" },
  { id: "lexical:hebrew:1", kind: "lexical", reference: "Jeremiah 31:31" },
];
assert.equal(
  normalizeEmetAiMechanicalAnswerText(
    "The covenant is named here [scripture:web:19723].",
    visibleEvidence,
  ),
  "The covenant is named here (Jeremiah 31:31).",
);
assert.equal(
  normalizeEmetAiMechanicalAnswerText(
    "The texts connect [scripture:web:19723, scripture:web:30097] and repeat [scripture:web:19723].",
    visibleEvidence,
  ),
  "The texts connect (Jeremiah 31:31; Hebrews 8:8) and repeat (Jeremiah 31:31).",
);
assert.equal(
  normalizeEmetAiMechanicalAnswerText(
    "Internal notes add nothing [lexical:hebrew:1, scripture:web:999999].",
    visibleEvidence,
  ),
  "Internal notes add nothing.",
);

console.log("EMET post-benchmark reliability replay passed.");
console.log("- Mechanical internal terminology no longer discards the echad or righteousness answers.");
console.log("- Chapter-level Acts 15 context no longer requires independent prose for every retrieved verse.");
console.log("- The substantive Sabbath continuity-policy rejection remains fail closed.");
