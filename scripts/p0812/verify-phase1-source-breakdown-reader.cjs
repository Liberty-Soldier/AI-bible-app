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
  "app/components/ReaderVerseStudy.tsx"
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

forbid(scripture, "data-word-token", "English word tap remains");
forbid(scripture, "useRouter", "English navigation remains");

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
  "<ReaderVerseStudy",
  "verse uses inline ReaderVerseStudy"
);

need(
  verse,
  '<ScriptureText',
  "reading-only ScriptureText remains"
);

need(
  verse,
  'data-verse-study-control="true"',
  "per-verse Study control exists"
);

need(
  verse,
  "/api/source-breakdown",
  "Study opens Source Breakdown API"
);

need(
  verse,
  "WordStudySheet",
  "source lexical occurrence opens Word Overview"
);

need(
  verse,
  'data-source-word="true"',
  "source lexical words are tappable"
);

need(
  verse,
  '["hebrew", "lxx"]',
  "Hebrew and LXX choices exist"
);

need(
  verse,
  "transliteration",
  "source transliteration remains visible"
);

need(
  verse,
  'presentation="inline"',
  "deeper Word Overview renders inline"
);

forbid(
  verse,
  'className="fixed inset-0 z-[110]"',
  "legacy fixed Word Overview wrapper remains"
);

need(
  verse,
  'ownership?.kind !== "exact"',
  "source correspondence does not require exact ownership"
);

need(
  verse,
  "spans.size === 1",
  "ambiguous source correspondence does not fail closed"
);

need(
  scripture,
  'data-source-correspondence',
  "visual source correspondence marker is missing"
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
        "reading-only with inline Study control",

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
