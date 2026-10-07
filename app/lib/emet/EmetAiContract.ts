export const EMET_AI_EVIDENCE_SCHEMA = "emet-ai-evidence@4" as const;
export const EMET_AI_ANSWER_SCHEMA = "emet-ai-answer@4" as const;
export const EMET_AI_PROMPT_VERSION = "scripture-first@12" as const;

export type EmetAiCorpus = "hebrew" | "lxx" | "greek-nt" | "translation";
export type EmetAiScopeType = "word" | "verse" | "passage" | "topic";
export type EmetAiIdentityGate =
  | "verified"
  | "not-applicable"
  | "ambiguous"
  | "unresolved";

export type EmetAiReasoningMode =
  | "simple"
  | "doctrinal-claim"
  | "apparent-contradiction";

export type EmetAiClaimSupport =
  | "explicit-statement"
  | "strong-implication"
  | "theological-synthesis"
  | "possible-interpretation"
  | "does-not-establish";

export type EmetAiReasoningCategory =
  | "identity"
  | "authority"
  | "nature"
  | "relationship"
  | "practice"
  | "duration"
  | "command"
  | "covenant"
  | "covenant-participants"
  | "priesthood"
  | "mediator"
  | "sanctuary"
  | "sacrifice"
  | "promise"
  | "timing"
  | "prophecy"
  | "chronology"
  | "event"
  | "application"
  | "other";

export type EmetAiPropositionPolarity =
  | "affirms"
  | "denies"
  | "qualifies";

export type EmetAiTiming =
  | "not-applicable"
  | "promised"
  | "inaugurated"
  | "presently-operating"
  | "transitioning"
  | "fulfilled"
  | "awaiting-full-realization"
  | "uncertain";

export type EmetAiEstablishedProposition = {
  id: string;
  text: string;
  support: EmetAiClaimSupport;
  category: EmetAiReasoningCategory;
  polarity: EmetAiPropositionPolarity;
  scope: string;
  timing: EmetAiTiming;
  evidenceIds: string[];
};

export type EmetAiEvidenceItem = {
  id: string;
  kind:
    | "scripture"
    | "lexical"
    | "morphology"
    | "rendering"
    | "relationship"
    | "event"
    | "theme";
  corpus: EmetAiCorpus;
  text: string;
  reference?: string;
  entityId?: string;
  lexicalId?: string;
  provenance: {
    authority: string;
    sourceId?: string;
    checksum?: string;
    retrieval?: {
      method:
        | "explicit-reference"
        | "reader-context"
        | "exact-source-phrase"
        | "semantic-plan"
        | "literal-text-match"
        | "governing-scripture";
      role:
        | "direct"
        | "foundation"
        | "later-witness"
        | "qualifying"
        | "contrast"
        | "context";
      reason: string;
      score: number;
    };
  };
};

export type EmetAiEvidencePacket = {
  schemaVersion: typeof EMET_AI_EVIDENCE_SCHEMA;
  question: string;
  reasoning: {
    mode: EmetAiReasoningMode;
    proposition: string;
    requiresScopeAnalysis: boolean;
    requiresTimeline: boolean;
    components: Array<{
      id: string;
      proposition: string;
      category: EmetAiReasoningCategory;
    }>;
    establishedPropositions: EmetAiEstablishedProposition[];
  };
  scope: {
    type: EmetAiScopeType;
    references: string[];
    entityIds: string[];
  };
  identity: {
    gate: EmetAiIdentityGate;
    canonicalEntityId?: string;
    corpus?: Exclude<EmetAiCorpus, "translation">;
    lexicalId?: string;
    lemma?: string;
    morphology?: string;
  };
  evidence: EmetAiEvidenceItem[];
  provenance: {
    evidenceVersion: string;
    builtAt: string;
  };
};

