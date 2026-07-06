const path = require("path");

const root = process.cwd();

module.exports = {
  outputRoot: path.join(root, ".private", "scripture", "canonical"),

  corpora: {
    hebrew: {
  source: "hebrew",
  lexiconFile: path.join(
    root,
    "app",
    "data",
    "lexicon",
    "generatedHebrewLexiconV12.json"
  ),
  alignmentIndexFile: path.join(
    root,
    ".private",
    "alignment",
    "hebrew",
    "generatedAlignmentIndex.json"
  ),
  translations: [
        {
          id: "kjv",
          file: path.join(root, "app", "data", "scripture", "generatedKJV.json"),
        },
        {
          id: "web",
          file: path.join(root, "app", "data", "scripture", "generatedWEB.json"),
        },
      ],
    },
  },
};