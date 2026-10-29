import "server-only";

import {
  EMET_AI_EVIDENCE_SCHEMA,
  validateEmetAiAnswer,
  validateEmetAiEvidencePacket,
  type EmetAiEvidenceItem,
  type EmetAiEvidencePacket,
} from "../EmetAiContract";
import type { EmetConversationContext } from "../EmetAiConversation";
import { buildEmetAiQuestionContract } from "../EmetAiQuestionContract";
import { validateEmetAiSimpleAnswer, type EmetAiSimpleAnswer, type EmetAiSimpleDraft } from "./EmetAiSimpleContract";
import type { EmetAiSimpleProvider, EmetAiSimpleUsage } from "./EmetAiSimpleProvider";
import type {
  EmetAiFastCoverageDimension,
  EmetAiFastDiscoveryProvider,
} from "./EmetAiFastDiscovery";
import {
  retrieveFastScriptureEvidence,
  deterministicLexicalLookups,
  type FastScriptureLexicalTerm,
  type FastScripturePassage,
} from "./EmetAiFastScriptureRetrieval";
import {
  assembleFastTwoPathEvidence,
  type EmetAiEvidenceManifestEntry,
} from "./EmetAiFastEvidenceAssembler";
import { adaptFastEmetAnswer } from "./EmetAiFastAnswerAdapter";
import {
  materializeFoundationalIdentityContract,
  planFoundationalIdentityContract,
  type EmetAiFoundationalIdentityPlan,
} from "./EmetAiFoundationalIdentityContract";

export type EmetAiFastTwoPathResult = {
  status: "complete" | "insufficient-evidence";
  path: "direct" | "discovery";
  answer: EmetAiSimpleAnswer | null;
  generatedDraft: EmetAiSimpleDraft | null;
  generatedRawOutput: string;
  packet: EmetAiEvidencePacket | null;
  validationErrors: string[];
  modelCalls: 0 | 1 | 2;
  usage: EmetAiSimpleUsage;
  discovery: null | {
    references: Array<{
      reference: string;
      required: boolean;
      relevance: string;
      covers?: EmetAiFastCoverageDimension[];
    }>;
    requiredCoverage: EmetAiFastCoverageDimension[];
    limitations: string[];
    blockingIssues: string[];
    droppedOptionalReferences: string[];
    rawOutput: string;
    promptCharacters: number;
    outputCharacters: number;
  };
  initialCandidates: Array<{ reference: string; score: number; reasons: string[] }>;
  evidenceManifest: EmetAiEvidenceManifestEntry[];
  stages: {
    initialRetrievalMs: number;
    discoveryMs: number;
    lockedRetrievalMs: number;
    generationMs: number;
    verificationMs: number;
    totalMs: number;
  };
};

