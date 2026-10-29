import "server-only";

import { isDeepStrictEqual } from "node:util";

import type { EmetAiAnswer, EmetAiEvidencePacket } from "./EmetAiContract";
import { buildEmetAiQuestionContract } from "./EmetAiQuestionContract";
import {
  materializeFoundationalIdentityContract,
  planFoundationalIdentityContract,
} from "./simple/EmetAiFoundationalIdentityContract";
import { retrieveLockedScriptureReferences } from "./simple/EmetAiFastScriptureRetrieval";
import {
  EMET_AI_SIMPLE_ANSWER_SCHEMA,
  composeIdentityContractAnswer,
  validateEmetAiSimpleAnswer,
  type EmetAiSimpleDraft,
} from "./simple/EmetAiSimpleContract";

const normalizedQuestion = (value: string) => value.normalize("NFKC").trim()
  .replace(/\s+/g, " ").toLocaleLowerCase("en-US");

/** Re-establish identity authority at persistence and delivery boundaries.
 * The adapted answer no longer carries the simple draft's authority metadata.
 * Match its exact claims to the current server registry instead of treating
 * cached IDs, interpretation definitions, or Scripture text as authority.
 */
export function isEmetAiCachedAnswerAuthorityVerified({
  packet,
  answer,
  question = packet.question,
}: {
  packet: EmetAiEvidencePacket;
  answer: EmetAiAnswer;
  question?: string;
}): boolean {
  try {
    if (normalizedQuestion(question) !== normalizedQuestion(packet.question)) return false;
    const plan = planFoundationalIdentityContract(buildEmetAiQuestionContract({ question }));
    if (!plan) return !packet.foundationalIdentityContract;
    if (answer.status !== "complete" || !packet.foundationalIdentityContract) return false;

    const locked = retrieveLockedScriptureReferences({ references: plan.requiredReferences, includeContext: false });
    const lockedText = new Map(locked.passages.map((item) => [item.reference, item.text]));
    for (const reference of plan.requiredReferences) {
      const items = packet.evidence.filter((item) => item.reference === reference);
      if (!lockedText.has(reference) || !items.length || items.some((item) =>
        item.kind !== "scripture" || item.text !== lockedText.get(reference)
      )) return false;
    }

    const contract = materializeFoundationalIdentityContract({ plan, evidence: packet.evidence });
    if (!contract || !isDeepStrictEqual(contract, packet.foundationalIdentityContract)) return false;
    const authorities = [...contract.propositions, ...contract.interpretations];
    const referencesFor = (ids: string[]) => ids.map((id) => {
      const item = packet.evidence.find((item) => item.id === id && item.kind === "scripture");
      if (!item?.reference) throw new Error("Missing cached claim evidence");
      return item.reference;
    });
    const claims = answer.claims.map((claim): EmetAiSimpleDraft["claims"][number] => {
      const authority = authorities.find((item) => item.text === claim.text);
      if (!authority) throw new Error("Unapproved cached claim");
      const references = referencesFor(claim.evidenceIds);
      return {
        text: claim.text,
        support: claim.support,
        answerBearing: contract.answerRequirements.some((item) => item.authorityId === authority.id),
        evidenceLevel: authority.evidenceLevel,
        contractInterpretationId: authority.id,
        references,
        excerpts: references.map((reference) => ({
          reference,
          text: lockedText.get(reference) || "",
          evidenceKind: "scripture",
          verbatim: true,
        })),
      };
    });
    if (contract.answerRequirements.some((requirement) =>
      !claims.some((claim) => claim.contractInterpretationId === requirement.authorityId)
    )) return false;
    const publicReferences = new Set(claims.flatMap((claim) => claim.references));
    if (answer.citations.length !== publicReferences.size || answer.citations.some((citation) => {
      const evidence = packet.evidence.find((item) => item.id === citation.evidenceId);
      return !citation.reference || !publicReferences.has(citation.reference) ||
        evidence?.kind !== "scripture" || evidence.reference !== citation.reference;
    }) || new Set(answer.citations.map((item) => item.reference)).size !== publicReferences.size) return false;

    // Do not use cached polarity to authorize an added yes/no assertion.
    // Older records needing a model-only prefix cannot establish it from the
    // retained approved statements and must miss rather than be rewritten.
    const constructed = composeIdentityContractAnswer({ status: "complete", conclusion: "not-applicable", claims });
    if (answer.answer !== constructed) return false;
    const opening = constructed.match(/^(yes|no)\b/i)?.[1]?.toLocaleLowerCase("en-US");
    const conclusion = opening === "yes" ? "yes" : opening === "no" ? "no" : "not-applicable";
    const polarity = conclusion === "yes" ? "affirms" : conclusion === "no" ? "denies" : "qualifies";
    if (answer.claims.some((claim) => claim.polarity !== polarity)) return false;
    const draft: EmetAiSimpleDraft = {
      schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
      status: answer.status,
      conclusion,
      conclusionSupport: answer.conclusionSupport,
      answer: answer.answer,
      references: answer.citations.map((item) => item.reference || ""),
      claims,
      componentChecks: answer.componentChecks.map((check) => ({
        componentId: check.componentId,
        support: check.support,
        explanation: check.explanation,
        references: referencesFor(check.evidenceIds),
      })),
      lexicalAnalyses: [],
      limitations: answer.limitations,
    };
    const validation = validateEmetAiSimpleAnswer({ packet: { ...packet, foundationalIdentityContract: contract }, draft });
    return validation.ok && validation.value.answer === answer.answer;
  } catch {
    // Old, malformed, or incomplete records are cache misses, never authority.
    return false;
  }
}
