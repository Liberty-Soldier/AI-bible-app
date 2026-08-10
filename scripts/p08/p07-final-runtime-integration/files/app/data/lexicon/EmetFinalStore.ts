import "server-only";

import { createHash } from "node:crypto";

import type { BibleIQSource } from "./BibleIQTypes";

const RUNTIME_ROOT = "/data/bibleiq/word-study/emet-final";
const EXPECTED_RUNTIME_VERSION = 1;
const EXPECTED_SCHEMA_VERSION = "p07-emet-final-runtime@1.0.0";
const EXPECTED_SOURCE_RUNTIME_SHA256 =
  "3d8e36c865a7d5b6b36d894d509cd9c3d29f4a7849d48e9656c8c64e74bb9e0a";
const EXPECTED_ACTIVE_ENTITY_COUNT = 27184;
const EXPECTED_APPROVED_COUNT = 26896;
const EXPECTED_POLICY_COUNT = 288;

export type FinalEmetCitation = {
  reference: string;
  book?: string;
  chapter?: number;
  verse?: number;
  evidenceId?: string;
  kind?: string;
};

export type FinalEmetPolicy = {
  code?: string;
  policy?: string;
  reason?: string;
  readerBehavior?: string;
  preserveLexicalMeaning?: boolean;
  allowAcrossScriptureExplanation?: boolean;
  futureRepairGate?: string;
  [key: string]: unknown;
};

export type FinalEmetRuntimeRecord = {
  entityId: string;
  corpus: BibleIQSource;
  status: "approved" | "no-explanation";
  sourceKind: string;
  explanation?: string;
  citations: FinalEmetCitation[];
  explanationChecksum?: string;
  viewChecksum?: string;
  sourceRecordChecksum?: string;
  independentReviewerApproved?: boolean;
  policy?: FinalEmetPolicy | null;
};

type RuntimeShard = {
  version: number;
  schemaVersion: string;
  corpus: BibleIQSource;
  shard: string;
  entities: Record<string, FinalEmetRuntimeRecord>;
};

type RuntimeShardMeta = {
  file: string;
  entities: number;
  approved: number;
  noExplanation: number;
  bytes: number;
  checksum: string;
};

type RuntimeManifest = {
  version: number;
  schemaVersion: string;
  shardAlgorithm: "fnv1a-32-mod";
  shardCount: number;
  source: {
    runtimeCachePath: string;
    runtimeCacheSha256: string;
    runtimeSchemaVersion: string;
    runtimeChecksum: string;
  };
  corpora: Record<
    BibleIQSource,
    {
      entities: number;
      approved: number;
      noExplanation: number;
      shards: Record<string, RuntimeShardMeta>;
    }
  >;
  totals: {
    entities: number;
    approved: number;
    noExplanation: number;
    shards: number;
    byCorpus: Record<BibleIQSource, number>;
  };
  checksum: string;
};

type FetchedJson<T> = {
  data: T;
  byteChecksum: string;
};

