#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  fail,
  writeJson,
  parseArgs,
  snapshotProtectedState,
  gitInfo,
} = require("./p0512aj-lib");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  if (!args.output) fail("--output is required.");
  const output = path.resolve(args.output);
  const snapshot = snapshotProtectedState(repoRoot);
  writeJson(output, {
    milestone: "P05.12AJ",
    generatedAtUtc: new Date().toISOString(),
    repository: gitInfo(repoRoot),
    ...snapshot,
  });
  process.stdout.write(`${JSON.stringify({ output, protectedItems: snapshot.items.length }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
