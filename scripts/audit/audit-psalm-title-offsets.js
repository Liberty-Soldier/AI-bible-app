const fs = require("fs");
const path = require("path");

const root = process.cwd();

const canonicalPath = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "hebrew",
  "Ps.json"
);

const outputPath = path.join(root, "reports", "psalm-title-offset-audit.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getRef(chapter, verse) {
  return `Ps:${chapter}:${verse}`;
}

function getTokens(v) {
  return Array.isArray(v?.sourceTokens) ? v.sourceTokens : [];
}

function getEnglishMax(chapterData) {
  let max = 0;

  for (const [ref, verseData] of Object.entries(chapterData)) {
    const match = ref.match(/^Ps:(\d+):(\d+)$/);
    if (!match) continue;

    const translations = verseData.translations || {};
    if (translations.kjv?.text || translations.web?.text) {
      max = Math.max(max, Number(match[2]));
    }
  }

  return max;
}

function getSourceMax(chapterData) {
  let max = 0;

  for (const verseData of Object.values(chapterData)) {
    for (const token of getTokens(verseData)) {
      const ref = token.sourceReference || token.canonicalReference;
      const match = String(ref || "").match(/^Ps:(\d+):(\d+)$/);
      if (!match) continue;
      max = Math.max(max, Number(match[2]));
    }
  }

  return max;
}

function main() {
  const ps = readJson(canonicalPath);

  const byChapter = new Map();

  for (const [ref, verseData] of Object.entries(ps)) {
    const match = ref.match(/^Ps:(\d+):(\d+)$/);
    if (!match) continue;

    const chapter = Number(match[1]);

    if (!byChapter.has(chapter)) byChapter.set(chapter, {});
    byChapter.get(chapter)[ref] = verseData;
  }

  const rows = [];
  const proposedRules = [];

  for (const [chapter, chapterData] of [...byChapter.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const englishMax = getEnglishMax(chapterData);
    const sourceMax = getSourceMax(chapterData);
    const titleVerseCount = sourceMax - englishMax;

    if (titleVerseCount <= 1) continue;
    if (titleVerseCount > 5) continue;

    const sourceStart = titleVerseCount + 1;

    const skipRule = {
      id: `ps-${chapter}-1-${titleVerseCount}-multi-title-skip`,
      sourceBook: "Ps",
      sourceChapter: chapter,
      sourceVerseStart: 1,
      sourceVerseEnd: titleVerseCount,
      action: "skip",
      reason: `Hebrew Psalm ${chapter}:1-${titleVerseCount} appears to be a multi-verse superscription/title and should not be aligned to English verses.`,
    };

    const offsetRule = {
      id: `ps-${chapter}-${sourceStart}-${sourceMax}-to-ps-${chapter}-1-${englishMax}`,
      sourceBook: "Ps",
      sourceChapter: chapter,
      sourceVerseStart: sourceStart,
      sourceVerseEnd: sourceMax,
      targetBook: "Ps",
      targetChapter: chapter,
      targetVerseOffset: -titleVerseCount,
      reason: `Hebrew Psalm ${chapter}:${sourceStart}-${sourceMax} appears to map to English Psalm ${chapter}:1-${englishMax}; Hebrew ${titleVerseCount} title verse(s) are skipped.`,
    };

    rows.push({
      chapter,
      sourceMax,
      englishMax,
      titleVerseCount,
      sourceStart,
      proposedRules: [skipRule, offsetRule],
    });

    proposedRules.push(skipRule, offsetRule);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      chaptersChecked: byChapter.size,
      multiTitleChapters: rows.length,
      proposedRules: proposedRules.length,
    },
    rows,
    proposedRules,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("Psalm multi-title offset audit complete");
  console.log(`Chapters checked: ${report.summary.chaptersChecked}`);
  console.log(`Multi-title chapters: ${report.summary.multiTitleChapters}`);
  console.log(`Proposed rules: ${report.summary.proposedRules}`);
  console.log(`Report written: ${outputPath}`);
}

main();