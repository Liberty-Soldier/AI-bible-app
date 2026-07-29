"use strict";

const fs = require("fs");
const path = require("path");

function fail(message) {
  throw new Error(`[P05.12V WEB canonical preview audit] ${message}`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--live-root" && next) {
      args.liveRoot = path.resolve(next);
      index += 1;
    } else if (current === "--staged-root" && next) {
      args.stagedRoot = path.resolve(next);
      index += 1;
    } else if (current === "--candidate" && next) {
      args.candidate = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  for (const key of ["liveRoot", "stagedRoot", "candidate", "output"]) {
    if (!args[key]) fail(`Missing required argument: ${key}`);
  }

  return args;
}

function routeIds(token) {
  const values = [
    ...(Array.isArray(token?.alignedSourceTokenIds) ? token.alignedSourceTokenIds : []),
    ...(Array.isArray(token?.sourceTokenIds) ? token.sourceTokenIds : []),
  ];
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function entityIds(token) {
  const values = [
    ...(Array.isArray(token?.alignedSourceEntityIds) ? token.alignedSourceEntityIds : []),
    ...(Array.isArray(token?.sourceEntityIds) ? token.sourceEntityIds : []),
  ];
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function isAligned(token) {
  return (
    routeIds(token).length > 0 ||
    entityIds(token).length > 0 ||
    token?.alignmentStatus === "aligned"
  );
}

function routeSignature(token) {
  return JSON.stringify({
    routes: routeIds(token),
    entities: entityIds(token),
  });
}

function walkJson(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;

  for (const name of fs.readdirSync(directory).sort()) {
    const full = path.join(directory, name);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) result.push(...walkJson(full));
    else if (stat.isFile() && name.endsWith(".json")) result.push(full);
  }

  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function candidateKey(record) {
  return `${String(record.book)}\u0000${Number(record.chapter)}\u0000${Number(record.verse)}`;
}

function compareRoots(liveRoot, stagedRoot) {
  const detail = [];
  const summary = {
    filesCompared: 0,
    canonicalRecordsCompared: 0,
    changedWebRecords: 0,
    unchangedWebRecords: 0,
    addedWebRecords: 0,
    removedWebRecords: 0,
    oldWebTokens: 0,
    stagedWebTokens: 0,
    oldAlignedTokens: 0,
    stagedAlignedTokens: 0,
    preservedAlignedSignatures: 0,
    droppedAlignedSignatures: 0,
    newlyAlignedSignatures: 0,
    changedRecordsWithDroppedAlignedSignatures: 0,
  };

  for (const corpus of ["hebrew", "greek-nt"]) {
    const liveDirectory = path.join(liveRoot, corpus);

    for (const liveFile of walkJson(liveDirectory)) {
      const relative = path.relative(liveRoot, liveFile);
      const stagedFile = path.join(stagedRoot, relative);

      if (!fs.existsSync(stagedFile)) {
        fail(`Staged canonical file missing: ${relative}`);
      }

      summary.filesCompared += 1;
      const live = readJson(liveFile);
      const staged = readJson(stagedFile);

      for (const objectKey of new Set([...Object.keys(live), ...Object.keys(staged)])) {
        const oldRecord = live[objectKey];
        const newRecord = staged[objectKey];
        if (!oldRecord || !newRecord) continue;

        summary.canonicalRecordsCompared += 1;

        const oldWeb = oldRecord?.translations?.web;
        const newWeb = newRecord?.translations?.web;

        if (!oldWeb && !newWeb) continue;
        if (!oldWeb && newWeb) {
          summary.addedWebRecords += 1;
          continue;
        }
        if (oldWeb && !newWeb) {
          summary.removedWebRecords += 1;
          continue;
        }

        const oldText = String(oldWeb?.text ?? "");
        const newText = String(newWeb?.text ?? "");
        const oldTokens = Array.isArray(oldWeb?.tokens) ? oldWeb.tokens : [];
        const newTokens = Array.isArray(newWeb?.tokens) ? newWeb.tokens : [];

        summary.oldWebTokens += oldTokens.length;
        summary.stagedWebTokens += newTokens.length;
        summary.oldAlignedTokens += oldTokens.filter(isAligned).length;
        summary.stagedAlignedTokens += newTokens.filter(isAligned).length;

        if (oldText === newText) {
          summary.unchangedWebRecords += 1;
          continue;
        }

        summary.changedWebRecords += 1;

        const oldSignatureCounts = new Map();
        const newSignatureCounts = new Map();

        for (const token of oldTokens.filter(isAligned)) {
          const signature = routeSignature(token);
          oldSignatureCounts.set(signature, (oldSignatureCounts.get(signature) || 0) + 1);
        }

        for (const token of newTokens.filter(isAligned)) {
          const signature = routeSignature(token);
          newSignatureCounts.set(signature, (newSignatureCounts.get(signature) || 0) + 1);
        }

        let preserved = 0;
        let dropped = 0;
        let newlyAligned = 0;

        for (const [signature, oldCount] of oldSignatureCounts) {
          const newCount = newSignatureCounts.get(signature) || 0;
          preserved += Math.min(oldCount, newCount);
          dropped += Math.max(0, oldCount - newCount);
        }

        for (const [signature, newCount] of newSignatureCounts) {
          const oldCount = oldSignatureCounts.get(signature) || 0;
          newlyAligned += Math.max(0, newCount - oldCount);
        }

        summary.preservedAlignedSignatures += preserved;
        summary.droppedAlignedSignatures += dropped;
        summary.newlyAlignedSignatures += newlyAligned;
        if (dropped > 0) summary.changedRecordsWithDroppedAlignedSignatures += 1;

        detail.push({
          corpus,
          file: relative.replace(/\\/g, "/"),
          objectKey,
          reference: String(newRecord?.reference ?? objectKey),
          oldText,
          newText,
          oldTokenCount: oldTokens.length,
          newTokenCount: newTokens.length,
          oldAlignedTokenCount: oldTokens.filter(isAligned).length,
          newAlignedTokenCount: newTokens.filter(isAligned).length,
          preservedAlignedSignatures: preserved,
          droppedAlignedSignatures: dropped,
          newlyAlignedSignatures: newlyAligned,
        });
      }
    }
  }

  return { summary, detail };
}

function main() {
  const args = parseArgs(process.argv);
  const candidate = readJson(args.candidate);

  if (!Array.isArray(candidate) || candidate.length !== 31098) {
    fail(`Candidate must contain 31,098 verses; found ${Array.isArray(candidate) ? candidate.length : "non-array"}`);
  }

  const candidateKeys = new Set(candidate.map(candidateKey));
  if (candidateKeys.size !== 31098) {
    fail(`Candidate contains duplicate verse coordinates: ${31098 - candidateKeys.size}`);
  }

  const comparison = compareRoots(args.liveRoot, args.stagedRoot);
  const report = {
    milestone: "P05.12V",
    generatedAtUtc: new Date().toISOString(),
    candidate: {
      verses: candidate.length,
      uniqueCoordinates: candidateKeys.size,
      first: candidate[0]?.reference ?? null,
      last: candidate[candidate.length - 1]?.reference ?? null,
    },
    canonicalMigration: comparison.summary,
    gates: {
      candidateHas31098Verses: true,
      candidateCoordinatesUnique: true,
      noWebRecordsRemoved: comparison.summary.removedWebRecords === 0,
      safeToReviewMigration: true,
      safeToPromoteProduction: false,
    },
  };

  fs.mkdirSync(args.output, { recursive: true });
  fs.writeFileSync(
    path.join(args.output, "web-canonical-migration-audit-summary.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(args.output, "web-canonical-changed-records.json"),
    JSON.stringify(comparison.detail, null, 2) + "\n",
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
