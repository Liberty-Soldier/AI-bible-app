"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(message) {
  throw new Error(`[P05.12W WEB alignment preservation] ${message}`);
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
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  for (const key of ["liveRoot", "stagedRoot", "output"]) {
    if (!args[key]) fail(`Missing required argument: ${key}`);
  }

  return args;
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokenText(token) {
  return String(token?.text ?? token?.surface ?? token?.word ?? "");
}

const ARRAY_ALIGNMENT_KEYS = [
  "alignedSourceTokenIds",
  "sourceTokenIds",
  "alignedSourceEntityIds",
  "sourceEntityIds",
];

const SCALAR_ALIGNMENT_KEYS = [
  "alignmentStatus",
  "alignmentMethod",
  "alignmentConfidence",
  "alignmentReason",
  "approvedRouteId",
  "compoundDefinitionId",
];

function uniqueStrings(values) {
  return [...new Set((values || []).map(String).filter(Boolean))].sort();
}

function arrayValue(token, key) {
  return Array.isArray(token?.[key]) ? uniqueStrings(token[key]) : [];
}

function routeIds(token) {
  return uniqueStrings([
    ...arrayValue(token, "alignedSourceTokenIds"),
    ...arrayValue(token, "sourceTokenIds"),
  ]);
}

function entityIds(token) {
  return uniqueStrings([
    ...arrayValue(token, "alignedSourceEntityIds"),
    ...arrayValue(token, "sourceEntityIds"),
  ]);
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

function alignmentPayload(token) {
  const payload = {};

  for (const key of ARRAY_ALIGNMENT_KEYS) {
    const values = arrayValue(token, key);
    if (values.length) payload[key] = values;
  }

  for (const key of SCALAR_ALIGNMENT_KEYS) {
    if (token?.[key] !== undefined && token?.[key] !== null) {
      payload[key] = token[key];
    }
  }

  if (!payload.alignmentStatus && isAligned(token)) {
    payload.alignmentStatus = "aligned";
  }

  return payload;
}

function mergePayloads(tokens, method) {
  const payload = {};

  for (const key of ARRAY_ALIGNMENT_KEYS) {
    const values = uniqueStrings(
      tokens.flatMap(token => arrayValue(token, key)),
    );
    if (values.length) payload[key] = values;
  }

  payload.alignmentStatus = "aligned";
  payload.alignmentMethod = method;

  return payload;
}

function hasConflictingAlignment(target, payload) {
  if (!isAligned(target)) return false;

  const targetSignature = routeSignature(target);
  const payloadSignature = JSON.stringify({
    routes: uniqueStrings([
      ...(payload.alignedSourceTokenIds || []),
      ...(payload.sourceTokenIds || []),
    ]),
    entities: uniqueStrings([
      ...(payload.alignedSourceEntityIds || []),
      ...(payload.sourceEntityIds || []),
    ]),
  });

  return targetSignature !== payloadSignature;
}

function applyPayload(target, payload) {
  for (const [key, value] of Object.entries(payload)) {
    target[key] = Array.isArray(value) ? [...value] : value;
  }
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

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function lcsMapping(oldTokens, newTokens) {
  const oldNorm = oldTokens.map(token => normalizeToken(tokenText(token)));
  const newNorm = newTokens.map(token => normalizeToken(tokenText(token)));
  const rows = oldNorm.length + 1;
  const cols = newNorm.length + 1;
  const dp = Array.from({ length: rows }, () =>
    new Uint16Array(cols),
  );

  for (let oldIndex = oldNorm.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newNorm.length - 1; newIndex >= 0; newIndex -= 1) {
      if (
        oldNorm[oldIndex] &&
        oldNorm[oldIndex] === newNorm[newIndex]
      ) {
        dp[oldIndex][newIndex] =
          dp[oldIndex + 1][newIndex + 1] + 1;
      } else {
        dp[oldIndex][newIndex] = Math.max(
          dp[oldIndex + 1][newIndex],
          dp[oldIndex][newIndex + 1],
        );
      }
    }
  }

  const mapping = new Map();
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldNorm.length && newIndex < newNorm.length) {
    if (
      oldNorm[oldIndex] &&
      oldNorm[oldIndex] === newNorm[newIndex]
    ) {
      mapping.set(oldIndex, newIndex);
      oldIndex += 1;
      newIndex += 1;
    } else if (
      dp[oldIndex + 1][newIndex] >=
      dp[oldIndex][newIndex + 1]
    ) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }

  return mapping;
}

