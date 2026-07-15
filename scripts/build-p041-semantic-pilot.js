#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const P03_PATH = path.join(ROOT, ".private", "entity", "build", "P03", "evidence-packets.json");
const P04_PATH = path.join(ROOT, ".private", "entity", "build", "P04", "cached-explanations.json");
const AUDIT_PATH = path.join(ROOT, "reports", "p04-quality-audit-v2", "gold-set-candidates.json");
const ALIGNMENT_ROOT = path.join(ROOT, "public", "data", "bibleiq", "word-study");
const OUTPUT_ROOT = path.join(ROOT, ".private", "entity", "build", "P04.1", "pilot");
const VIEW_ROOT = path.join(OUTPUT_ROOT, "semantic-views");
const CORPORA = ["hebrew", "greek-nt", "lxx"];
const PILOT_PER_CORPUS = 20;

const MANUAL = {
  hebrew: [
    "word:hebrew:H3068", "word:hebrew:H3050", "word:hebrew:H430",
    "word:hebrew:H8451", "word:hebrew:H4687", "word:hebrew:H7676",
    "word:hebrew:H1697", "word:hebrew:H5315", "word:hebrew:H7307",
    "word:hebrew:H6662", "word:hebrew:H1285", "word:hebrew:H3548",
    "word:hebrew:H4428", "word:hebrew:H1254", "word:hebrew:H7225",
  ],
  "greek-nt": [
    "word:greek-nt:G2424", "word:greek-nt:G2316", "word:greek-nt:G5547",
    "word:greek-nt:G2962", "word:greek-nt:G3551", "word:greek-nt:G4102",
    "word:greek-nt:G26", "word:greek-nt:G4151", "word:greek-nt:G266",
    "word:greek-nt:G1343", "word:greek-nt:G1242", "word:greek-nt:G935",
    "word:greek-nt:G40", "word:greek-nt:G1510", "word:greek-nt:G1135",
  ],
  lxx: [],
};

const GOVERNING_RULES = [
  "Scripture is the sole source of truth and authority for EMET.",
  "Scripture interprets Scripture.",
  "The Old Testament establishes the definitions, commands, covenants, promises, institutions, and framework through which the New Testament must be understood.",
  "Later Scripture must never be explained in a way that contradicts or nullifies earlier Scripture.",
  "EMET must never claim that Yahweh changed, that His commandments became false, or that Scripture overturned Scripture.",
  "If an apparent tension cannot be resolved from the supplied scriptural evidence, EMET must state the limitation instead of inventing a resolution.",
  "English is rendering evidence only; it does not define the source word by itself.",
  "Hebrew, Greek New Testament, and LXX corpus identity must remain separate.",
  "Do not manufacture Strong's numbers for LXX entities.",
];