export type EmetAiClaim = {
  id: string;
  text: string;
  support: EmetAiClaimSupport;
  category: EmetAiReasoningCategory;
  polarity: EmetAiPropositionPolarity;
  scope: string;
  timing: EmetAiTiming;
  evidenceIds: string[];
};

export type EmetAiContinuityCheck = {
  propositionId: string;
  verdict: "preserved" | "narrowed" | "reconciled" | "unresolved-conflict";
  explanation: string;
  evidenceIds: string[];
};

export type EmetAiComponentCheck = {
  componentId: string;
  support: EmetAiClaimSupport;
  explanation: string;
  evidenceIds: string[];
};

export type EmetAiAnswer = {
  schemaVersion: typeof EMET_AI_ANSWER_SCHEMA;
  status: "complete" | "insufficient-evidence";
  answer: string;
  conclusionSupport: EmetAiClaimSupport;
  componentChecks: EmetAiComponentCheck[];
  claims: EmetAiClaim[];
  continuityChecks: EmetAiContinuityCheck[];
  citations: Array<{
    evidenceId: string;
    reference?: string;
  }>;
  limitations: string[];
};

export type EmetAiValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const claimSupports = new Set<EmetAiClaimSupport>([
  "explicit-statement",
  "strong-implication",
  "theological-synthesis",
  "possible-interpretation",
  "does-not-establish",
]);
const reasoningCategories = new Set<EmetAiReasoningCategory>([
  "identity", "authority", "nature", "relationship", "practice", "duration",
  "command", "covenant", "covenant-participants", "priesthood", "mediator",
  "sanctuary", "sacrifice", "promise", "timing", "prophecy", "chronology",
  "event", "application", "other",
]);
const propositionPolarities = new Set<EmetAiPropositionPolarity>([
  "affirms", "denies", "qualifies",
]);
const timings = new Set<EmetAiTiming>([
  "not-applicable", "promised", "inaugurated", "presently-operating",
  "transitioning", "fulfilled", "awaiting-full-realization", "uncertain",
]);
const continuityVerdicts = new Set<EmetAiContinuityCheck["verdict"]>([
  "preserved", "narrowed", "reconciled", "unresolved-conflict",
]);

const supportRank: Record<EmetAiClaimSupport, number> = {
  "does-not-establish": 0,
  "possible-interpretation": 1,
  "theological-synthesis": 2,
  "strong-implication": 3,
  "explicit-statement": 4,
};