function missingOldAlignedIndexes(oldTokens, newTokens) {
  const available = new Map();

  for (const token of newTokens.filter(isAligned)) {
    const signature = routeSignature(token);
    available.set(signature, (available.get(signature) || 0) + 1);
  }

  const missing = [];

  for (let index = 0; index < oldTokens.length; index += 1) {
    const token = oldTokens[index];
    if (!isAligned(token)) continue;

    const signature = routeSignature(token);
    const count = available.get(signature) || 0;

    if (count > 0) {
      available.set(signature, count - 1);
    } else {
      missing.push(index);
    }
  }

  return missing;
}

function alignmentCounts(oldTokens, newTokens) {
  const oldCounts = new Map();
  const newCounts = new Map();

  for (const token of oldTokens.filter(isAligned)) {
    const signature = routeSignature(token);
    oldCounts.set(signature, (oldCounts.get(signature) || 0) + 1);
  }

  for (const token of newTokens.filter(isAligned)) {
    const signature = routeSignature(token);
    newCounts.set(signature, (newCounts.get(signature) || 0) + 1);
  }

  let preserved = 0;
  let dropped = 0;
  let added = 0;

  for (const [signature, oldCount] of oldCounts) {
    const newCount = newCounts.get(signature) || 0;
    preserved += Math.min(oldCount, newCount);
    dropped += Math.max(0, oldCount - newCount);
  }

  for (const [signature, newCount] of newCounts) {
    const oldCount = oldCounts.get(signature) || 0;
    added += Math.max(0, newCount - oldCount);
  }

  return { preserved, dropped, added };
}

function occurrenceIndex(tokens, targetIndex, normalized) {
  let ordinal = -1;

  for (let index = 0; index <= targetIndex; index += 1) {
    if (normalizeToken(tokenText(tokens[index])) === normalized) {
      ordinal += 1;
    }
  }

  return ordinal;
}

function indexesForNormalized(tokens, normalized) {
  const result = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (normalizeToken(tokenText(tokens[index])) === normalized) {
      result.push(index);
    }
  }

  return result;
}

