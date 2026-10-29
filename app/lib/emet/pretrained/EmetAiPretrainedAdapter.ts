import "server-only";

import { createHash } from "node:crypto";

import {
  EMET_AI_ANSWER_SCHEMA,
  EMET_AI_EVIDENCE_SCHEMA,
  parseEmetAiAnswer,
  validateEmetAiEvidencePacket,
  type EmetAiAnswer,
  type EmetAiClaimSupport,
  type EmetAiEvidenceItem,
  type EmetAiEvidencePacket,
} from "../EmetAiContract";
import {
  EMET_AI_PRETRAINED_ADAPTER_VERSION,
  EMET_AI_PRETRAINED_VERIFIER_VERSION,
  type EmetAiPretrainedDraft,
  type EmetAiPretrainedSupport,
} from "./EmetAiPretrainedContract";
import type { EmetAiPretrainedVerification, EmetAiVerifiedReferenceGroup } from "./EmetAiPretrainedVerifier";

function support(value: EmetAiPretrainedSupport): EmetAiClaimSupport {
  if (value === "explicit-statement" || value === "strong-implication" || value === "does-not-establish") return value;
  return "possible-interpretation";
}
function polarity(conclusion: EmetAiPretrainedDraft["conclusion"]) {
  return conclusion === "no" ? "denies" as const : conclusion === "qualified" || conclusion === "not-applicable" || conclusion === "insufficient-evidence" ? "qualifies" as const : "affirms" as const;
}
function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
function stableId(prefix: string, value: string) {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}
function scriptureEvidence(group: EmetAiVerifiedReferenceGroup): EmetAiEvidenceItem {
  return {
    id: stableId(`scripture:${group.translation}:pretrained`, `${group.reference}|${group.sourceFingerprint}`),
    kind: "scripture",
    corpus: "translation",
    text: group.text,
    reference: group.reference,
    provenance: {
      authority: `locked-${group.translation}-scripture-index`,
      sourceId: `public/scripture/search/${group.translation}.json#${group.expandedReferences.join(",")}`,
      checksum: group.sourceFingerprint,
      retrieval: { method: "explicit-reference", role: "direct", reason: "Model-proposed reference resolved after generation.", score: 100 },
    },
  };
}

