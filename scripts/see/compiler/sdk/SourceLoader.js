const fs = require("fs");
const path = require("path");

function loadSourceUniverse(config) {
  const sources = [];

  for (const source of config.sources) {
    if (source.id !== "hebrew-wlc") continue;

    const folder = path.join(
      config.rootDir,
      ".private",
      "scripture",
      "canonical",
      "hebrew"
    );

    const files = fs.readdirSync(folder).filter(f => f.endsWith(".json"));

    sources.push({
      ...source,
      folder,
      files: files.map(file => ({
        name: file,
        path: path.join(folder, file)
      }))
    });
  }

  return {
    type: "SourceUniverse",
    version: config.compilerVersion,
    sources
  };
}

module.exports = {
  loadSourceUniverse
};