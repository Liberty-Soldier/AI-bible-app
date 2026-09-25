"use strict";

const { normalizeBookName } = require("../shared/corpus-ownership.cjs");

const fs = require("fs");
const path = require("path");

const base =
  process.argv[2] ||
  "http://127.0.0.1:3199";

const runtimeRoot =
  path.join(
    process.cwd(),
    "public",
    "data",
    "bibleiq",
    "source-breakdown",
    "runtime"
  );

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

const manifest =
  readJson(
    path.join(
      runtimeRoot,
      "manifest.json"
    )
  );

const display =
  readJson(
    path.join(
      runtimeRoot,
      "display-index.json"
    )
  );

const entries =
  Object.values(
    display.displayIndex || {}
  );

const shardCache =
  new Map();

function loadSourceVerse(
  owner
) {
  const location =
    manifest.sourceIndex[
      owner.sourceKey
    ];

  if (!location) {
    throw new Error(
      `Missing sourceIndex: ${owner.sourceKey}`
    );
  }

  const absolute =
    path.join(
      runtimeRoot,
      location.file
    );

  let shard =
    shardCache.get(
      absolute
    );

  if (!shard) {
    shard =
      readJson(absolute);

    shardCache.set(
      absolute,
      shard
    );
  }

  const verse =
    shard.verses?.[
      location.key
    ];

  if (!verse) {
    throw new Error(
      `Missing source verse: ${location.key}`
    );
  }

  return verse;
}

function findEntry(
  translation,
  corpus
) {
  const entry =
    entries.find(
      (item) =>
        item.translation ===
          translation &&
        item.corpus ===
          corpus &&
        item.sourceVerses?.length
    );

  if (!entry) {
    throw new Error(
      `No ${translation}/${corpus} representative found.`
    );
  }

  return entry;
}

function findGrammarOnlyEntry() {
  for (
    const entry
    of entries
  ) {
    if (
      entry.corpus !==
      "hebrew"
    ) {
      continue;
    }

    for (
      const owner
      of entry.sourceVerses ||
        []
    ) {
      const verse =
        loadSourceVerse(
          owner
        );

      if (
        verse.occurrences?.some(
          (occurrence) =>
            occurrence
              .grammarOnly ===
              true &&
            !occurrence.lexicalId
        )
      ) {
        return entry;
      }
    }
  }

  throw new Error(
    "No mapped Hebrew grammar-only case found."
  );
}

function findBrentonMultiSource() {
  return (
    entries.find(
      (item) =>
        item.translation ===
          "brenton" &&
        item.corpus ===
          "lxx" &&
        item.sourceVerses
          ?.length > 1
    ) || null
  );
}

function makeApiUrl(entry) {
  const query =
    new URLSearchParams({
      translation:
        entry.translation,

      book:
        entry.displayedBook,

      chapter:
        String(
          entry.displayedChapter
        ),

      verse:
        String(
          entry.displayedVerse
        ),
    });

  return (
    `${base}/api/source-breakdown?` +
    query.toString()
  );
}

function verifyOrdering(
  data
) {
  for (
    const sourceVerse
    of data.sourceVerses
  ) {
    const occurrences =
      sourceVerse.occurrences ||
      [];

    if (!occurrences.length) {
      throw new Error(
        `${sourceVerse.reference} returned zero source occurrences.`
      );
    }

    for (
      const occurrence
      of occurrences
    ) {
      if (
        !String(
          occurrence.surface ||
            ""
        ).trim()
      ) {
        throw new Error(
          `${sourceVerse.reference} contains blank source surface.`
        );
      }
    }

    for (
      let index = 1;
      index <
      occurrences.length;
      index++
    ) {
      const before =
        occurrences[
          index - 1
        ];

      const after =
        occurrences[
          index
        ];

      if (
        data.corpus ===
        "hebrew"
      ) {
        if (
          Number(
            after.sourceSlotOrder
          ) <
          Number(
            before.sourceSlotOrder
          )
        ) {
          throw new Error(
            `Hebrew sourceSlotOrder regression: ${sourceVerse.reference}`
          );
        }
      } else {
        if (
          Number(
            after.sourceOrder
          ) <
          Number(
            before.sourceOrder
          )
        ) {
          throw new Error(
            `${data.corpus} canonical order regression: ${sourceVerse.reference}`
          );
        }
      }
    }
  }
}