function fail(message) {
  throw new Error(`[P04.1 semantic pilot] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashScore(value) {
  return Number.parseInt(sha256(value).slice(0, 8), 16);
}

function corpusFromEntityId(entityId) {
  return String(entityId).split(":")[1];
}

function lexicalIdFromEntityId(entityId) {
  return String(entityId).split(":").slice(2).join(":");
}

function safeFileName(entityId) {
  return `${entityId.replace(/[^0-9A-Za-z.-]+/g, "_")}.json`;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values.map(clean).filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function looksVerbLike(identity) {
  const values = [
    ...(Array.isArray(identity?.partsOfSpeech) ? identity.partsOfSpeech : []),
    ...(Array.isArray(identity?.morphologyEnglish) ? identity.morphologyEnglish : []),
    ...(Array.isArray(identity?.morphology) ? identity.morphology : []),
  ].map(clean);
  return values.some((value) => /\bverb\b|(?:^|[\/\s-])V(?:[A-Z]|$)/i.test(value));
}

function isContextualDefinition(value, identity) {
  const text = clean(value);
  if (/^(?:about|by|from|in|of|on|with)\s+/i.test(text)) return true;
  if (/^to\s+/i.test(text)) return !looksVerbLike(identity);
  return false;
}

const GREEK_DIGRAPHS = {
  αι: "ai", ει: "ei", οι: "oi", ου: "ou", αυ: "au", ευ: "eu", ηυ: "ēu", υι: "ui",
};
const GREEK_LETTERS = {
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "ē", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
  ς: "s", τ: "t", υ: "y", φ: "ph", χ: "ch", ψ: "ps", ω: "ō",
};
const HEBREW_CONSONANTS = {
  א: "", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t",
  י: "y", כ: "kh", ך: "kh", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s",
  ע: "", פ: "f", ף: "f", צ: "ts", ץ: "ts", ק: "q", ר: "r", ש: "sh", ת: "t",
};
const HEBREW_VOWELS = {
  "\u05B0": "e", "\u05B1": "e", "\u05B2": "a", "\u05B3": "o", "\u05B4": "i",
  "\u05B5": "e", "\u05B6": "e", "\u05B7": "a", "\u05B8": "a", "\u05B9": "o",
  "\u05BA": "o", "\u05BB": "u",
};
const TRANSLITERATION_OVERRIDES = {
  H3068: "YHWH", H3050: "Yah", H430: "Elohim", H8451: "Torah", H7676: "Shabbat",
  G2424: "Iēsous", G2316: "theos", G5547: "Christos", G2962: "kyrios",
};

function transliterateGreek(value) {
  const normalized = clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let output = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (GREEK_DIGRAPHS[pair]) {
      output += GREEK_DIGRAPHS[pair];
      index += 1;
    } else {
      output += GREEK_LETTERS[normalized[index]] || normalized[index];
    }
  }
  return output;
}

function transliterateHebrew(value) {
  const characters = Array.from(clean(value).normalize("NFD"));
  const clusters = [];
  for (const character of characters) {
    if (/^[א-ת]$/u.test(character)) clusters.push({ base: character, marks: [] });
    else if (clusters.length && /^[\u0591-\u05C7]$/u.test(character)) clusters.at(-1).marks.push(character);
  }
  let output = "";
  let previousHadHiriq = false;
  for (const cluster of clusters) {
    const marks = new Set(cluster.marks);
    const hasDagesh = marks.has("\u05BC");
    const hasHolam = marks.has("\u05B9") || marks.has("\u05BA");
    const hasHiriq = marks.has("\u05B4");
    if (cluster.base === "י" && previousHadHiriq && cluster.marks.length === 0) {
      previousHadHiriq = false;
      continue;
    }
    let consonant = HEBREW_CONSONANTS[cluster.base] || "";
    if (cluster.base === "ב") consonant = hasDagesh ? "b" : "v";
    if (cluster.base === "כ" || cluster.base === "ך") consonant = hasDagesh ? "k" : "kh";
    if (cluster.base === "פ" || cluster.base === "ף") consonant = hasDagesh ? "p" : "f";
    if (cluster.base === "ש" && marks.has("\u05C2")) consonant = "s";
    if (cluster.base === "ו" && (hasDagesh || hasHolam)) consonant = "";
    let vowel = "";
    for (const mark of cluster.marks) {
      if (HEBREW_VOWELS[mark]) {
        vowel = HEBREW_VOWELS[mark];
        break;
      }
    }
    if (cluster.base === "ו" && hasDagesh && !vowel) vowel = "u";
    if (cluster.base === "ו" && hasHolam) vowel = "o";
    if (cluster.base === "א" || cluster.base === "ע") consonant = "";
    output += consonant + vowel;
    previousHadHiriq = hasHiriq;
  }
  return output.replace(/[^A-Za-zāēīōūḥṭṣšḵ]+/g, "");
}

function deriveTransliteration(lemma, corpus, lexicalId) {
  if (TRANSLITERATION_OVERRIDES[lexicalId]) return TRANSLITERATION_OVERRIDES[lexicalId];
  if (corpus === "hebrew") return transliterateHebrew(lemma);
  if (corpus === "greek-nt" || corpus === "lxx") return transliterateGreek(lemma);
  return "";
}

function selectPilot(gold, packets) {
  const selected = [];
  const selectedSet = new Set();
  const goldById = new Map(gold.map((item) => [item.entityId, item]));

  function add(entityId, reason) {
    if (!packets[entityId] || selectedSet.has(entityId)) return;
    selectedSet.add(entityId);
    selected.push({ entityId, reason, audit: goldById.get(entityId) || null });
  }

  for (const corpus of CORPORA) {
    for (const entityId of MANUAL[corpus]) add(entityId, "manual-high-value");

    const corpusGold = gold.filter((item) => item.corpus === corpus);
    corpusGold
      .filter((item) => item.issues?.some((issue) => issue.code === "contextual-renderings-as-definitions"))
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .forEach((item) => {
        if (selected.filter((entry) => corpusFromEntityId(entry.entityId) === corpus).length < PILOT_PER_CORPUS) {
          add(item.entityId, "substantive-quality-case");
        }
      });

    corpusGold
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .forEach((item) => {
        if (selected.filter((entry) => corpusFromEntityId(entry.entityId) === corpus).length < PILOT_PER_CORPUS) {
          add(item.entityId, "frequency-representative");
        }
      });

    Object.keys(packets)
      .filter((entityId) => corpusFromEntityId(entityId) === corpus)
      .sort((a, b) => hashScore(a) - hashScore(b))
      .forEach((entityId) => {
        if (selected.filter((entry) => corpusFromEntityId(entry.entityId) === corpus).length < PILOT_PER_CORPUS) {
          add(entityId, "deterministic-representative");
        }
      });
  }

  return selected;
}

function scanAlignmentRuntime(wantedIds) {
  const wanted = new Set(wantedIds);
  const collected = new Map(wantedIds.map((id) => [id, { lemmas: [], surfaces: [], morphs: [], strongs: [], samples: [] }]));
  const manifest = readJson(path.join(ALIGNMENT_ROOT, "manifest.json"));

  for (const corpus of CORPORA) {
    const books = manifest?.corpora?.[corpus]?.books || {};
    for (const [bookFile, metadata] of Object.entries(books)) {
      const relativeFile = metadata?.file || bookFile;
      const document = readJson(path.join(ALIGNMENT_ROOT, corpus, relativeFile));
      const book = clean(document?.book || path.basename(relativeFile, ".json"));
      for (const [verseKey, verse] of Object.entries(document?.verses || {})) {
        for (const token of verse?.s || []) {
          const entityId = clean(token?.[4]);
          if (!wanted.has(entityId)) continue;
          const target = collected.get(entityId);
          target.surfaces.push(clean(token?.[1]));
          target.lemmas.push(clean(token?.[2]));
          target.strongs.push(clean(token?.[3]));
          target.morphs.push(clean(token?.[5]));
          if (target.samples.length < 8) {
            target.samples.push({
              reference: `${book} ${verseKey}`,
              surface: clean(token?.[1]),
              lemma: clean(token?.[2]),
              lexicalId: clean(token?.[3]),
              morphology: clean(token?.[5]),
            });
          }
        }
      }
    }
  }

  return collected;
}

function compactKnowledgeSection(section) {
  if (!section) return [];
  const excerpts = Array.isArray(section.excerpts) ? section.excerpts : [];
  const references = Array.isArray(section.references) ? section.references : [];
  return [...excerpts, ...references].slice(0, 12).map((item) => ({
    reference: item.reference || item.canonicalId || item?.pointer?.canonicalId || null,
    label: item.label || item.type || item.predicate || item.theme || item.event || null,
    details: item.details || item.description || null,
    confidence: item.confidence || null,
    counterpartEntityIds: item.counterpartEntityIds || [],
  }));
}

function normalizeReference(reference) {
  if (!reference) return null;
  return {
    reference: reference.reference || null,
    book: reference.book || null,
    chapter: reference.chapter || null,
    verse: reference.verse || null,
    occurrenceCount: reference.occurrenceCount || 1,
    renderings: reference.renderings || {},
    evidenceId: reference.evidenceId || null,
  };
}

function buildView(selection, packet, oldRecord, alignment) {
  const identity = packet.identity || {};
  const lemmaCandidates = countValues(alignment.lemmas);
  const canonicalLemma = clean(identity.lemma) || clean(identity.normalizedLemma) || lemmaCandidates[0]?.value || "";
  const lexicalId = clean(identity.lexicalId) || lexicalIdFromEntityId(selection.entityId);
  const rawDefinitions = unique([
    ...(Array.isArray(identity.shortDefinitions) ? identity.shortDefinitions : []),
    ...(Array.isArray(identity.glosses) ? identity.glosses : []),
  ]);
  const contextualRemoved = rawDefinitions.filter((value) => isContextualDefinition(value, identity));
  const lexicalDefinitions = rawDefinitions.filter((value) => !isContextualDefinition(value, identity));
  const suppliedTransliteration = clean(identity.transliteration);
  const derivedTransliteration = suppliedTransliteration || deriveTransliteration(canonicalLemma, packet.corpus, lexicalId);
  const renderings = (packet.renderings?.mostCommon || []).slice(0, 20).map((item) => ({
    text: clean(item.text),
    normalized: clean(item.normalized),
    count: Number(item.count || 0),
    translation: clean(item.translation),
  }));
  const chronology = packet.occurrences?.chronology || {};
  const representativeReferences = (packet.occurrences?.representativeReferences || [])
    .slice(0, 12)
    .map(normalizeReference)
    .filter(Boolean);
  const see = packet.seeKnowledge || {};
  const auditIssues = selection.audit?.issues || [];

  const view = {
    schemaVersion: "1.0.0",
    purpose: "P04.1 controlled reader-first explanation pilot",
    entityId: selection.entityId,
    corpus: packet.corpus,
    selectionReason: selection.reason,
    sourceChecksums: {
      p03Packet: packet.checksum || null,
      p04Record: oldRecord?.checksum || null,
    },
    governingRules: GOVERNING_RULES,
    sourceIdentity: {
      lexicalId,
      strong: packet.corpus === "lxx" ? null : clean(identity.strong) || null,
      language: clean(identity.language) || packet.corpus,
      canonicalLemma,
      normalizedLemma: clean(identity.normalizedLemma) || null,
      lemmaProvenance: clean(identity.lemma)
        ? "P03/P01 identity"
        : lemmaCandidates[0]
          ? "dominant aligned source-token lemma"
          : "missing",
      transliteration: derivedTransliteration || null,
      transliterationProvenance: suppliedTransliteration
        ? "P03/P01 identity"
        : derivedTransliteration
          ? "deterministic script transliteration"
          : "missing",
      pronunciation: clean(identity.pronunciation) || null,
      pronunciationProvenance: clean(identity.pronunciation) ? "P03/P01 identity" : "missing-do-not-invent",
      partsOfSpeech: unique(identity.partsOfSpeech || []),
      morphologyObserved: unique([
        ...(identity.morphologyEnglish || []),
        ...(identity.morphology || []),
        ...alignment.morphs,
      ]).slice(0, 40),
      sourceForms: countValues([
        ...alignment.surfaces,
        ...((identity.sourceForms?.forms || []).flatMap((item) =>
          Array(Math.min(Number(item.count || 1), 4)).fill(clean(item.surface)),
        )),
      ]).slice(0, 24),
      alignedTokenSamples: alignment.samples,
    },
    lexicalEvidence: {
      lexicalDefinitions,
      definitionStatus: lexicalDefinitions.length ? "available" : "requires-authoritative-lexicon-enrichment",
      contextualRenderingsRemoved: contextualRemoved,
      rawDefinitionsForAudit: rawDefinitions,
      englishRenderings: renderings,
      warning: "English renderings are translation evidence. They are not automatically lexical definitions.",
    },
    scripturalUsage: {
      corpusOccurrenceCount: Number(packet.occurrences?.corpusOccurrenceCount || 0),
      uniqueVerseCount: Number(packet.occurrences?.uniqueVerseCount || 0),
      firstOccurrence: chronology.firstOccurrence || null,
      lastOccurrence: chronology.lastOccurrence || null,
      representativeReferences,
    },
    oldTestamentFoundation: {
      required: true,
      corpusRole:
        packet.corpus === "greek-nt"
          ? "Later Greek New Testament witness; interpret through the Old Testament and whole scriptural witness."
          : "Old Testament source witness that establishes earlier scriptural usage.",
      instruction:
        packet.corpus === "greek-nt"
          ? "Use only supplied SEE or Scripture evidence to connect this Greek New Testament word to earlier Scripture. Do not invent a Hebrew equivalent or claim a doctrine changed."
          : "Explain how this source word functions in the Old Testament witness before drawing any later connection.",
      suppliedRelationships: compactKnowledgeSection(see.relationships),
      suppliedEvents: compactKnowledgeSection(see.events),
      suppliedThemes: compactKnowledgeSection(see.themes),
    },
    existingP04ForCritiqueOnly: {
      headline: oldRecord?.explanation?.headline || null,
      explanation: oldRecord?.explanation?.text || null,
      auditIssues,
      instruction: "Do not preserve wording merely because it exists. Use it only to identify defects that must not recur.",
    },
    generationContract: {
      audience: "A reader who tapped one word and wants useful understanding in about twenty seconds.",
      output: {
        headline: "Plain, specific, and non-sensational.",
        explanation: "One coherent reader-first paragraph, normally 70-120 words.",
        citations: "At least two direct Scripture references when the supplied evidence permits.",
      },
      requiredOrder: [
        "State the normal lexical meaning or function plainly.",
        "Explain the word's normal scriptural use and important distinctions.",
        "For Greek New Testament words, ground the explanation in the Old Testament foundation when supplied evidence supports the connection.",
        "Use statistics only when they genuinely clarify meaning; never use frequency as filler or proof of importance.",
      ],
      prohibited: [
        "Do not treat 'of God', 'to God', 'by faith', or similar grammar/context phrases as separate lexical meanings.",
        "Do not confuse the tapped inflected form with the canonical lemma.",
        "Do not expose evidence IDs, compiler terminology, packet language, or health labels.",
        "Do not appeal to denominations, creeds, commentaries, traditions, or popular theology.",
        "Do not claim that Yahweh changed, that His commandments became false, or that the New Testament contradicts or overturns the Old Testament.",
        "Do not invent evidence, cross-corpus equivalences, pronunciations, or Strong's numbers.",
      ],
    },
    reviewContract: {
      automaticRejectIf: [
        "Any lexical claim is unsupported by the semantic view.",
        "An English rendering is presented as a lexical definition without evidence.",
        "The explanation contradicts earlier Scripture or assumes a command was abolished.",
        "The explanation contains generic occurrence-count or chronology filler.",
        "The lemma, corpus, or source form is confused.",
        "Internal evidence IDs or compiler language appear.",
      ],
      humanApprovalRequired: true,
    },
  };

  view.semanticViewChecksum = sha256(stableStringify(view));
  return view;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function main() {
  const p03 = readJson(P03_PATH);
  const p04 = readJson(P04_PATH);
  const gold = readJson(AUDIT_PATH);
  const packets = p03.packets || {};
  const explanations = p04.explanations || {};
  const selections = selectPilot(gold, packets);

  if (selections.length !== PILOT_PER_CORPUS * CORPORA.length) {
    fail(`Expected 60 pilot entities, selected ${selections.length}.`);
  }

  const byCorpus = Object.fromEntries(
    CORPORA.map((corpus) => [
      corpus,
      selections.filter((item) => corpusFromEntityId(item.entityId) === corpus).length,
    ]),
  );
  for (const corpus of CORPORA) {
    if (byCorpus[corpus] !== PILOT_PER_CORPUS) {
      fail(`Expected ${PILOT_PER_CORPUS} ${corpus} entities, found ${byCorpus[corpus]}.`);
    }
  }

  console.log("[P04.1] Scanning compact alignment runtime for authoritative source-token identity...");
  const alignment = scanAlignmentRuntime(selections.map((item) => item.entityId));

  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(VIEW_ROOT, { recursive: true });

  const views = selections.map((selection) => {
    const view = buildView(
      selection,
      packets[selection.entityId],
      explanations[selection.entityId],
      alignment.get(selection.entityId),
    );
    fs.writeFileSync(
      path.join(VIEW_ROOT, safeFileName(selection.entityId)),
      `${JSON.stringify(view, null, 2)}\n`,
      "utf8",
    );
    return view;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    schemaVersion: "1.0.0",
    pilotCount: views.length,
    byCorpus,
    p03Checksum: p03.checksum,
    p04Checksum: p04.checksum,
    governingRulesChecksum: sha256(GOVERNING_RULES.join("\n")),
    semanticViewsChecksum: sha256(stableStringify(views.map((view) => ({
      entityId: view.entityId,
      checksum: view.semanticViewChecksum,
    })))),
    noAiCallsMade: true,
    approvalStatus: "unreviewed-pilot",
    entityOrder: views.map((view) => view.entityId),
  };

  fs.writeFileSync(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(OUTPUT_ROOT, "semantic-views.json"), `${JSON.stringify({ manifest, views }, null, 2)}\n`, "utf8");

  const reviewHeaders = [
    "entityId", "corpus", "lexicalId", "lemma", "transliteration", "pronunciationStatus",
    "definitionStatus", "selectionReason", "semanticViewChecksum", "generatorHeadline",
    "generatorExplanation", "reviewerDecision", "reviewerNotes", "humanApproved",
  ];
  const reviewRows = views.map((view) => [
    view.entityId,
    view.corpus,
    view.sourceIdentity.lexicalId,
    view.sourceIdentity.canonicalLemma,
    view.sourceIdentity.transliteration,
    view.sourceIdentity.pronunciationProvenance,
    view.lexicalEvidence.definitionStatus,
    view.selectionReason,
    view.semanticViewChecksum,
    "", "", "", "", "",
  ]);
  fs.writeFileSync(
    path.join(OUTPUT_ROOT, "pilot-review.csv"),
    [reviewHeaders, ...reviewRows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8",
  );

  console.log("P04.1 semantic pilot prepared. No AI calls were made.");
  console.log(`- Pilot entities: ${views.length}`);
  console.log(`- Hebrew: ${byCorpus.hebrew}`);
  console.log(`- Greek NT: ${byCorpus["greek-nt"]}`);
  console.log(`- LXX: ${byCorpus.lxx}`);
  console.log(`- Output: ${path.relative(ROOT, OUTPUT_ROOT)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
