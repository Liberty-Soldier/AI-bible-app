"use strict";

const base = process.argv[2] || "http://127.0.0.1:3199";

function fail(message) {
  throw new Error(message);
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) fail(`${response.status} ${url}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const source = await getJson(
    `${base}/api/source-breakdown?` +
      new URLSearchParams({
        translation: "brenton",
        book: "Genesis",
        chapter: "2",
        verse: "2",
      }),
  );
  const occurrences = source.sourceVerses.flatMap((verse) => verse.occurrences);
  const expected = {
    "ἕκτῃ": "L704340",
    "αὐτοῦ": "L702165",
    "ἃ": "L709781",
    "ὧν": "L709781",
  };
  const verified = [];

  for (const [surface, lexicalId] of Object.entries(expected)) {
    const matches = occurrences.filter((item) => item.surface === surface);
    if (!matches.length) fail(`Missing Genesis 2:2 occurrence: ${surface}`);

    for (const occurrence of matches) {
      if (
        occurrence.lexicalId !== lexicalId ||
        occurrence.entityId !== `word:lxx:${lexicalId}` ||
        occurrence.lexicalResolution?.status !== "resolved"
      ) {
        fail(`Incorrect source identity for ${surface}`);
      }

      const query = new URLSearchParams({
        entityId: occurrence.entityId,
        displayWord: occurrence.surface,
        book: "Genesis",
        chapter: "2",
        verse: "2",
        translation: "brenton",
        selectedText: occurrence.surface,
        originalWord: occurrence.surface,
        sourceOccurrenceId: occurrence.id,
        sourceLexicalId: occurrence.lexicalId,
        sourceCorpus: "lxx",
        sourceResolutionAuthority: occurrence.lexicalResolution.authority,
        sourceResolutionMethod: occurrence.lexicalResolution.method,
      });
      const overview = await getJson(`${base}/api/word-study?${query}`);
      const provenance = overview.entity?.alignment?.lexicalResolution;

      if (
        overview.entity?.id !== occurrence.entityId ||
        overview.entity?.alignment?.lexicalId !== occurrence.lexicalId ||
        provenance?.sourceOccurrenceId !== occurrence.id ||
        provenance?.entityId !== occurrence.entityId ||
        overview.entity?.emet?.sourceEntityId !== occurrence.entityId ||
        overview.entity?.emet?.sourceLexicalId !== occurrence.lexicalId
      ) {
        fail(`Reader/Word Overview/EMET contract mismatch for ${surface}`);
      }

      verified.push({
        surface,
        lexicalId: occurrence.lexicalId,
        entityId: occurrence.entityId,
        lemma: occurrence.lemma,
        meaning: occurrence.meaning,
        morphology: occurrence.morphology,
        emetStatus: overview.entity?.emet?.status,
      });
    }
  }

  const rejected = occurrences.find((item) => item.surface === "ἕκτῃ");
  const rejectedQuery = new URLSearchParams({
    entityId: rejected.entityId,
    displayWord: rejected.surface,
    book: "Genesis",
    chapter: "2",
    verse: "2",
    translation: "brenton",
    sourceOccurrenceId: rejected.id,
    sourceLexicalId: "L704339",
    sourceCorpus: "lxx",
    sourceResolutionAuthority: rejected.lexicalResolution.authority,
    sourceResolutionMethod: rejected.lexicalResolution.method,
  });
  const rejectedResponse = await fetch(
    `${base}/api/word-study?${rejectedQuery}`,
    { cache: "no-store" },
  );
  const rejectedJson = await rejectedResponse.json();
  if (rejectedJson.resolved !== false) {
    fail("Mismatched occurrence/entity contract did not fail closed");
  }

  console.log(
    JSON.stringify(
      {
        verdict: "GENESIS_2_2_LXX_IDENTITY_E2E_VERIFIED",
        verified,
        mismatchedContractRejected: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("GENESIS 2:2 LXX E2E: FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
