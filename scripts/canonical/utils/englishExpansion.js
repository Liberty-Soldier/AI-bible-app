function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function add(set, value) {
  const normalized = normalize(value);
  if (normalized && normalized.length > 1) set.add(normalized);
}

function addPluralForms(set, word) {
  add(set, word);

  if (word.endsWith("y") && word.length > 3) {
    add(set, `${word.slice(0, -1)}ies`);
  } else if (
    word.endsWith("s") ||
    word.endsWith("x") ||
    word.endsWith("z") ||
    word.endsWith("ch") ||
    word.endsWith("sh")
  ) {
    add(set, `${word}es`);
  } else {
    add(set, `${word}s`);
  }
}

function addVerbForms(set, word) {
  add(set, word);

  if (word.endsWith("e") && word.length > 3) {
    add(set, `${word}d`);
    add(set, `${word.slice(0, -1)}ing`);
  } else {
    add(set, `${word}ed`);
    add(set, `${word}ing`);
  }

  add(set, `${word}s`);
}

function addKnownIrregularForms(set, word) {
  const irregulars = {
    be: ["am", "is", "are", "was", "were", "been", "being"],
    bear: ["bare", "born", "borne", "bearing"],
    bring: ["brought", "bringing"],
    do: ["did", "done", "doing", "does"],
    give: ["gave", "given", "giving", "gives"],
    make: ["made", "making", "makes"],
    say: ["said", "saying", "says"],
    see: ["saw", "seen", "seeing", "sees"],
    take: ["took", "taken", "taking", "takes"],
    go: ["went", "gone", "going", "goes"],
    come: ["came", "coming", "comes"],
    eat: ["ate", "eaten", "eating", "eats"],
    know: ["knew", "known", "knowing", "knows"],
    lie: ["lay", "lain", "lying", "lies"],
    rise: ["rose", "risen", "rising", "rises"],
  };

  for (const form of irregulars[word] || []) {
    add(set, form);
  }
}

function extractGlossParts(gloss) {
  const normalized = normalize(gloss);
  if (!normalized) return [];

  return normalized
    .split(/\b(?:or|and|to|i e|that is|figuratively|properly|specifically)\b|[;,()]/)
    .map((x) => normalize(x))
    .filter(Boolean);
}

function expandPhrase(set, phrase) {
  const normalized = normalize(phrase);
  if (!normalized) return;

  add(set, normalized);

  const words = normalized.split(/\s+/).filter(Boolean);

  for (const word of words) {
    if (word.length <= 1) continue;

    add(set, word);
    addPluralForms(set, word);
    addVerbForms(set, word);
    addKnownIrregularForms(set, word);
  }

  // Common phrase simplifications
  if (normalized.includes("give birth")) {
    add(set, "birth");
    add(set, "gave birth");
    add(set, "giving birth");
    add(set, "bear");
    add(set, "bare");
    add(set, "born");
    add(set, "borne");
  }

  if (normalized.includes("bring forth")) {
    add(set, "bring forth");
    add(set, "brought forth");
    add(set, "bringing forth");
    add(set, "bear");
    add(set, "bare");
    add(set, "birth");
  }

  if (normalized.includes("feed") || normalized.includes("shepherd")) {
    add(set, "keeper");
    add(set, "keepers");
    add(set, "keep");
    add(set, "kept");
    add(set, "tend");
    add(set, "tending");
    add(set, "shepherd");
    add(set, "shepherding");
  }

  if (normalized.includes("work") || normalized.includes("cultivate")) {
    add(set, "tiller");
    add(set, "tillers");
    add(set, "till");
    add(set, "tilled");
    add(set, "tilling");
    add(set, "cultivate");
    add(set, "cultivated");
    add(set, "cultivating");
  }
}

function expandEnglishForEntry(entry) {
  const expansions = new Set();

  const fields = [
    entry.gloss,
    entry.shortGloss,
    entry.definition,
    entry.meaning,
  ];

  for (const field of fields) {
    for (const part of extractGlossParts(field)) {
      expandPhrase(expansions, part);
    }
  }

  return [...expansions].sort();
}

module.exports = {
  normalize,
  expandEnglishForEntry,
};