function sumUsage(...items: EmetAiSimpleUsage[]): EmetAiSimpleUsage {
  return items.reduce((sum, item) => ({
    inputTokens: sum.inputTokens + item.inputTokens,
    cachedInputTokens: sum.cachedInputTokens + item.cachedInputTokens,
    outputTokens: sum.outputTokens + item.outputTokens,
    reasoningTokens: sum.reasoningTokens + item.reasoningTokens,
    totalTokens: sum.totalTokens + item.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 });
}

function buildPacket({
  question,
  passages,
  lexicalTerms,
  contract,
  coveragePlan,
  identityPlan,
}: {
  question: string;
  passages: FastScripturePassage[];
  lexicalTerms: FastScriptureLexicalTerm[];
  contract: ReturnType<typeof buildEmetAiQuestionContract>;
  coveragePlan: EmetAiFastCoverageDimension[];
  identityPlan: EmetAiFoundationalIdentityPlan | null;
}) {
  const scriptureEvidence: EmetAiEvidenceItem[] = passages.map((passage, index) => ({
    id: `scripture:web:${index + 1}`,
    kind: "scripture",
    corpus: "translation",
    text: passage.text,
    reference: passage.reference,
    provenance: {
      authority: "locked-web-scripture-index",
      sourceId: "public/scripture/search/web.json",
      retrieval: {
        method: passage.explicit ? "explicit-reference" : "governing-scripture",
        role: passage.covers?.includes("foundation")
          ? "foundation"
          : passage.covers?.includes("apostolic-testimony") || passage.covers?.includes("final-canonical-testimony")
            ? "later-witness"
            : passage.reasons.some((reason) => reason.startsWith("context:")) ? "context" : "direct",
        reason: passage.reasons.join("; ") || "Verified fast retrieval.",
        score: Math.max(0, Math.min(100, passage.score)),
      },
    },
  }));
  const lexicalEvidence: EmetAiEvidenceItem[] = lexicalTerms.map((term, index) => ({
    id: `lexical:${term.corpus}:${index + 1}`,
    kind: "lexical",
    corpus: term.corpus,
    text: term.evidenceMode === "verse-sequence"
      ? `Verified ${term.corpus} source token ${Number(term.position) + 1} in the complete ordered sequence for ${term.reference}: surface ${term.surfaceForm || term.lemma}; lemma ${term.lemma}; ${term.lexicalId}; transliteration ${term.transliteration}; meaning ${term.meaning}; morphology ${term.morphologySignature || "not supplied"}.`
      : `Verified ${term.corpus} source term in ${term.reference}: ${term.lemma} (${term.transliteration}) — ${term.meaning}${term.morphologySignature ? `; morphology ${term.morphologySignature}` : ""}.`,
    reference: term.reference,
    lexicalId: term.lexicalId,
    provenance: {
      authority: "locked-source-phrase-index",
      sourceId: term.lexicalId,
      retrieval: {
        method: "exact-source-phrase",
        role: "direct",
        reason: "Verified source-language identity at the requested reference.",
        score: 100,
      },
    },
  }));
  const evidence = [...scriptureEvidence, ...lexicalEvidence];
  const foundationalIdentityContract = materializeFoundationalIdentityContract({
    plan: identityPlan,
    evidence,
  });
  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question,
    responseDesign: contract.responseDesign,
    reasoning: {
      mode: contract.intent === "apparent-contradiction" ? "apparent-contradiction" : contract.commandApplicability ? "doctrinal-claim" : "simple",
      proposition: question,
      requiresScopeAnalysis: contract.commandApplicability,
      requiresTimeline: contract.temporalRelationship,
      commandApplicability: contract.commandApplicability,
      components: coveragePlan.map((dimension) => {
        const requestedPart = contract.subquestions.length
          ? dimension === "prophetic-testimony" || dimension === "foundation"
            ? contract.subquestions[0]
            : contract.subquestions[contract.subquestions.length - 1]
          : question;
        return {
        id: dimension,
        proposition: `Assess this requested proposition using the verified ${dimension.replace(/-/g, " ")}: ${requestedPart}`,
        category: dimension === "governing-instruction" || dimension === "messiah-teaching"
          ? "command"
          : dimension === "duration-conditions" || dimension === "timing-sequence"
            ? "duration"
            : dimension === "audience-scope" || dimension === "covenant-membership"
              ? "covenant-participants"
              : dimension === "foundation"
                ? "covenant"
                : "application",
        };
      }),
      establishedPropositions: [],
    },
    governingCoverage: coveragePlan.map((dimension) => ({
      componentId: dimension,
      evidenceIds: dimension === "source-language-context"
        ? lexicalEvidence.map((item) => item.id)
        : scriptureEvidence
            .filter((_, index) => passages[index].covers?.includes(dimension))
            .map((item) => item.id),
    })),
    scope: {
      type: "topic",
      references: scriptureEvidence.flatMap((item) => item.reference ? [item.reference] : []),
      entityIds: [],
    },
    identity: { gate: "not-applicable" },
    foundationalIdentityContract,
    evidence,
    provenance: {
      evidenceVersion: "fast-two-path-locked-evidence@1",
      builtAt: new Date().toISOString(),
    },
  };
  return validateEmetAiEvidencePacket(packet);
}

