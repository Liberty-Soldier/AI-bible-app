const fs = require("fs");
const path = require("path");

const root = process.cwd();

const lexiconPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

const kjvPath = path.join(root, "app", "data", "scripture", "generatedKJV.json");
const webPath = path.join(root, "app", "data", "scripture", "generatedWEB.json");

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "psalm-superscription-audit.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseSourceReference(reference) {
  const match = String(reference || "").match(
    /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/
  );

  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function getEvidenceBook(book) {
  const map = {
    Psalms: "Ps",
    Psalm: "Ps",
  };

  return map[book] || book;
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function addVerse(map, chapter, verse) {
  if (!map.has(chapter)) map.set(chapter, new Set());
  map.get(chapter).add(verse);
}

function statsForSet(set) {
  const values = Array.from(set || []).sort((a, b) => a - b);

  return {
    count: values.length,
    min: values.length ? values[0] : null,
    max: values.length ? values[values.length - 1] : null,
    values,
    contiguous: isContiguous(values),
  };
}

function isContiguous(values) {
  if (!values.length) return false;

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== i + 1) return false;
  }

  return true;
}

function createSkipRule(chapter) {
  return {
    id: `ps-${chapter}-1-superscription-skip`,
    sourceBook: "Ps",
    sourceChapter: chapter,
    sourceVerseStart: 1,
    sourceVerseEnd: 1,
    action: "skip",
    reason: `Hebrew Psalm ${chapter}:1 appears to be a superscription/title and should not be aligned to an English verse.`,
  };
}

function createOffsetRule(chapter, sourceMax, englishMax) {
  return {
    id: `ps-${chapter}-2-${sourceMax}-to-ps-${chapter}-1-${englishMax}`,
    sourceBook: "Ps",
    sourceChapter: chapter,
    sourceVerseStart: 2,
    sourceVerseEnd: sourceMax,
    targetBook: "Ps",
    targetChapter: chapter,
    targetVerseOffset: -1,
    reason: `Hebrew Psalm ${chapter}:2-${sourceMax} appears to map to English Psalm ${chapter}:1-${englishMax}; Hebrew verse 1 is a superscription/title.`,
  };
}

function main() {
  const lexicon = readJson(lexiconPath);
  const kjv = readJson(kjvPath);
  const web = readJson(webPath);

  const sourceByChapter = new Map();
  const kjvByChapter = new Map();
  const webByChapter = new Map();

  for (const entry of lexicon) {
    if (!entry?.strong || entry.language !== "hebrew") continue;

    for (const occurrence of entry.occurrences || []) {
      const parsed = parseSourceReference(occurrence.reference);
      if (!parsed || parsed.book !== "Ps") continue;

      addVerse(sourceByChapter, parsed.chapter, parsed.verse);
    }
  }

  for (const verse of kjv) {
    const book = getEvidenceBook(verse.book);
    if (book !== "Ps") continue;
    if (!getVerseText(verse)) continue;

    addVerse(kjvByChapter, Number(verse.chapter), Number(verse.verse));
  }

  for (const verse of web) {
    const book = getEvidenceBook(verse.book);
    if (book !== "Ps") continue;
    if (!getVerseText(verse)) continue;

    addVerse(webByChapter, Number(verse.chapter), Number(verse.verse));
  }

  const chapters = new Set([
    ...sourceByChapter.keys(),
    ...kjvByChapter.keys(),
    ...webByChapter.keys(),
  ]);

  const rows = [];
  const proposedRules = [];

  for (const chapter of Array.from(chapters).sort((a, b) => a - b)) {
    const source = statsForSet(sourceByChapter.get(chapter));
    const kjvStats = statsForSet(kjvByChapter.get(chapter));
    const webStats = statsForSet(webByChapter.get(chapter));

    const englishMax = Math.max(kjvStats.max || 0, webStats.max || 0);
    const englishCount = Math.max(kjvStats.count || 0, webStats.count || 0);
    const sourceMax = source.max || 0;

    const likelyOneVerseSuperscription =
      source.min === 1 &&
      source.contiguous &&
      englishMax > 0 &&
      sourceMax === englishMax + 1 &&
      source.count === englishCount + 1;

    const proposedRulesForChapter = [];

    if (likelyOneVerseSuperscription) {
      const skipRule = createSkipRule(chapter);
      const offsetRule = createOffsetRule(chapter, sourceMax, englishMax);

      proposedRulesForChapter.push(skipRule, offsetRule);
      proposedRules.push(skipRule, offsetRule);
    }

    rows.push({
      chapter,
      source,
      kjv: kjvStats,
      web: webStats,
      englishMax,
      englishCount,
      sourceMax,
      sourceMinusEnglish: sourceMax - englishMax,
      likelyOneVerseSuperscription,
      proposedRules: proposedRulesForChapter,
    });
  }

  const likelyRows = rows.filter((row) => row.likelyOneVerseSuperscription);

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      chaptersChecked: rows.length,
      likelyOneVerseSuperscriptionChapters: likelyRows.length,
      proposedRules: proposedRules.length,
    },
    rows,
    proposedRules,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Psalm superscription audit complete");
  console.log(`Chapters checked: ${report.summary.chaptersChecked}`);
  console.log(
    `Likely one-verse superscription chapters: ${report.summary.likelyOneVerseSuperscriptionChapters}`
  );
  console.log(`Proposed rules: ${report.summary.proposedRules}`);
  console.log(`Report written: ${reportPath}`);
}

main();