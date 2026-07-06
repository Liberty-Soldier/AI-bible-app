import "server-only";
import fs from "fs";
import path from "path";
import type {
  BibleIQEntity,
  BibleIQSource,
} from "@/app/data/lexicon/BibleIQTypes";

export type ResolverHit = {
  strong: string;
  entityPath: string;
  sourceWord?: string;
};

export type AlignmentHit = ResolverHit & {
  displayWord?: string;
  displayTokenIndex?: number;
  sourceTokenIndex?: number;
  method?: string;
  confidence?: "exact" | "high" | "medium" | "low";
};

const RUNTIME_ENTITY_ROOT = path.join(
  process.cwd(),
  "app",
  "data",
  "bibleiq",
  "entities"
);

function safeEntityPart(value: string) {
  return String(value || "").replace(/[^A-Za-z0-9_/-]/g, "");
}

/**
 * Retired resolver architecture.
 *
 * Do not read from .private/evidence at runtime.
 * Runtime resolution now goes through:
 *
 * CanonicalVerseStore
 *   -> sourceToken
 *   -> entityId
 *   -> BibleIQ entity
 */
export function loadResolverForBook(
  _source: BibleIQSource,
  _book: string
): Record<string, ResolverHit> {
  return {};
}

export function loadAlignmentForBook(
  _translation: string,
  _book: string
): Record<string, Record<string, AlignmentHit>> {
  return {};
}

export function findAlignmentHit(_input: {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  displayTokenIndex?: number;
}): AlignmentHit | null {
  return null;
}

export function findResolverHit(_input: {
  source: BibleIQSource;
  book: string;
  chapter: number;
  verse: number;
  displayWord: string;
}): ResolverHit | null {
  return null;
}

export function loadEntityByHit(hit: ResolverHit): BibleIQEntity | null {
  const safePath = safeEntityPart(hit.entityPath || "");
  if (!safePath) return null;

  const filePath = path.join(RUNTIME_ENTITY_ROOT, safePath);

  if (!filePath.startsWith(RUNTIME_ENTITY_ROOT)) return null;
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as BibleIQEntity;
}