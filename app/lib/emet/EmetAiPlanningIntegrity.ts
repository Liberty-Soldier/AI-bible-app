import type { EmetAiQuestionContract } from "./EmetAiQuestionContract";
import { normalizeEmetAiPlanReference } from "./EmetAiRetrievalPlan";

export type EmetAiPlanReferenceDiagnostics = {
  value: unknown;
  requiredReferenceErrors: string[];
  recoveredMalformedGoverningReferences: Array<{ reference: string; reason: string }>;
  recoveredSerializedGoverningReferences: Array<{
    reference: string;
    references: string[];
  }>;
  rejectedOptionalReferences: Array<{ reference: string; reason: string }>;
};

const SERIALIZED_REFERENCE_DELIMITER = /"\s*,\s*"/;

function recoverSerializedReferenceList(
  value: string,
  referenceExists: (reference: string) => boolean,
) {
  if (!SERIALIZED_REFERENCE_DELIMITER.test(value)) return null;
  const parts = value.split(SERIALIZED_REFERENCE_DELIMITER).map((item) => item.trim());
  if (parts.length < 2 || parts.some((item) => !item || item.includes('"'))) return null;
  const references: string[] = [];
  for (const part of parts) {
    const normalized = normalizeEmetAiPlanReference(part, referenceExists);
    if (normalized.status !== "resolved") return null;
    references.push(...normalized.references);
  }
  return Array.from(new Set(references));
}

function unfinishedReferenceChapter(value: string) {
  if (!/[?]|[-–—]\s*$/.test(value.trim())) return null;
  const match = value.trim().match(/^(.+?)\s+(\d+)(?::\d+)?\s*[-–—]\s*\?*$/i);
  if (!match) return null;
  return `${match[1].replace(/\.$/, "").trim().toLocaleLowerCase("en-US")} ${Number(match[2])}`;
}

function referenceChapter(value: string) {
  const match = value.trim().match(/^(.+?)\s+(\d+):\d+/i);
  return match
    ? `${match[1].replace(/\.$/, "").trim().toLocaleLowerCase("en-US")} ${Number(match[2])}`
    : null;
}

function resolvedRequestedReferences(
  contract: EmetAiQuestionContract,
  referenceExists: (reference: string) => boolean,
) {
  return new Set(contract.explicitReferences.flatMap((reference) => {
    const normalized = normalizeEmetAiPlanReference(reference, referenceExists);
    return normalized.status === "resolved" ? normalized.references : [];
  }));
}

