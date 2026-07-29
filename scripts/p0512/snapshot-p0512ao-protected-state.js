#!/usr/bin/env node
"use strict";
const path = require("path");
const { fail, parseArgs, snapshotPaths, writeJson } = require("./p0512ao-lib");
try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) fail("--output is required.");
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  writeJson(path.resolve(args.output), snapshotPaths(repoRoot));
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
