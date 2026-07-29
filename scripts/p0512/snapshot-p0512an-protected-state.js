#!/usr/bin/env node
"use strict";
const path = require("path");
const { fail, writeJson, parseArgs, snapshotProtected } = require("./p0512an-lib");
try {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const output = path.resolve(args.output || "");
  if (!args.output) fail("--output is required.");
  writeJson(output, snapshotProtected(repoRoot));
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