function buildFastCoveragePlan(
  contract: ReturnType<typeof buildEmetAiQuestionContract>,
  question: string,
) {
  const required = new Set<EmetAiFastCoverageDimension>();
  if (contract.requestedCoverage.passages.length) required.add("explicit-request");
  if (contract.requestedLanguages.length) required.add("source-language-context");
  if (contract.temporalRelationship) required.add("timing-sequence");
  if (contract.commandApplicability && !contract.requestedCoverage.passages.length) {
    const roleScoped = /\b(?:priest|king|servant|slave|parent|child|husband|wife|levite)\w*\b/i.test(question);
    const asksContinuity = /\b(?:modern|today|still|continue|forever|perpetual|remain|new covenant|christians?|believers?|followers?)\b/i.test(question);
    // The governing assignment is itself the foundation for a role-scoped
    // question. Requiring an additional generic label made direct governing
    // passages fail coverage before answer generation.
    if (!roleScoped) required.add("foundation");
    required.add("governing-instruction");
    required.add("audience-scope");
    if (!roleScoped || asksContinuity) required.add("duration-conditions");
    if (/\b(?:christians?|believers?|followers?|messiah|gentiles?)\b/i.test(question)) {
      required.add("covenant-membership");
      required.add("messiah-teaching");
      required.add("apostolic-testimony");
      required.add("final-canonical-testimony");
    }
    // Avoid turning ordinary command questions into automatic exemption inquiries.
    // The discovery model can still obtain audience or duration details when the
    // actual text or question needs them.
    if (roleScoped) {
      required.add("role-circumstance");
    }
  }
  const identitySubjects = [
    ["messiah", /\b(?:jesus|yeshua|yahshua|messiah|christ)\b/i],
    ["yahweh", /\b(?:yahweh|yhwh|the most high)\b/i],
    ["god", /\b(?:god|elohim)\b/i],
    ["father", /\b(?:the )?father\b/i],
    ["holy-spirit", /\b(?:holy spirit|spirit of god|ruach ha[ -]?kodesh)\b/i],
  ] as const;
  const namedIdentitySubjects = identitySubjects
    .filter(([, pattern]) => pattern.test(question))
    .map(([subject]) => subject);
  const asksIdentity =
    /\b(?:who|what)\s+(?:is|are)\b|\b(?:identity|identify|same person|same being|difference between)\b/i.test(question) ||
    /\bis\b[^?]{0,55}\b(?:god|elohim|yahweh|yhwh|father|messiah|christ)\b/i.test(question);
  if (
    !contract.commandApplicability &&
    !contract.requestedCoverage.passages.length &&
    asksIdentity &&
    namedIdentitySubjects.includes("messiah")
  ) {
    const relationalIdentityQuestion = contract.subquestions.length > 1 ||
      namedIdentitySubjects.includes("father") ||
      namedIdentitySubjects.includes("yahweh") ||
      /\b(?:same person|same being|difference between)\b/i.test(question);
    if (relationalIdentityQuestion) required.add("messiah-teaching");
    required.add("apostolic-testimony");
    if (
      namedIdentitySubjects.some((subject) => subject === "god" || subject === "yahweh") ||
      /\b(?:who|identity|nature)\b[^?]{0,80}\b(?:jesus|yeshua|yahshua|messiah|christ)\b|\b(?:jesus|yeshua|yahshua|messiah|christ)\b[^?]{0,80}\b(?:who|identity|nature)\b/i.test(question)
    ) {
      required.add("prophetic-testimony");
    }
  }
  return Array.from(required);
}

