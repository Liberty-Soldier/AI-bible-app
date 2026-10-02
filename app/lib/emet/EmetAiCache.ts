import "server-only";

import { createHash } from "node:crypto";

import {
  EMET_AI_PROMPT_VERSION,
  type EmetAiAnswer,
  type EmetAiEvidencePacket,
} from "./EmetAiContract";

export type EmetAiCachedAnswer = {
  answer: EmetAiAnswer;
  createdAt: string;
  model: string;
};

export interface EmetAiAnswerStore {
  get(key: string): Promise<EmetAiCachedAnswer | null>;
  set(key: string, value: EmetAiCachedAnswer): Promise<void>;
}

function normalizedQuestion(question: string) {
  return question
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

export function getEmetAiCacheKey(packet: EmetAiEvidencePacket) {
  const identity = packet.identity.canonicalEntityId || "no-entity";
  const stableInput = JSON.stringify({
    schemaVersion: packet.schemaVersion,
    promptVersion: EMET_AI_PROMPT_VERSION,
    question: normalizedQuestion(packet.question),
    scopeType: packet.scope.type,
    references: [...packet.scope.references].sort(),
    entityIds: [...packet.scope.entityIds].sort(),
    identity,
    evidenceVersion: packet.provenance.evidenceVersion,
    evidence: packet.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      corpus: item.corpus,
      text: item.text,
      reference: item.reference || "",
      entityId: item.entityId || "",
      lexicalId: item.lexicalId || "",
      authority: item.provenance.authority,
      sourceId: item.provenance.sourceId || "",
      checksum: item.provenance.checksum || "",
    })),
  });

  return `emet-ai:${createHash("sha256")
    .update(stableInput, "utf8")
    .digest("hex")}`;
}

export function createMemoryEmetAiAnswerStore(): EmetAiAnswerStore {
  const records = new Map<string, EmetAiCachedAnswer>();

  return {
    async get(key) {
      return records.get(key) || null;
    },
    async set(key, value) {
      records.set(key, value);
    },
  };
}
