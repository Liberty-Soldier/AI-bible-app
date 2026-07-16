"use strict";

const FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but",
  "by", "can", "could", "did", "do", "does", "for", "from", "had",
  "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in",
  "is", "it", "its", "may", "me", "might", "must", "my", "no", "nor",
  "not", "of", "on", "or", "our", "ours", "shall", "she", "should",
  "so", "that", "the", "their", "theirs", "them", "then", "there",
  "these", "they", "this", "those", "thou", "thy", "to", "unto", "up",
  "upon", "us", "was", "we", "were", "what", "when", "where", "which",
  "who", "whom", "whose", "why", "will", "with", "would", "ye", "you",
  "your", "yours",
]);

const IRREGULAR_TO_BASE = new Map();

function addIrregular(base, forms) {
  for (const form of [base, ...forms]) {
    IRREGULAR_TO_BASE.set(form, base);
  }
}

addIrregular("arise", ["arose", "arisen", "arising"]);
addIrregular("awake", ["awoke", "awaken", "awakened"]);
addIrregular("bear", ["bare", "borne", "born", "bearing"]);
addIrregular("be", ["am", "is", "are", "was", "were", "been", "being"]);
addIrregular("become", ["became", "becoming"]);
addIrregular("begin", ["began", "begun", "beginning"]);
addIrregular("bind", ["bound", "binding"]);
addIrregular("bring", ["brought", "bringing"]);
addIrregular("build", ["built", "building"]);
addIrregular("buy", ["bought", "buying"]);
addIrregular("catch", ["caught", "catching"]);
addIrregular("choose", ["chose", "chosen", "choosing"]);
addIrregular("come", ["came", "coming"]);
addIrregular("do", ["did", "done", "doing", "does"]);
addIrregular("draw", ["drew", "drawn", "drawing"]);
addIrregular("drink", ["drank", "drunk", "drinking"]);
addIrregular("drive", ["drove", "driven", "driving"]);
addIrregular("eat", ["ate", "eaten", "eating"]);
addIrregular("fall", ["fell", "fallen", "falling"]);
addIrregular("fight", ["fought", "fighting"]);
addIrregular("find", ["found", "finding"]);
addIrregular("flee", ["fled", "fleeing"]);
addIrregular("forget", ["forgot", "forgotten", "forgetting"]);
addIrregular("forgive", ["forgave", "forgiven", "forgiving"]);
addIrregular("forsake", ["forsook", "forsaken", "forsaking"]);
addIrregular("give", ["gave", "given", "giving", "gives"]);
addIrregular("go", ["went", "gone", "going", "goes"]);
addIrregular("grow", ["grew", "grown", "growing"]);
addIrregular("hear", ["heard", "hearing"]);
addIrregular("hide", ["hid", "hidden", "hiding"]);
addIrregular("hold", ["held", "holding"]);
addIrregular("keep", ["kept", "keeping"]);
addIrregular("know", ["knew", "known", "knowing", "knows"]);
addIrregular("lead", ["led", "leading"]);
addIrregular("leave", ["left", "leaving"]);
addIrregular("lie", ["lay", "lain", "lying"]);
addIrregular("lose", ["lost", "losing"]);
addIrregular("make", ["made", "making", "makes"]);
addIrregular("meet", ["met", "meeting"]);
addIrregular("pay", ["paid", "paying"]);
addIrregular("read", ["reading"]);
addIrregular("ride", ["rode", "ridden", "riding"]);
addIrregular("rise", ["rose", "risen", "rising"]);
addIrregular("run", ["ran", "running"]);
addIrregular("say", ["said", "saying", "says"]);
addIrregular("see", ["saw", "seen", "seeing", "sees"]);
addIrregular("sell", ["sold", "selling"]);
addIrregular("send", ["sent", "sending"]);
addIrregular("shake", ["shook", "shaken", "shaking"]);
addIrregular("shine", ["shone", "shining"]);
addIrregular("show", ["shown", "showed", "showing"]);
addIrregular("sing", ["sang", "sung", "singing"]);
addIrregular("sit", ["sat", "sitting"]);
addIrregular("slay", ["slew", "slain", "slaying"]);
addIrregular("speak", ["spake", "spoke", "spoken", "speaking"]);
addIrregular("stand", ["stood", "standing"]);
addIrregular("strike", ["struck", "stricken", "striking"]);
addIrregular("take", ["took", "taken", "taking", "takes"]);
addIrregular("teach", ["taught", "teaching"]);
addIrregular("tear", ["tore", "torn", "tearing"]);
addIrregular("tell", ["told", "telling"]);
addIrregular("think", ["thought", "thinking"]);
addIrregular("throw", ["threw", "thrown", "throwing"]);
addIrregular("understand", ["understood", "understanding"]);
addIrregular("wear", ["wore", "worn", "wearing"]);
addIrregular("weep", ["wept", "weeping"]);
addIrregular("win", ["won", "winning"]);
addIrregular("write", ["wrote", "written", "writing"]);

const IRREGULAR_NOUNS = new Map([
  ["children", "child"],
  ["feet", "foot"],
  ["men", "man"],
  ["people", "person"],
  ["teeth", "tooth"],
  ["women", "woman"],
]);

