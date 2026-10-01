import "server-only";

import type { WordStudyRuntimeEntity } from "./WordStudyEntityStore";

const RUNTIME_ROOT =
  "/data/bibleiq/word-study/lxx-occurrence-fallback";
const EXPECTED_MANIFEST_SCHEMA =
  "emet-lxx-occurrence-entity-fallback-manifest/v1";
const EXPECTED_SHARD_SCHEMA =
  "emet-lxx-occurrence-entity-fallback-shard/v1";

type RuntimeManifest = {
  schema: string;
  shardAlgorithm: "fnv1a-32-mod";
  shardCount: number;
  entityCount: number;
  shards: Record<
    string,
    {
      file: string;
      entityCount: number;
      bytes: number;
    }
  >;
};

type RuntimeShard = {
  schema: string;
  shard: string;
  entityCount: number;
  entities: Record<string, WordStudyRuntimeEntity>;
};

const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();
const shardCache = new Map<string, Promise<RuntimeShard | null>>();

function originKey(origin: string) {
  return new URL(origin).origin;
}

function runtimeUrl(origin: string, file: string) {
  return new URL(`${RUNTIME_ROOT}/${file}`, originKey(origin)).toString();
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

async function fetchJson<T>(
  url: string,
  requestHeaders?: Record<string, string>,
): Promise<T | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: requestHeaders,
  });

  if (!response.ok) return null;
  return (await response.json()) as T;
}

function loadManifest(
  origin: string,
  requestHeaders?: Record<string, string>,
) {
  if (requestHeaders && Object.keys(requestHeaders).length > 0) {
    return fetchJson<RuntimeManifest>(
      runtimeUrl(origin, "manifest.json"),
      requestHeaders,
    );
  }

  const key = originKey(origin);
  let pending = manifestCache.get(key);
  if (!pending) {
    pending = fetchJson<RuntimeManifest>(runtimeUrl(origin, "manifest.json")).catch((error) => {
      manifestCache.delete(key);
      throw error;
    });
    manifestCache.set(key, pending);
  }

  return pending;
}

function loadShard(
  origin: string,
  shardId: string,
  file: string,
  requestHeaders?: Record<string, string>,
) {
  if (requestHeaders && Object.keys(requestHeaders).length > 0) {
    return fetchJson<RuntimeShard>(runtimeUrl(origin, file), requestHeaders);
  }

  const key = `${originKey(origin)}|${shardId}`;
  let pending = shardCache.get(key);
  if (!pending) {
    pending = fetchJson<RuntimeShard>(runtimeUrl(origin, file)).catch((error) => {
      shardCache.delete(key);
      throw error;
    });
    shardCache.set(key, pending);
  }

  return pending;
}

export async function loadLxxOccurrenceEntity(
  origin: string,
  entityId: string,
  requestHeaders?: Record<string, string>,
) {
  if (!/^word:lxx:L\d+$/.test(entityId)) return null;
  const manifest = await loadManifest(origin, requestHeaders);
  if (
    !manifest ||
    manifest.schema !== EXPECTED_MANIFEST_SCHEMA ||
    manifest.shardAlgorithm !== "fnv1a-32-mod" ||
    !Number.isInteger(manifest.shardCount) ||
    manifest.shardCount < 1
  ) {
    return null;
  }

  const shardId = shardIdForEntity(entityId, manifest.shardCount);
  const shardMeta = manifest.shards?.[shardId];
  if (!shardMeta) return null;

  const shard = await loadShard(
    origin,
    shardId,
    shardMeta.file,
    requestHeaders,
  );
  if (
    !shard ||
    shard.schema !== EXPECTED_SHARD_SCHEMA ||
    shard.shard !== shardId ||
    shard.entityCount !== Object.keys(shard.entities || {}).length
  ) {
    return null;
  }

  return shard.entities?.[entityId] || null;
}
