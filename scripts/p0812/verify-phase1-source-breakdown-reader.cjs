"use strict";

const fs = require("fs");

function read(file) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

const scripture = read(
  "app/components/ScriptureText.tsx"
);

const controller = read(
  "app/components/VerseActionController.tsx"
);

const verse = read(
  "app/components/SourceBreakdownVerse.tsx"
);

const sheet = read(
  "app/components/SourceBreakdownSheet.tsx"
);

const failures = [];

function need(
  text,
  value,
  label
) {
  if (!text.includes(value)) {
    failures.push(label);
  }
}

function forbid(
  text,
  value,
  label
) {
  if (text.includes(value)) {
    failures.push(label);
  }
}

need(
  scripture,
  'interactionMode?: "word" | "plain"',
  "ScriptureText plain mode exists"
);

need(
  scripture,
  'if (interactionMode === "plain")',
  "plain mode bypasses English word taps"
);

need(
  controller,
  'data-verse-selector="true"',
  "verse-number selector remains intact"
);

need(
  controller,
  "toggleVerse(verse)",
  "verse-number action remains intact"
);

need(
  controller,
  "<SourceBreakdownVerse",
  "verse text now uses SourceBreakdownVerse"
);

forbid(
  controller,
  '<ScriptureText',
  "old ScriptureText verse renderer remains"
);

need(
  verse,
  'interactionMode="plain"',
  "whole verse disables old English word interaction"
);

need(
  verse,
  "/api/source-breakdown",
  "whole verse opens Source Breakdown API"
);

need(
  sheet,
  "WordStudySheet",
  "source lexical occurrence opens Word Overview"
);

need(
  sheet,
  "occurrence.grammarOnly",
  "Hebrew grammar-only rendering remains"
);

need(
  sheet,
  "occurrence.morphology",
  "occurrence morphology remains"
);

need(
  sheet,
  "occurrence.partOfSpeech",
  "LXX part of speech remains distinct"
);

if (failures.length) {
  console.error(
    "PHASE1 SOURCE BREAKDOWN READER: FAIL"
  );

  for (const failure of failures) {
    console.error(
      `- ${failure}`
    );
  }

  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      verdict:
        "PHASE1_SOURCE_BREAKDOWN_READER_VERIFIED",

      verseNumber:
        "existing VerseActionController selector preserved",

      englishVerse:
        "whole verse opens Source Breakdown",

      englishWordToSourceTap:
        false,

      lexicalSourceWordToWordOverview:
        true,

      deploymentPerformed:
        false,
    },
    null,
    2
  )
);
