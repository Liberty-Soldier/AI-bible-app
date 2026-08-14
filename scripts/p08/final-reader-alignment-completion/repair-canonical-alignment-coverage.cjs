#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());
const REPORT_DIR = path.resolve(
  process.env.EMETSEES_P0812_REPORT_DIR ||
  path.join(ROOT, ".private", "reports", "P08.12", "manual"),
);
const MODE = process.argv.includes("--apply") ? "apply" : "preview";
const AUDITED_KJV_WITNESS_FILE = path.resolve(
  process.env.EMETSEES_P0812_AUDITED_KJV_WITNESS || "",
);

const CANONICAL_ROOT = path.join(ROOT, "app", "data", "bibleiq", "canonical");
const STRONG_EVIDENCE_FILE = path.join(
  ROOT,
  "scripts",
  "canonical",
  "data",
  "hebrew-strong-english-evidence.json",
);

const TRANSLATIONS_BY_CORPUS = Object.freeze({
  hebrew: ["web", "kjv"],
  "greek-nt": ["web", "kjv"],
  lxx: ["brenton"],
});

const APPROVED_GREEK_COMPOUNDS = new Set([
  "G4566«G4567",
  "G3535«G3536",
  "G1176+G3638",
  "G3379+G4219",
]);

const WEAK_METHOD = "expanded-exact-lexical-match";
const CROSS_METHOD = "p0812-cross-translation-exact";
const AUDITED_CROSS_METHOD =
  "p0812r1-cross-translation-exact-p0811-audited-kjv";
const STRONG_METHOD = "p0812-hebrew-direct-strong-corroborated";
const GLOBAL_METHOD = "p0812-global-witness-verse-unique";

