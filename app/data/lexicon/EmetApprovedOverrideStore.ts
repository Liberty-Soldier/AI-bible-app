import "server-only";

import type { BibleIQSource } from "./BibleIQTypes";

const RUNTIME_ROOT = "/data/bibleiq/word-study/emet-approved";
const EXPECTED_SCHEMA_VERSION = "1.0.0";
const EXPECTED_BASE_P04_CHECKSUM =
  "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5";

export type ApprovedEmetCitation = {
  book: string;
  chapter: number;
  verse: number;
  label?: string;
  evidenceId?: string;
  kind?: string;
};

export type ApprovedEmetOverride = {
  entityId: string;
  corpus: BibleIQSource;
  headline: string;
  explanation: string;
  citations: ApprovedEmetCitation[];
  explanationChecksum: string;
  semanticViewChecksum: string;
  promptVersion: string;
  reviewerVersion: string;
  approvedAt: string;
  approvedBy: string;
};

type CompactApprovedOverride = {
  c: BibleIQSource;
  h: string;
  t: string;
  r?: [
    book: string,
    chapter: number,
    verse: number,
    label: string,
    evidenceId: string,
    kind: string,
  ][];
  x: string;
  s: string;
  p: string;
  v: string;
  a: string;
  b: string;
};

type OverrideShard = {
  version: number;
  corpus: BibleIQSource;
  shard: string;
  entities: Record<string, CompactApprovedOverride>;
};

type OverrideManifest = {
  version: number;
  schemaVersion: string;
  shardAlgorithm: "fnv1a-32-mod";
  shardCount: number;
  source: {
    baseP04Checksum: string;
  };
  corpora: Record<
    BibleIQSource,
    {
      approved: number;
      shards: Record<
        string,
        {
          file: string;
          approved: number;
          checksum: string;
        }
      >;
    }
  >;
  totals: {
    approved: number;
    shards: number;
  };
  checksum: string;
};

const manifestCache = new Map<string, Promise<OverrideManifest | null>>();
const shardCache = new Map<string, Promise<OverrideShard | null>>();

function originKey(origin: string) {
  return new URL(origin).origin;
}

function runtimeUrl(origin: string, relativePath: string) {
  return new URL(
    `${RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

async function fetchJsonQuiet<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (response.status === 404) return null;
    if (!response.ok) {
      console.error(`P04.1 approved runtime returned ${response.status}: ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`P04.1 approved runtime fetch failed: ${url}`, error);
    return null;
  }
}

function loadManifest(origin: string) {
  const key = originKey(origin);
  let pending = manifestCache.get(key);
  if (!pending) {
    pending = fetchJsonQuiet<OverrideManifest>(runtimeUrl(key, "manifest.json"));
    manifestCache.set(key, pending);
  }
  return pending;
}

function hashEntityId(entityId: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function shardIdForEntity(entityId: string, shardCount: number) {
  return (hashEntityId(entityId) % shardCount)
    .toString(16)
    .padStart(2, "0");
}

function corpusFromEntityId(entityId: string): BibleIQSource | null {
  const value = String(entityId || "");
  if (/^word:hebrew:H\d+$/.test(value)) return "hebrew";
  if (/^word:greek-nt:G\d+$/.test(value)) return "greek-nt";
  if (/^word:lxx:L\d+$/.test(value)) return "lxx";
  return null;
}

function expandOverride(
  entityId: string,
  compact: CompactApprovedOverride,
): ApprovedEmetOverride {
  return {
    entityId,
    corpus: compact.c,
    headline: compact.h,
    explanation: compact.t,
    citations: (compact.r || []).map(
      ([book, chapter, verse, label, evidenceId, kind]) => ({
        book,
        chapter,
        verse,
        label: label || undefined,
        evidenceId: evidenceId || undefined,
        kind: kind || undefined,
      }),
    ),
    explanationChecksum: compact.x,
    semanticViewChecksum: compact.s,
    promptVersion: compact.p,
    reviewerVersion: compact.v,
    approvedAt: compact.a,
    approvedBy: compact.b,
  };
}

export async function loadApprovedEmetOverride(
  origin: string,
  entityId: string,
): Promise<ApprovedEmetOverride | null> {
  const corpus = corpusFromEntityId(entityId);
  if (!corpus) return null;

  const manifest = await loadManifest(origin);
  if (!manifest) return null;

  if (
    manifest.schemaVersion !== EXPECTED_SCHEMA_VERSION ||
    manifest.source.baseP04Checksum !== EXPECTED_BASE_P04_CHECKSUM
  ) {
    console.error("P04.1 approved runtime provenance validation failed.");
    return null;
  }

  const shardId = shardIdForEntity(entityId, manifest.shardCount);
  const shardMeta = manifest.corpora?.[corpus]?.shards?.[shardId];
  if (!shardMeta) return null;

  const cacheKey = `${originKey(origin)}|${shardMeta.file}`;
  let pending = shardCache.get(cacheKey);
  if (!pending) {
    pending = fetchJsonQuiet<OverrideShard>(
      runtimeUrl(originKey(origin), shardMeta.file),
    );
    shardCache.set(cacheKey, pending);
  }

  const shard = await pending;
  const compact = shard?.entities?.[entityId];
  if (!compact) return null;

  return expandOverride(entityId, compact);
}
