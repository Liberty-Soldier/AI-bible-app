"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalize, expandEnglishForEntry } = require("../utils/englishExpansion");

const WEAK_METHOD = "expanded-exact-lexical-match";
const RECONCILED_METHOD = "weak-source-collision-reconciled";
const DEFAULT_MIN_REMOTE_DISPLAY_DISTANCE = 5;
const DEFAULT_MIN_EXTERNAL_SUPPORT = 1;
const STRONG_EVIDENCE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "hebrew-strong-english-evidence.json",
);

function sourceId(sourceToken) {
  return String(sourceToken?.id || "");
}
function sourceEntityId(sourceToken) {
  return String(sourceToken?.entityId || "");
}
function sourceStrong(sourceToken) {
  return String(sourceToken?.strong || "");
}
function tokenMethod(token) {
  return String(token?.method || token?.alignmentMethod || "");
}
function tokenIndex(token) {
  return Number(token?.index);
}
function normalizedTokenWord(token) {
  return normalize(token?.normalized || token?.text || "");
}
function hasAlignment(token) {
  return (
    Array.isArray(token?.alignedSourceTokenIds) &&
    token.alignedSourceTokenIds.length > 0
  );
}
function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function readStrongEvidence() {
  if (!fs.existsSync(STRONG_EVIDENCE_FILE)) {
    throw new Error(
      `Canonical Strong English evidence is missing: ${STRONG_EVIDENCE_FILE}`,
    );
  }

  const doc = JSON.parse(
    fs.readFileSync(STRONG_EVIDENCE_FILE, "utf8").replace(/^\uFEFF/u, ""),
  );

  if (doc?.schema !== "emetsees-hebrew-strong-english-evidence@2.0.0") {
    throw new Error(
      `Unexpected Strong English evidence schema: ${doc?.schema || "missing"}`,
    );
  }

  const core = { ...doc };
  delete core.checksum;
  const checksum = sha256Buffer(Buffer.from(JSON.stringify(core), "utf8"));

  if (doc.checksum && checksum !== doc.checksum) {
    throw new Error(
      `Strong English evidence checksum mismatch: expected ${doc.checksum}, got ${checksum}`,
    );
  }

  const map = new Map();
  for (const [strong, evidence] of Object.entries(doc.entries || {})) {
    const direct = new Set(
      Array.isArray(evidence?.direct)
        ? evidence.direct.map((term) => normalize(term)).filter(Boolean)
        : [],
    );
    const marked = new Set(
      Array.isArray(evidence?.marked)
        ? evidence.marked.map((term) => normalize(term)).filter(Boolean)
        : [],
    );
    const broad = new Set(
      Array.isArray(evidence?.broad)
        ? evidence.broad.map((term) => normalize(term)).filter(Boolean)
        : [],
    );
    map.set(String(strong), { direct, marked, broad });
  }

  function bucket(strong) {
    return map.get(String(strong || "")) || {
      direct: new Set(),
      marked: new Set(),
      broad: new Set(),
    };
  }

  return {
    doc,
    directSupports(strong, word) {
      return bucket(strong).direct.has(normalize(word));
    },
    markedSupports(strong, word) {
      return bucket(strong).marked.has(normalize(word));
    },
    broadSupports(strong, word) {
      return bucket(strong).broad.has(normalize(word));
    },
  };
}

function buildGeneratedLexiconIndex(lexicon) {
  const byEntityId = new Map();

  for (const entry of Array.isArray(lexicon) ? lexicon : []) {
    if (!entry?.strong) continue;

    const entityId = `hebrew:${entry.strong}`;
    const words = new Set();

    for (const value of expandEnglishForEntry(entry) || []) {
      const word = normalize(value);
      if (word) words.add(word);
    }

    byEntityId.set(entityId, words);
  }

  return byEntityId;
}

