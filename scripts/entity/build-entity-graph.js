"use strict";

const fs = require("fs");
const path = require("path");

const {
  ENTITY_SCHEMA_VERSION,
  ENTITY_COMPILER_VERSION,
  SUPPORTED_CORPORA,
  stableStringify,
  sha256,
  normalizeWordEntityId,
  parseWordEntityId,
  createEmptyEntity,
  createEntityFingerprint,
} = require("./sdk/contracts");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const CANONICAL_ROOT = path.join(
  ROOT_DIR,
  ".private",
  "scripture",
  "canonical"
);

const OUTPUT_DIR = path.join(
  ROOT_DIR,
  ".private",
  "entity",
  "build",
  "P01"
);

const CORPUS_CONFIG = Object.freeze({
  hebrew: {
    folder: "hebrew",
    language: "hebrew",
  },

  "greek-nt": {
    folder: "greek-nt",
    language: "greek",
  },

  lxx: {
    folder: "lxx",
    language: "greek",
  },
});

const BOOK_ORDER = [
  "Gen", "Genesis",
  "Exod", "Exodus",
  "Lev", "Leviticus",
  "Num", "Numbers",
  "Deut", "Deuteronomy",
  "Josh", "Joshua",
  "Judg", "Judges",
  "Ruth",
  "1Sam", "1 Samuel",
  "2Sam", "2 Samuel",
  "1Kgs", "1 Kings",
  "2Kgs", "2 Kings",
  "1Chr", "1 Chronicles",
  "2Chr", "2 Chronicles",
  "Ezra",
  "Neh", "Nehemiah",
  "Esth", "Esther",
  "Job",
  "Ps", "Psalm", "Psalms",
  "Prov", "Proverbs",
  "Eccl", "Ecclesiastes",
  "Song", "Song of Solomon",
  "Isa", "Isaiah",
  "Jer", "Jeremiah",
  "Lam", "Lamentations",
  "Ezek", "Ezekiel",
  "Dan", "Daniel",
  "Hos", "Hosea",
  "Joel",
  "Amos",
  "Obad", "Obadiah",
  "Jonah",
  "Mic", "Micah",
  "Nah", "Nahum",
  "Hab", "Habakkuk",
  "Zeph", "Zephaniah",
  "Hag", "Haggai",
  "Zech", "Zechariah",
  "Mal", "Malachi",

  "Tob", "Tobit",
  "Jdt", "Judith",
  "Wis", "Wisdom",
  "Sir", "Sirach",
  "Bar", "Baruch",
  "1Macc", "1 Maccabees",
  "2Macc", "2 Maccabees",
  "3Macc", "3 Maccabees",
  "4Macc", "4 Maccabees",
  "1Esd", "1 Esdras",
  "2Esd", "2 Esdras",
  "PsSol", "Psalms of Solomon",
  "Odes",

  "Matt", "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Rom", "Romans",
  "1Cor", "1 Corinthians",
  "2Cor", "2 Corinthians",
  "Gal", "Galatians",
  "Eph", "Ephesians",
  "Phil", "Philippians",
  "Col", "Colossians",
  "1Thess", "1 Thessalonians",
  "2Thess", "2 Thessalonians",
  "1Tim", "1 Timothy",
  "2Tim", "2 Timothy",
  "Titus",
  "Phlm", "Philemon",
  "Heb", "Hebrews",
  "Jas", "James",
  "1Pet", "1 Peter",
  "2Pet", "2 Peter",
  "1John", "1 John",
  "2John", "2 John",
  "3John", "3 John",
  "Jude",
  "Rev", "Revelation",
];

function normalizeBookName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const BOOK_ORDER_MAP = new Map(
  BOOK_ORDER.map((name, index) => [
    normalizeBookName(name),
    index,
  ])
);

function ensureDirectory(folder) {
  fs.mkdirSync(folder, {
    recursive: true,
  });
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));

  fs.writeFileSync(
    filePath,
    stableStringify(value, 2) + "\n",
    "utf8"
  );
}