function repairRecord(oldTokens, newTokens) {
  const before = alignmentCounts(oldTokens, newTokens);
  const missing = new Set(missingOldAlignedIndexes(oldTokens, newTokens));
  const resolved = new Set();
  const actions = [];
  const unresolved = [];
  const lcs = lcsMapping(oldTokens, newTokens);
  const claimedNewIndexes = new Set();

  function tryDirect(oldIndex, newIndex, method) {
    if (!missing.has(oldIndex) || resolved.has(oldIndex)) return false;
    if (newIndex === undefined || newIndex < 0 || newIndex >= newTokens.length) {
      return false;
    }

    const oldToken = oldTokens[oldIndex];
    const newToken = newTokens[newIndex];
    const oldNorm = normalizeToken(tokenText(oldToken));
    const newNorm = normalizeToken(tokenText(newToken));

    if (!oldNorm || oldNorm !== newNorm) return false;
    if (claimedNewIndexes.has(newIndex)) return false;

    const payload = alignmentPayload(oldToken);
    if (hasConflictingAlignment(newToken, payload)) return false;

    applyPayload(newToken, {
      ...payload,
      alignmentMethod: method,
    });
    claimedNewIndexes.add(newIndex);
    resolved.add(oldIndex);
    actions.push({
      method,
      oldIndexes: [oldIndex],
      newIndexes: [newIndex],
      oldText: tokenText(oldToken),
      newText: tokenText(newToken),
      signature: routeSignature(oldToken),
    });

    return true;
  }

  for (const oldIndex of [...missing]) {
    tryDirect(oldIndex, lcs.get(oldIndex), "p0512w-lcs-preservation");
  }

  for (const oldIndex of [...missing]) {
    if (resolved.has(oldIndex)) continue;

    const oldNorm = normalizeToken(tokenText(oldTokens[oldIndex]));
    if (!oldNorm) continue;

    const oldMatches = indexesForNormalized(oldTokens, oldNorm);
    const newMatches = indexesForNormalized(newTokens, oldNorm);

    if (oldMatches.length !== newMatches.length) continue;

    const ordinal = occurrenceIndex(oldTokens, oldIndex, oldNorm);
    tryDirect(
      oldIndex,
      newMatches[ordinal],
      "p0512w-occurrence-preservation",
    );
  }

  // Safe merge preservation for punctuation/hyphenation changes such as
  // "Merib Baal" -> "Merib-baal". Only unaligned target tokens are used.
  for (let newIndex = 0; newIndex < newTokens.length; newIndex += 1) {
    if (claimedNewIndexes.has(newIndex) || isAligned(newTokens[newIndex])) {
      continue;
    }

    const newNorm = normalizeToken(tokenText(newTokens[newIndex]));
    if (!newNorm) continue;

    let applied = false;

    for (let start = 0; start < oldTokens.length && !applied; start += 1) {
      for (let span = 2; span <= 3 && start + span <= oldTokens.length; span += 1) {
        const indexes = Array.from({ length: span }, (_, offset) => start + offset);
        const combined = indexes
          .map(index => normalizeToken(tokenText(oldTokens[index])))
          .join("");

        if (!combined || combined !== newNorm) continue;

        const missingAlignedIndexes = indexes.filter(
          index => missing.has(index) && !resolved.has(index),
        );

        if (!missingAlignedIndexes.length) continue;

        const alignedOldTokens = missingAlignedIndexes.map(
          index => oldTokens[index],
        );
        const payload = mergePayloads(
          alignedOldTokens,
          "p0512w-compound-merge-preservation",
        );

        if (hasConflictingAlignment(newTokens[newIndex], payload)) continue;

        applyPayload(newTokens[newIndex], payload);
        claimedNewIndexes.add(newIndex);

        for (const oldIndex of missingAlignedIndexes) {
          resolved.add(oldIndex);
        }

        actions.push({
          method: "p0512w-compound-merge-preservation",
          oldIndexes: missingAlignedIndexes,
          newIndexes: [newIndex],
          oldText: indexes.map(index => tokenText(oldTokens[index])).join(" "),
          newText: tokenText(newTokens[newIndex]),
          signatures: alignedOldTokens.map(routeSignature),
        });

        applied = true;
        break;
      }
    }
  }

  for (const oldIndex of [...missing]) {
    if (resolved.has(oldIndex)) continue;

    const oldToken = oldTokens[oldIndex];
    unresolved.push({
      oldIndex,
      oldText: tokenText(oldToken),
      normalized: normalizeToken(tokenText(oldToken)),
      signature: routeSignature(oldToken),
      reason: "no-deterministic-same-token-or-safe-merge-target",
    });
  }

  const after = alignmentCounts(oldTokens, newTokens);

  if (after.dropped > before.dropped) {
    fail(
      `Repair increased dropped signatures from ${before.dropped} to ${after.dropped}`,
    );
  }

  return {
    before,
    after,
    actions,
    unresolved,
  };
}