function normalizedScope(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueNonEmpty(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size ===
    values.length;
}

export function validateEmetAiEvidencePacket(
  packet: EmetAiEvidencePacket,
): EmetAiValidationResult<EmetAiEvidencePacket> {
  const errors: string[] = [];

  if (packet.schemaVersion !== EMET_AI_EVIDENCE_SCHEMA) {
    errors.push("Unsupported EMET evidence schema.");
  }

  if (!clean(packet.question)) {
    errors.push("The question is required.");
  }

  if (!clean(packet.reasoning?.proposition)) {
    errors.push("The proposition being tested is required.");
  }

  if (
    !["simple", "doctrinal-claim", "apparent-contradiction"].includes(
      packet.reasoning?.mode,
    )
  ) {
    errors.push("The reasoning mode is invalid.");
  }

  const componentIds = packet.reasoning?.components?.map((item) => clean(item.id)) || [];
  if (
    !Array.isArray(packet.reasoning?.components) ||
    componentIds.some((id) => !id) ||
    !uniqueNonEmpty(componentIds) ||
    packet.reasoning.components.some((item) => !clean(item.proposition))
  ) {
    errors.push("Reasoning components must be identified and non-empty.");
  }

  if (
    typeof packet.reasoning?.requiresScopeAnalysis !== "boolean" ||
    typeof packet.reasoning?.requiresTimeline !== "boolean"
  ) {
    errors.push("Reasoning scope and timeline requirements must be explicit.");
  }

  if (
    packet.reasoning.components.some(
      (item) => !reasoningCategories.has(item.category),
    )
  ) {
    errors.push("A reasoning component uses an invalid category.");
  }

  const establishedIds = packet.reasoning?.establishedPropositions?.map(
    (item) => clean(item.id),
  ) || [];
  if (
    !Array.isArray(packet.reasoning?.establishedPropositions) ||
    establishedIds.some((id) => !id) ||
    !uniqueNonEmpty(establishedIds)
  ) {
    errors.push("Established propositions must have unique non-empty IDs.");
  } else {
    const availableEvidenceIds = new Set(packet.evidence.map((item) => item.id));
    for (const proposition of packet.reasoning.establishedPropositions) {
      if (
        !clean(proposition.text) ||
        !claimSupports.has(proposition.support) ||
        !reasoningCategories.has(proposition.category) ||
        !propositionPolarities.has(proposition.polarity) ||
        !clean(proposition.scope) ||
        !timings.has(proposition.timing) ||
        !proposition.evidenceIds.length ||
        proposition.evidenceIds.some((id) => !availableEvidenceIds.has(id))
      ) {
        errors.push(`Established proposition ${proposition.id || "<missing>"} is not re-established by current evidence.`);
      }
      if (
        proposition.support !== "explicit-statement" &&
        proposition.support !== "strong-implication"
      ) {
        errors.push(`Established proposition ${proposition.id} is too inferential to constrain later answers.`);
      }
    }
  }

  if (packet.scope.type === "word") {
    if (packet.identity.gate !== "verified") {
      errors.push(
        "Word questions require one verified canonical lexical identity.",
      );
    }

    if (
      !clean(packet.identity.canonicalEntityId) ||
      !clean(packet.identity.lexicalId) ||
      !packet.identity.corpus
    ) {
      errors.push(
        "A verified word identity requires its entity, lexical ID, and corpus.",
      );
    }

    if (
      packet.identity.canonicalEntityId &&
      !packet.scope.entityIds.includes(packet.identity.canonicalEntityId)
    ) {
      errors.push("The canonical lexical entity is absent from the scope.");
    }
  }

  if (packet.scope.type !== "word" && packet.identity.gate === "verified") {
    if (!clean(packet.identity.canonicalEntityId)) {
      errors.push("A verified identity must include its canonical entity ID.");
    }
  }

  if (packet.evidence.length === 0) {
    errors.push("No evidence is available for generation.");
  }

  const evidenceIds = packet.evidence.map((item) => clean(item.id));
  if (evidenceIds.some((id) => !id) || !uniqueNonEmpty(evidenceIds)) {
    errors.push("Evidence IDs must be non-empty and unique.");
  }

  for (const item of packet.evidence) {
    if (!clean(item.text)) {
      errors.push(`Evidence ${item.id || "<missing>"} has no content.`);
    }

    if (!clean(item.provenance?.authority)) {
      errors.push(`Evidence ${item.id || "<missing>"} has no authority.`);
    }

    if (item.provenance.retrieval) {
      if (!clean(item.provenance.retrieval.reason)) {
        errors.push(`Evidence ${item.id} has no retrieval reason.`);
      }
      if (
        !Number.isFinite(item.provenance.retrieval.score) ||
        item.provenance.retrieval.score < 0 ||
        item.provenance.retrieval.score > 100
      ) {
        errors.push(`Evidence ${item.id} has an invalid retrieval score.`);
      }
    }

    if (
      item.entityId &&
      !packet.scope.entityIds.includes(item.entityId)
    ) {
      errors.push(`Evidence ${item.id} uses an entity outside the scope.`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: packet };
}

export function validateEmetAiAnswer(
  packet: EmetAiEvidencePacket,
  answer: EmetAiAnswer,
): EmetAiValidationResult<EmetAiAnswer> {
  const errors: string[] = [];
  const packetValidation = validateEmetAiEvidencePacket(packet);

  if (!packetValidation.ok) {
    errors.push(...packetValidation.errors);
  }

  if (answer.schemaVersion !== EMET_AI_ANSWER_SCHEMA) {
    errors.push("Unsupported EMET answer schema.");
  }

  if (!clean(answer.answer)) {
    errors.push("The answer text is required.");
  }

  if (!claimSupports.has(answer.conclusionSupport)) {
    errors.push("The full proposition requires a valid support classification.");
  }

  const allowedEvidence = new Map(
    packet.evidence.map((item) => [item.id, item] as const),
  );
  const citedEvidenceIds = new Set<string>();

  for (const citation of answer.citations) {
    const item = allowedEvidence.get(citation.evidenceId);
    if (!item) {
      errors.push(`Citation ${citation.evidenceId} is not in the packet.`);
      continue;
    }

    if (citation.reference && citation.reference !== item.reference) {
      errors.push(
        `Citation ${citation.evidenceId} changes its supplied reference.`,
      );
    }

    citedEvidenceIds.add(citation.evidenceId);
  }

  if (answer.status === "complete") {
    if (answer.claims.length === 0) {
      errors.push("A complete answer requires at least one supported claim.");
    }

    if (answer.citations.length === 0) {
      errors.push("A complete answer requires evidence citations.");
    }

    const components = new Map(
      packet.reasoning.components.map((item) => [item.id, item]),
    );
    const componentCheckIds = answer.componentChecks.map(
      (item) => item.componentId,
    );
    if (
      componentCheckIds.some((id) => !components.has(id)) ||
      new Set(componentCheckIds).size !== componentCheckIds.length ||
      components.size !== componentCheckIds.length
    ) {
      errors.push("Every proposition component requires exactly one component check.");
    }

    for (const check of answer.componentChecks) {
      if (
        !claimSupports.has(check.support) ||
        !clean(check.explanation) ||
        !check.evidenceIds.length ||
        check.evidenceIds.some((id) => !allowedEvidence.has(id))
      ) {
        errors.push(`Component check ${check.componentId || "<missing>"} is invalid or unsupported.`);
      }
    }

    if (answer.componentChecks.length) {
      const weakestComponent = Math.min(
        ...answer.componentChecks.map((item) => supportRank[item.support]),
      );
      if (supportRank[answer.conclusionSupport] > weakestComponent) {
        errors.push(
          "The full proposition cannot receive stronger support than its weakest material component.",
        );
      }
    }

    const claimIds = answer.claims.map((claim) => clean(claim.id));
    if (claimIds.some((id) => !id) || !uniqueNonEmpty(claimIds)) {
      errors.push("Answer claims require unique non-empty proposition IDs.");
    }

    for (const claim of answer.claims) {
      if (!clean(claim.text)) {
        errors.push("Every claim must contain text.");
      }

      if (!claimSupports.has(claim.support)) {
        errors.push("Every claim requires a valid support classification.");
      }

      if (
        !reasoningCategories.has(claim.category) ||
        !propositionPolarities.has(claim.polarity) ||
        !clean(claim.scope) ||
        !timings.has(claim.timing)
      ) {
        errors.push(`Claim ${claim.id || "<missing>"} has invalid scope, category, polarity, or timing.`);
      }

      if (claim.evidenceIds.length === 0) {
        errors.push("Every complete-answer claim requires evidence.");
      }

      for (const evidenceId of claim.evidenceIds) {
        if (!allowedEvidence.has(evidenceId)) {
          errors.push(`Claim cites unavailable evidence ${evidenceId}.`);
        } else if (!citedEvidenceIds.has(evidenceId)) {
          errors.push(`Claim evidence ${evidenceId} is missing from citations.`);
        }
      }
    }

    const established = new Map(
      packet.reasoning.establishedPropositions.map((item) => [item.id, item]),
    );
    const continuityIds = answer.continuityChecks.map((item) => item.propositionId);
    if (
      continuityIds.some((id) => !established.has(id)) ||
      new Set(continuityIds).size !== continuityIds.length ||
      established.size !== continuityIds.length
    ) {
      errors.push("Every established proposition requires exactly one continuity check.");
    }

    for (const check of answer.continuityChecks) {
      if (
        !continuityVerdicts.has(check.verdict) ||
        !clean(check.explanation) ||
        !check.evidenceIds.length ||
        check.evidenceIds.some((id) => !allowedEvidence.has(id))
      ) {
        errors.push(`Continuity check ${check.propositionId || "<missing>"} is invalid or unsupported.`);
      }
      if (check.verdict === "unresolved-conflict") {
        errors.push(`Established proposition ${check.propositionId} has an unresolved conflict.`);
      }
    }

    for (const claim of answer.claims) {
      for (const proposition of established.values()) {
        const sameDomain =
          claim.category === proposition.category &&
          normalizedScope(claim.scope) === normalizedScope(proposition.scope);
        const opposite =
          (claim.polarity === "affirms" && proposition.polarity === "denies") ||
          (claim.polarity === "denies" && proposition.polarity === "affirms");
        if (!sameDomain || !opposite) continue;
        const check = answer.continuityChecks.find(
          (item) => item.propositionId === proposition.id,
        );
        if (!check || check.verdict !== "reconciled") {
          errors.push(`Claim ${claim.id} contradicts established proposition ${proposition.id} without reconciliation.`);
        }
        if (
          proposition.support === "explicit-statement" &&
          claim.support !== "explicit-statement"
        ) {
          errors.push(`Claim ${claim.id} uses lower-level inference against explicit proposition ${proposition.id}.`);
        }
      }
    }

    if (packet.reasoning.mode !== "simple") {
      const retrievalRoles = new Set(
        packet.evidence.map((item) => item.provenance.retrieval?.role),
      );
      if (
        !retrievalRoles.has("qualifying") &&
        !retrievalRoles.has("contrast")
      ) {
        errors.push(
          "A disputed claim requires qualifying or contrasting Scripture evidence.",
        );
      }

      if (
        answer.conclusionSupport !== "explicit-statement" &&
        /^\s*(yes|no)\s*[.!,:;-]/i.test(answer.answer)
      ) {
        errors.push(
          "A disputed claim without an explicit statement cannot begin with a categorical yes or no.",
        );
      }
      if (
        answer.conclusionSupport !== "explicit-statement" &&
        /\b(?:scripture|the bible|these passages|these texts|the passages|the texts|the evidence)\s+(?:clearly\s+|directly\s+)?(?:proves?|proved)\b|\b(?:is|was|has been)\s+proven\b/i.test(
          answer.answer,
        )
      ) {
        errors.push(
          "A disputed claim cannot use proof language without an explicit statement.",
        );
      }
    }
  }

  if (
    packet.scope.type === "word" &&
    packet.identity.gate !== "verified" &&
    answer.status !== "insufficient-evidence"
  ) {
    errors.push("An uncertain word identity must fail closed.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: answer };
}

export function insufficientEmetAiAnswer(
  explanation: string,
  limitations: string[] = [],
): EmetAiAnswer {
  return {
    schemaVersion: EMET_AI_ANSWER_SCHEMA,
    status: "insufficient-evidence",
    answer: explanation,
    conclusionSupport: "does-not-establish",
    claims: [],
    componentChecks: [],
    continuityChecks: [],
    citations: [],
    limitations,
  };
}

export function parseEmetAiAnswer(value: unknown): EmetAiAnswer | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_ANSWER_SCHEMA ||
    (candidate.status !== "complete" &&
      candidate.status !== "insufficient-evidence") ||
    typeof candidate.answer !== "string" ||
    !claimSupports.has(candidate.conclusionSupport as EmetAiClaimSupport) ||
    !Array.isArray(candidate.claims) ||
    !Array.isArray(candidate.componentChecks) ||
    !Array.isArray(candidate.continuityChecks) ||
    !Array.isArray(candidate.citations) ||
    !Array.isArray(candidate.limitations)
  ) {
    return null;
  }

  const claims: EmetAiClaim[] = [];
  for (const value of candidate.claims) {
    if (!value || typeof value !== "object") return null;
    const claim = value as Record<string, unknown>;
    if (
      typeof claim.id !== "string" ||
      typeof claim.text !== "string" ||
      (claim.support !== "explicit-statement" &&
        claim.support !== "strong-implication" &&
        claim.support !== "theological-synthesis" &&
        claim.support !== "possible-interpretation" &&
        claim.support !== "does-not-establish") ||
      !reasoningCategories.has(claim.category as EmetAiReasoningCategory) ||
      !propositionPolarities.has(claim.polarity as EmetAiPropositionPolarity) ||
      typeof claim.scope !== "string" ||
      !timings.has(claim.timing as EmetAiTiming) ||
      !Array.isArray(claim.evidenceIds) ||
      claim.evidenceIds.some((id) => typeof id !== "string")
    ) {
      return null;
    }
    claims.push({
      id: claim.id as string,
      text: claim.text,
      support: claim.support,
      category: claim.category as EmetAiReasoningCategory,
      polarity: claim.polarity as EmetAiPropositionPolarity,
      scope: claim.scope as string,
      timing: claim.timing as EmetAiTiming,
      evidenceIds: claim.evidenceIds as string[],
    });
  }

  const componentChecks: EmetAiComponentCheck[] = [];
  for (const value of candidate.componentChecks) {
    if (!value || typeof value !== "object") return null;
    const check = value as Record<string, unknown>;
    if (
      typeof check.componentId !== "string" ||
      !claimSupports.has(check.support as EmetAiClaimSupport) ||
      typeof check.explanation !== "string" ||
      !Array.isArray(check.evidenceIds) ||
      check.evidenceIds.some((id) => typeof id !== "string")
    ) return null;
    componentChecks.push({
      componentId: check.componentId,
      support: check.support as EmetAiClaimSupport,
      explanation: check.explanation,
      evidenceIds: check.evidenceIds as string[],
    });
  }

  const continuityChecks: EmetAiContinuityCheck[] = [];
  for (const value of candidate.continuityChecks) {
    if (!value || typeof value !== "object") return null;
    const check = value as Record<string, unknown>;
    if (
      typeof check.propositionId !== "string" ||
      !continuityVerdicts.has(check.verdict as EmetAiContinuityCheck["verdict"]) ||
      typeof check.explanation !== "string" ||
      !Array.isArray(check.evidenceIds) ||
      check.evidenceIds.some((id) => typeof id !== "string")
    ) return null;
    continuityChecks.push({
      propositionId: check.propositionId,
      verdict: check.verdict as EmetAiContinuityCheck["verdict"],
      explanation: check.explanation,
      evidenceIds: check.evidenceIds as string[],
    });
  }

  const citations: EmetAiAnswer["citations"] = [];
  for (const value of candidate.citations) {
    if (!value || typeof value !== "object") return null;
    const citation = value as Record<string, unknown>;
    if (
      typeof citation.evidenceId !== "string" ||
      (citation.reference !== undefined &&
        typeof citation.reference !== "string")
    ) {
      return null;
    }
    citations.push({
      evidenceId: citation.evidenceId,
      ...(clean(citation.reference)
        ? { reference: citation.reference as string }
        : {}),
    });
  }

  if (candidate.limitations.some((item) => typeof item !== "string")) {
    return null;
  }

  return {
    schemaVersion: EMET_AI_ANSWER_SCHEMA,
    status: candidate.status,
    answer: candidate.answer,
    conclusionSupport: candidate.conclusionSupport as EmetAiClaimSupport,
    componentChecks,
    claims,
    continuityChecks,
    citations,
    limitations: candidate.limitations as string[],
  };
}
