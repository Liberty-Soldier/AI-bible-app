"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  normalizeEnglish,
  sameWordFamily,
  sourceEvidenceValues,
  sourceProperNameValues,
  isProperNameSource,
  phraseCandidatesForSource,
  isFunctionWord,
} = require("./english-matching.cjs");

const ROOT = process.cwd();
const PRIVATE_ROOT = path.join(ROOT, ".private", "scripture", "canonical");
const COMMITTED_ROOT = path.join(ROOT, "app", "data", "bibleiq", "canonical");
const REPORT_ROOT = path.join(ROOT, "reports", "p052-alignment-expansion");

const CORPORA = ["hebrew", "greek-nt", "lxx"];
const APPLY = process.argv.includes("--apply");
const SAMPLE_LIMIT = 500;

function fail(message) {
  throw new Error(`[P05.2 alignment] ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {};
  }

  for (const key of ["verses", "records", "data", "entries"]) {
    const candidate = document[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.values(candidate).some(
        (value) =>
          value &&
          typeof value === "object" &&
          Array.isArray(value.sourceTokens),
      )
    ) {
      return candidate;
    }
  }

  return document;
}

function lexicalIdForSource(sourceToken, corpus) {
  if (corpus === "lxx") {
    return String(
      sourceToken?.lxxId ||
        String(sourceToken?.entityId || "").split(":").at(-1) ||
        "",
    );
  }

  return String(
    sourceToken?.strong ||
      String(sourceToken?.entityId || "").split(":").at(-1) ||
      "",
  );
}

function normalizeLexicalId(value, corpus) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  if (corpus === "hebrew") {
    const match = raw.match(/H0*(\d+)/);
    return match ? `H${Number(match[1])}` : "";
  }

  if (corpus === "greek-nt") {
    const match = raw.match(/G0*(\d+)/);
    return match ? `G${String(Number(match[1])).padStart(4, "0")}` : "";
  }

  const match = raw.match(/L0*(\d+)/);
  return match ? `L${Number(match[1])}` : "";
}

function generatedLexiconPath(corpus) {
  const names = {
    hebrew: "generatedHebrewLexiconV12.json",
    "greek-nt": "generatedNTGreekLexiconV12.json",
    lxx: "generatedLXXGreekLexiconV12.json",
  };
  return path.join(ROOT, "app", "data", "lexicon", names[corpus]);
}

function generatedEntryId(entry, corpus) {
  const candidates =
    corpus === "lxx"
      ? [entry?.id, entry?.lxxId, entry?.lexicalId]
      : [entry?.strong, entry?.strongs, entry?.lexicalId, entry?.id];

  for (const candidate of candidates) {
    const normalized = normalizeLexicalId(candidate, corpus);
    if (normalized) return normalized;
  }
  return "";
}

function lexiconEntries(document) {
  if (Array.isArray(document)) return document;
  for (const key of ["entries", "records", "data", "items"]) {
    if (Array.isArray(document?.[key])) return document[key];
  }
  if (document?.dict && typeof document.dict === "object") {
    return Object.entries(document.dict).map(([key, value]) => ({
      __key: key,
      ...value,
    }));
  }
  return [];
}

function loadLexiconIndex(corpus) {
  const filePath = generatedLexiconPath(corpus);
  const index = new Map();

  if (!fs.existsSync(filePath)) return index;

  for (const entry of lexiconEntries(readJson(filePath))) {
    const id =
      generatedEntryId(entry, corpus) ||
      normalizeLexicalId(entry?.__key, corpus);
    if (!id) continue;

    const current = index.get(id) || {};
    index.set(id, { ...current, ...entry });
  }

  return index;
}

function translationStats(verseMap) {
  const totals = {};

  for (const verse of Object.values(verseMap)) {
    for (const [translation, record] of Object.entries(
      verse?.translations || {},
    )) {
      if (!totals[translation]) {
        totals[translation] = {
          displayTokens: 0,
          alignedTokens: 0,
          contentTokens: 0,
          alignedContentTokens: 0,
        };
      }

      for (const token of record?.tokens || []) {
        const text = token?.normalized || token?.text;
        if (!normalizeEnglish(text)) continue;

        totals[translation].displayTokens += 1;
        const aligned =
          Array.isArray(token?.alignedSourceTokenIds) &&
          token.alignedSourceTokenIds.length > 0;

        if (aligned) totals[translation].alignedTokens += 1;

        if (!isFunctionWord(text)) {
          totals[translation].contentTokens += 1;
          if (aligned) totals[translation].alignedContentTokens += 1;
        }
      }
    }
  }

  for (const value of Object.values(totals)) {
    value.alignedRate =
      value.displayTokens > 0
        ? value.alignedTokens / value.displayTokens
        : 0;
    value.contentAlignedRate =
      value.contentTokens > 0
        ? value.alignedContentTokens / value.contentTokens
        : 0;
  }

  return totals;
}

function alignedIds(tokens) {
  const ids = new Set();
  for (const token of tokens || []) {
    for (const id of token?.alignedSourceTokenIds || []) ids.add(String(id));
  }
  return ids;
}

function alignmentFingerprint(verseMap) {
  const records = [];

  for (const [reference, verse] of Object.entries(verseMap)) {
    for (const [translation, record] of Object.entries(
      verse?.translations || {},
    )) {
      for (const token of record?.tokens || []) {
        const ids = (token?.alignedSourceTokenIds || []).map(String);
        if (!ids.length) continue;
        records.push(
          `${reference}|${translation}|${token.index}|${ids.join(",")}`,
        );
      }
    }
  }

  return new Set(records);
}

function tokenPhrase(tokens, start, length) {
  return tokens
    .slice(start, start + length)
    .map((token) => normalizeEnglish(token?.normalized || token?.text))
    .filter(Boolean)
    .join(" ");
}

function estimatedSourceIndex(displayIndex, displayCount, sourceCount) {
  if (displayCount <= 1 || sourceCount <= 1) return 0;
  return (displayIndex / (displayCount - 1)) * (sourceCount - 1);
}

function sourceLexiconEntry(sourceToken, corpus, lexiconIndex) {
  const id = normalizeLexicalId(
    lexicalIdForSource(sourceToken, corpus),
    corpus,
  );
  return id ? lexiconIndex.get(id) || null : null;
}

function sourceHasValidEntity(sourceToken, corpus) {
  const id = String(sourceToken?.entityId || "");
  if (corpus === "hebrew") {
    return /^(?:word:)?hebrew:H\d+$/.test(id);
  }
  if (corpus === "greek-nt") {
    return /^word:greek-nt:G\d+$/.test(id);
  }
  return /^word:lxx:L\d+$/.test(id);
}

function applyTokenAlignment({
  token,
  sourceToken,
  method,
  kind,
  groupId,
}) {
  token.alignedSourceTokenIds = [sourceToken.id];
  token.alignedSourceEntityIds = [sourceToken.entityId].filter(Boolean);
  token.alignmentStatus = "aligned";
  token.alignmentConfidence = "high";
  token.confidence = "high";
  token.alignmentMethod = method;
  token.method = method;
  token.alignmentKind = kind;
  if (groupId) token.alignmentGroupId = groupId;
}

function sourceMatchScore({
  token,
  sourceToken,
  corpus,
  lexiconEntry,
  displayCount,
  sourceCount,
}) {
  const text = normalizeEnglish(token?.normalized || token?.text);
  if (!text || isFunctionWord(text)) return null;

  const evidence = sourceEvidenceValues(sourceToken, lexiconEntry);
  const properValues = sourceProperNameValues(sourceToken, lexiconEntry);
  const proper = isProperNameSource(sourceToken, lexiconEntry);

  let lexicalScore = 0;
  let method = "";

  if (proper && properValues.has(text)) {
    lexicalScore = 115;
    method = "p052-proper-name-exact";
  }

  for (const value of evidence) {
    if (value === text && lexicalScore < 110) {
      lexicalScore = 110;
      method = "p052-direct-exact";
      continue;
    }

    if (
      !value.includes(" ") &&
      sameWordFamily(text, value) &&
      lexicalScore < 100
    ) {
      lexicalScore = 100;
      method = "p052-direct-irregular-family";
    }
  }

  if (!lexicalScore) return null;

  const expected = estimatedSourceIndex(
    Number(token.index),
    displayCount,
    sourceCount,
  );
  const distance = Math.abs(Number(sourceToken.index) - expected);

  return {
    sourceToken,
    lexicalScore,
    finalScore: lexicalScore - Math.min(distance, 12) * 0.75,
    method,
    kind: proper && method.includes("proper") ? "proper-name" : "direct",
  };
}

function tryPhrasePass({
  corpus,
  reference,
  translation,
  tokens,
  sourceTokens,
  usedSourceIds,
  lexiconIndex,
  additions,
  ambiguous,
}) {
  const occupiedDisplay = new Set();

  for (const token of tokens) {
    if (token?.alignedSourceTokenIds?.length) occupiedDisplay.add(token.index);
  }

  const sourceCandidates = [];

  for (const sourceToken of sourceTokens) {
    if (usedSourceIds.has(sourceToken.id)) continue;
    if (!sourceHasValidEntity(sourceToken, corpus)) continue;

    const lexiconEntry = sourceLexiconEntry(
      sourceToken,
      corpus,
      lexiconIndex,
    );

    for (const phrase of phraseCandidatesForSource(
      sourceToken,
      lexiconEntry,
    )) {
      const length = phrase.split(/\s+/).length;
      if (length < 2 || length > 4) continue;
      sourceCandidates.push({ sourceToken, phrase, length });
    }
  }

  for (let start = 0; start < tokens.length; start += 1) {
    for (const length of [4, 3, 2]) {
      if (start + length > tokens.length) continue;

      const windowTokens = tokens.slice(start, start + length);
      if (
        windowTokens.some(
          (token) =>
            occupiedDisplay.has(token.index) ||
            token?.alignedSourceTokenIds?.length,
        )
      ) {
        continue;
      }

      const phrase = tokenPhrase(tokens, start, length);
      if (!phrase) continue;
      if (windowTokens.every((token) => isFunctionWord(token.text))) continue;

      const matches = sourceCandidates.filter(
        (candidate) =>
          candidate.length === length && candidate.phrase === phrase,
      );

      const uniqueBySource = new Map(
        matches.map((match) => [match.sourceToken.id, match]),
      );
      const unique = [...uniqueBySource.values()];

      if (unique.length !== 1) {
        if (unique.length > 1 && ambiguous.length < SAMPLE_LIMIT) {
          ambiguous.push({
            corpus,
            reference,
            translation,
            display: phrase,
            reason: "ambiguous-phrase",
            candidateSourceIds: unique.map(
              (item) => item.sourceToken.id,
            ),
          });
        }
        continue;
      }

      const { sourceToken } = unique[0];
      const groupId = `${corpus}:${reference}:${translation}:phrase:${start}`;
      const alignableWindowTokens = windowTokens.filter(
        (token) => !isFunctionWord(token.text),
      );

      if (!alignableWindowTokens.length) continue;

      for (const token of alignableWindowTokens) {
        applyTokenAlignment({
          token,
          sourceToken,
          method: "p052-phrase-exact",
          kind: "phrase",
          groupId,
        });
        occupiedDisplay.add(token.index);
      }

      usedSourceIds.add(sourceToken.id);

      additions.push({
        corpus,
        reference,
        translation,
        displayTokenIndexes: alignableWindowTokens.map((token) => token.index),
        displayText: windowTokens.map((token) => token.text).join(" "),
        sourceTokenId: sourceToken.id,
        sourceEntityId: sourceToken.entityId,
        sourceSurface: sourceToken.surface || "",
        sourceLemma: sourceToken.lemma || "",
        method: "p052-phrase-exact",
        kind: "phrase",
        groupId,
      });
    }
  }
}

function siblingTransferMap(translations, targetTranslation) {
  const map = new Map();

  for (const [translation, record] of Object.entries(translations)) {
    if (translation === targetTranslation) continue;

    for (const token of record?.tokens || []) {
      const ids = token?.alignedSourceTokenIds || [];
      const normalized = normalizeEnglish(token?.normalized || token?.text);
      if (!normalized || ids.length !== 1 || isFunctionWord(normalized)) continue;

      if (!map.has(normalized)) map.set(normalized, new Set());
      map.get(normalized).add(String(ids[0]));
    }
  }

  return map;
}

function tryCrossWitnessPass({
  corpus,
  reference,
  translation,
  translations,
  tokens,
  sourceById,
  usedSourceIds,
  additions,
}) {
  const sibling = siblingTransferMap(translations, translation);

  for (const token of tokens) {
    if (token?.alignedSourceTokenIds?.length) continue;

    const text = normalizeEnglish(token?.normalized || token?.text);
    if (!text || isFunctionWord(text)) continue;

    const possible = new Set();

    for (const [siblingWord, ids] of sibling.entries()) {
      if (!sameWordFamily(text, siblingWord)) continue;
      for (const id of ids) {
        if (!usedSourceIds.has(id)) possible.add(id);
      }
    }

    if (possible.size !== 1) continue;
    const sourceToken = sourceById.get([...possible][0]);
    if (!sourceToken || !sourceHasValidEntity(sourceToken, corpus)) continue;

    applyTokenAlignment({
      token,
      sourceToken,
      method: "p052-cross-witness-family",
      kind: "cross-witness",
    });
    usedSourceIds.add(sourceToken.id);

    additions.push({
      corpus,
      reference,
      translation,
      displayTokenIndexes: [token.index],
      displayText: token.text,
      sourceTokenId: sourceToken.id,
      sourceEntityId: sourceToken.entityId,
      sourceSurface: sourceToken.surface || "",
      sourceLemma: sourceToken.lemma || "",
      method: "p052-cross-witness-family",
      kind: "cross-witness",
    });
  }
}

function tryDirectPass({
  corpus,
  reference,
  translation,
  tokens,
  sourceTokens,
  usedSourceIds,
  lexiconIndex,
  additions,
  ambiguous,
}) {
  for (const token of tokens) {
    if (token?.alignedSourceTokenIds?.length) continue;

    const text = normalizeEnglish(token?.normalized || token?.text);
    if (!text || isFunctionWord(text)) continue;

    const candidates = [];

    for (const sourceToken of sourceTokens) {
      if (usedSourceIds.has(sourceToken.id)) continue;
      if (!sourceHasValidEntity(sourceToken, corpus)) continue;

      const candidate = sourceMatchScore({
        token,
        sourceToken,
        corpus,
        lexiconEntry: sourceLexiconEntry(
          sourceToken,
          corpus,
          lexiconIndex,
        ),
        displayCount: tokens.length,
        sourceCount: sourceTokens.length,
      });

      if (candidate) candidates.push(candidate);
    }

    candidates.sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        Number(left.sourceToken.index) - Number(right.sourceToken.index),
    );

    if (!candidates.length || candidates[0].lexicalScore < 100) continue;

    const best = candidates[0];
    const second = candidates[1];
    const margin = second
      ? best.finalScore - second.finalScore
      : Number.POSITIVE_INFINITY;

    if (second && margin < 8) {
      if (ambiguous.length < SAMPLE_LIMIT) {
        ambiguous.push({
          corpus,
          reference,
          translation,
          display: token.text,
          reason: "ambiguous-direct",
          topScore: best.finalScore,
          secondScore: second.finalScore,
          candidateSourceIds: candidates
            .slice(0, 5)
            .map((item) => item.sourceToken.id),
        });
      }
      continue;
    }

    applyTokenAlignment({
      token,
      sourceToken: best.sourceToken,
      method: best.method,
      kind: best.kind,
    });
    usedSourceIds.add(best.sourceToken.id);

    additions.push({
      corpus,
      reference,
      translation,
      displayTokenIndexes: [token.index],
      displayText: token.text,
      sourceTokenId: best.sourceToken.id,
      sourceEntityId: best.sourceToken.entityId,
      sourceSurface: best.sourceToken.surface || "",
      sourceLemma: best.sourceToken.lemma || "",
      method: best.method,
      kind: best.kind,
      lexicalScore: best.lexicalScore,
      finalScore: Number(best.finalScore.toFixed(3)),
    });
  }
}

function processVerseMap(corpus, verseMap, lexiconIndex) {
  const additions = [];
  const ambiguous = [];

  for (const [reference, verse] of Object.entries(verseMap)) {
    const sourceTokens = Array.isArray(verse?.sourceTokens)
      ? verse.sourceTokens
      : [];
    const translations =
      verse?.translations && typeof verse.translations === "object"
        ? verse.translations
        : {};

    const sourceById = new Map(
      sourceTokens.map((token) => [String(token.id), token]),
    );

    for (const [translation, record] of Object.entries(translations)) {
      const tokens = Array.isArray(record?.tokens) ? record.tokens : [];
      const usedSourceIds = alignedIds(tokens);

      tryPhrasePass({
        corpus,
        reference,
        translation,
        tokens,
        sourceTokens,
        usedSourceIds,
        lexiconIndex,
        additions,
        ambiguous,
      });

      tryCrossWitnessPass({
        corpus,
        reference,
        translation,
        translations,
        tokens,
        sourceById,
        usedSourceIds,
        additions,
      });

      tryDirectPass({
        corpus,
        reference,
        translation,
        tokens,
        sourceTokens,
        usedSourceIds,
        lexiconIndex,
        additions,
        ambiguous,
      });
    }
  }

  return { additions, ambiguous };
}

function main() {
  const inputRoot = fs.existsSync(PRIVATE_ROOT)
    ? PRIVATE_ROOT
    : COMMITTED_ROOT;

  if (!fs.existsSync(inputRoot)) {
    fail("No canonical corpus was found.");
  }

  if (APPLY && inputRoot !== PRIVATE_ROOT) {
    fail(
      "Apply mode requires .private/scripture/canonical so the authoritative local canonical source is updated.",
    );
  }

  fs.mkdirSync(REPORT_ROOT, { recursive: true });

  const allAdditions = [];
  const allAmbiguous = [];
  const corpusReport = {};
  const stagedWrites = [];
  let totalChangedFiles = 0;

  const applyStamp = APPLY
    ? new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+$/, "")
    : null;
  const backupRoot = APPLY
    ? path.join(
        ROOT,
        ".private",
        "p05-backups",
        `p052-alignment-expansion-${applyStamp}`,
      )
    : null;
  const stageRoot = APPLY
    ? path.join(
        ROOT,
        ".private",
        "p052-stage",
        `p052-alignment-expansion-${applyStamp}`,
      )
    : null;

  if (stageRoot) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.mkdirSync(stageRoot, { recursive: true });
  }

  for (const corpus of CORPORA) {
    const directory = path.join(inputRoot, corpus);
    const lexiconIndex = loadLexiconIndex(corpus);

    if (!fs.existsSync(directory)) {
      corpusReport[corpus] = { missing: true };
      continue;
    }

    const files = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    const before = {};
    const after = {};
    let changedFiles = 0;
    let corpusAdditions = 0;

    for (const file of files) {
      const filePath = path.join(directory, file);
      const originalRaw = fs.readFileSync(filePath, "utf8");
      const document = JSON.parse(originalRaw.replace(/^\uFEFF/, ""));
      const verseMap = unwrapVerseMap(document);
      const baselineFingerprint = alignmentFingerprint(verseMap);

      const beforeFile = translationStats(verseMap);
      for (const [translation, stats] of Object.entries(beforeFile)) {
        if (!before[translation]) {
          before[translation] = {
            displayTokens: 0,
            alignedTokens: 0,
            contentTokens: 0,
            alignedContentTokens: 0,
          };
        }
        for (const key of [
          "displayTokens",
          "alignedTokens",
          "contentTokens",
          "alignedContentTokens",
        ]) {
          before[translation][key] += stats[key];
        }
      }

      const result = processVerseMap(corpus, verseMap, lexiconIndex);
      for (const addition of result.additions) {
        allAdditions.push(addition);
      }
      for (const proposal of result.ambiguous) {
        allAmbiguous.push(proposal);
      }
      corpusAdditions += result.additions.reduce(
        (sum, item) => sum + item.displayTokenIndexes.length,
        0,
      );

      const afterFile = translationStats(verseMap);
      for (const [translation, stats] of Object.entries(afterFile)) {
        if (!after[translation]) {
          after[translation] = {
            displayTokens: 0,
            alignedTokens: 0,
            contentTokens: 0,
            alignedContentTokens: 0,
          };
        }
        for (const key of [
          "displayTokens",
          "alignedTokens",
          "contentTokens",
          "alignedContentTokens",
        ]) {
          after[translation][key] += stats[key];
        }
      }

      if (result.additions.length > 0) {
        changedFiles += 1;
        totalChangedFiles += 1;

        const currentFingerprint = alignmentFingerprint(verseMap);
        for (const record of baselineFingerprint) {
          if (!currentFingerprint.has(record)) {
            fail(`An existing alignment changed or disappeared: ${record}`);
          }
        }

        if (APPLY) {
          const backupPath = path.join(backupRoot, corpus, file);
          const stagePath = path.join(stageRoot, corpus, file);

          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          fs.mkdirSync(path.dirname(stagePath), { recursive: true });
          fs.writeFileSync(backupPath, originalRaw, "utf8");
          writeJson(stagePath, document);

          stagedWrites.push({ filePath, stagePath });
        }
      }
    }

    for (const group of [before, after]) {
      for (const stats of Object.values(group)) {
        stats.alignedRate =
          stats.displayTokens > 0
            ? stats.alignedTokens / stats.displayTokens
            : 0;
        stats.contentAlignedRate =
          stats.contentTokens > 0
            ? stats.alignedContentTokens / stats.contentTokens
            : 0;
      }
    }

    corpusReport[corpus] = {
      files: files.length,
      changedFiles,
      addedDisplayTokenAlignments: corpusAdditions,
      before,
      after,
    };
  }

  const byMethod = {};
  const byCorpus = {};
  for (const addition of allAdditions) {
    const count = addition.displayTokenIndexes.length;
    byMethod[addition.method] = (byMethod[addition.method] || 0) + count;
    byCorpus[addition.corpus] = (byCorpus[addition.corpus] || 0) + count;
  }

  const report = {
    version: "p052-safe-alignment-expansion@1",
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "plan",
    inputRoot: path.relative(ROOT, inputRoot).replace(/\\/g, "/"),
    rules: {
      existingAlignmentsPreserved: true,
      functionWordsExcludedFromDirectPass: true,
      phraseLength: "2-4 tokens",
      directMinimumLexicalScore: 100,
      directAmbiguityMargin: 8,
      confidence: "high only",
    },
    totals: {
      addedDisplayTokenAlignments: allAdditions.reduce(
        (sum, item) => sum + item.displayTokenIndexes.length,
        0,
      ),
      addedGroups: allAdditions.length,
      ambiguousProposalsRetainedForReview: allAmbiguous.length,
      changedFiles: totalChangedFiles,
    },
    byCorpus,
    byMethod,
    corpora: corpusReport,
    samples: allAdditions.slice(0, SAMPLE_LIMIT),
    ambiguousSamples: allAmbiguous.slice(0, SAMPLE_LIMIT),
  };

  if (APPLY) {
    for (const pending of stagedWrites) {
      fs.copyFileSync(pending.stagePath, pending.filePath);
    }

    report.backupRoot = path.relative(ROOT, backupRoot).replace(/\\/g, "/");
    report.stagedFileCount = stagedWrites.length;
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }

  const reportPath = path.join(REPORT_ROOT, "report.json");
  writeJson(reportPath, report);

  const csvEscape = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csvRows = allAdditions.slice(0, 5000).map((item) => ({
    corpus: item.corpus,
    reference: item.reference,
    translation: item.translation,
    displayText: item.displayText,
    sourceSurface: item.sourceSurface,
    sourceLemma: item.sourceLemma,
    sourceEntityId: item.sourceEntityId,
    method: item.method,
    kind: item.kind,
  }));

  const columns = [
    "corpus",
    "reference",
    "translation",
    "displayText",
    "sourceSurface",
    "sourceLemma",
    "sourceEntityId",
    "method",
    "kind",
  ];

  fs.writeFileSync(
    path.join(REPORT_ROOT, "added-alignments.jsonl"),
    allAdditions.map((item) => JSON.stringify(item)).join("\n") +
      (allAdditions.length ? "\n" : ""),
    "utf8",
  );

  fs.writeFileSync(
    path.join(REPORT_ROOT, "added-alignments.csv"),
    [
      columns.map(csvEscape).join(","),
      ...csvRows.map((row) =>
        columns.map((column) => csvEscape(row[column])).join(","),
      ),
      "",
    ].join("\n"),
    "utf8",
  );

  console.log("");
  console.log(`P05.2 alignment ${APPLY ? "application" : "plan"} complete.`);
  console.log(
    `- Added display-token alignments: ${report.totals.addedDisplayTokenAlignments.toLocaleString()}`,
  );
  console.log(
    `- Changed canonical files: ${report.totals.changedFiles.toLocaleString()}`,
  );
  console.log(`- By corpus: ${JSON.stringify(byCorpus)}`);
  console.log(`- By method: ${JSON.stringify(byMethod)}`);
  console.log(
    `- Ambiguous proposals left unchanged: ${allAmbiguous.length.toLocaleString()}`,
  );
  console.log(
    "- Existing alignments removed or changed: 0",
  );
  console.log(
    `- Report: ${path.relative(ROOT, reportPath)}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