function failure({
  path,
  errors,
  calls,
  usage,
  discovery,
  stages,
  startedAt,
  initialCandidates,
  generatedDraft,
  generatedRawOutput,
  evidenceManifest = [],
  packet = null,
}: {
  path: "direct" | "discovery";
  errors: string[];
  calls: 0 | 1 | 2;
  usage: EmetAiSimpleUsage;
  discovery: EmetAiFastTwoPathResult["discovery"];
  stages: Omit<EmetAiFastTwoPathResult["stages"], "totalMs">;
  startedAt: number;
  initialCandidates: EmetAiFastTwoPathResult["initialCandidates"];
  generatedDraft?: EmetAiSimpleDraft | null;
  generatedRawOutput?: string;
  evidenceManifest?: EmetAiEvidenceManifestEntry[];
  packet?: EmetAiEvidencePacket | null;
}): EmetAiFastTwoPathResult {
  return {
    status: "insufficient-evidence", path, answer: null, packet,
    generatedDraft: generatedDraft || null,
    generatedRawOutput: generatedRawOutput || "",
    validationErrors: errors, modelCalls: calls, usage, discovery, initialCandidates, evidenceManifest,
    stages: { ...stages, totalMs: performance.now() - startedAt },
  };
}

export async function answerWithFastTwoPathEmet({
  question,
  answerProvider,
  discoveryProvider,
  conversation = null,
}: {
  question: string;
  answerProvider: EmetAiSimpleProvider;
  discoveryProvider: EmetAiFastDiscoveryProvider;
  conversation?: EmetConversationContext | null;
}): Promise<EmetAiFastTwoPathResult> {
  const startedAt = performance.now();
  const initial = retrieveFastScriptureEvidence({ question, conversation });
  const contract = buildEmetAiQuestionContract({ question, conversation });
  const identityPlan = planFoundationalIdentityContract(contract);
  const coveragePlan = buildFastCoveragePlan(contract, question);
  const missingInitialCoverage = coveragePlan.filter((dimension) =>
    dimension === "source-language-context"
      ? !initial.lexicalTerms.length
      : !initial.passages.some((passage) => passage.covers?.includes(dimension))
  );
  const initialCandidates = initial.passages.map(({ reference, score, reasons }) => ({ reference, score, reasons }));
  const commonStages = {
    initialRetrievalMs: initial.diagnostics.retrievalMs,
    discoveryMs: 0,
    lockedRetrievalMs: 0,
    generationMs: 0,
    verificationMs: 0,
  };
  let path: "direct" | "discovery" = "direct";
  let passages = initial.passages;
  let lexicalTerms = initial.lexicalTerms;
  let discovery: EmetAiFastTwoPathResult["discovery"] = null;
  let discoveryUsage = sumUsage();
  let discoveryDraft: Awaited<ReturnType<EmetAiFastDiscoveryProvider["discover"]>>["draft"] = null;

  if (initial.status === "insufficient" || missingInitialCoverage.length) {
    path = "discovery";
    const found = await discoveryProvider.discover({ question, conversation, candidates: initial.passages, coveragePlan });
    commonStages.discoveryMs = found.latencyMs;
    discoveryUsage = found.usage;
    if (!found.draft) {
      return failure({ path, errors: ["The evidence-discovery response was invalid."], calls: 1, usage: found.usage,
        discovery: null, stages: commonStages, startedAt, initialCandidates });
    }
    discoveryDraft = found.draft;
    discovery = {
      references: found.draft.references,
      requiredCoverage: coveragePlan,
      limitations: found.draft.limitations,
      blockingIssues: found.draft.blockingIssues,
      droppedOptionalReferences: [],
      rawOutput: found.rawOutput,
      promptCharacters: found.estimatedInputCharacters || 0,
      outputCharacters: found.rawOutput.length,
    };
  }

  const assembled = assembleFastTwoPathEvidence({
    contract,
    initialPassages: initial.passages,
    initialLexicalTerms: initial.lexicalTerms,
    discovery: discoveryDraft,
    contractReferences: identityPlan?.requiredReferences || [],
    deterministicLexicalLookups: deterministicLexicalLookups({ question, contract }),
  });
  passages = assembled.passages;
  lexicalTerms = assembled.lexicalTerms;
  commonStages.lockedRetrievalMs = assembled.retrievalMs;
  if (discovery) {
    discovery.droppedOptionalReferences = assembled.manifest
      .filter((entry) => entry.origins.includes("discovery") && entry.disposition !== "retained" && entry.priority >= 3)
      .map((entry) => entry.reference);
  }
  if (assembled.errors.length || !passages.length) {
    return failure({
      path,
      errors: assembled.errors.length ? assembled.errors : ["No verified material Scripture remained after evidence assembly."],
      calls: path === "direct" ? 0 : 1,
      usage: discoveryUsage,
      discovery,
      stages: commonStages,
      startedAt,
      initialCandidates,
      evidenceManifest: assembled.manifest,
    });
  }

  const missingAssembledCoverage = coveragePlan.filter((dimension) =>
    dimension === "source-language-context"
      ? !lexicalTerms.length
      : !passages.some((passage) => passage.covers?.includes(dimension))
  );
  if (missingAssembledCoverage.length) {
    return failure({
      path,
      errors: [`Verified evidence is missing required coverage: ${missingAssembledCoverage.join(", ")}.`],
      calls: path === "direct" ? 0 : 1,
      usage: discoveryUsage,
      discovery,
      stages: commonStages,
      startedAt,
      initialCandidates,
      evidenceManifest: assembled.manifest,
    });
  }

  const packetValidation = buildPacket({ question, passages, lexicalTerms, contract, coveragePlan, identityPlan });
  if (!packetValidation.ok) {
    return failure({ path, errors: packetValidation.errors, calls: path === "direct" ? 0 : 1,
      usage: discoveryUsage, discovery, stages: commonStages, startedAt, initialCandidates,
      evidenceManifest: assembled.manifest });
  }
  const generated = await answerProvider.generate({ question, candidatePacket: packetValidation.value, conversation });
  commonStages.generationMs = generated.latencyMs;
  const verificationStartedAt = performance.now();
  if (!generated.draft) {
    commonStages.verificationMs = performance.now() - verificationStartedAt;
    return failure({ path, errors: ["The answer response was invalid."], calls: path === "direct" ? 1 : 2,
      usage: sumUsage(discoveryUsage, generated.usage), discovery, stages: commonStages, startedAt, initialCandidates,
      generatedRawOutput: generated.rawOutput, evidenceManifest: assembled.manifest, packet: packetValidation.value });
  }
  // Validation may make deterministic presentation repairs. Preserve the parsed
  // model draft so live-evaluation artifacts can audit model output separately
  // from the reader-facing answer.
  const generatedDraft = structuredClone(generated.draft);
  const validationDraft = structuredClone(generated.draft);
  const answerValidation = validateEmetAiSimpleAnswer({ packet: packetValidation.value, draft: validationDraft });
  const fullAnswerValidation = answerValidation.ok
    ? validateEmetAiAnswer(
        packetValidation.value,
        adaptFastEmetAnswer({ answer: answerValidation.value, packet: packetValidation.value }),
      )
    : null;
  commonStages.verificationMs = performance.now() - verificationStartedAt;
  if (!answerValidation.ok || (fullAnswerValidation && !fullAnswerValidation.ok)) {
    const validationErrors = !answerValidation.ok
      ? answerValidation.errors
      : fullAnswerValidation && !fullAnswerValidation.ok ? fullAnswerValidation.errors : [];
    return failure({ path, errors: validationErrors, calls: path === "direct" ? 1 : 2,
      usage: sumUsage(discoveryUsage, generated.usage), discovery, stages: commonStages, startedAt, initialCandidates,
      generatedDraft, generatedRawOutput: generated.rawOutput,
      evidenceManifest: assembled.manifest, packet: packetValidation.value });
  }
  return {
    status: answerValidation.value.status,
    path,
    answer: answerValidation.value,
    generatedDraft,
    generatedRawOutput: generated.rawOutput,
    packet: packetValidation.value,
    validationErrors: [],
    modelCalls: path === "direct" ? 1 : 2,
    usage: sumUsage(discoveryUsage, generated.usage),
    discovery,
    initialCandidates,
    evidenceManifest: assembled.manifest,
    stages: { ...commonStages, totalMs: performance.now() - startedAt },
  };
}