export function adaptEmetAiPretrainedAnswer({ draft, verification }: { draft: EmetAiPretrainedDraft; verification: EmetAiPretrainedVerification }) {
  if (!verification.ok) return null;
  const omitted = new Set(verification.omissions.map((item) => item.reference));
  const scripture = verification.scripture.map((group) => ({ group, evidence: scriptureEvidence(group) }));
  const evidenceByRequested = new Map(scripture.map((item) => [item.group.requestedReference, item.evidence]));
  const evidenceByReference = new Map(scripture.map((item) => [item.group.reference, item.evidence]));
  const lexical: EmetAiEvidenceItem[] = verification.lexical.map((term) => ({
    id: `lexical:${term.corpus}:${term.lexicalId}`,
    kind: "lexical",
    corpus: term.corpus,
    text: `Verified source term: ${term.lemma}; ${term.lexicalId}; transliteration ${term.transliteration}; meaning ${term.meaning}.`,
    reference: term.lexicalId,
    lexicalId: term.lexicalId,
    provenance: {
      authority: "locked-source-phrase-index",
      sourceId: `public/scripture/source-phrase-index.json#${term.corpus}:${term.lexicalId}`,
      checksum: term.sourceFingerprint,
      retrieval: { method: "exact-source-phrase", role: "direct", reason: "Exact lexical identity verified after generation.", score: 100 },
    },
  }));
  const evidence = [...scripture.map((item) => item.evidence), ...lexical];
  const claims = draft.claims.map((claim, index) => {
    const evidenceIds = Array.from(new Set([
      ...claim.references.flatMap((reference) => {
        const item = evidenceByRequested.get(reference);
        return item && !omitted.has(item.reference || "") ? [item.id] : [];
      }),
      ...lexical.filter((item) => {
        const visible = `${item.lexicalId || ""} ${item.text}`.toLocaleLowerCase("en-US");
        return visible.split(/[;\s]+/).some((token) => token.length > 3 && claim.claim.toLocaleLowerCase("en-US").includes(token));
      }).map((item) => item.id),
    ]));
    return {
      id: `pretrained-claim-${index + 1}`,
      text: claim.claim,
      support: support(claim.support),
      category: "other" as const,
      polarity: polarity(draft.conclusion),
      scope: draft.question,
      timing: "uncertain" as const,
      evidenceIds,
    };
  });
  const publicScripture = verification.publicReferences.flatMap((reference) => {
    const item = evidenceByReference.get(reference);
    return item ? [{ evidenceId: item.id, reference }] : [];
  });
  const citations = [...publicScripture, ...lexical.map((item) => ({ evidenceId: item.id, reference: item.reference }))];
  const responseWords = words(draft.proposedAnswer);
  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question: draft.question,
    responseDesign: {
      depth: responseWords <= 70 ? "concise" : responseWords <= 180 ? "standard" : "deep",
      targetMinWords: Math.max(10, Math.min(responseWords, 60)),
      targetMaxWords: Math.max(70, responseWords + 40),
      maxScriptureCitations: Math.max(1, publicScripture.length),
      progressiveFollowUp: false,
    },
    reasoning: {
      mode: support(draft.conclusionSupport) === "possible-interpretation" ? "doctrinal-claim" : "simple",
      proposition: draft.question,
      requiresScopeAnalysis: false,
      requiresTimeline: false,
      components: [],
      establishedPropositions: [],
    },
    governingCoverage: [],
    scope: {
      type: verification.lexical.length ? "word" : "topic",
      references: Array.from(new Set(verification.scripture.map((group) => group.reference))),
      entityIds: verification.lexical.map((term) => `word:${term.corpus}:${term.lexicalId}`),
    },
    identity: verification.lexical.length === 1 ? {
      gate: "verified",
      canonicalEntityId: `word:${verification.lexical[0].corpus}:${verification.lexical[0].lexicalId}`,
      corpus: verification.lexical[0].corpus,
      lexicalId: verification.lexical[0].lexicalId,
      lemma: verification.lexical[0].lemma,
    } : { gate: "not-applicable" },
    evidence,
    provenance: {
      evidenceVersion: `${EMET_AI_PRETRAINED_ADAPTER_VERSION}|${EMET_AI_PRETRAINED_VERIFIER_VERSION}|${Array.from(new Set(verification.scripture.map((group) => group.sourceFingerprint))).sort().join("+")}`,
      builtAt: new Date().toISOString(),
    },
  };
  const answer: EmetAiAnswer = {
    schemaVersion: EMET_AI_ANSWER_SCHEMA,
    status: draft.conclusion === "insufficient-evidence" ? "insufficient-evidence" : "complete",
    answer: draft.proposedAnswer,
    conclusionSupport: support(draft.conclusionSupport),
    componentChecks: [],
    claims,
    continuityChecks: [],
    citations,
    limitations: draft.limitations,
  };
  return { packet, answer };
}

export function validateEmetAiPretrainedAdaptedContracts(packet: EmetAiEvidencePacket, answer: EmetAiAnswer) {
  const errors: string[] = [];
  const packetValidation = validateEmetAiEvidencePacket(packet);
  if (!packetValidation.ok) errors.push(...packetValidation.errors);
  const parsed = parseEmetAiAnswer(answer);
  if (!parsed) errors.push("Pretrained answer did not parse as the existing reader contract.");
  const evidence = new Map(packet.evidence.map((item) => [item.id, item]));
  for (const citation of answer.citations) {
    const item = evidence.get(citation.evidenceId);
    if (!item) errors.push(`Citation ${citation.evidenceId} is unavailable.`);
    else if (citation.reference && citation.reference !== item.reference) errors.push(`Citation ${citation.evidenceId} changes its locked reference.`);
  }
  for (const claim of answer.claims) {
    if (!claim.evidenceIds.length) errors.push(`Claim ${claim.id} has no verified evidence.`);
    for (const id of claim.evidenceIds) if (!evidence.has(id)) errors.push(`Claim ${claim.id} uses unavailable evidence ${id}.`);
  }
  return errors.length ? { ok: false as const, errors } : { ok: true as const, packet: packetValidation.ok ? packetValidation.value : packet, answer: parsed! };
}

