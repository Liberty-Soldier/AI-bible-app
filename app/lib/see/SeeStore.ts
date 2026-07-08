import evidenceLite from "@/public/data/see/lite/evidence-lite.json";
import relationshipCounts from "@/public/data/see/lite/relationship-counts.json";
import eventCounts from "@/public/data/see/lite/event-counts.json";
import themeCounts from "@/public/data/see/lite/theme-counts.json";
import manifest from "@/public/data/see/manifest.json";

type SeeEvidenceLite = {
  id: string;
  occurrenceCount?: number;
  firstOccurrence?: string;
  lastOccurrence?: string;
};

type EvidenceMap = Record<string, SeeEvidenceLite>;

const evidence = (evidenceLite as any).evidence
  ? ((evidenceLite as any).evidence as EvidenceMap)
  : (evidenceLite as EvidenceMap);

function normalizeStrongId(id: string) {
  const raw = String(id || "").trim();

  if (!raw) return "";

  if (raw.startsWith("lemma:")) return raw;

  if (raw.startsWith("word:")) {
    return raw.replace(/^word:/, "lemma:");
  }

  if (raw.startsWith("hebrew:")) {
    return `lemma:${raw}`;
  }

  return raw;
}

function normalizeCountId(id: string) {
  const raw = String(id || "").trim();

  if (!raw) return "";

  if (raw.startsWith("lemma:")) {
    return raw.replace(/^lemma:/, "");
  }

  if (raw.startsWith("word:")) {
    return raw.replace(/^word:/, "");
  }

  return raw;
}

export function toSeeEvidenceId(id: string) {
  return normalizeStrongId(id);
}

export function toSeeCountId(id: string) {
  return normalizeCountId(id);
}

export const SeeStore = {
  manifest,

  get(id: string) {
    const evidenceId = toSeeEvidenceId(id);
    return evidence[evidenceId] ?? null;
  },

  has(id: string) {
    const evidenceId = toSeeEvidenceId(id);
    return evidenceId in evidence;
  },

  relationshipCount(id: string) {
    const countId = toSeeCountId(id);
    return (relationshipCounts as any)[countId] ?? 0;
  },

  eventCount(id: string) {
    const countId = toSeeCountId(id);
    return (eventCounts as any)[countId] ?? 0;
  },

  themeCount(id: string) {
    const countId = toSeeCountId(id);
    return (themeCounts as any)[countId] ?? 0;
  },

  allIds(): string[] {
    return Object.keys(evidence);
  },
};

export default SeeStore;