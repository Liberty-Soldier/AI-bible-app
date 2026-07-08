const path = require("path");

function createBuildConfiguration() {
  const rootDir = process.cwd();

  return {
    compilerVersion: "0.1.0",
    profile: "default",
    rootDir,
    outputDir: path.join(rootDir, ".private", "see", "build"),
    reportDir: path.join(rootDir, ".private", "see", "reports"),
    sources: [
      { id: "hebrew-wlc", label: "Hebrew WLC", role: "primary" },
      { id: "greek-lxx", label: "Greek LXX", role: "primary" },
      { id: "greek-nt", label: "Greek NT", role: "primary" },
      { id: "kjv", label: "KJV", role: "translation" },
      { id: "web", label: "WEB", role: "translation" },
      { id: "brenton", label: "Brenton", role: "translation" }
    ]
  };
}

module.exports = { createBuildConfiguration };