async function runSourceCase(
  name,
  entry,
  expectedCorpus,
  extraVerify
) {
  const response =
    await fetch(
      makeApiUrl(entry),
      {
        cache:
          "no-store",
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.resolved !== true
  ) {
    throw new Error(
      `${name}: source API failed ${response.status}: ${JSON.stringify(data)}`
    );
  }

  if (
    data.corpus !==
    expectedCorpus
  ) {
    throw new Error(
      `${name}: expected corpus ${expectedCorpus}, got ${data.corpus}`
    );
  }

  if (
    data.sourceVerseCount !==
    entry.sourceVerses.length
  ) {
    throw new Error(
      `${name}: sourceVerseCount mismatch`
    );
  }

  verifyOrdering(data);

  if (extraVerify) {
    extraVerify(data);
  }

  return data;
}

async function verifyWordOverview(
  name,
  data
) {
  const occurrence =
    data.sourceVerses
      .flatMap(
        (verse) =>
          verse.occurrences
      )
      .find(
        (item) =>
          item.lexicalId &&
          item.entityId &&
          !item.grammarOnly
      );

  if (!occurrence) {
    throw new Error(
      `${name}: no lexical occurrence available for Word Overview test`
    );
  }

  const query =
    new URLSearchParams({
      entityId:
        occurrence.entityId || "",

      displayWord:
        occurrence.lexicalId,

      book:
        data.displayedReference
          .book,

      chapter:
        String(
          data.displayedReference
            .chapter
        ),

      verse:
        String(
          data.displayedReference
            .verse
        ),

      translation:
        data.translation,

      displayTokenIndex:
        "-1",

      selectedText:
        occurrence.surface,

      originalWord:
        occurrence.surface,

      verseText:
        "",
    });

  const response =
    await fetch(
      `${base}/api/word-study?${query.toString()}`,
      {
        cache:
          "no-store",
      }
    );

  const json =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `${name}: Word Overview API HTTP ${response.status}`
    );
  }

  if (
    json.resolved ===
    false
  ) {
    throw new Error(
      `${name}: lexical source word did not resolve in Word Overview: ${occurrence.lexicalId}`
    );
  }

  if (
    json.entity?.id &&
    occurrence.entityId &&
    json.entity.id !==
      occurrence.entityId
  ) {
    throw new Error(
      `${name}: Word Overview entity mismatch; expected ${occurrence.entityId}, got ${json.entity.id}`
    );
  }

  return {
    lexicalId:
      occurrence.lexicalId,

    entityId:
      occurrence.entityId,

    resolvedEntity:
      json.entity?.id ||
      null,
  };
}