function incrementMap(map, key, amount = 1) {
  if (
    key === null ||
    key === undefined ||
    String(key).trim() === ""
  ) {
    return;
  }

  const normalizedKey = String(key);

  map.set(
    normalizedKey,
    (map.get(normalizedKey) || 0) + amount
  );
}

function uniqueSorted(values) {
  return [
    ...new Set(
      values
        .filter(value => value !== null)
        .filter(value => value !== undefined)
        .map(value => String(value).trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function chooseMostFrequent(map) {
  let selected = null;
  let selectedCount = -1;

  for (const [value, count] of map.entries()) {
    if (
      count > selectedCount ||
      (
        count === selectedCount &&
        (
          selected === null ||
          String(value).localeCompare(
            String(selected)
          ) < 0
        )
      )
    ) {
      selected = value;
      selectedCount = count;
    }
  }

  return selected;
}

function normalizeReference(verse) {
  return String(
    verse.canonicalReference ||
    verse.reference ||
    ""
  );
}

function getReferenceParts(reference, verse) {
  const parts = String(reference).split(/[.:]/);

  const book =
    verse.book ||
    parts[0] ||
    "";

  const chapter =
    Number(verse.chapter) ||
    Number(parts[1]) ||
    0;

  const verseNumber =
    Number(verse.verse) ||
    Number(parts[2]) ||
    0;

  return {
    book,
    chapter,
    verse: verseNumber,
  };
}

function getReferenceSortKey(referenceEntry) {
  const normalizedBook =
    normalizeBookName(referenceEntry.book);

  const bookOrder =
    BOOK_ORDER_MAP.has(normalizedBook)
      ? BOOK_ORDER_MAP.get(normalizedBook)
      : 9999;

  return [
    String(bookOrder).padStart(5, "0"),
    String(referenceEntry.chapter || 0).padStart(4, "0"),
    String(referenceEntry.verse || 0).padStart(4, "0"),
    referenceEntry.reference,
  ].join(":");
}

function compareReferences(a, b) {
  return getReferenceSortKey(a)
    .localeCompare(getReferenceSortKey(b));
}

function getLexicalId(token) {
  if (
    typeof token.entityId === "string" &&
    /^word:(hebrew|greek-nt|lxx):[^:]+$/.test(
      token.entityId
    )
  ) {
    return token.entityId.split(":").at(-1);
  }

  if (
    typeof token.entityId === "string" &&
    /^(hebrew|greek-nt|lxx):[^:]+$/.test(
      token.entityId
    )
  ) {
    return token.entityId.split(":").at(-1);
  }

  return (
    token.strong ||
    token.lxxId ||
    token.lexicalId ||
    token.lemmaId ||
    token.lexemeId ||
    null
  );
}

function getLanguage(token, fallback) {
  return (
    token.language ||
    fallback ||
    null
  );
}

function getSourceDataset(token, corpus) {
  return (
    token.sourceName ||
    token.witness ||
    (
      corpus === "hebrew"
        ? "Hebrew canonical corpus"
        : corpus === "greek-nt"
          ? "OpenGNT"
          : "LXX Rahlfs"
    )
  );
}

function getTokenId(token) {
  return token.id || token.tokenId || null;
}

function isCompatibleMorphEnglish(
  morph,
  morphEnglish
) {
  if (
    typeof morph !== "string" ||
    typeof morphEnglish !== "string"
  ) {
    return false;
  }

  const code = morph
    .trim()
    .toUpperCase();

  const description = morphEnglish
    .trim()
    .toLowerCase();

  if (!code || !description) {
    return false;
  }

  if (code.startsWith("N-")) {
    return description.startsWith("noun,");
  }

  if (
    code.startsWith("V-") ||
    code.startsWith("V")
  ) {
    return description.startsWith("verb,");
  }

  if (
    code.startsWith("A-") ||
    code.startsWith("ADJ")
  ) {
    return description.startsWith("adjective,");
  }

  if (
    code.startsWith("P-") ||
    code.startsWith("RP-") ||
    code.startsWith("RD-") ||
    code.startsWith("RI-")
  ) {
    return description.includes("pronoun");
  }

  if (code.startsWith("T-")) {
    return description.includes("article");
  }

  if (
    code === "CONJ" ||
    code.startsWith("C-")
  ) {
    return description.includes("conjunction");
  }

  if (
    code === "PREP" ||
    code.startsWith("PREP")
  ) {
    return description.includes("preposition");
  }

  if (
    code === "ADV" ||
    code.startsWith("ADV")
  ) {
    return description.includes("adverb");
  }

  return false;
}

function getAlignedEntityIds(
  translationToken,
  tokenIdToEntityId
) {
  const result = new Set();

  for (
    const entityId of
    translationToken.alignedSourceEntityIds || []
  ) {
    if (
      typeof entityId === "string" &&
      entityId.trim() !== ""
    ) {
      result.add(entityId);
    }
  }

  for (
    const tokenId of
    translationToken.alignedSourceTokenIds || []
  ) {
    const entityId =
      tokenIdToEntityId.get(tokenId);

    if (entityId) {
      result.add(entityId);
    }
  }

  return [...result];
}

function createWorkingEntity({
  id,
  corpus,
  language,
  lexicalId,
}) {
  const entity = createEmptyEntity({
    id,
    corpus,
    language,
    lexicalId,
  });

  return {
    entity,

    surfaces: new Map(),
    morphology: new Set(),
    morphologyEnglish: new Set(),
    partsOfSpeech: new Set(),

    glosses: new Set(),
    shortDefinitions: new Set(),

    witnesses: new Set(),
    sourceDatasets: new Set(),

    verseReferences: new Map(),
    renderingCounts: new Map(),
    translationCounts: new Map(),

    alignedVerseReferences: new Set(),
    alignedSourceTokenIds: new Set(),

    lemmaCounts: new Map(),
    normalizedLemmaCounts: new Map(),
    transliterationCounts: new Map(),
    pronunciationCounts: new Map(),
  };
}

function ensureReferenceEntry(
  working,
  reference,
  parts
) {
  if (!working.verseReferences.has(reference)) {
    working.verseReferences.set(
      reference,
      {
        reference,
        book: parts.book,
        chapter: parts.chapter,
        verse: parts.verse,
        sourceTokenIds: new Set(),
        renderings: new Map(),
      }
    );
  }

  return working.verseReferences.get(reference);
}

function processCorpus({
  corpus,
  config,
  workingEntities,
  audit,
}) {
  const folder = path.join(
    CANONICAL_ROOT,
    config.folder
  );

  if (!fs.existsSync(folder)) {
    audit.missingCorpusFolders.push(folder);
    return;
  }

  const files = fs
    .readdirSync(folder)
    .filter(file => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  audit.corpora[corpus] = {
    files: files.length,
    verses: 0,
    sourceTokens: 0,
    translationTokens: 0,
    alignedTranslationTokens: 0,
    entities: 0,
  };

  for (const file of files) {
    const filePath = path.join(folder, file);
    const bookData = readJson(filePath);

    for (const verse of Object.values(bookData)) {
      if (
        !verse ||
        typeof verse !== "object" ||
        !Array.isArray(verse.sourceTokens)
      ) {
        continue;
      }

      audit.corpora[corpus].verses += 1;

      const reference =
        normalizeReference(verse);

      const parts =
        getReferenceParts(reference, verse);

      const tokenIdToEntityId =
        new Map();

      for (const token of verse.sourceTokens) {
        const lexicalId =
          getLexicalId(token);

        if (!lexicalId) {
          audit.tokensWithoutLexicalId += 1;
          continue;
        }

        let entityId;

        try {
          entityId = normalizeWordEntityId(
            token.entityId,
            corpus,
            lexicalId
          );
        } catch (error) {
          audit.entityNormalizationErrors.push({
            corpus,
            reference,
            tokenId: getTokenId(token),
            entityId: token.entityId || null,
            lexicalId,
            message: error.message,
          });

          continue;
        }

        const parsed =
          parseWordEntityId(entityId);

        const tokenId =
          getTokenId(token);

        if (tokenId) {
          tokenIdToEntityId.set(
            tokenId,
            entityId
          );
        }

        if (!workingEntities.has(entityId)) {
          workingEntities.set(
            entityId,
            createWorkingEntity({
              id: entityId,
              corpus,
              language: getLanguage(
                token,
                config.language
              ),
              lexicalId: parsed.lexicalId,
            })
          );
        }

        const working =
          workingEntities.get(entityId);

        const entity =
          working.entity;

        entity.statistics.sourceTokenCount += 1;

        audit.corpora[corpus]
          .sourceTokens += 1;

        if (token.surface) {
          incrementMap(
            working.surfaces,
            token.surface
          );
        }

        if (token.morph) {
          working.morphology.add(
            token.morph
          );
        }

        if (
          token.morphEnglish &&
          isCompatibleMorphEnglish(
            token.morph,
            token.morphEnglish
          )
        ) {
          working.morphologyEnglish.add(
            token.morphEnglish
          );
        }

        if (token.partOfSpeech) {
          working.partsOfSpeech.add(
            token.partOfSpeech
          );
        }

        for (const gloss of [
          token.gloss,
          token.mounceGloss,
          token.tyndaleGloss,
        ]) {
          if (gloss) {
            working.glosses.add(gloss);
          }
        }

        if (token.shortDefinition) {
          working.shortDefinitions.add(
            token.shortDefinition
          );
        }

        if (token.lemma) {
          incrementMap(
            working.lemmaCounts,
            token.lemma
          );
        }

        if (token.normalizedLemma) {
          incrementMap(
            working.normalizedLemmaCounts,
            token.normalizedLemma
          );
        }

        if (token.transliteration) {
          incrementMap(
            working.transliterationCounts,
            token.transliteration
          );
        }

        if (token.pronunciation) {
          incrementMap(
            working.pronunciationCounts,
            token.pronunciation
          );
        }

        if (token.witness) {
          working.witnesses.add(
            token.witness
          );
        }

        working.sourceDatasets.add(
          getSourceDataset(token, corpus)
        );

        const referenceEntry =
          ensureReferenceEntry(
            working,
            reference,
            parts
          );

        if (tokenId) {
          referenceEntry.sourceTokenIds.add(
            tokenId
          );
        }
      }

      const translations =
        verse.translations || {};

      for (
        const [translationId, translation] of
        Object.entries(translations)
      ) {
        for (
          const translationToken of
          translation.tokens || []
        ) {
          audit.corpora[corpus]
            .translationTokens += 1;

          const alignedEntityIds =
            getAlignedEntityIds(
              translationToken,
              tokenIdToEntityId
            );

          if (alignedEntityIds.length > 0) {
            audit.corpora[corpus]
              .alignedTranslationTokens += 1;
          }

          for (
            const alignedSourceTokenId of
            translationToken.alignedSourceTokenIds || []
          ) {
            const alignedEntityId =
              tokenIdToEntityId.get(
                alignedSourceTokenId
              );

            if (!alignedEntityId) {
              continue;
            }

            const alignedWorking =
              workingEntities.get(
                alignedEntityId
              );

            if (alignedWorking) {
              alignedWorking
                .alignedSourceTokenIds
                .add(alignedSourceTokenId);
            }
          }

          for (
            const rawEntityId of
            alignedEntityIds
          ) {
            let entityId;

            try {
              const lexicalId =
                String(rawEntityId)
                  .split(":")
                  .at(-1);

              entityId =
                normalizeWordEntityId(
                  rawEntityId,
                  corpus,
                  lexicalId
                );
            } catch {
              continue;
            }

            const working =
              workingEntities.get(entityId);

            if (!working) {
              audit.alignmentEntityMissing += 1;
              continue;
            }

            const text =
              String(
                translationToken.text || ""
              ).trim();

            if (!text) {
              continue;
            }

            const renderingKey =
              `${translationId}\u0000${text}`;

            incrementMap(
              working.renderingCounts,
              renderingKey
            );

            incrementMap(
              working.translationCounts,
              translationId
            );

            working.entity.statistics
              .translationAlignmentCount += 1;

            working.alignedVerseReferences.add(
              reference
            );

            const referenceEntry =
              working.verseReferences.get(
                reference
              );

            if (!referenceEntry) {
              continue;
            }

            if (
              !referenceEntry.renderings.has(
                translationId
              )
            ) {
              referenceEntry.renderings.set(
                translationId,
                new Set()
              );
            }

            referenceEntry.renderings
              .get(translationId)
              .add(text);
          }
        }
      }
    }
  }
}

function finalizeEntity(working) {
  const entity =
    working.entity;

  entity.lexical.lemma =
    chooseMostFrequent(
      working.lemmaCounts
    );

  entity.lexical.normalizedLemma =
    chooseMostFrequent(
      working.normalizedLemmaCounts
    );

  entity.lexical.transliteration =
    chooseMostFrequent(
      working.transliterationCounts
    );

  entity.lexical.pronunciation =
    chooseMostFrequent(
      working.pronunciationCounts
    );

  entity.lexical.glosses =
    uniqueSorted([
      ...working.glosses,
    ]);

  entity.lexical.shortDefinitions =
    uniqueSorted([
      ...working.shortDefinitions,
    ]);

  entity.lexical.morphology =
    uniqueSorted([
      ...working.morphology,
    ]);

  entity.lexical.morphologyEnglish =
    uniqueSorted([
      ...working.morphologyEnglish,
    ]);

  entity.lexical.partsOfSpeech =
    uniqueSorted([
      ...working.partsOfSpeech,
    ]);

  entity.lexical.witnesses =
    uniqueSorted([
      ...working.witnesses,
    ]);

  entity.lexical.surfaces =
    [...working.surfaces.entries()]
      .map(([surface, count]) => ({
        surface,
        count,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.surface.localeCompare(
          b.surface
        );
      });

  entity.provenance.sourceDatasets =
    uniqueSorted([
      ...working.sourceDatasets,
    ]);

  entity.references =
    [...working.verseReferences.values()]
      .map(reference => ({
        reference:
          reference.reference,

        book:
          reference.book,

        chapter:
          reference.chapter,

        verse:
          reference.verse,

        sourceTokenIds:
          [...reference.sourceTokenIds]
            .sort((a, b) =>
              a.localeCompare(b)
            ),

        renderings:
          Object.fromEntries(
            [...reference.renderings.entries()]
              .sort(([a], [b]) =>
                a.localeCompare(b)
              )
              .map(
                ([translationId, values]) => [
                  translationId,
                  [...values].sort((a, b) =>
                    a.localeCompare(b)
                  ),
                ]
              )
          ),
      }))
      .sort(compareReferences);

  entity.statistics.verseCount =
    entity.references.length;

  entity.statistics.alignedVerseCount =
    working.alignedVerseReferences.size;

  entity.statistics.alignedSourceTokenCount =
    working.alignedSourceTokenIds.size;

  entity.statistics.translationCounts =
    Object.fromEntries(
      [...working.translationCounts.entries()]
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
    );

  entity.renderings =
    [...working.renderingCounts.entries()]
      .map(([key, count]) => {
        const [
          translation,
          text,
        ] = key.split("\u0000");

        return {
          translation,
          text,
          normalized:
            text.toLocaleLowerCase("en"),
          count,
        };
      })
      .sort((a, b) => {
        if (
          a.translation !==
          b.translation
        ) {
          return a.translation.localeCompare(
            b.translation
          );
        }

        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.text.localeCompare(
          b.text
        );
      });

  if (entity.references.length > 0) {
    entity.chronology.firstOccurrence =
      entity.references[0].reference;

    entity.chronology.lastOccurrence =
      entity.references.at(-1).reference;
  }

  const sourceTokenCount =
    entity.statistics.sourceTokenCount;

  const alignedSourceTokenCount =
    entity.statistics.alignedSourceTokenCount;

  entity.entityHealth.hasLemma =
    Boolean(entity.lexical.lemma);

  entity.entityHealth.hasGloss =
    entity.lexical.glosses.length > 0;

  entity.entityHealth.hasReferences =
    entity.references.length > 0;

  entity.entityHealth.hasEnglishRenderings =
    entity.renderings.length > 0;

  entity.entityHealth.alignmentCoverage =
    sourceTokenCount > 0
      ? alignedSourceTokenCount /
        sourceTokenCount
      : 0;

  entity.entityHealth.status =
    entity.entityHealth.hasLexicalId &&
    entity.entityHealth.hasReferences &&
    (
      entity.entityHealth.hasLemma ||
      entity.entityHealth.hasGloss ||
      entity.lexical.surfaces.length > 0
    )
      ? "base-ready"
      : "incomplete";

  entity.fingerprint =
    createEntityFingerprint(entity);

  return entity;
}

function buildAudit(entities, sourceAudit) {
  const byCorpus = {};

  for (const corpus of SUPPORTED_CORPORA) {
    byCorpus[corpus] = {
      entities: 0,
      sourceTokens: 0,
      alignedSourceTokens: 0,
      verses: 0,
      translationAlignments: 0,
      withLemma: 0,
      withGloss: 0,
      withEnglishRenderings: 0,
      incomplete: 0,
      averageAlignmentCoverage: 0,
    };
  }

  let totalReferences = 0;
  let totalRenderings = 0;
  let largestEntity = null;

  const coverageTotals = {
    hebrew: 0,
    "greek-nt": 0,
    lxx: 0,
  };

  for (const entity of entities) {
    const stats =
      byCorpus[entity.corpus];

    stats.entities += 1;

    stats.sourceTokens +=
      entity.statistics.sourceTokenCount;

    stats.alignedSourceTokens +=
      entity.statistics.alignedSourceTokenCount;

    stats.verses +=
      entity.statistics.verseCount;

    stats.translationAlignments +=
      entity.statistics.translationAlignmentCount;

    coverageTotals[entity.corpus] +=
      entity.entityHealth.alignmentCoverage;

    if (entity.lexical.lemma) {
      stats.withLemma += 1;
    }

    if (
      entity.lexical.glosses.length > 0
    ) {
      stats.withGloss += 1;
    }

    if (
      entity.renderings.length > 0
    ) {
      stats.withEnglishRenderings += 1;
    }

    if (
      entity.entityHealth.status ===
      "incomplete"
    ) {
      stats.incomplete += 1;
    }

    totalReferences +=
      entity.references.length;

    totalRenderings +=
      entity.renderings.length;

    if (
      !largestEntity ||
      entity.references.length >
        largestEntity.references
    ) {
      largestEntity = {
        id: entity.id,
        references:
          entity.references.length,
        sourceTokens:
          entity.statistics
            .sourceTokenCount,
      };
    }
  }

  for (const corpus of SUPPORTED_CORPORA) {
    const stats = byCorpus[corpus];

    stats.averageAlignmentCoverage =
      stats.entities > 0
        ? coverageTotals[corpus] /
          stats.entities
        : 0;
  }

  return {
    schemaVersion: "1",
    compilerVersion:
      ENTITY_COMPILER_VERSION,

    generatedAt:
      new Date().toISOString(),

    totals: {
      entities:
        entities.length,

      references:
        totalReferences,

      renderingForms:
        totalRenderings,

      averageReferencesPerEntity:
        entities.length > 0
          ? totalReferences /
            entities.length
          : 0,
    },

    byCorpus,

    largestEntity,

    sourceAudit,
  };
}

function main() {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    " EMETSEES Entity Compiler"
  );
  console.log(
    " P01 Base Entity Graph V2"
  );
  console.log(
    "========================================"
  );
  console.log("");

  ensureDirectory(OUTPUT_DIR);

  const startedAt =
    Date.now();

  const workingEntities =
    new Map();

  const sourceAudit = {
    corpora: {},
    missingCorpusFolders: [],
    tokensWithoutLexicalId: 0,
    alignmentEntityMissing: 0,
    entityNormalizationErrors: [],
  };

  for (const corpus of SUPPORTED_CORPORA) {
    console.log(
      `Scanning ${corpus}...`
    );

    processCorpus({
      corpus,
      config: CORPUS_CONFIG[corpus],
      workingEntities,
      audit: sourceAudit,
    });
  }

  console.log("");
  console.log(
    "Finalizing entities..."
  );

  const entities =
    [...workingEntities.values()]
      .map(finalizeEntity)
      .sort((a, b) =>
        a.id.localeCompare(b.id)
      );

  for (const corpus of SUPPORTED_CORPORA) {
    if (sourceAudit.corpora[corpus]) {
      sourceAudit.corpora[corpus]
        .entities =
        entities.filter(
          entity =>
            entity.corpus === corpus
        ).length;
    }
  }

  const entityIndex = {
    schemaVersion:
      ENTITY_SCHEMA_VERSION,

    compilerVersion:
      ENTITY_COMPILER_VERSION,

    type: "EntityGraph",
    entityType: "word",

    entities:
      Object.fromEntries(
        entities.map(entity => [
          entity.id,
          entity,
        ])
      ),
  };

  const audit =
    buildAudit(
      entities,
      sourceAudit
    );

  const checksum =
    sha256(entityIndex);

  const manifest = {
    schemaVersion: "1",

    compilerVersion:
      ENTITY_COMPILER_VERSION,

    representation:
      "EntityGraph",

    pass:
      "P01",

    generatedAt:
      new Date().toISOString(),

    checksum,

    durationMs:
      Date.now() - startedAt,

    outputs: {
      entities: "entities.json",
      audit: "audit.json",
    },

    totals:
      audit.totals,

    byCorpus:
      audit.byCorpus,
  };

  writeJson(
    path.join(
      OUTPUT_DIR,
      "entities.json"
    ),
    entityIndex
  );

  writeJson(
    path.join(
      OUTPUT_DIR,
      "audit.json"
    ),
    audit
  );

  writeJson(
    path.join(
      OUTPUT_DIR,
      "manifest.json"
    ),
    manifest
  );

  console.log("");
  console.log(
    "P01 ENTITY GRAPH COMPLETE"
  );
  console.log("");

  for (const corpus of SUPPORTED_CORPORA) {
    const stats =
      audit.byCorpus[corpus];

    console.log(
      `${corpus.padEnd(10)} ` +
      `entities=${String(stats.entities).padStart(6)} ` +
      `tokens=${String(stats.sourceTokens).padStart(8)} ` +
      `aligned=${String(stats.alignedSourceTokens).padStart(8)} ` +
      `rendered=${String(stats.withEnglishRenderings).padStart(6)}`
    );
  }

  console.log("");

  console.log(
    `Total entities : ${audit.totals.entities}`
  );

  console.log(
    `References     : ${audit.totals.references}`
  );

  console.log(
    `Checksum       : ${checksum}`
  );

  console.log(
    `Output         : ${OUTPUT_DIR}`
  );

  console.log("");
}

main();