const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();
const shardCache = new Map<string, Promise<RuntimeShard | null>>();

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Json(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function originKey(origin: string) {
  return new URL(origin).origin;
}

function runtimeUrl(origin: string, relativePath: string) {
  return new URL(
    `${RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

async function fetchJsonWithChecksum<T>(
  url: string,
): Promise<FetchedJson<T> | null> {
  try {
    const response = await fetch(url, { cache: "force-cache" });

    if (!response.ok) {
      console.error(`P07 final EMET runtime returned ${response.status}: ${url}`);
      return null;
    }

    const text = await response.text();

    return {
      data: JSON.parse(text) as T,
      byteChecksum: sha256Text(text),
    };
  } catch (error) {
    console.error(`P07 final EMET runtime fetch failed: ${url}`, error);
    return null;
  }
}

function validateManifest(manifest: RuntimeManifest) {
  const core = { ...manifest } as Partial<RuntimeManifest>;
  delete core.checksum;

  return (
    manifest.version === EXPECTED_RUNTIME_VERSION &&
    manifest.schemaVersion === EXPECTED_SCHEMA_VERSION &&
    manifest.source?.runtimeCacheSha256 ===
      EXPECTED_SOURCE_RUNTIME_SHA256 &&
    manifest.totals?.entities === EXPECTED_ACTIVE_ENTITY_COUNT &&
    manifest.totals?.approved === EXPECTED_APPROVED_COUNT &&
    manifest.totals?.noExplanation === EXPECTED_POLICY_COUNT &&
    manifest.checksum === sha256Json(core)
  );
}

function loadManifest(origin: string) {
  const key = originKey(origin);
  let pending = manifestCache.get(key);

  if (!pending) {
    pending = (async () => {
      const fetched = await fetchJsonWithChecksum<RuntimeManifest>(
        runtimeUrl(key, "manifest.json"),
      );

      if (!fetched) return null;

      if (!validateManifest(fetched.data)) {
        console.error("P07 final EMET runtime manifest validation failed.");
        return null;
      }

      return fetched.data;
    })();

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

async function loadShard(
  origin: string,
  corpus: BibleIQSource,
  shardId: string,
  meta: RuntimeShardMeta,
) {
  const key = `${originKey(origin)}|${corpus}|${shardId}`;
  let pending = shardCache.get(key);

  if (!pending) {
    pending = (async () => {
      const fetched = await fetchJsonWithChecksum<RuntimeShard>(
        runtimeUrl(originKey(origin), meta.file),
      );

      if (!fetched) return null;

      if (fetched.byteChecksum !== meta.checksum) {
        console.error(
          `P07 final EMET shard checksum mismatch: ${corpus}/${shardId}`,
        );
        return null;
      }

      const shard = fetched.data;

      if (
        shard.version !== EXPECTED_RUNTIME_VERSION ||
        shard.schemaVersion !== EXPECTED_SCHEMA_VERSION ||
        shard.corpus !== corpus ||
        shard.shard !== shardId
      ) {
        console.error(
          `P07 final EMET shard identity mismatch: ${corpus}/${shardId}`,
        );
        return null;
      }

      return shard;
    })();

    shardCache.set(key, pending);
  }

  return pending;
}

export async function loadFinalEmetRecord(
  origin: string,
  entityId: string,
): Promise<FinalEmetRuntimeRecord | null> {
  const corpus = corpusFromEntityId(entityId);
  if (!corpus) return null;

  const manifest = await loadManifest(origin);
  if (!manifest) return null;

  const shardId = shardIdForEntity(entityId, manifest.shardCount);
  const shardMeta = manifest.corpora?.[corpus]?.shards?.[shardId];

  if (!shardMeta) {
    console.error(`P07 final EMET shard not found: ${entityId}`);
    return null;
  }

  const shard = await loadShard(origin, corpus, shardId, shardMeta);
  const record = shard?.entities?.[entityId];

  if (!record) {
    console.error(`P07 final EMET record not found: ${entityId}`);
    return null;
  }

  if (
    record.entityId !== entityId ||
    record.corpus !== corpus ||
    (record.status !== "approved" &&
      record.status !== "no-explanation")
  ) {
    console.error(`P07 final EMET record identity invalid: ${entityId}`);
    return null;
  }

  if (
    record.status === "approved" &&
    (!record.explanation || !record.explanation.trim())
  ) {
    console.error(`P07 approved EMET record has no explanation: ${entityId}`);
    return null;
  }

  if (
    record.status === "no-explanation" &&
    record.explanation?.trim()
  ) {
    console.error(
      `P07 no-explanation policy unexpectedly contains prose: ${entityId}`,
    );
    return null;
  }

  return record;
}

export const EmetFinalStore = {
  get: loadFinalEmetRecord,
};

export default EmetFinalStore;