async function verifyReaderPage(
  entry
) {
  const url =
    `${base}/read/` +
    `${encodeURIComponent(entry.translation === "brenton" && entry.displayedBook === "1CH" ? "1 Chronicles" : (normalizeBookName(entry.displayedBook) || entry.displayedBook))}/` +
    `${entry.displayedChapter}?` +
    new URLSearchParams({
      translation:
        entry.translation,

      verse:
        String(
          entry.displayedVerse
        ),
    }).toString();

  const response =
    await fetch(
      url,
      {
        redirect:
          "follow",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Reader route failed ${response.status}: ${url}`
    );
  }

  const html =
    await response.text();

  if (
    !html.includes(
      "Open source breakdown"
    )
  ) {
    throw new Error(
      `Reader route does not contain Source Breakdown interaction: ${url}`
    );
  }

  return {
    status:
      response.status,

    url,
  };
}

async function main() {
  const webOt =
    findEntry(
      "web",
      "hebrew"
    );

  const kjvOt =
    findEntry(
      "kjv",
      "hebrew"
    );

  const webNt =
    findEntry(
      "web",
      "greek-nt"
    );

  const kjvNt =
    findEntry(
      "kjv",
      "greek-nt"
    );

  const brenton =
    findEntry(
      "brenton",
      "lxx"
    );

  const grammarOnly =
    findGrammarOnlyEntry();

  const multiSource =
    findBrentonMultiSource();

  const results = {};

  results.webOt =
    await runSourceCase(
      "WEB OT",
      webOt,
      "hebrew"
    );

  results.kjvOt =
    await runSourceCase(
      "KJV OT",
      kjvOt,
      "hebrew"
    );

  results.webNt =
    await runSourceCase(
      "WEB NT",
      webNt,
      "greek-nt"
    );

  results.kjvNt =
    await runSourceCase(
      "KJV NT",
      kjvNt,
      "greek-nt"
    );

  results.brenton =
    await runSourceCase(
      "Brenton",
      brenton,
      "lxx"
    );

  const grammarData =
    await runSourceCase(
      "Hebrew grammar-only",
      grammarOnly,
      "hebrew",
      (data) => {
        const found =
          data.sourceVerses
            .flatMap(
              (verse) =>
                verse.occurrences
            )
            .some(
              (item) =>
                item.grammarOnly ===
                  true &&
                !item.lexicalId
            );

        if (!found) {
          throw new Error(
            "Grammar-only case did not return the grammar-only occurrence."
          );
        }
      }
    );

  const multiData =
    multiSource
      ? await runSourceCase(
          "Brenton multi-source",
          multiSource,
          "lxx",
          (data) => {
            if (
              data.sourceVerses.length < 2
            ) {
              throw new Error(
                "Multi-source case collapsed to a single source verse."
              );
            }
          }
        )
      : null;

  const wordOverview = {
    hebrew:
      await verifyWordOverview(
        "Hebrew Word Overview",
        results.webOt
      ),

    greekNt:
      await verifyWordOverview(
        "OpenGNT Word Overview",
        results.webNt
      ),

    lxx:
      await verifyWordOverview(
        "LXX Word Overview",
        results.brenton
      ),
  };

  const readerPages = {
    webOt:
      await verifyReaderPage(
        webOt
      ),

    webNt:
      await verifyReaderPage(
        webNt
      ),

    brenton:
      await verifyReaderPage(
        brenton
      ),
  };

  console.log(
    JSON.stringify(
      {
        verdict:
          "PHASE1_SOURCE_BREAKDOWN_E2E_VERIFIED",

        sourceCases: {
          webOt: {
            displayed:
              results.webOt
                .displayedReference,

            sourceVerses:
              results.webOt
                .sourceVerseCount,

            occurrences:
              results.webOt
                .occurrenceCount,
          },

          kjvOt: {
            displayed:
              results.kjvOt
                .displayedReference,

            sourceVerses:
              results.kjvOt
                .sourceVerseCount,

            occurrences:
              results.kjvOt
                .occurrenceCount,
          },

          webNt: {
            displayed:
              results.webNt
                .displayedReference,

            sourceVerses:
              results.webNt
                .sourceVerseCount,

            occurrences:
              results.webNt
                .occurrenceCount,
          },

          kjvNt: {
            displayed:
              results.kjvNt
                .displayedReference,

            sourceVerses:
              results.kjvNt
                .sourceVerseCount,

            occurrences:
              results.kjvNt
                .occurrenceCount,
          },

          brenton: {
            displayed:
              results.brenton
                .displayedReference,

            sourceVerses:
              results.brenton
                .sourceVerseCount,

            occurrences:
              results.brenton
                .occurrenceCount,
          },

          grammarOnly: {
            displayed:
              grammarData
                .displayedReference,

            preserved:
              true,
          },

          brentonMultiSource:
            multiData
              ? {
                  presentInCurrentRuntime: true,
                  displayed:
                    multiData.displayedReference,
                  sourceVerses:
                    multiData.sourceVerseCount,
                }
              : {
                  presentInCurrentRuntime: false,
                  capability:
                    "Resolver preserves sourceVerses[] ownership order and supports arrays of one or more source verses.",
                },
        },

        wordOverview,

        readerPages,

        alignmentRegenerated:
          false,

        deploymentPerformed:
          false,
      },
      null,
      2
    )
  );
}

main().catch(
  (error) => {
    console.error(
      "PHASE1 SOURCE BREAKDOWN E2E: FAIL"
    );

    console.error(
      error?.stack ||
      error
    );

    process.exit(1);
  }
);
