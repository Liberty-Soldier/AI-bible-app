import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import {
  materializeFoundationalIdentityContract,
  planFoundationalIdentityContract,
} from "../app/lib/emet/simple/EmetAiFoundationalIdentityContract.ts";
import {
  composeIdentityContractAnswer,
  validateEmetAiSimpleAnswer,
} from "../app/lib/emet/simple/EmetAiSimpleContract.ts";

const root = process.cwd();
const sourceArtifactPath = path.join(
  root, ".private", "reliability-recovery-phase2b",
  "final-live-acceptance-2026-10-28T19-57-18-422Z.json",
);
const sourceArtifact = JSON.parse(await fs.readFile(sourceArtifactPath, "utf8"));

function liveResult(id) {
  const item = sourceArtifact.results.find((entry) => entry.id === id);
  assert.ok(item?.result?.packet && item.result.generatedDraft, `Missing ${id} fidelity source.`);
  const packet = structuredClone(item.result.packet);
  const questionContract = buildEmetAiQuestionContract({ question: item.question });
  const plan = planFoundationalIdentityContract(questionContract);
  packet.foundationalIdentityContract = materializeFoundationalIdentityContract({ plan, evidence: packet.evidence });
  return { ...item, result: { ...item.result, packet } };
}

const sacred = liveResult("yahweh-yahshua");
const jesusGod = liveResult("jesus-god");

function claimFor(packet, authorityId, answerBearing = false) {
  const proposition = packet.foundationalIdentityContract.propositions.find((item) => item.id === authorityId);
  const interpretation = packet.foundationalIdentityContract.interpretations.find((item) => item.id === authorityId);
  const authority = proposition || interpretation;
  assert.ok(authority, `Missing authority ${authorityId}`);
  const references = authority.evidenceIds.map((id) => {
    const item = packet.evidence.find((evidence) => evidence.id === id);
    assert.ok(item?.reference, `Missing authority evidence ${id}`);
    return item.reference;
  });
  return {
    text: authority.text,
    support: proposition ? "explicit-statement" : "theological-synthesis",
    answerBearing,
    evidenceLevel: authority.evidenceLevel,
    contractInterpretationId: authority.id,
    references,
    excerpts: references.map((reference) => {
      const evidence = packet.evidence.find((item) => item.reference === reference);
      return { reference, text: evidence.text, evidenceKind: "scripture", verbatim: true };
    }),
  };
}

function draftFor(item, claims, conclusion) {
  const draft = {
    ...structuredClone(item.result.generatedDraft),
    status: "complete",
    conclusion,
    conclusionSupport: "theological-synthesis",
    claims,
    references: Array.from(new Set(claims.flatMap((claim) => claim.references))),
  };
  draft.answer = composeIdentityContractAnswer(draft);
  return draft;
}

function validate(packet, draft) {
  return validateEmetAiSimpleAnswer({ packet, draft: structuredClone(draft) });
}

const oldSacredValidation = validate(sacred.result.packet, sacred.result.generatedDraft);
assert.equal(oldSacredValidation.ok, false);

const sacredProjectClaim = claimFor(sacred.result.packet, "yahweh-is-the-father", true);
const sacredIdentityClaim = claimFor(sacred.result.packet, "yahshua-not-the-same-person-as-yahweh", true);
const correctedSacred = draftFor(sacred, [sacredProjectClaim, sacredIdentityClaim], "no");
const correctedSacredValidation = validate(sacred.result.packet, correctedSacred);
assert.equal(correctedSacredValidation.ok, true, correctedSacredValidation.errors?.join(" | "));
assert.match(correctedSacred.answer, /not the same person as Yahweh/i);
assert.doesNotMatch(correctedSacred.answer, /unity of nature/i);

const strongerPublicAnswer = structuredClone(correctedSacred);
strongerPublicAnswer.answer += " Yahshua and Yahweh therefore have unity of nature.";
const strongerPublicValidation = validate(sacred.result.packet, strongerPublicAnswer);
assert.equal(strongerPublicValidation.ok, false);
assert.ok(strongerPublicValidation.errors.some((error) => error.includes("not constructed")));

