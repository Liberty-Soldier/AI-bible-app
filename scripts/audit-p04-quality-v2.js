#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const P03_PATH = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  "P03",
  "evidence-packets.json",
);
const P04_PATH = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  "P04",
  "cached-explanations.json",
);
const REPORT_ROOT = path.join(ROOT, "reports", "p04-quality-audit-v2");
const CORPORA = ["hebrew", "greek-nt", "lxx"];

const MANUAL_HIGH_VALUE = [
  "word:hebrew:H3068", "word:hebrew:H3050", "word:hebrew:H430",
  "word:hebrew:H8451", "word:hebrew:H4687", "word:hebrew:H7676",
  "word:hebrew:H1697", "word:hebrew:H5315", "word:hebrew:H7307",
  "word:hebrew:H6662", "word:hebrew:H1285", "word:hebrew:H3548",
  "word:hebrew:H4428", "word:hebrew:H1254", "word:hebrew:H7225",
  "word:greek-nt:G2424", "word:greek-nt:G2316", "word:greek-nt:G5547",
  "word:greek-nt:G2962", "word:greek-nt:G3551", "word:greek-nt:G4102",
  "word:greek-nt:G26", "word:greek-nt:G4151", "word:greek-nt:G266",
  "word:greek-nt:G1343", "word:greek-nt:G1242", "word:greek-nt:G935",
  "word:greek-nt:G40", "word:greek-nt:G1510", "word:greek-nt:G1135",
];