export function normalizeEmetAiPlannedReferences(
  value: unknown,
  contract: EmetAiQuestionContract,
  referenceExists: (reference: string) => boolean,
): EmetAiPlanReferenceDiagnostics {
  if (!value || typeof value !== "object") {
    return {
      value,
      requiredReferenceErrors: ["Retrieval plan is not an object."],
      recoveredMalformedGoverningReferences: [],
      recoveredSerializedGoverningReferences: [],
      rejectedOptionalReferences: [],
    };
  }

  const candidate = structuredClone(value) as Record<string, unknown>;
  const requiredReferenceErrors: string[] = [];
  const recoveredMalformedGoverningReferences: Array<{ reference: string; reason: string }> = [];
  const recoveredSerializedGoverningReferences: Array<{
    reference: string;
    references: string[];
  }> = [];
  const rejectedOptionalReferences: Array<{ reference: string; reason: string }> = [];
  const requested = resolvedRequestedReferences(contract, referenceExists);
  const governing = new Set<string>();

  if (Array.isArray(candidate.passages)) {
    candidate.passages = candidate.passages.flatMap((item) => {
      if (!item || typeof item !== "object") return [item];
      const passage = item as Record<string, unknown>;
      if (typeof passage.reference !== "string") return [item];
      const normalized = normalizeEmetAiPlanReference(passage.reference, referenceExists);
      if (normalized.status !== "resolved") {
        rejectedOptionalReferences.push({
          reference: passage.reference,
          reason: normalized.reason,
        });
        return [];
      }
      return normalized.references.map((reference) => ({ ...passage, reference }));
    }).slice(0, 24);
  }

  const plannedReferenceChapters = new Set(
    Array.isArray(candidate.passages)
      ? candidate.passages.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const reference = (item as Record<string, unknown>).reference;
          if (typeof reference !== "string") return [];
          const chapter = referenceChapter(reference);
          return chapter ? [chapter] : [];
        })
      : [],
  );

  if (Array.isArray(candidate.components)) {
    candidate.components = candidate.components.map((item) => {
      if (!item || typeof item !== "object") return item;
      const component = item as Record<string, unknown>;
      if (!Array.isArray(component.governingReferences)) return item;
      const validReferences: string[] = [];
      const invalidReferences: Array<{ reference: string; reason: string }> = [];
      for (const reference of component.governingReferences) {
        if (typeof reference !== "string") continue;
        const recoveredSerialized = recoverSerializedReferenceList(reference, referenceExists);
        if (recoveredSerialized) {
          recoveredSerializedGoverningReferences.push({
            reference,
            references: recoveredSerialized,
          });
          recoveredSerialized.forEach((resolved) => {
            governing.add(resolved);
            validReferences.push(resolved);
          });
          continue;
        }
        const normalized = normalizeEmetAiPlanReference(reference, referenceExists);
        if (normalized.status !== "resolved") {
          invalidReferences.push({ reference, reason: normalized.reason });
          continue;
        }
        normalized.references.forEach((resolved) => {
          governing.add(resolved);
          validReferences.push(resolved);
        });
      }
      for (const invalid of invalidReferences) {
        const unfinishedChapter = unfinishedReferenceChapter(invalid.reference);
        if (
          validReferences.length > 0 &&
          unfinishedChapter &&
          plannedReferenceChapters.has(unfinishedChapter)
        ) {
          recoveredMalformedGoverningReferences.push(invalid);
        } else {
          requiredReferenceErrors.push(invalid.reason);
        }
      }
      return { ...component, governingReferences: Array.from(new Set(validReferences)) };
    });
  }

  // Requested references are independently injected by deterministic coverage.
  // Governing references, however, must remain present in the plan passage set.
  const planned = new Set(
    Array.isArray(candidate.passages)
      ? candidate.passages.flatMap((item) =>
          item && typeof item === "object" && typeof (item as Record<string, unknown>).reference === "string"
            ? [(item as Record<string, string>).reference]
            : [],
        )
      : [],
  );
  for (const reference of governing) {
    if (!planned.has(reference)) {
      requiredReferenceErrors.push(`Required governing reference ${reference} is missing from planned passages.`);
    }
  }

  // Retain this invariant explicitly: no optional rejection can erase a valid
  // reference that the reader requested. Requested coverage is supplied later
  // from the canonical contract even when the planner omitted it.
  for (const reference of requested) {
    if (!referenceExists(reference)) {
      requiredReferenceErrors.push(`Explicitly requested reference ${reference} is unavailable in locked Scripture.`);
    }
  }

  return {
    value: candidate,
    requiredReferenceErrors,
    recoveredMalformedGoverningReferences,
    recoveredSerializedGoverningReferences,
    rejectedOptionalReferences,
  };
}

const INCOMPLETE_PLAN_LIMITATION =
  /\b(?:plan|evidence|retrieval|coverage)\s+(?:is|remains)\s+incomplete\b|\b(?:essential|materially necessary|key)\s+(?:evidence|passages?|references?)\s+(?:is|are|remain)\s+(?:missing|omitted)|\bincomplete until\b|\bmust be added before\b/i;

export function validateEmetAiPlanningCompleteness(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const limitations = (value as Record<string, unknown>).limitations;
  if (!Array.isArray(limitations)) return [];
  return limitations
    .filter((item): item is string => typeof item === "string")
    .filter((item) => INCOMPLETE_PLAN_LIMITATION.test(item))
    .map((item) => `Retrieval plan explicitly identifies unresolved essential evidence: ${item}`);
}

const INTERPRETIVE_PLAN_CONCLUSION =
  /\b(?:should be (?:read|interpreted|understood) as|rather than|therefore (?:abolishes|preserves|changes)|does not (?:abolish|revoke|change|end)|abolishes|revokes|preserves unchanged|(?:the passages?|these texts?) agree|there is no contradiction|are reconciled by|use .{0,40} with different (?:scope|meaning|sense))\b/i;

export function validateEmetAiPlanningNeutrality(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as Record<string, unknown>;
  if (candidate.analysisMode !== "apparent-contradiction") return [];
  const statements = [candidate.proposition];
  if (Array.isArray(candidate.components)) {
    statements.push(...candidate.components.flatMap((item) =>
      item && typeof item === "object" ? [(item as Record<string, unknown>).proposition] : [],
    ));
  }
  return statements
    .filter((statement): statement is string => typeof statement === "string")
    .filter((statement) => INTERPRETIVE_PLAN_CONCLUSION.test(statement))
    .map((statement) => `Planning must identify textual considerations without selecting an interpretation: ${statement}`);
}