function collectClaims(translationData) {
  const claimsBySourceId = new Map();

  for (const token of translationData?.tokens || []) {
    if (!hasAlignment(token)) continue;

    for (const id of token.alignedSourceTokenIds) {
      const key = String(id || "");
      if (!key) continue;
      const list = claimsBySourceId.get(key) || [];
      list.push(token);
      claimsBySourceId.set(key, list);
    }
  }

  return claimsBySourceId;
}

function buildExternalSupport(canonicalByVerse, translationIds) {
  const support = new Map();

  function add(word, entityId, verseKey) {
    const key = `${word}\u0000${entityId}`;
    let verses = support.get(key);
    if (!verses) {
      verses = new Set();
      support.set(key, verses);
    }
    verses.add(verseKey);
  }

  for (const [verseKey, canonical] of Object.entries(canonicalByVerse || {})) {
    const sourceTokens = Array.isArray(canonical?.sourceTokens)
      ? canonical.sourceTokens
      : [];
    const sourceById = new Map(
      sourceTokens.map((sourceToken) => [sourceId(sourceToken), sourceToken]),
    );

    for (const [translationId, translationData] of Object.entries(
      canonical?.translations || {},
    )) {
      if (!translationIds.has(translationId)) continue;

      const claimsBySourceId = collectClaims(translationData);

      for (const token of translationData?.tokens || []) {
        if (!hasAlignment(token)) continue;
        const word = normalizedTokenWord(token);
        if (!word) continue;

        for (const alignedId of token.alignedSourceTokenIds) {
          const id = String(alignedId || "");
          const source = sourceById.get(id);
          if (!source) continue;

          // Support only from source occurrences that are not already
          // contested by multiple English tokens in this translation/verse.
          const claimCount = claimsBySourceId.get(id)?.length || 0;
          if (claimCount !== 1) continue;

          const entityId = sourceEntityId(source);
          if (!entityId) continue;
          add(word, entityId, verseKey);
        }
      }
    }
  }

  return {
    count(word, entityId, excludedVerseKey) {
      const verses = support.get(
        `${normalize(word)}\u0000${String(entityId || "")}`,
      );
      if (!verses) return 0;

      let count = 0;
      for (const verseKey of verses) {
        if (verseKey !== excludedVerseKey) count += 1;
      }
      return count;
    },
  };
}

function summarizeSource(sourceToken) {
  return {
    id: sourceId(sourceToken),
    index: Number(sourceToken?.index),
    surface: sourceToken?.surface ?? null,
    lemma: sourceToken?.lemma ?? null,
    strong: sourceStrong(sourceToken),
    entityId: sourceEntityId(sourceToken),
  };
}