function fail(message) {
  throw new Error(`[P04 quality audit v2] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function words(value) {
  const text = clean(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function occurrenceCount(packet) {
  const occurrences = packet?.occurrences || {};
  return Number(
    occurrences.corpusOccurrenceCount ||
      occurrences.totalEntityOccurrences ||
      occurrences.uniqueVerseCount ||
      0,
  );
}

function hashScore(value) {
  return Number.parseInt(
    crypto.createHash("sha256").update(value).digest("hex").slice(0, 8),
    16,
  );
}

function issueRecord(code, category, severity, details) {
  return { code, category, severity, details };
}

function looksVerbLike(identity) {
  const values = [
    ...(Array.isArray(identity?.partsOfSpeech) ? identity.partsOfSpeech : []),
    ...(Array.isArray(identity?.morphologyEnglish) ? identity.morphologyEnglish : []),
    ...(Array.isArray(identity?.morphology) ? identity.morphology : []),
  ].map(clean);

  return values.some((value) =>
    /\bverb\b|(?:^|[\/\s-])V(?:[A-Z]|$)/i.test(value),
  );
}

function contextualDefinition(value, identity) {
  const text = clean(value);
  if (!text) return false;

  if (/^(?:about|by|from|in|of|on|with)\s+/i.test(text)) {
    return true;
  }

  if (/^to\s+/i.test(text)) {
    // "to rejoice" is a legitimate infinitive gloss for a verb.
    // "to God" or "to him" is a grammatical/contextual rendering for a noun/pronoun.
    return !looksVerbLike(identity);
  }

  return false;
}

function analyzeEntity(entityId, packet, explanationRecord) {
  const corpus = clean(
    packet?.corpus || explanationRecord?.corpus || entityId.split(":")[1],
  );
  const identity = packet?.identity || {};
  const explanation = explanationRecord?.explanation || {};
  const text = clean(explanation.text);
  const headline = clean(explanation.headline);
  const definitions = [
    ...(Array.isArray(identity.shortDefinitions) ? identity.shortDefinitions : []),
    ...(Array.isArray(identity.glosses) ? identity.glosses : []),
  ]
    .map(clean)
    .filter(Boolean);
  const issues = [];
  const wordCount = words(text);

  if (!text) {
    issues.push(
      issueRecord(
        "missing-explanation",
        "content",
        "critical",
        "Explanation text is empty.",
      ),
    );
  }
  if (!headline) {
    issues.push(
      issueRecord("missing-headline", "format", "review", "Headline is empty."),
    );
  }
  if (wordCount > 0 && wordCount < 45) {
    issues.push(
      issueRecord("too-short", "style", "review", `${wordCount} words.`),
    );
  }
  if (wordCount > 125) {
    issues.push(
      issueRecord("too-long", "style", "review", `${wordCount} words.`),
    );
  }
  if (/\[(?:p0[1234]|word:)[^\]]+\]/i.test(text)) {
    issues.push(
      issueRecord(
        "embedded-evidence-id",
        "format",
        "critical",
        "Internal evidence identifier appears in reader text.",
      ),
    );
  }
  if (/\boccurs?\s+[\d,]+\s+times\b/i.test(text)) {
    issues.push(
      issueRecord(
        "occurrence-count-filler",
        "style",
        "review",
        "Explanation spends reader space reporting the occurrence total.",
      ),
    );
  }
  if (/\bappears?\s+from\s+.+\s+through\s+.+/i.test(text)) {
    issues.push(
      issueRecord(
        "chronology-filler",
        "style",
        "review",
        "Explanation uses broad first-to-last corpus chronology as filler.",
      ),
    );
  }
  if (/rather than (?:describing|naming|expressing) (?:a )?(?:quality|action|object)/i.test(text)) {
    issues.push(
      issueRecord(
        "generic-part-of-speech-filler",
        "style",
        "review",
        "Generic object/action/quality wording adds little lexical value.",
      ),
    );
  }
  if (/showing (?:its|that it is) (?:central|common|important|broadly used)/i.test(text)) {
    issues.push(
      issueRecord(
        "frequency-inference",
        "content",
        "review",
        "Frequency is used to infer importance or centrality.",
      ),
    );
  }

  if (!clean(identity.lemma)) {
    issues.push(
      issueRecord("missing-lemma", "input-data", "data", "P03 identity has no lemma."),
    );
  }
  if (!clean(identity.transliteration)) {
    issues.push(
      issueRecord(
        "missing-transliteration",
        "input-data",
        "data",
        "P03 identity has no transliteration.",
      ),
    );
  }
  if (!clean(identity.pronunciation)) {
    issues.push(
      issueRecord(
        "missing-pronunciation",
        "input-data",
        "data",
        "P03 identity has no pronunciation.",
      ),
    );
  }
  if (definitions.length === 0) {
    issues.push(
      issueRecord(
        "missing-lexical-definition",
        "input-data",
        "data",
        "P03 identity has no gloss or short definition.",
      ),
    );
  }

  const contextualDefinitions = definitions.filter((value) =>
    contextualDefinition(value, identity),
  );
  if (contextualDefinitions.length >= 1) {
    issues.push(
      issueRecord(
        "contextual-renderings-as-definitions",
        "content",
        "critical",
        `Grammar/context phrases appear in lexical definitions: ${contextualDefinitions
          .slice(0, 6)
          .join("; ")}`,
      ),
    );
  }

  const citations = Array.isArray(explanationRecord?.citations)
    ? explanationRecord.citations
    : [];
  const scriptureCitations = citations.filter(
    (citation) => citation?.book && citation?.chapter && citation?.verse,
  );
  if (scriptureCitations.length === 0) {
    issues.push(
      issueRecord(
        "no-scripture-citation",
        "content",
        "review",
        "No direct Scripture-reference citation is attached to the explanation.",
      ),
    );
  }

  const severityRank = { critical: 4, data: 3, review: 2, info: 1 };
  const highestSeverity = issues.reduce(
    (highest, issue) =>
      severityRank[issue.severity] > severityRank[highest]
        ? issue.severity
        : highest,
    "info",
  );

  return {
    entityId,
    corpus,
    lexicalId: clean(identity.lexicalId),
    lemma: clean(identity.lemma),
    transliteration: clean(identity.transliteration),
    pronunciation: clean(identity.pronunciation),
    occurrenceCount: occurrenceCount(packet),
    headline,
    explanation: text,
    wordCount,
    citationCount: citations.length,
    scriptureCitationCount: scriptureCitations.length,
    definitions,
    issues,
    highestSeverity: issues.length ? highestSeverity : "none",
  };
}

function csvEscape(value) {
  const string = value == null ? "" : String(value);
  return `"${string.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, records) {
  const headers = [
    "entityId",
    "corpus",
    "lexicalId",
    "lemma",
    "occurrenceCount",
    "headline",
    "wordCount",
    "citationCount",
    "highestSeverity",
    "inputDataIssues",
    "contentIssues",
    "styleIssues",
    "formatIssues",
  ];
  const lines = [headers.join(",")];
  for (const record of records) {
    const codes = (category) =>
      record.issues
        .filter((issue) => issue.category === category)
        .map((issue) => issue.code)
        .join("|");
    lines.push(
      [
        record.entityId,
        record.corpus,
        record.lexicalId,
        record.lemma,
        record.occurrenceCount,
        record.headline,
        record.wordCount,
        record.citationCount,
        record.highestSeverity,
        codes("input-data"),
        codes("content"),
        codes("style"),
        codes("format"),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function selectGoldCandidates(records) {
  const selected = new Map();
  function add(record, reason) {
    if (!record) return;
    const existing = selected.get(record.entityId);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      selected.set(record.entityId, { ...record, reasons: [reason] });
    }
  }

  const byId = new Map(records.map((record) => [record.entityId, record]));
  for (const entityId of MANUAL_HIGH_VALUE) {
    add(byId.get(entityId), "manual-high-value");
  }

  for (const corpus of CORPORA) {
    const corpusRecords = records.filter((record) => record.corpus === corpus);
    const byFrequency = [...corpusRecords].sort(
      (a, b) => b.occurrenceCount - a.occurrenceCount,
    );

    byFrequency.slice(0, 25).forEach((record) => add(record, "high-frequency"));

    corpusRecords
      .filter((record) =>
        record.issues.some(
          (issue) =>
            issue.code === "contextual-renderings-as-definitions" ||
            issue.code === "embedded-evidence-id",
        ),
      )
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 25)
      .forEach((record) => add(record, "substantive-quality-flag"));

    [...corpusRecords]
      .sort((a, b) => hashScore(a.entityId) - hashScore(b.entityId))
      .slice(0, 25)
      .forEach((record) => add(record, "deterministic-random"));
  }

  return [...selected.values()].sort(
    (a, b) =>
      a.corpus.localeCompare(b.corpus) || b.occurrenceCount - a.occurrenceCount,
  );
}

function main() {
  const p03 = readJson(P03_PATH);
  const p04 = readJson(P04_PATH);
  const packets = p03?.packets || {};
  const explanations = p04?.explanations || {};
  const entityIds = Array.isArray(p04?.entityOrder)
    ? p04.entityOrder
    : Object.keys(explanations).sort();

  const records = entityIds.map((entityId) =>
    analyzeEntity(entityId, packets[entityId], explanations[entityId]),
  );

  const issueCounts = {};
  const categoryCounts = {};
  const byCorpus = {};

  for (const corpus of CORPORA) {
    const corpusRecords = records.filter((record) => record.corpus === corpus);
    byCorpus[corpus] = {
      entities: corpusRecords.length,
      substantiveCritical: corpusRecords.filter((record) =>
        record.issues.some(
          (issue) => issue.category === "content" && issue.severity === "critical",
        ),
      ).length,
      inputDataDeficient: corpusRecords.filter((record) =>
        record.issues.some((issue) => issue.category === "input-data"),
      ).length,
      styleOrFormatReview: corpusRecords.filter((record) =>
        record.issues.some(
          (issue) => issue.category === "style" || issue.category === "format",
        ),
      ).length,
      noDetectedIssues: corpusRecords.filter((record) => record.issues.length === 0)
        .length,
    };
  }

  for (const record of records) {
    for (const issue of record.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
      categoryCounts[issue.category] =
        (categoryCounts[issue.category] || 0) + 1;
    }
  }

  const flagged = records.filter((record) => record.issues.length > 0);
  const substantiveCritical = records.filter((record) =>
    record.issues.some(
      (issue) => issue.category === "content" && issue.severity === "critical",
    ),
  );
  const formattingCritical = records.filter((record) =>
    record.issues.some(
      (issue) => issue.category === "format" && issue.severity === "critical",
    ),
  );
  const inputDataDeficient = records.filter((record) =>
    record.issues.some((issue) => issue.category === "input-data"),
  );
  const goldCandidates = selectGoldCandidates(records);

  const summary = {
    generatedAt: new Date().toISOString(),
    auditVersion: "2.0.0",
    p03Checksum: clean(p03?.checksum),
    p04Checksum: clean(p04?.checksum),
    prompt: p04?.prompt,
    totals: {
      entities: records.length,
      flaggedByAnyHeuristic: flagged.length,
      substantiveCritical: substantiveCritical.length,
      formattingCritical: formattingCritical.length,
      inputDataDeficient: inputDataDeficient.length,
      noDetectedIssues: records.length - flagged.length,
      goldSetCandidates: goldCandidates.length,
    },
    byCorpus,
    issueCounts: Object.fromEntries(
      Object.entries(issueCounts).sort((a, b) => b[1] - a[1]),
    ),
    categoryCounts: Object.fromEntries(
      Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]),
    ),
    notes: [
      "This audit makes no API calls and does not modify P01-P04.",
      "Input-data deficiencies are reported separately from defects in generated prose.",
      "Verb infinitive glosses such as 'to rejoice' are not classified as contextual renderings when the identity is verb-like.",
      "No regeneration should begin until the controlled pilot is manually reviewed.",
    ],
  };

  fs.mkdirSync(REPORT_ROOT, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_ROOT, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(REPORT_ROOT, "flagged-records.json"),
    `${JSON.stringify(flagged, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(REPORT_ROOT, "substantive-critical.json"),
    `${JSON.stringify(substantiveCritical, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(REPORT_ROOT, "formatting-critical.json"),
    `${JSON.stringify(formattingCritical, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(REPORT_ROOT, "input-data-deficient.json"),
    `${JSON.stringify(inputDataDeficient, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(REPORT_ROOT, "gold-set-candidates.json"),
    `${JSON.stringify(goldCandidates, null, 2)}\n`,
    "utf8",
  );
  writeCsv(path.join(REPORT_ROOT, "flagged-records.csv"), flagged);
  writeCsv(path.join(REPORT_ROOT, "gold-set-candidates.csv"), goldCandidates);

  console.log("P04 quality audit v2 complete. No AI calls were made.");
  console.log(`- Entities audited: ${records.length.toLocaleString()}`);
  console.log(
    `- Substantive critical: ${substantiveCritical.length.toLocaleString()}`,
  );
  console.log(
    `- Formatting critical: ${formattingCritical.length.toLocaleString()}`,
  );
  console.log(
    `- Input-data deficient: ${inputDataDeficient.length.toLocaleString()}`,
  );
  console.log(`- Gold candidates: ${goldCandidates.length.toLocaleString()}`);
  console.log("- Report: reports/p04-quality-audit-v2/summary.json");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
