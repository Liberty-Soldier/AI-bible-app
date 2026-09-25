"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();

const runtimeRoot = path.join(
  root,
  "public",
  "data",
  "bibleiq",
  "source-breakdown",
  "runtime"
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const manifest = readJson(
  path.join(runtimeRoot, "manifest.json")
);

const display = readJson(
  path.join(runtimeRoot, "display-index.json")
);

const entries = Object.values(display.displayIndex || {});

if (entries.length !== 89389) {
  throw new Error(
    `Displayed mapping regression: expected 89389, got ${entries.length}`
  );
}

if (Object.keys(manifest.sourceIndex || {}).length !== 58009) {
  throw new Error(
    `Source index regression: expected 58009, got ${
      Object.keys(manifest.sourceIndex || {}).length
    }`
  );
}

const corpusCounts = {
  hebrew: 0,
  "greek-nt": 0,
  lxx: 0,
};

let multiSource = null;

for (const entry of entries) {
  if (!(entry.corpus in corpusCounts)) {
    throw new Error(`Unexpected corpus: ${entry.corpus}`);
  }

  corpusCounts[entry.corpus] += 1;

  if (
    !multiSource &&
    Array.isArray(entry.sourceVerses) &&
    entry.sourceVerses.length > 1
  ) {
    multiSource = entry;
  }

  for (const owner of entry.sourceVerses || []) {
    if (!manifest.sourceIndex[owner.sourceKey]) {
      throw new Error(
        `Missing sourceIndex ownership: ${owner.sourceKey}`
      );
    }
  }
}

for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
  if (!corpusCounts[corpus]) {
    throw new Error(`${corpus} has zero displayed mappings`);
  }
}

const shardCache = new Map();

function loadVerse(sourceKey) {
  const location = manifest.sourceIndex[sourceKey];

  if (!location) {
    throw new Error(`Missing sourceIndex: ${sourceKey}`);
  }

  const absolute = path.join(runtimeRoot, location.file);

  let shard = shardCache.get(absolute);

  if (!shard) {
    shard = readJson(absolute);
    shardCache.set(absolute, shard);
  }

  const verse = shard.verses?.[location.key];

  if (!verse) {
    throw new Error(
      `Missing verse ${location.key} in ${location.file}`
    );
  }

  return verse;
}

const representative = {};

for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
  const entry = entries.find(
    (item) =>
      item.corpus === corpus &&
      Array.isArray(item.sourceVerses) &&
      item.sourceVerses.length
  );

  if (!entry) {
    throw new Error(`No representative ${corpus} mapping`);
  }

  const verses = entry.sourceVerses.map((owner) =>
    loadVerse(owner.sourceKey)
  );

  for (const verse of verses) {
    if (!Array.isArray(verse.occurrences) || !verse.occurrences.length) {
      throw new Error(
        `${corpus} representative contains zero occurrences`
      );
    }

    for (let i = 1; i < verse.occurrences.length; i++) {
      const previous = verse.occurrences[i - 1];
      const current = verse.occurrences[i];

      if (corpus === "hebrew") {
        if (
          Number(current.sourceSlotOrder) <
          Number(previous.sourceSlotOrder)
        ) {
          throw new Error(
            `Hebrew sourceSlotOrder failure in ${verse.reference}`
          );
        }
      } else if (
        Number(current.sourceOrder) <
        Number(previous.sourceOrder)
      ) {
        throw new Error(
          `${corpus} canonical source-order failure in ${verse.reference}`
        );
      }
    }
  }

  representative[corpus] = {
    translation: entry.translation,
    displayed: `${entry.displayedBook} ${entry.displayedChapter}:${entry.displayedVerse}`,
    sourceVerseCount: verses.length,
    occurrenceCount: verses.reduce(
      (sum, verse) => sum + verse.occurrences.length,
      0
    ),
    orderAuthority: verses.map((verse) => verse.orderAuthority),
  };
}

let grammarOnly = null;

for (const [sourceKey] of Object.entries(manifest.sourceIndex)) {
  if (!sourceKey.startsWith("hebrew:")) continue;

  const verse = loadVerse(sourceKey);

  const occurrence = verse.occurrences.find(
    (item) => item.grammarOnly === true && !item.lexicalId
  );

  if (occurrence) {
    grammarOnly = {
      sourceKey,
      occurrenceId: occurrence.id,
      surface: occurrence.surface,
    };

    break;
  }
}

if (!grammarOnly) {
  throw new Error(
    "No honest rendered Hebrew grammar-only occurrence found."
  );
}

console.log(
  JSON.stringify(
    {
      verdict: "PHASE1_SOURCE_BREAKDOWN_RUNTIME_VERIFIED",
      displayedMappings: entries.length,
      sourceIndexEntries: Object.keys(manifest.sourceIndex).length,
      corpusDisplayMappings: corpusCounts,
      representatives: representative,
      multiSourceVerseFound: Boolean(multiSource),
      multiSource: multiSource
        ? {
            translation: multiSource.translation,
            displayed: `${multiSource.displayedBook} ${multiSource.displayedChapter}:${multiSource.displayedVerse}`,
            sourceVerseCount: multiSource.sourceVerses.length,
          }
        : null,
      hebrewGrammarOnlyRendered: true,
      grammarOnlyExample: grammarOnly,
      alignmentRegenerated: false,
      deploymentPerformed: false,
    },
    null,
    2
  )
);