const fabricatedInterpretation = structuredClone(correctedSacred);
fabricatedInterpretation.claims.at(-1).contractInterpretationId = "unity-of-nature";
fabricatedInterpretation.answer = composeIdentityContractAnswer(fabricatedInterpretation);
const fabricatedValidation = validate(sacred.result.packet, fabricatedInterpretation);
assert.equal(fabricatedValidation.ok, false);
assert.ok(fabricatedValidation.errors.some((error) => error.includes("unavailable typed authority")));

const missingInterpretation = structuredClone(correctedSacred);
delete missingInterpretation.claims.at(-1).contractInterpretationId;
missingInterpretation.answer = composeIdentityContractAnswer(missingInterpretation);
const missingInterpretationValidation = validate(sacred.result.packet, missingInterpretation);
assert.equal(missingInterpretationValidation.ok, false);

const incompleteProjectEvidence = structuredClone(correctedSacred);
incompleteProjectEvidence.claims.at(-1).references = ["John 17:3", "John 20:17"];
incompleteProjectEvidence.claims.at(-1).excerpts = incompleteProjectEvidence.claims.at(-1).excerpts
  .filter((excerpt) => incompleteProjectEvidence.claims.at(-1).references.includes(excerpt.reference));
const incompleteProjectValidation = validate(sacred.result.packet, incompleteProjectEvidence);
assert.equal(incompleteProjectValidation.ok, false);
assert.ok(incompleteProjectValidation.errors.some((error) => error.includes("missing its registry evidence")));

const designationClaim = claimFor(jesusGod.result.packet, "scripture-applies-god-language-to-yahshua", true);
const distinctionClaim = claimFor(jesusGod.result.packet, "yahshua-personally-distinct-from-father", true);
const correctedJesusGod = draftFor(jesusGod, [designationClaim, distinctionClaim], "qualified");
const correctedJesusGodValidation = validate(jesusGod.result.packet, correctedJesusGod);
assert.equal(correctedJesusGodValidation.ok, true, correctedJesusGodValidation.errors?.join(" | "));
assert.match(correctedJesusGod.answer, /^Yes—/);
assert.match(correctedJesusGod.answer, /personally distinct/i);

const output = {
  schemaVersion: "emet-identity-output-fidelity-offline@2",
  createdAt: new Date().toISOString(),
  sourceArtifact: path.relative(root, sourceArtifactPath).replaceAll("\\", "/"),
  cases: {
    A_approved_project_synthesis: { accepted: correctedSacredValidation.ok, answer: correctedSacred.answer },
    B_unsupported_unity_of_nature: { accepted: strongerPublicValidation.ok, errors: strongerPublicValidation.errors },
    C_father_equals_yahweh_label: { evidenceLevel: sacredProjectClaim.evidenceLevel, wording: sacredProjectClaim.text },
    D_public_stronger_than_claims: { accepted: strongerPublicValidation.ok, errors: strongerPublicValidation.errors },
    E_valid_interpretation_id: { accepted: correctedSacredValidation.ok },
    F_invalid_interpretation_ids: {
      fabricatedAccepted: fabricatedValidation.ok,
      fabricatedErrors: fabricatedValidation.errors,
      missingAccepted: missingInterpretationValidation.ok,
      missingErrors: missingInterpretationValidation.errors,
      incompleteEvidenceAccepted: incompleteProjectValidation.ok,
      incompleteEvidenceErrors: incompleteProjectValidation.errors,
    },
    G_direct_and_contextual_without_project_id: {
      accepted: correctedJesusGodValidation.ok,
      levels: correctedJesusGod.claims.map((claim) => claim.evidenceLevel),
      ids: correctedJesusGod.claims.map((claim) => claim.contractInterpretationId),
    },
    H_jesus_god: { accepted: correctedJesusGodValidation.ok, answer: correctedJesusGod.answer },
    latest_live_failure: {
      accepted: oldSacredValidation.ok,
      rawOutput: sacred.result.generatedRawOutput,
      displayedAnswer: sacred.result.answer?.answer,
      errors: oldSacredValidation.errors,
    },
  },
};

const outputDirectory = path.join(root, ".private", "reliability-recovery-phase2c");
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "identity-output-fidelity-offline.json");
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...output.cases }, null, 2));