function reconcileWeakSourceCollisions(
  canonicalByVerse,
  lexicon,
  options = {},
) {
  const apply = options.apply !== false;
  const translationIds = new Set(
    Array.isArray(options.translationIds) && options.translationIds.length
      ? options.translationIds
      : ["kjv"],
  );
  const minRemoteDisplayDistance = Number.isFinite(
    Number(options.minRemoteDisplayDistance),
  )
    ? Number(options.minRemoteDisplayDistance)
    : DEFAULT_MIN_REMOTE_DISPLAY_DISTANCE;
  const minExternalSupport = Number.isFinite(
    Number(options.minExternalSupport),
  )
    ? Number(options.minExternalSupport)
    : DEFAULT_MIN_EXTERNAL_SUPPORT;

  const generatedLexicon = buildGeneratedLexiconIndex(lexicon);
  const strongEvidence = readStrongEvidence();
  const externalSupport = buildExternalSupport(
    canonicalByVerse,
    translationIds,
  );

  const proposedRepairs = [];
  const deferredEvidenceQueue = [];

  for (const verseKey of Object.keys(canonicalByVerse || {}).sort()) {
    const canonical = canonicalByVerse[verseKey];
    const sourceTokens = Array.isArray(canonical?.sourceTokens)
      ? canonical.sourceTokens
      : [];

    if (!sourceTokens.length) continue;

    const sourceById = new Map(
      sourceTokens.map((sourceToken) => [sourceId(sourceToken), sourceToken]),
    );

    for (const [translationId, translationData] of Object.entries(
      canonical?.translations || {},
    )) {
      if (!translationIds.has(translationId)) continue;

      const claimsBySourceId = collectClaims(translationData);
      const initiallyClaimedSourceIds = new Set(claimsBySourceId.keys());
      const newlyConsumedTargetIds = new Set();

      for (const [sharedSourceId, claims] of [...claimsBySourceId.entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        if (claims.length < 2) continue;

        const weakClaims = claims.filter(
          (token) => tokenMethod(token) === WEAK_METHOD,
        );
        const strongerClaims = claims.filter(
          (token) => tokenMethod(token) !== WEAK_METHOD,
        );

        if (!weakClaims.length || !strongerClaims.length) continue;

        const currentSource = sourceById.get(sharedSourceId);
        if (!currentSource) {
          deferredEvidenceQueue.push({
            reason: "shared-source-token-missing",
            verseKey,
            translationId,
            sharedSourceId,
          });
          continue;
        }

        for (const weakToken of weakClaims) {
          const word = normalizedTokenWord(weakToken);
          if (!word) continue;

          const weakIndex = tokenIndex(weakToken);
          const strongerDistances = strongerClaims
            .map((token) => Math.abs(tokenIndex(token) - weakIndex))
            .filter(Number.isFinite);
          const nearestStrongerDistance = strongerDistances.length
            ? Math.min(...strongerDistances)
            : Infinity;

          if (
            !Number.isFinite(nearestStrongerDistance) ||
            nearestStrongerDistance < minRemoteDisplayDistance
          ) {
            deferredEvidenceQueue.push({
              reason:
                "nearby-shared-source-preserved-as-possible-multiword-rendering",
              verseKey,
              translationId,
              word,
              displayIndex: weakIndex,
              sharedSource: summarizeSource(currentSource),
              strongerClaims: strongerClaims.map((token) => ({
                index: tokenIndex(token),
                text: token?.text ?? null,
                normalized: normalizedTokenWord(token),
                method: tokenMethod(token),
              })),
            });
            continue;
          }

          const currentStrong = sourceStrong(currentSource);
          const currentDirectSupport = strongEvidence.directSupports(
            currentStrong,
            word,
          );
          const currentMarkedSupport = strongEvidence.markedSupports(
            currentStrong,
            word,
          );

          // The proven Gen 3:16 family is specifically a broad/marked Strong
          // usage leaking through the expanded lexical fallback. Do not move a
          // route when the currently shared source itself directly supports the
          // English word; that is genuine lexical ambiguity, not Tier-A repair.
          // Requiring a marked exact usage on the current source keeps this
          // automatic repair family narrow and evidence-bound.
          if (currentDirectSupport || !currentMarkedSupport) {
            deferredEvidenceQueue.push({
              reason: currentDirectSupport
                ? "shared-source-also-directly-supports-word"
                : "shared-source-not-exact-marked-usage-family",
              verseKey,
              translationId,
              word,
              displayIndex: weakIndex,
              sharedSource: summarizeSource(currentSource),
              currentDirectSupport,
              currentMarkedSupport,
            });
            continue;
          }

          const alternatives = sourceTokens.filter((candidate) => {
            const candidateId = sourceId(candidate);
            const entityId = sourceEntityId(candidate);
            const strong = sourceStrong(candidate);

            if (!candidateId || !entityId || !strong) return false;
            if (candidateId === sharedSourceId) return false;
            if (initiallyClaimedSourceIds.has(candidateId)) return false;
            if (newlyConsumedTargetIds.has(candidateId)) return false;

            const generatedWords = generatedLexicon.get(entityId);
            const generatedSupport = Boolean(
              generatedWords && generatedWords.has(word),
            );
            const directSupport = strongEvidence.directSupports(strong, word);

            // Tier-A automatic repair requires the target entity to give the
            // English word as a direct, unmarked KJV usage alternative. Broad
            // dictionary token overlap is diagnostic only.
            if (!directSupport) return false;

            const outsideSupport = externalSupport.count(
              word,
              entityId,
              verseKey,
            );

            if (outsideSupport < minExternalSupport) return false;

            return true;
          });

          if (alternatives.length !== 1) {
            deferredEvidenceQueue.push({
              reason:
                alternatives.length === 0
                  ? "no-unique-unused-source-with-direct-strong-and-external-kjv-support"
                  : "multiple-unused-sources-with-direct-strong-and-external-kjv-support",
              verseKey,
              translationId,
              word,
              displayIndex: weakIndex,
              sharedSource: summarizeSource(currentSource),
              alternativeCount: alternatives.length,
              alternatives: alternatives.map(summarizeSource),
            });
            continue;
          }

          const target = alternatives[0];
          const targetEntityId = sourceEntityId(target);
          const targetStrong = sourceStrong(target);
          const outsideSupport = externalSupport.count(
            word,
            targetEntityId,
            verseKey,
          );
          const generatedWords = generatedLexicon.get(targetEntityId);
          const generatedSupport = Boolean(
            generatedWords && generatedWords.has(word),
          );

          const proposal = {
            verseKey,
            book: canonical?.book ?? null,
            chapter: Number(canonical?.chapter),
            verse: Number(canonical?.verse),
            translationId,
            displayIndex: weakIndex,
            displayText: weakToken?.text ?? null,
            normalized: word,
            fromSource: summarizeSource(currentSource),
            toSource: summarizeSource(target),
            fromMethod: tokenMethod(weakToken),
            strongerOwners: strongerClaims.map((token) => ({
              displayIndex: tokenIndex(token),
              displayText: token?.text ?? null,
              normalized: normalizedTokenWord(token),
              method: tokenMethod(token),
            })),
            evidence: {
              uniqueUnusedVerseLocalSource: true,
              targetDirectUnmarkedStrongUsageSupport: true,
              sharedSourceDirectStrongUsageSupport: currentDirectSupport,
              sharedSourceMarkedStrongUsageSupport: currentMarkedSupport,
              generatedLexiconSupport: generatedSupport,
              nonCollidingExternalKjvSupportCount: outsideSupport,
              tier: "A-marked-to-direct",
            },
          };

          proposedRepairs.push(proposal);
          newlyConsumedTargetIds.add(sourceId(target));

          if (apply) {
            weakToken.alignedSourceTokenIds = [sourceId(target)];
            weakToken.confidence = "medium";
            weakToken.method = RECONCILED_METHOD;
          }
        }
      }
    }
  }

  return {
    schema: "emetsees-weak-source-collision-reconciliation@3.0.0",
    policy: {
      weakMethod: WEAK_METHOD,
      reconciledMethod: RECONCILED_METHOD,
      translationIds: [...translationIds],
      minRemoteDisplayDistance,
      minExternalSupport,
      requiresSharedSourceToHaveStrongerOwner: true,
      requiresUniqueUnusedVerseLocalAlternative: true,
      requiresTargetDirectUnmarkedStrongUsageSupport: true,
      requiresSharedSourceMarkedExactUsage: true,
      rejectsSharedSourceDirectUsageAmbiguity: true,
      requiresNonCollidingExternalKjvSupport: true,
      broadStrongVocabularyIsDiagnosticOnly: true,
      generatedLexiconIsSupplementalOnly: true,
      permitsManualVersePatch: false,
      preservesNearbySharedSourceRelationships: true,
    },
    lexicalEvidence: {
      file: STRONG_EVIDENCE_FILE,
      sourceSha256: strongEvidence.doc.sourceSha256,
      checksum: strongEvidence.doc.checksum,
      semanticEntryCount: strongEvidence.doc.semanticEntryCount,
    },
    proposedRepairs,
    deferredEvidenceQueue,
  };
}

module.exports = {
  WEAK_METHOD,
  RECONCILED_METHOD,
  reconcileWeakSourceCollisions,
};
