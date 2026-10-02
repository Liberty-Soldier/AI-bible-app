export const EMET_AI_EVIDENCE_SCHEMA = "emet-ai-evidence@1" as const;
export const EMET_AI_ANSWER_SCHEMA = "emet-ai-answer@1" as const;
export const EMET_AI_PROMPT_VERSION = "scripture-first@7" as const;

export type EmetAiCorpus = "hebrew" | "lxx" | "greek-nt" | "translation";
export type EmetAiScopeType = "word" | "verse" | "passage" | "topic";
export type EmetAiIdentityGate =
  | "verified"
  | "not-applicable"
  | "ambiguous"
  | "unresolved";

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
  };
};

export type EmetAiEvidencePacket = {
  schemaVersion: typeof EMET_AI_EVIDENCE_SCHEMA;
  question: string;
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
  text: string;
  support: "direct" | "scriptural-synthesis";
  evidenceIds: string[];
};

export type EmetAiAnswer = {
  schemaVersion: typeof EMET_AI_ANSWER_SCHEMA;
  status: "complete" | "insufficient-evidence";
  answer: string;
  claims: EmetAiClaim[];
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

    for (const claim of answer.claims) {
      if (!clean(claim.text)) {
        errors.push("Every claim must contain text.");
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
    claims: [],
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
    !Array.isArray(candidate.claims) ||
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
      typeof claim.text !== "string" ||
      (claim.support !== "direct" &&
        claim.support !== "scriptural-synthesis") ||
      !Array.isArray(claim.evidenceIds) ||
      claim.evidenceIds.some((id) => typeof id !== "string")
    ) {
      return null;
    }
    claims.push({
      text: claim.text,
      support: claim.support,
      evidenceIds: claim.evidenceIds as string[],
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
    claims,
    citations,
    limitations: candidate.limitations as string[],
  };
}
