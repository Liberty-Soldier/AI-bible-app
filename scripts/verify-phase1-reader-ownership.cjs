#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ALLOWED_MODES = new Set(["exact-single", "exact-multi", "segment-context"]);
const errors = [];
const warnings = [];
const stats = {
  compactBooks: 0,
  verses: 0,
  sourceTokens: 0,
  legacyRoutes: 0,
  v2Routes: 0,
  v2Exact: 0,
  v2Context: 0,
  legacyPreferredOverContext: 0,
  legacyOnly: 0,
  exactSpanOverlapPairs: 0,
  brentonOverlayRecords: 0,
  brentonOverlayRoutes: 0,
};

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function walkJson(relativeDir) {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  const result = [];

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        result.push(full);
      }
    }
  }

  visit(absolute);
  return result;
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(ROOT, file)}: invalid JSON: ${error.message}`);
    return null;
  }
}

function entityMatchesCorpus(entityId, corpus) {
  const value = String(entityId || "");
  if (corpus === "hebrew") return /^word:hebrew:H\d+$/.test(value);
  if (corpus === "greek-nt") {
    return (
      /^word:greek-nt:G\d+$/.test(value) ||
      /^compound:greek-nt:G\d+-G\d+$/.test(value)
    );
  }
  if (corpus === "lxx") return /^word:lxx:L\d+$/.test(value);
  return false;
}

function legacyValid(verse, translation, displayIndex, corpus, label) {
  const raw = verse?.a?.[translation]?.[String(displayIndex)];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
  const token = verse.s?.[raw];
  if (!token) {
    errors.push(`${label}: legacy ${translation} token ${displayIndex} points to missing source index ${raw}`);
    return null;
  }
  if (!entityMatchesCorpus(token[4], corpus)) {
    errors.push(`${label}: legacy ${translation} token ${displayIndex} points to invalid ${corpus} entity ${token[4]}`);
    return null;
  }
  return { sourceIndex: raw, token };
}

function exactBounds(compactV2, displayIndex) {
  const segment = compactV2?.segment || {};
  const start = Number(segment.renderingStartTokenIndex);
  const end = Number(segment.renderingEndTokenIndex);
  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    displayIndex >= start &&
    displayIndex <= end
  ) {
    return { start, end };
  }
  return { start: displayIndex, end: displayIndex };
}

function ownershipId(compactV2, corpus, displayIndex) {
  const bounds = exactBounds(compactV2, displayIndex);
  const segment = compactV2?.segment || {};
  const occurrences = Array.isArray(segment.sourceOccurrenceIds)
    ? [...segment.sourceOccurrenceIds].map(String).sort()
    : [];
  const components = Array.isArray(segment.sourceComponentIds)
    ? [...segment.sourceComponentIds].map(String).sort()
    : [];
  return [
    corpus,
    compactV2.mode,
    bounds.start,
    bounds.end,
    occurrences.join(","),
    components.join(","),
  ].join("|");
}

function validateV2(verse, compactV2, displayIndex, corpus, label, translation) {
  stats.v2Routes += 1;

  if (!compactV2 || !ALLOWED_MODES.has(compactV2.mode)) {
    errors.push(`${label}: ${translation} token ${displayIndex} has invalid V2 mode`);
    return null;
  }

  if (compactV2.mode === "segment-context") {
    stats.v2Context += 1;
  } else {
    stats.v2Exact += 1;
  }

  const indices =
    Array.isArray(compactV2.si)
      ? compactV2.si
      : [];

  const routes =
    Array.isArray(compactV2.routes)
      ? compactV2.routes
      : [];

  /*
   * Mirror runtime behavior.
   *
   * A V2 shell with no usable route is inactive. It does not create
   * ownership. Legacy exact ownership may take over safely.
   */
  if (
    !indices.length ||
    !routes.length
  ) {
    warnings.push(
      `${label}: ${translation} token ${displayIndex} has inactive V2 data (${indices.length}/${routes.length}); runtime falls back safely`,
    );

    return null;
  }

  /*
   * Once both arrays are active they are positional pairs.
   */
  if (
    indices.length !==
    routes.length
  ) {
    errors.push(
      `${label}: ${translation} token ${displayIndex} has active mismatched V2 source indices/routes (${indices.length}/${routes.length})`,
    );

    return null;
  }

  const segment =
    compactV2.segment || {};

  const segmentOccurrences =
    new Set(
      Array.isArray(
        segment.sourceOccurrenceIds,
      )
        ? segment.sourceOccurrenceIds.map(
            String,
          )
        : [],
    );

  const segmentComponents =
    new Set(
      Array.isArray(
        segment.sourceComponentIds,
      )
        ? segment.sourceComponentIds.map(
            String,
          )
        : [],
    );

  for (
    let index = 0;
    index < indices.length;
    index += 1
  ) {
    const sourceIndex =
      indices[index];

    const route =
      routes[index] || {};

    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex < 0 ||
      !verse.s?.[sourceIndex]
    ) {
      errors.push(
        `${label}: ${translation} token ${displayIndex} has missing V2 source index ${sourceIndex}`,
      );

      continue;
    }

    const sourceToken =
      verse.s[sourceIndex];

    const sourceTokenId =
      String(
        sourceToken?.[0] || "",
      );

    const routeOccurrenceId =
      String(
        route?.o || "",
      );

    const routeComponentId =
      String(
        route?.c || "",
      );

    /*
     * IMPORTANT:
     *
     * Compact source rows can represent the owning occurrence:
     *
     *   wlc:Book:1:1:0
     *
     * while V2 routes can additionally identify a component:
     *
     *   wlc:Book:1:1:0:c1
     *
     * The source row must therefore be checked against route.o,
     * not route.c.
     */
    if (
      routeOccurrenceId &&
      sourceTokenId
    ) {
      const sameOccurrence =
        sourceTokenId ===
          routeOccurrenceId ||
        sourceTokenId.startsWith(
          `${routeOccurrenceId}:`,
        ) ||
        routeOccurrenceId.startsWith(
          `${sourceTokenId}:`,
        );

      if (!sameOccurrence) {
        errors.push(
          `${label}: ${translation} token ${displayIndex} route occurrence ${routeOccurrenceId} != source token ${sourceTokenId}`,
        );
      }
    }

    /*
     * Component identity belongs to the segment declaration.
     */
    if (
      routeComponentId &&
      segmentComponents.size &&
      !segmentComponents.has(
        routeComponentId,
      )
    ) {
      errors.push(
        `${label}: ${translation} token ${displayIndex} route component ${routeComponentId} is outside its declared source segment`,
      );
    }

    /*
     * Occurrence identity must also belong to the segment.
     */
    if (
      routeOccurrenceId &&
      segmentOccurrences.size &&
      !segmentOccurrences.has(
        routeOccurrenceId,
      )
    ) {
      errors.push(
        `${label}: ${translation} token ${displayIndex} route occurrence ${routeOccurrenceId} is outside its declared source segment`,
      );
    }

    /*
     * Grammar routes intentionally point at grammatical components
     * rather than an independent lexical entity.
     */
    if (
      route?.k !== "grammar"
    ) {
      const routeEntity =
        String(
          route?.e || "",
        );

      const sourceEntity =
        String(
          sourceToken?.[4] || "",
        );

      const effectiveEntity =
        routeEntity ||
        sourceEntity;

      if (
        !entityMatchesCorpus(
          effectiveEntity,
          corpus,
        )
      ) {
        errors.push(
          `${label}: ${translation} token ${displayIndex} has invalid lexical entity ${effectiveEntity}`,
        );
      }

      if (
        routeEntity &&
        sourceEntity &&
        routeEntity !==
          sourceEntity
      ) {
        errors.push(
          `${label}: ${translation} token ${displayIndex} lexical entity ${routeEntity} != source token ${sourceEntity}`,
        );
      }
    }
  }

  const rawStart =
    segment.renderingStartTokenIndex;

  const rawEnd =
    segment.renderingEndTokenIndex;

  if (
    rawStart !== undefined ||
    rawEnd !== undefined
  ) {
    const start =
      Number(rawStart);

    const end =
      Number(rawEnd);

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      displayIndex < start ||
      displayIndex > end
    ) {
      errors.push(
        `${label}: ${translation} token ${displayIndex} has malformed rendering bounds ${rawStart}..${rawEnd}`,
      );
    }
  }

  return compactV2;
}

function auditCompactBook(file, forcedTranslation = null) {
  const json = parseJson(file);
  if (!json || !json.verses || !json.corpus) return;

  const corpus = String(json.corpus);
  if (!new Set(["hebrew", "greek-nt", "lxx"]).has(corpus)) return;

  stats.compactBooks += 1;
  const relative = path.relative(ROOT, file);

  for (const [verseKey, verse] of Object.entries(json.verses || {})) {
    stats.verses += 1;
    stats.sourceTokens += Array.isArray(verse?.s) ? verse.s.length : 0;
    const label = `${relative} ${verseKey}`;
    const translations = forcedTranslation
      ? [forcedTranslation]
      : Array.from(
          new Set([
            ...Object.keys(verse?.a || {}),
            ...Object.keys(verse?.v || {}),
          ]),
        );

    for (const translation of translations) {
      const legacy = verse?.a?.[translation] || {};
      for (const displayIndex of Object.keys(legacy)) {
        const numeric = Number(displayIndex);
        if (!Number.isInteger(numeric) || numeric < 0) {
          errors.push(`${label}: ${translation} has invalid legacy display index ${displayIndex}`);
          continue;
        }
        if (legacyValid(verse, translation, numeric, corpus, label)) {
          stats.legacyRoutes += 1;
        }
      }

      const v2 = verse?.v?.[translation] || {};
      const candidates = new Set([...Object.keys(legacy), ...Object.keys(v2)]);
      const exactSpans = [];

      for (const displayIndex of candidates) {
        const numeric = Number(displayIndex);
        if (!Number.isInteger(numeric) || numeric < 0) {
          errors.push(`${label}: ${translation} has invalid display index ${displayIndex}`);
          continue;
        }

        const legacyRoute = legacyValid(verse, translation, numeric, corpus, label);
        const compactV2 = v2[displayIndex]
          ? validateV2(verse, v2[displayIndex], numeric, corpus, label, translation)
          : null;

        let selected = null;
        if (compactV2 && compactV2.mode !== "segment-context") {
          selected = { kind: "exact-v2", compactV2 };
        } else if (legacyRoute) {
          selected = { kind: "legacy", legacyRoute };
          if (compactV2?.mode === "segment-context") {
            stats.legacyPreferredOverContext += 1;
          } else if (!compactV2) {
            stats.legacyOnly += 1;
          }
        } else if (compactV2) {
          selected = { kind: "context", compactV2 };
        }

        if (selected?.kind === "exact-v2") {
          const bounds = exactBounds(selected.compactV2, numeric);
          exactSpans.push({
            start: bounds.start,
            end: bounds.end,
            id: ownershipId(selected.compactV2, corpus, numeric),
          });
        } else if (selected?.kind === "legacy") {
          exactSpans.push({
            start: numeric,
            end: numeric,
            id: `legacy|${numeric}|${selected.legacyRoute.token[0]}|${selected.legacyRoute.token[4]}`,
          });
        }
      }

      const deduped = Array.from(
        new Map(exactSpans.map((span) => [`${span.start}:${span.end}:${span.id}`, span])).values(),
      ).sort((a, b) => a.start - b.start || a.end - b.end);

      for (let left = 0; left < deduped.length; left += 1) {
        for (let right = left + 1; right < deduped.length; right += 1) {
          if (deduped[right].start > deduped[left].end) break;
          const overlaps =
            deduped[left].start <= deduped[right].end &&
            deduped[right].start <= deduped[left].end;
          if (overlaps && deduped[left].id !== deduped[right].id) {
            stats.exactSpanOverlapPairs += 1;
          }
        }
      }
    }
  }
}

function auditBrentonOverlay() {
  const relative = "public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
  if (!exists(relative)) return;
  const manifest = JSON.parse(read(relative));
  const records = manifest.records || {};
  stats.brentonOverlayRecords = Object.keys(records).length;

  for (const [recordId, record] of Object.entries(records)) {
    for (const [displayIndex, route] of Object.entries(record?.routes || {})) {
      stats.brentonOverlayRoutes += 1;
      const numeric = Number(displayIndex);
      if (!Number.isInteger(numeric) || numeric < 0) {
        errors.push(`Brenton overlay ${recordId}: invalid display index ${displayIndex}`);
      }
      if (!Array.isArray(route) || route.length !== 3) {
        errors.push(`Brenton overlay ${recordId}:${displayIndex}: invalid route tuple`);
        continue;
      }
      const [sourceIndex, occurrenceId, entityId] = route;
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !occurrenceId || !/^word:lxx:L\d+$/.test(String(entityId))) {
        errors.push(`Brenton overlay ${recordId}:${displayIndex}: invalid exact LXX route`);
      }
    }
  }
}

function verifySourceContract() {
  const store = read("app/data/scripture/CanonicalVerseStore.ts");
  const scriptureText = read("app/components/ScriptureText.tsx");
  const readerStudy = read("app/components/ReaderVerseStudy.tsx");
  const types = read("app/data/lexicon/BibleIQTypes.ts");

  const required = [
    [types.includes("export type BibleIQReaderOwnership"), "BibleIQReaderOwnership type missing"],
    [types.includes("readerOwnership?: BibleIQReaderOwnership"), "token availability ownership field missing"],
    [store.includes("function resolveCompactReaderOwnershipAtToken("), "authoritative compact ownership resolver missing"],
    [store.includes("exact V2 ownership"), "exact V2 precedence marker missing"],
    [store.includes("sealed legacy exact ownership"), "legacy exact precedence marker missing"],
    [store.includes("V2 segment context"), "context precedence marker missing"],
    [!scriptureText.includes("readerOwnership"), "English reader still consumes ownership for navigation"],
    [!scriptureText.includes("data-word-token"), "English reader still exposes word tap targets"],
    [readerStudy.includes('data-source-word="true"'), "source-word navigation is missing"],
    [!scriptureText.includes("availability.sourceSegment"), "reader still interprets source segments"],
    [!scriptureText.includes('availability.routeMode ==='), "reader still interprets route modes"],
  ];

  for (const [ok, message] of required) {
    if (!ok) errors.push(message);
  }
}

verifySourceContract();

for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
  for (const file of walkJson(`public/data/bibleiq/word-study/${corpus}`)) {
    auditCompactBook(file);
  }
}

for (const file of walkJson("public/data/bibleiq/word-study-kjv-reader")) {
  auditCompactBook(file, "kjv");
}

auditBrentonOverlay();

console.log("PHASE 1 READER OWNERSHIP AUDIT");
console.log(JSON.stringify(stats, null, 2));

if (stats.compactBooks === 0) {
  errors.push("No compact word-study runtime books were found.");
}

if (warnings.length) {
  console.log("WARNINGS");
  warnings.slice(0, 50).forEach((warning) => console.log(`- ${warning}`));
}

if (errors.length) {
  console.error("ERRORS");
  errors.slice(0, 100).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 100) {
    console.error(`- ... ${errors.length - 100} additional errors`);
  }
  process.exit(1);
}

console.log("PASS: reader ownership policy is centralized and runtime routes are structurally valid.");
console.log("PASS: exact V2 > legacy exact > V2 context > unmapped precedence is auditable corpus-wide.");
console.log("NOTE: contextual ownership remains source-segment evidence and is never promoted to one lexical identity by this resolver.");
