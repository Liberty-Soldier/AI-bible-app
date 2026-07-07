const fs = require("fs");
const path = require("path");

const root = process.cwd();

const inputRoot = path.join(root, ".private", "scripture", "canonical");
const outputRoot = path.join(root, "app", "data", "bibleiq", "canonical");

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyCorpus(corpus) {
  const inputDir = path.join(inputRoot, corpus);
  const outputDir = path.join(outputRoot, corpus);

  if (!fs.existsSync(inputDir)) {
    console.log(`Skipping missing canonical corpus: ${corpus}`);
    return 0;
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let count = 0;

  for (const file of fs.readdirSync(inputDir)) {
    if (!file.endsWith(".json")) continue;

    fs.copyFileSync(path.join(inputDir, file), path.join(outputDir, file));
    count += 1;
  }

  return count;
}

function main() {
  cleanDir(outputRoot);

  const hebrewCount = copyCorpus("hebrew");
  const lxxCount = copyCorpus("lxx");
  const greekNtCount = copyCorpus("greek-nt");

  console.log(
    `Exported BibleIQ canonical runtime: hebrew=${hebrewCount}, lxx=${lxxCount}, greek-nt=${greekNtCount}`
  );
}

main();