function treeHash(directory) {
  const hash = crypto.createHash("sha256");

  for (const file of walkJson(directory)) {
    hash.update(path.relative(directory, file).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }

  return hash.digest("hex");
}

function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.output, { recursive: true });

  const recordReports = [];
  const totals = {
    filesScanned: 0,
    recordsScanned: 0,
    changedRecords: 0,
    recordsWithDroppedBefore: 0,
    recordsRepaired: 0,
    oldAlignedTokens: 0,
    stagedAlignedTokensBefore: 0,
    stagedAlignedTokensAfter: 0,
    droppedSignaturesBefore: 0,
    droppedSignaturesAfter: 0,
    recoveredSignatures: 0,
    lcsActions: 0,
    occurrenceActions: 0,
    compoundMergeActions: 0,
    unresolvedOldAlignedTokens: 0,
  };

  const allowedOldRoutes = new Set();
  const introducedRoutes = new Set();

  for (const corpus of ["hebrew", "greek-nt"]) {
    const liveDirectory = path.join(args.liveRoot, corpus);

    for (const liveFile of walkJson(liveDirectory)) {
      totals.filesScanned += 1;

      const relative = path.relative(args.liveRoot, liveFile);
      const stagedFile = path.join(args.stagedRoot, relative);

      if (!fs.existsSync(stagedFile)) {
        fail(`Staged canonical file missing: ${relative}`);
      }

      const live = readJson(liveFile);
      const staged = readJson(stagedFile);
      let fileChanged = false;

      for (const objectKey of Object.keys(live)) {
        const oldRecord = live[objectKey];
        const newRecord = staged[objectKey];
        if (!oldRecord || !newRecord) continue;

        totals.recordsScanned += 1;

        const oldWeb = oldRecord?.translations?.web;
        const newWeb = newRecord?.translations?.web;
        if (!oldWeb || !newWeb) continue;

        const oldTokens = Array.isArray(oldWeb.tokens) ? oldWeb.tokens : [];
        const newTokens = Array.isArray(newWeb.tokens) ? newWeb.tokens : [];

        for (const token of oldTokens.filter(isAligned)) {
          for (const route of routeIds(token)) allowedOldRoutes.add(route);
        }

        totals.oldAlignedTokens += oldTokens.filter(isAligned).length;
        totals.stagedAlignedTokensBefore += newTokens.filter(isAligned).length;

        if (String(oldWeb.text ?? "") !== String(newWeb.text ?? "")) {
          totals.changedRecords += 1;
        }

        const result = repairRecord(oldTokens, newTokens);

        totals.droppedSignaturesBefore += result.before.dropped;
        totals.droppedSignaturesAfter += result.after.dropped;
        totals.recoveredSignatures +=
          result.before.dropped - result.after.dropped;
        totals.stagedAlignedTokensAfter += newTokens.filter(isAligned).length;

        if (result.before.dropped > 0) {
          totals.recordsWithDroppedBefore += 1;
        }

        if (result.actions.length > 0) {
          totals.recordsRepaired += 1;
          fileChanged = true;
        }

        for (const action of result.actions) {
          if (action.method === "p0512w-lcs-preservation") {
            totals.lcsActions += 1;
          } else if (action.method === "p0512w-occurrence-preservation") {
            totals.occurrenceActions += 1;
          } else if (action.method === "p0512w-compound-merge-preservation") {
            totals.compoundMergeActions += 1;
          }
        }

        totals.unresolvedOldAlignedTokens += result.unresolved.length;

        if (result.before.dropped > 0 || result.actions.length > 0) {
          recordReports.push({
            corpus,
            file: relative.replace(/\\/g, "/"),
            objectKey,
            reference: String(newRecord.reference ?? objectKey),
            oldText: String(oldWeb.text ?? ""),
            newText: String(newWeb.text ?? ""),
            ...result,
          });
        }
      }

      if (fileChanged) writeJson(stagedFile, staged);
    }
  }

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(path.join(args.stagedRoot, corpus))) {
      const root = readJson(file);

      for (const record of Object.values(root)) {
        const web = record?.translations?.web;
        const tokens = Array.isArray(web?.tokens) ? web.tokens : [];

        for (const token of tokens.filter(isAligned)) {
          for (const route of routeIds(token)) {
            if (!allowedOldRoutes.has(route)) introducedRoutes.add(route);
          }
        }
      }
    }
  }

  if (introducedRoutes.size > 0) {
    fail(
      `Repair introduced ${introducedRoutes.size} source routes not present in the live canonical WEB layer`,
    );
  }

  const report = {
    milestone: "P05.12W",
    generatedAtUtc: new Date().toISOString(),
    stagedTreeSha256AfterRepair: treeHash(args.stagedRoot),
    totals,
    introducedSourceRoutes: [...introducedRoutes],
    gates: {
      noNewSourceRoutesIntroduced: introducedRoutes.size === 0,
      droppedSignaturesDidNotIncrease:
        totals.droppedSignaturesAfter <= totals.droppedSignaturesBefore,
      deterministicPreservationOnly: true,
      safeToReviewRepair: true,
      safeToPromoteProduction: false,
    },
  };

  writeJson(
    path.join(args.output, "web-alignment-preservation-summary.json"),
    report,
  );
  writeJson(
    path.join(args.output, "web-alignment-preservation-records.json"),
    recordReports,
  );

  const unresolved = recordReports
    .filter(record => record.unresolved.length > 0)
    .map(record => ({
      corpus: record.corpus,
      file: record.file,
      objectKey: record.objectKey,
      reference: record.reference,
      oldText: record.oldText,
      newText: record.newText,
      unresolved: record.unresolved,
    }));

  writeJson(
    path.join(args.output, "web-alignment-preservation-unresolved.json"),
    unresolved,
  );

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