function fail(message) {
  throw new Error(`[P08.12 alignment completion] ${message}`);
}
function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function readJson(file) {
  if (!existsFile(file)) fail(`Required JSON missing: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function eolOf(text) {
  return String(text || "").includes("\r\n") ? "\r\n" : "\n";
}
function withEol(text, eol) {
  return eol === "\r\n"
    ? String(text).replace(/\n/gu, "\r\n")
    : String(text);
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function sha256File(file) {
  return sha256(fs.readFileSync(file));
}
function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, "");
}
function tokenWord(token) {
  const normalized = normalizeEnglish(token?.normalized || "");
  return normalized || normalizeEnglish(token?.text || "");
}
function tokenIndex(token, fallback) {
  const value = Number(token?.index);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
function tokenMethod(token) {
  return String(token?.method ?? token?.alignmentMethod ?? "").trim();
}
function alignedIds(token) {
  return Array.isArray(token?.alignedSourceTokenIds)
    ? token.alignedSourceTokenIds.map(String).filter(Boolean)
    : [];
}
function validRuntimeEntity(source, corpus) {
  const strong = String(source?.strong || "").trim();
  if (corpus === "hebrew") {
    return /^H\d+$/u.test(strong) ? `word:hebrew:${strong}` : "";
  }
  if (corpus === "greek-nt") {
    if (/^G\d+$/u.test(strong)) return `word:greek-nt:${strong}`;
    if (APPROVED_GREEK_COMPOUNDS.has(strong)) {
      const pieces = strong.match(/G\d+/gu) || [];
      return pieces.length === 2
        ? `compound:greek-nt:${pieces[0]}-${pieces[1]}`
        : "";
    }
    return "";
  }
  if (corpus === "lxx") {
    return /^L\d+$/u.test(strong) ? `word:lxx:${strong}` : "";
  }
  return "";
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
function translationTokens(verse, translation) {
  const tokens = verse?.translations?.[translation]?.tokens;
  return Array.isArray(tokens) ? tokens : [];
}
function canonicalFiles(corpus) {
  const dir = path.join(CANONICAL_ROOT, corpus);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(dir, name));
}
function allCanonicalEntries() {
  const entries = [];
  for (const corpus of Object.keys(TRANSLATIONS_BY_CORPUS).sort()) {
    const files = canonicalFiles(corpus);
    if (!files.length) fail(`No canonical files found for ${corpus}.`);
    for (const file of files) {
      entries.push({
        corpus,
        file,
        relative: path.relative(ROOT, file).replace(/\\/gu, "/"),
      });
    }
  }
  return entries;
}
function sourceMap(verse) {
  const tokens = Array.isArray(verse?.sourceTokens) ? verse.sourceTokens : [];
  return new Map(
    tokens
      .map((source) => [String(source?.id || ""), source])
      .filter(([id]) => Boolean(id)),
  );
}
function sourceClaimedByTranslation(verse, translation) {
  const claimed = new Set();
  for (const token of translationTokens(verse, translation)) {
    for (const id of alignedIds(token)) claimed.add(id);
  }
  return claimed;
}
function wordFrequency(tokens) {
  const out = new Map();
  for (const token of tokens) {
    const word = tokenWord(token);
    if (!word) continue;
    out.set(word, (out.get(word) || 0) + 1);
  }
  return out;
}
function trustedAlignedClaim(token, source, corpus) {
  const ids = alignedIds(token);
  if (ids.length !== 1) return false;
  if (!validRuntimeEntity(source, corpus)) return false;
  const method = tokenMethod(token);
  return method !== WEAK_METHOD;
}
function auditedWitnessKey(sourceId, word, displayIndex, runtimeEntity) {
  return [sourceId, word, String(displayIndex), runtimeEntity].join("\t");
}
function loadAuditedKjvWitnesses() {
  if (!AUDITED_KJV_WITNESS_FILE || !existsFile(AUDITED_KJV_WITNESS_FILE)) {
    fail(
      `Bound P08.11 audited KJV witness file missing: ${AUDITED_KJV_WITNESS_FILE || "<unset>"}`,
    );
  }
  const compressed = fs.readFileSync(AUDITED_KJV_WITNESS_FILE);
  const doc = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
  if (
    doc?.schema !==
    "emetsees-p0812r1-p0811-audited-kjv-witnesses@1.0.0" ||
    !Array.isArray(doc?.entries)
  ) {
    fail("Bound P08.11 audited KJV witness file has an invalid schema.");
  }
  const keys = new Set();
  for (const entry of doc.entries) {
    if (!Array.isArray(entry) || entry.length !== 4) {
      fail("Malformed row in bound P08.11 audited KJV witness file.");
    }
    const [sourceId, word, displayIndex, runtimeEntity] = entry;
    keys.add(
      auditedWitnessKey(
        String(sourceId),
        normalizeEnglish(word),
        Number(displayIndex),
        String(runtimeEntity),
      ),
    );
  }
  if (keys.size !== Number(doc?.counts?.eligibleUnique || 0)) {
    fail(
      `Bound P08.11 KJV witness count mismatch: ${keys.size} vs ${doc?.counts?.eligibleUnique}.`,
    );
  }
  return {
    keys,
    schema: doc.schema,
    source: doc.source || null,
    counts: doc.counts || null,
    compressedSha256: sha256File(AUDITED_KJV_WITNESS_FILE),
  };
}
function p0811AuditedKjvClaim(token, tokenIndexValue, source, corpus, audited) {
  const ids = alignedIds(token);
  if (ids.length !== 1 || ids[0] !== String(source?.id || "")) return false;
  const runtimeEntity = validRuntimeEntity(source, corpus);
  if (!runtimeEntity) return false;
  const word = tokenWord(token);
  if (!word) return false;
  return audited.keys.has(
    auditedWitnessKey(ids[0], word, tokenIndexValue, runtimeEntity),
  );
}
function immutableTokenProjection(token) {
  const out = {};
  for (const [key, value] of Object.entries(token || {})) {
    if (
      key === "alignedSourceTokenIds" ||
      key === "method" ||
      key === "alignmentMethod" ||
      key === "confidence"
    ) continue;
    out[key] = value;
  }
  return out;
}
function immutableDocumentProjection(document) {
  const verses = unwrapVerseMap(document);
  const projection = {};
  for (const verseKey of Object.keys(verses).sort()) {
    const verse = verses[verseKey];
    const translations = {};
    for (const translation of Object.keys(verse?.translations || {}).sort()) {
      const payload = verse.translations[translation];
      translations[translation] = {
        ...payload,
        tokens: Array.isArray(payload?.tokens)
          ? payload.tokens.map(immutableTokenProjection)
          : payload?.tokens,
      };
    }
    projection[verseKey] = {
      ...verse,
      sourceTokens: verse?.sourceTokens,
      translations,
    };
  }
  return projection;
}
function updateImmutableHash(hash, entry, document) {
  hash.update(
    JSON.stringify({
      corpus: entry.corpus,
      file: path.basename(entry.file),
      verses: immutableDocumentProjection(document),
    }),
  );
}
function directStrongEvidence() {
  if (!existsFile(STRONG_EVIDENCE_FILE)) {
    fail(`Hebrew Strong evidence missing: ${STRONG_EVIDENCE_FILE}`);
  }
  const doc = readJson(STRONG_EVIDENCE_FILE);
  const entries = doc?.entries || {};
  const map = new Map();
  for (const [strong, evidence] of Object.entries(entries)) {
    const words = new Set(
      (Array.isArray(evidence?.direct) ? evidence.direct : [])
        .map(normalizeEnglish)
        .filter(Boolean),
    );
    map.set(strong, words);
  }
  return {
    schema: doc?.schema || null,
    checksum: doc?.checksum || null,
    map,
  };
}
function memorySnapshot(label, fileIndex, totalFiles) {
  const m = process.memoryUsage();
  const mb = (value) => Number((value / 1024 / 1024).toFixed(1));
  console.log(
    `[P08.12 stream] ${label} ${fileIndex}/${totalFiles} ` +
    `rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB`,
  );
}
function witnessStatsPass(entries) {
  const stats = new Map();
  const immutableHash = crypto.createHash("sha256");

  for (let fileIndex = 0; fileIndex < entries.length; fileIndex += 1) {
    const entry = entries[fileIndex];
    const raw = fs.readFileSync(entry.file, "utf8");
    const doc = JSON.parse(raw.replace(/^\uFEFF/u, ""));
    updateImmutableHash(immutableHash, entry, doc);

    const verses = unwrapVerseMap(doc);
    for (const verseKey of Object.keys(verses).sort()) {
      const verse = verses[verseKey];
      if (!verse || typeof verse !== "object") continue;
      const byId = sourceMap(verse);
      const verseIdentity = `${entry.relative}|${verseKey}`;

      for (const translation of TRANSLATIONS_BY_CORPUS[entry.corpus] || []) {
        for (const token of translationTokens(verse, translation)) {
          const word = tokenWord(token);
          const ids = alignedIds(token);
          if (!word || ids.length !== 1) continue;
          const source = byId.get(ids[0]);
          if (!source || !trustedAlignedClaim(token, source, entry.corpus)) continue;
          const entity = validRuntimeEntity(source, entry.corpus);
          if (!entity) continue;

          const key = `${entry.corpus}|${word}`;
          let row = stats.get(key);
          if (!row) {
            row = {
              corpus: entry.corpus,
              word,
              claims: 0,
              entities: new Map(),
            };
            stats.set(key, row);
          }
          row.claims += 1;

          let entityRow = row.entities.get(entity);
          if (!entityRow) {
            entityRow = {
              entity,
              count: 0,
              support: 0,
              lastVerseIdentity: null,
              translationMask: 0,
            };
            row.entities.set(entity, entityRow);
          }
          entityRow.count += 1;
          if (entityRow.lastVerseIdentity !== verseIdentity) {
            entityRow.support += 1;
            entityRow.lastVerseIdentity = verseIdentity;
          }
          if (translation === "web") entityRow.translationMask |= 1;
          if (translation === "kjv") entityRow.translationMask |= 2;
          if (translation === "brenton") entityRow.translationMask |= 4;
        }
      }
    }

    if ((fileIndex + 1) % 10 === 0 || fileIndex + 1 === entries.length) {
      memorySnapshot("witness-pass", fileIndex + 1, entries.length);
    }
  }

  const model = new Map();
  for (const [key, row] of stats) {
    if (row.entities.size !== 1) continue;
    const only = [...row.entities.values()][0];
    if (only.count !== row.claims) continue;

    const translations = [];
    if (only.translationMask & 1) translations.push("web");
    if (only.translationMask & 2) translations.push("kjv");
    if (only.translationMask & 4) translations.push("brenton");

    let eligible = false;
    let tier = "";
    if (row.corpus === "lxx") {
      eligible = only.support >= 15;
      tier = eligible ? "lxx-monolingual-15-verse-purity-100" : "";
    } else {
      const bilingual =
        Boolean(only.translationMask & 1) &&
        Boolean(only.translationMask & 2);
      eligible = bilingual && only.support >= 5;
      tier = eligible ? "web-kjv-bilingual-5-verse-purity-100" : "";
    }

    model.set(key, {
      corpus: row.corpus,
      word: row.word,
      entity: only.entity,
      support: only.support,
      translations,
      translationMask: only.translationMask,
      eligible,
      tier,
    });
  }

  return {
    immutableDigest: immutableHash.digest("hex"),
    model,
  };
}
class ProposalRecorder {
  constructor(file) {
    ensure(path.dirname(file));
    this.file = file;
    this.fd = fs.openSync(file, "w");
    this.columns = [
      "corpus","canonicalFile","verseKey","translation","displayIndex",
      "displayText","normalized","sourceId","sourceSurface","sourceStrong",
      "runtimeEntity","method","evidence",
    ];
    fs.writeSync(this.fd, `${this.columns.join(",")}\n`);
    this.count = 0;
    this.byTranslation = {};
    this.byMethod = {};
    this.byCorpus = {};
    this.digestRows = [];
    this.hardPreviewFixtures = [];
  }
  escape(value) {
    const text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    return /[",\r\n]/u.test(text)
      ? `"${text.replace(/"/gu, '""')}"`
      : text;
  }
  add(row) {
    fs.writeSync(
      this.fd,
      `${this.columns.map((column) => this.escape(row[column])).join(",")}\n`,
    );
    this.count += 1;
    this.byTranslation[row.translation] =
      (this.byTranslation[row.translation] || 0) + 1;
    this.byMethod[row.method] =
      (this.byMethod[row.method] || 0) + 1;
    this.byCorpus[row.corpus] =
      (this.byCorpus[row.corpus] || 0) + 1;

    this.digestRows.push({
      key: row.key,
      sourceId: row.sourceId,
      method: row.method,
    });

    if (
      row.canonicalFile.endsWith("/Gen.json") &&
      String(row.verseKey).includes("3:16") &&
      row.translation === "web" &&
      ["desire","husband","rule","multiply","children"].includes(row.normalized)
    ) {
      this.hardPreviewFixtures.push(row);
    }
  }
  close() {
    fs.closeSync(this.fd);
  }
  digest() {
    return sha256(
      JSON.stringify(
        this.digestRows.sort((a, b) => a.key.localeCompare(b.key)),
      ),
    );
  }
}
function proposalKey(context, translation, index) {
  return `${context.relative}|${context.verseKey}|${translation}|${index}`;
}
function applyProposalToMemory({
  context,
  translation,
  token,
  tokenIndexValue,
  source,
  method,
  evidence,
  recorder,
  claimed,
}) {
  const sourceId = String(source?.id || "");
  if (!sourceId || claimed.has(sourceId)) return false;
  const runtimeEntity = validRuntimeEntity(source, context.corpus);
  if (!runtimeEntity) return false;

  const row = {
    key: proposalKey(context, translation, tokenIndexValue),
    corpus: context.corpus,
    canonicalFile: context.relative,
    verseKey: context.verseKey,
    book: context.verse?.book ?? null,
    chapter: Number(context.verse?.chapter ?? 0),
    verse: Number(context.verse?.verse ?? 0),
    translation,
    displayIndex: tokenIndexValue,
    displayText: token?.text ?? "",
    normalized: tokenWord(token),
    sourceId,
    sourceSurface: source?.surface ?? "",
    sourceLemma: source?.lemma ?? "",
    sourceStrong: source?.strong ?? "",
    sourceEntityId: source?.entityId ?? "",
    runtimeEntity,
    method,
    evidence,
  };

  recorder.add(row);
  token.alignedSourceTokenIds = [sourceId];
  token.confidence = "high";
  token.method = method;
  claimed.add(sourceId);
  return true;
}
function crossTranslationVerse(context, recorder, audited) {
  if (!["hebrew", "greek-nt"].includes(context.corpus)) return 0;
  let added = 0;
  for (const [targetTranslation, witnessTranslation] of [["web","kjv"],["kjv","web"]]) {
    const targetTokens = translationTokens(context.verse, targetTranslation);
    const witnessTokens = translationTokens(context.verse, witnessTranslation);
    if (!targetTokens.length || !witnessTokens.length) continue;

    const targetFreq = wordFrequency(targetTokens);
    const witnessFreq = wordFrequency(witnessTokens);
    const claimed = sourceClaimedByTranslation(context.verse, targetTranslation);
    const witnessUnique = new Map();
    for (let wi = 0; wi < witnessTokens.length; wi += 1) {
      const word = tokenWord(witnessTokens[wi]);
      if (word && witnessFreq.get(word) === 1) witnessUnique.set(word, { token: witnessTokens[wi], wi });
    }

    for (let i = 0; i < targetTokens.length; i += 1) {
      const token = targetTokens[i];
      if (alignedIds(token).length) continue;
      const word = tokenWord(token);
      if (!word || targetFreq.get(word) !== 1 || witnessFreq.get(word) !== 1) continue;

      const witnessRow = witnessUnique.get(word);
      if (!witnessRow) continue;
      const witness = witnessRow.token;
      const ids = alignedIds(witness);
      if (ids.length !== 1) continue;

      const source = context.sourceById.get(ids[0]);
      if (!source) continue;
      const witnessDisplayIndex = tokenIndex(witness, witnessRow.wi);
      const ordinaryTrust = trustedAlignedClaim(witness, source, context.corpus);
      const auditedKjvTrust =
        !ordinaryTrust &&
        targetTranslation === "web" &&
        witnessTranslation === "kjv" &&
        p0811AuditedKjvClaim(
          witness,
          witnessDisplayIndex,
          source,
          context.corpus,
          audited,
        );
      if (!ordinaryTrust && !auditedKjvTrust) continue;

      if (applyProposalToMemory({
        context,
        translation: targetTranslation,
        token,
        tokenIndexValue: tokenIndex(token, i),
        source,
        method: auditedKjvTrust ? AUDITED_CROSS_METHOD : CROSS_METHOD,
        evidence: {
          kind: "same-verse-exact-word-cross-translation",
          witnessTranslation,
          witnessDisplayIndex,
          witnessDisplayText: witness?.text ?? "",
          witnessMethod: tokenMethod(witness),
          witnessTrust: auditedKjvTrust
            ? "p0811-correctly-tappable-exact-token-one-to-one"
            : "canonical-non-weak-alignment-method",
          p0811AuditedKjvOverride: auditedKjvTrust,
          targetWordUniqueInVerse: true,
          witnessWordUniqueInVerse: true,
          sourceUnclaimedInTargetTranslation: true,
        },
        recorder,
        claimed,
      })) added += 1;
    }
  }
  return added;
}
function globalWitnessVerse(context, model, recorder) {
  let added = 0;
  for (const translation of TRANSLATIONS_BY_CORPUS[context.corpus] || []) {
    const tokens = translationTokens(context.verse, translation);
    if (!tokens.length) continue;
    const freq = wordFrequency(tokens);
    const claimed = sourceClaimedByTranslation(context.verse, translation);

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (alignedIds(token).length) continue;
      const word = tokenWord(token);
      if (!word || freq.get(word) !== 1) continue;

      const witness = model.get(`${context.corpus}|${word}`);
      if (!witness?.eligible) continue;

      const candidateSources = (Array.isArray(context.verse?.sourceTokens)
        ? context.verse.sourceTokens
        : []
      ).filter(
        (source) =>
          validRuntimeEntity(source, context.corpus) === witness.entity &&
          !claimed.has(String(source?.id || "")),
      );
      if (candidateSources.length !== 1) continue;

      if (applyProposalToMemory({
        context,
        translation,
        token,
        tokenIndexValue: tokenIndex(token, i),
        source: candidateSources[0],
        method: GLOBAL_METHOD,
        evidence: {
          kind: "global-pure-word-entity-witness-plus-verse-unique-source",
          witnessTier: witness.tier,
          supportVerses: witness.support,
          witnessTranslations: witness.translations,
          candidateEntityUniqueInVerse: true,
          targetWordUniqueInVerse: true,
          sourceUnclaimedInTargetTranslation: true,
        },
        recorder,
        claimed,
      })) added += 1;
    }
  }
  return added;
}
function strongDirectVerse(context, model, strongEvidence, recorder) {
  if (context.corpus !== "hebrew") return 0;
  let added = 0;

  for (const translation of ["web","kjv"]) {
    const tokens = translationTokens(context.verse, translation);
    if (!tokens.length) continue;
    const freq = wordFrequency(tokens);
    const claimed = sourceClaimedByTranslation(context.verse, translation);

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (alignedIds(token).length) continue;
      const word = tokenWord(token);
      if (!word || freq.get(word) !== 1) continue;

      const candidates = (Array.isArray(context.verse?.sourceTokens)
        ? context.verse.sourceTokens
        : []
      ).filter((source) => {
        const sourceId = String(source?.id || "");
        const strong = String(source?.strong || "");
        if (!sourceId || claimed.has(sourceId)) return false;
        if (!validRuntimeEntity(source, "hebrew")) return false;
        const direct = strongEvidence.map.get(strong);
        if (!direct?.has(word)) return false;

        const witness = model.get(`hebrew|${word}`);
        if (!witness || witness.entity !== `word:hebrew:${strong}`) return false;
        return witness.support >= 3;
      });
      if (candidates.length !== 1) continue;

      const source = candidates[0];
      const witness = model.get(`hebrew|${word}`);

      if (applyProposalToMemory({
        context,
        translation,
        token,
        tokenIndexValue: tokenIndex(token, i),
        source,
        method: STRONG_METHOD,
        evidence: {
          kind: "direct-unmarked-strong-evidence-corroborated-by-canonical-usage",
          strong: source.strong,
          globalSupportVerses: witness?.support || 0,
          targetWordUniqueInVerse: true,
          candidateSourceUniqueInVerse: true,
          sourceUnclaimedInTargetTranslation: true,
          broadStrongVocabularyUsedForAutomaticRepair: false,
          markedStrongVocabularyUsedForAutomaticRepair: false,
        },
        recorder,
        claimed,
      })) added += 1;
    }
  }
  return added;
}
function summarize(recorder, model, strongEvidence, audited, immutableBefore, immutableAfter, passCounts) {
  return {
    schema: "emetsees-p0812-evidence-backed-alignment-completion@2.0.0",
    mode: MODE,
    implementation: {
      architecture: "two-pass-file-streaming",
      allCanonicalDocumentsResidentAtOnce: false,
      allVerseContextsResidentAtOnce: false,
      sourceMapsResidentOnlyForCurrentVerse: true,
    },
    policy: {
      stopWordListUsed: false,
      semanticSimilarityUsed: false,
      lexicalDefinitionGuessingUsed: false,
      canonicalSourceArrayIndexUsedAsWordOrder: false,
      sourceOrderInferenceUsed: false,
      manualVersePatchesUsed: false,
      onlyUnalignedCanonicalTokensMayBePromoted: true,
      targetWordMustBeUniqueInVerseForAutomaticPromotion: true,
      targetSourceMustBeUnclaimedInTranslation: true,
      targetSourceMustHaveApprovedRuntimeEntity: true,
      crossTranslationWitnessMustBeExactSameNormalizedWord: true,
      weakExpandedExactLexicalMatchMayServeAsCrossWitness: false,
      weakExpandedExactLexicalMatchMayServeOnlyWhenP0811AuditedCorrect: true,
      p0811AuditOverrideAppliesOnlyKjvWitnessToWebTarget: true,
      globalWitnessRequiresPurity100Percent: true,
      hebrewGreekGlobalWitnessRequiresWebAndKjvSupport: true,
      lxxGlobalWitnessMinimumDistinctVerseSupport: 15,
      hebrewStrongAutomaticEvidenceUsesDirectUnmarkedOnly: true,
      broadStrongEvidenceAutomatic: false,
      markedStrongEvidenceAutomatic: false,
    },
    evidence: {
      hebrewStrongEvidenceSchema: strongEvidence.schema,
      hebrewStrongEvidenceChecksum: strongEvidence.checksum,
      p0811AuditedKjvWitnessSchema: audited.schema,
      p0811AuditedKjvWitnessSource: audited.source,
      p0811AuditedKjvWitnessCounts: audited.counts,
      p0811AuditedKjvWitnessCompressedSha256: audited.compressedSha256,
      witnessModelEntries: model.size,
      eligibleWitnessModelEntries: [...model.values()].filter((row) => row.eligible).length,
    },
    counts: {
      proposals: recorder.count,
      byTranslation: recorder.byTranslation,
      byCorpus: recorder.byCorpus,
      byMethod: recorder.byMethod,
    },
    passCounts,
    digest: recorder.digest(),
    immutableProjectionSha256Before: immutableBefore,
    immutableProjectionSha256After: immutableAfter,
    immutableProjectionPreserved: immutableBefore === immutableAfter,
    hardPreviewFixtures: recorder.hardPreviewFixtures,
    verdict:
      immutableBefore === immutableAfter
        ? `P0812_${MODE.toUpperCase()}_EVIDENCE_BACKED_ALIGNMENT_SET_VERIFIED`
        : "P0812_IMMUTABLE_CANONICAL_CONTENT_CHANGED",
  };
}
function repairPass(entries, model, strongEvidence, audited, immutableBefore) {
  const csvFile = path.join(
    REPORT_DIR,
    MODE === "apply"
      ? "alignment-applied-proposals.csv"
      : "alignment-preview-proposals.csv",
  );
  const recorder = new ProposalRecorder(csvFile);
  const immutableAfterHash = crypto.createHash("sha256");
  const passCounts = {
    crossTranslationInitial: 0,
    hebrewDirectStrong: 0,
    globalWitness: 0,
    crossTranslationCascade: 0,
  };
  const changed = [];

  for (let fileIndex = 0; fileIndex < entries.length; fileIndex += 1) {
    const entry = entries[fileIndex];
    const raw = fs.readFileSync(entry.file, "utf8");
    const eol = eolOf(raw);
    const doc = JSON.parse(raw.replace(/^\uFEFF/u, ""));
    const verses = unwrapVerseMap(doc);

    for (const verseKey of Object.keys(verses).sort()) {
      const verse = verses[verseKey];
      if (!verse || typeof verse !== "object") continue;
      const context = {
        corpus: entry.corpus,
        relative: entry.relative,
        verseKey,
        verse,
        sourceById: sourceMap(verse),
      };

      passCounts.crossTranslationInitial +=
        crossTranslationVerse(context, recorder, audited);
      passCounts.hebrewDirectStrong +=
        strongDirectVerse(context, model, strongEvidence, recorder);
      passCounts.globalWitness +=
        globalWitnessVerse(context, model, recorder);
      passCounts.crossTranslationCascade +=
        crossTranslationVerse(context, recorder, audited);
    }

    updateImmutableHash(immutableAfterHash, entry, doc);

    if (MODE === "apply") {
      const output = withEol(`${JSON.stringify(doc, null, 2)}\n`, eol);
      if (output !== raw) {
        fs.writeFileSync(entry.file, output, "utf8");
        changed.push({
          file: entry.relative,
          beforeSha256: sha256(Buffer.from(raw, "utf8")),
          afterSha256: sha256File(entry.file),
        });
      }
    }

    if ((fileIndex + 1) % 10 === 0 || fileIndex + 1 === entries.length) {
      memorySnapshot("repair-pass", fileIndex + 1, entries.length);
      console.log(
        `[P08.12 stream] proposals=${recorder.count} ` +
        `web=${recorder.byTranslation.web || 0} ` +
        `kjv=${recorder.byTranslation.kjv || 0} ` +
        `brenton=${recorder.byTranslation.brenton || 0}`,
      );
    }
  }

  recorder.close();
  const immutableAfter = immutableAfterHash.digest("hex");
  if (immutableBefore !== immutableAfter) {
    fail("Repair engine changed source tokens or translation token text/structure.");
  }

  const summary = summarize(
    recorder,
    model,
    strongEvidence,
    audited,
    immutableBefore,
    immutableAfter,
    passCounts,
  );
  if (MODE === "apply") summary.changedCanonicalFiles = changed;
  return summary;
}
function main() {
  ensure(REPORT_DIR);

  const entries = allCanonicalEntries();
  const strongEvidence = directStrongEvidence();
  const auditedKjv = loadAuditedKjvWitnesses();

  console.log("");
  console.log(`P08.12 ${MODE.toUpperCase()} — streaming evidence-backed alignment completion`);
  console.log(`Canonical files: ${entries.length}`);
  console.log(`P08.11 audited KJV witnesses: ${auditedKjv.keys.size}`);
  console.log("Pass 1: witness statistics + immutable baseline");
  console.log("");

  const witness = witnessStatsPass(entries);

  console.log("");
  console.log(`Witness model entries: ${witness.model.size}`);
  console.log(
    `Eligible witnesses: ${[...witness.model.values()].filter((row) => row.eligible).length}`,
  );
  console.log("Pass 2: evidence-backed proposals file-by-file");
  console.log("");

  const summary = repairPass(
    entries,
    witness.model,
    strongEvidence,
    auditedKjv,
    witness.immutableDigest,
  );

  const fixtureWords = new Set(
    (summary.hardPreviewFixtures || []).map((row) => row.normalized),
  );
  if (!fixtureWords.has("desire")) {
    fail("WEB Genesis 3:16 desire was not proven by the evidence engine.");
  }
  const desire = summary.hardPreviewFixtures.find(
    (row) => row.normalized === "desire",
  );
  if (desire?.sourceStrong !== "H8669") {
    fail(
      `WEB Genesis 3:16 desire expected H8669 proposal; found ${desire?.sourceStrong || "none"}.`,
    );
  }
  const husband = summary.hardPreviewFixtures.find(
    (row) => row.normalized === "husband",
  );
  if (husband?.sourceStrong !== "H376") {
    fail(
      `WEB Genesis 3:16 husband expected audited H376 proposal; found ${husband?.sourceStrong || "none"}.`,
    );
  }

  const summaryFile = path.join(
    REPORT_DIR,
    MODE === "apply" ? "alignment-apply.json" : "alignment-preview.json",
  );
  fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`P08.12 ${MODE.toUpperCase()} complete.`);
  console.log(`Proposals: ${summary.counts.proposals}`);
  console.log(`WEB: ${summary.counts.byTranslation.web || 0}`);
  console.log(`KJV: ${summary.counts.byTranslation.kjv || 0}`);
  console.log(`Brenton: ${summary.counts.byTranslation.brenton || 0}`);
  console.log(`Digest: ${summary.digest}`);
  console.log("Stop-word list: NO");
  console.log("Semantic guessing: NO");
  console.log("Canonical source-token array order used as word order: NO");
  console.log("");
}

main();
