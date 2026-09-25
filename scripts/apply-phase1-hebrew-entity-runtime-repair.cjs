"use strict";

const cp = require("child_process");
const path = require("path");

function applyPhase1HebrewEntityRuntimeRepair(root) {
  const runner = path.join(
    root,
    "scripts",
    "phase1-hebrew-entity-runtime-repair-worker.cjs"
  );

  cp.execFileSync(
    process.execPath,
    [runner, root, "--post-build"],
    {
      cwd: root,
      stdio: "inherit"
    }
  );
}

module.exports = {
  applyPhase1HebrewEntityRuntimeRepair
};
