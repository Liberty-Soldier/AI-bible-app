export type EmetCorpus =
  | "hebrew"
  | "greek-nt"
  | "lxx";

export type EmetPacketType = "word";

export interface EmetSourceIdentity {
  entityId: string;
  lexiconId?: string | null;
  lemma: string;
  normalizedLemma?: string | null;
  transliteration?: string | null;
  language: string;
  glosses?: string[];
  morphology?: string[];
}

export interface EmetReference {
  reference: string;
  verseId?: string | null;
  sourceTokenIds?: string[];
  reason?: string | null;
}

export interface EmetRendering {
  translation: string;
  text: string;
  count: number;
}

export interface EmetEvidenceItem {
  id?: string;
  type?: string;
  label?: string;
  count?: number;
  references?: EmetReference[];
  data?: Record<string, unknown>;
}

export interface EmetSourceEvidence {
  occurrenceCount: number;
  firstMention?: EmetReference | null;
  keyReferences: EmetReference[];
  renderings: EmetRendering[];
  relationships: EmetEvidenceItem[];
  events: EmetEvidenceItem[];
  themes: EmetEvidenceItem[];
}

export interface EmetPacketProvenance {
  seeSchemaVersion?: string | null;
  seeBuildId?: string | null;
  sourceCorpus: EmetCorpus;
  sourceDataset?: string | null;
  sourceDatasetVersion?: string | null;
  sourcePacketBuilderRevision: string;
  builtAt?: string;
}

export interface EmetSourcePacket {
  schemaVersion: "1";
  packetType: EmetPacketType;
  packetId: string;
  corpus: EmetCorpus;
  source: EmetSourceIdentity;
  evidence: EmetSourceEvidence;
  provenance: EmetPacketProvenance;
}

export interface EmetExplanationSections {
  simpleMeaning: string;
  biblicalUsage: string;
  whyItMatters: string;
  evidenceSummary: string;
  cautions?: string[];
}

export interface EmetGeneratedExplanation {
  schemaVersion: "1";
  packetType: EmetPacketType;
  packetId: string;
  corpus: EmetCorpus;
  locale: string;
  profile: string;

  logicalCacheKey: string;
  artifactCacheKey: string;
  sourcePacketFingerprint: string;

  explanation: EmetExplanationSections;

  citations: Array<{
    reference: string;
    evidenceType?: string;
  }>;

  generation: {
    promptRevision: string;
    generatorRevision: string;
    provider?: string | null;
    model?: string | null;
    generatedAt: string;
  };
}

export interface EmetManifestEntry {
  packetId: string;
  corpus: EmetCorpus;
  packetType: EmetPacketType;
  locale: string;
  profile: string;
  logicalCacheKey: string;
  artifactCacheKey: string;
  sourcePacketFingerprint: string;
  path: string;
}

export interface EmetManifest {
  schemaVersion: "1";
  generatedAt: string;
  promptRevision: string;
  entries: Record<string, EmetManifestEntry>;
}

export const EMET_PACKET_SCHEMA_VERSION: "1";
export const EMET_OUTPUT_SCHEMA_VERSION: "1";
export const EMET_DEFAULT_LOCALE: string;
export const EMET_DEFAULT_PROFILE: string;
export const EMET_PROMPT_REVISION: string;
export const EMET_PACKET_BUILDER_REVISION: string;

export const SUPPORTED_CORPORA: readonly EmetCorpus[];
export const SUPPORTED_PACKET_TYPES: readonly EmetPacketType[];

export function stableNormalize<T>(value: T): T;
export function stableStringify(
  value: unknown,
  spacing?: number
): string;

export function sha256(value: unknown): string;
export function shortHash(
  value: unknown,
  length?: number
): string;

export function parseWordEntityId(entityId: string): {
  packetType: "word";
  corpus: EmetCorpus;
  lexicalId: string;
};

export function validateSourcePacket<T extends EmetSourcePacket>(
  packet: T
): T;

export function getSourcePacketFingerprintInput(
  packet: EmetSourcePacket
): Record<string, unknown>;

export function createSourcePacketFingerprint(
  packet: EmetSourcePacket
): string;

export function createLogicalCacheKey(args: {
  packetType: EmetPacketType;
  entityId: string;
  locale?: string;
  profile?: string;
}): string;

export function createArtifactCacheKey(args: {
  packetType: EmetPacketType;
  entityId: string;
  packetFingerprint: string;
  locale?: string;
  profile?: string;
  promptRevision?: string;
}): string;

export function createRuntimeRelativePath(args: {
  entityId: string;
  packetFingerprint: string;
  promptRevision?: string;
}): string;

export function safeArtifactStem(entityId: string): string;