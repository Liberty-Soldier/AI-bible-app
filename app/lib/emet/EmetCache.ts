import fs from "fs";
import path from "path";
import type { EmetEvidencePacket } from "./EmetEvidencePacket";

export type EmetCacheRecord = {
  explanation: string;
  confidence: "high" | "medium" | "low";
  warnings?: string[];
  generatedAt?: string;
  packetVersion?: string;
};

export type EmetCachedResponse = {
  explanation: string;
  confidence: "high" | "medium" | "low";
  source: "emet-cache";
  warnings?: string[];
  cacheKey: string;
  generatedAt?: string;
};

type EmetCacheFile = {
  cacheVersion?: string;
  generatedAt?: string;
  records?: Record<string, EmetCacheRecord>;
};

let loaded = false;
let records: Record<string, EmetCacheRecord> = {};

const CACHE_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "emet",
  "explanations.json"
);

export function getEmetCacheKey(packet: EmetEvidencePacket): string {
  return [
    "emet",
    packet.packetVersion,
    packet.entity.inputId,
  ].join(":");
}

function loadCacheOnce() {
  if (loaded) return;

  loaded = true;

  if (!fs.existsSync(CACHE_PATH)) {
    records = {};
    return;
  }

  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as EmetCacheFile;

    records = parsed.records && typeof parsed.records === "object"
      ? parsed.records
      : {};
  } catch (error) {
    console.error("Failed to load EMET cache:", error);
    records = {};
  }
}

function normalizeRecord(
  cacheKey: string,
  record: EmetCacheRecord
): EmetCachedResponse | null {
  if (!record || typeof record.explanation !== "string") {
    return null;
  }

  const explanation = record.explanation.trim();

  if (!explanation) {
    return null;
  }

  const confidence =
    record.confidence === "high" ||
    record.confidence === "medium" ||
    record.confidence === "low"
      ? record.confidence
      : "low";

  const warnings = Array.isArray(record.warnings)
    ? record.warnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
    : [];

  return {
    explanation,
    confidence,
    source: "emet-cache",
    cacheKey,
    generatedAt: record.generatedAt,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export const EmetCache = {
  get(packet: EmetEvidencePacket): EmetCachedResponse | null {
    loadCacheOnce();

    const cacheKey = getEmetCacheKey(packet);
    const record = records[cacheKey];

    if (!record) return null;

    return normalizeRecord(cacheKey, record);
  },

  has(packet: EmetEvidencePacket): boolean {
    return this.get(packet) !== null;
  },

  keyFor(packet: EmetEvidencePacket): string {
    return getEmetCacheKey(packet);
  },
};