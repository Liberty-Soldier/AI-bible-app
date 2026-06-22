const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(
  process.cwd(),
  "app/data/lexicon/generatedHebrewWordIndex.json"
);

const OUTPUT_FILE = path.join(
  process.cwd(),
  "app/data/lexicon/generatedHebrewLemmaIndex.json"
);

function main() {
  const words = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const lemmaMap = new Map();

  for (const word of words) {
    if (!word.lemma) continue;

    if (!lemmaMap.has(word.lemma)) {
      lemmaMap.set(word.lemma, {
        testament: "old",
        language: "hebrew",
        lemma: word.lemma,
        surfaces: {},
        morphs: {},
        occurrences: [],
      });
    }

    const entry = lemmaMap.get(word.lemma);

    entry.surfaces[word.surface] = (entry.surfaces[word.surface] || 0) + 1;
    entry.morphs[word.morph] = (entry.morphs[word.morph] || 0) + 1;

    entry.occurrences.push({
      book: word.book,
      reference: word.reference,
      surface: word.surface,
      morph: word.morph,
    });
  }

  const lemmaIndex = Array.from(lemmaMap.values()).map((entry) => ({
    ...entry,
    occurrenceCount: entry.occurrences.length,
    surfaces: Object.entries(entry.surfaces)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
    morphs: Object.entries(entry.morphs)
      .sort((a, b) => b[1] - a[1]),
  }));

  lemmaIndex.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(lemmaIndex, null, 2));

  console.log(`Done. Wrote ${lemmaIndex.length} Hebrew lemmas.`);
}

main();