const PHRASE_ALIASES = [
  {
    concepts: ["happen", "become", "occur"],
    phrases: [
      "came to pass",
      "come to pass",
      "comes to pass",
      "it came to pass",
      "there came to pass",
    ],
  },
  {
    concepts: ["bring forth", "bear", "give birth"],
    phrases: ["bring forth", "brought forth", "gave birth", "give birth"],
  },
  {
    concepts: ["pass away", "depart"],
    phrases: ["passed away", "pass away"],
  },
  {
    concepts: ["go up", "ascend"],
    phrases: ["went up", "go up", "came up"],
  },
  {
    concepts: ["go down", "descend"],
    phrases: ["went down", "go down", "came down"],
  },
  {
    concepts: ["set apart", "sanctify"],
    phrases: ["set apart", "made holy"],
  },
  {
    concepts: ["take away", "remove"],
    phrases: ["took away", "take away"],
  },
];

function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\b([a-z0-9]+)'s\b/gi, "$1")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function singularize(word) {
  const normalized = normalizeEnglish(word);
  if (!normalized) return "";
  if (IRREGULAR_NOUNS.has(normalized)) return IRREGULAR_NOUNS.get(normalized);
  if (normalized.length <= 3) return normalized;
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses|oes)$/.test(normalized)) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function wordForms(value) {
  const normalized = normalizeEnglish(value);
  const forms = new Set();
  if (!normalized || normalized.includes(" ")) return forms;

  forms.add(normalized);
  forms.add(singularize(normalized));

  const irregularBase =
    IRREGULAR_TO_BASE.get(normalized) ||
    IRREGULAR_NOUNS.get(normalized);

  if (irregularBase) forms.add(irregularBase);

  if (normalized.endsWith("eth") && normalized.length > 4) {
    forms.add(normalized.slice(0, -3));
  }
  if (normalized.endsWith("est") && normalized.length > 4) {
    forms.add(normalized.slice(0, -3));
  }
  if (normalized.endsWith("ied") && normalized.length > 4) {
    forms.add(`${normalized.slice(0, -3)}y`);
  }
  if (normalized.endsWith("ed") && normalized.length > 4) {
    forms.add(normalized.slice(0, -2));
    forms.add(normalized.slice(0, -1));
  }
  if (normalized.endsWith("ing") && normalized.length > 5) {
    const stem = normalized.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
      forms.add(stem.slice(0, -1));
    }
  }

  return new Set([...forms].filter(Boolean));
}

function splitEvidencePhrases(value) {
  const raw = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:figuratively|properly|specifically|literally|by implication)\b/gi, " ");

  const phrases = new Set();

  for (const segment of raw.split(/[;,/|]+/)) {
    let normalized = normalizeEnglish(segment);
    if (!normalized) continue;

    normalized = normalized
      .replace(/^(?:to|a|an|the)\s+/, "")
      .trim();

    if (!normalized) continue;
    phrases.add(normalized);
  }

  return phrases;
}

function sourceEvidenceValues(sourceToken, lexiconEntry) {
  const fields = [
    sourceToken?.gloss,
    sourceToken?.mounceGloss,
    sourceToken?.tyndaleGloss,
    sourceToken?.shortDefinition,
    lexiconEntry?.gloss,
    lexiconEntry?.shortGloss,
    lexiconEntry?.shortDefinition,
    lexiconEntry?.definition,
    lexiconEntry?.meaning,
    lexiconEntry?.usage,
  ];

  const phrases = new Set();
  for (const field of fields) {
    for (const phrase of splitEvidencePhrases(field)) {
      phrases.add(phrase);
    }
  }

  return phrases;
}

function sourceProperNameValues(sourceToken, lexiconEntry) {
  const values = new Set();
  const fields = [
    sourceToken?.gloss,
    sourceToken?.mounceGloss,
    sourceToken?.tyndaleGloss,
    sourceToken?.transliteration,
    lexiconEntry?.transliteration,
    lexiconEntry?.usage,
  ];

  for (const field of fields) {
    for (const phrase of splitEvidencePhrases(field)) {
      if (phrase && phrase.split(/\s+/).length <= 3) values.add(phrase);
    }
  }
  return values;
}

function isProperNameSource(sourceToken, lexiconEntry) {
  const morphology = [
    sourceToken?.morph,
    sourceToken?.morphEnglish,
    sourceToken?.partOfSpeech,
    lexiconEntry?.partOfSpeech,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    morphology.includes("proper") ||
    morphology.includes("n-pr") ||
    /(?:^|[-/])p(?:$|[-/])/.test(String(sourceToken?.morph || "").toLowerCase())
  );
}

function sameWordFamily(left, right) {
  const leftForms = wordForms(left);
  const rightForms = wordForms(right);
  for (const form of leftForms) {
    if (rightForms.has(form)) return true;
  }
  return false;
}

function phraseCandidatesForSource(sourceToken, lexiconEntry) {
  const evidence = sourceEvidenceValues(sourceToken, lexiconEntry);
  const phrases = new Set(
    [...evidence].filter((value) => value.split(/\s+/).length >= 2),
  );

  for (const alias of PHRASE_ALIASES) {
    const conceptMatches = alias.concepts.some((concept) =>
      [...evidence].some(
        (value) =>
          value === concept ||
          sameWordFamily(value, concept) ||
          value.includes(concept),
      ),
    );

    if (!conceptMatches) continue;
    for (const phrase of alias.phrases) phrases.add(phrase);
  }

  return phrases;
}

function isFunctionWord(value) {
  return FUNCTION_WORDS.has(normalizeEnglish(value));
}

module.exports = {
  FUNCTION_WORDS,
  normalizeEnglish,
  wordForms,
  sameWordFamily,
  sourceEvidenceValues,
  sourceProperNameValues,
  isProperNameSource,
  phraseCandidatesForSource,
  isFunctionWord,
};
