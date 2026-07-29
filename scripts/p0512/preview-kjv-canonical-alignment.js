"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  normalizedToken,
  routeIds,
  ownsCanonicalFile,
} = require("../p0510/p0510-canonical-utils.cjs");

const {
  tokenizeDisplayText,
} = require("../canonical/utils/tokenize");

function fail(message) {
  throw new Error(`[P05.12AA KJV canonical preview] ${message}`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--canonical-root" && next) {
      args.canonicalRoot = path.resolve(next);
      index += 1;
    } else if (current === "--candidate" && next) {
      args.candidate = path.resolve(next);
      index += 1;
    } else if (current === "--current-reader" && next) {
      args.currentReader = path.resolve(next);
      index += 1;
    } else if (current === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (current === "--label" && next) {
      args.label = String(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${current}`);
    }
  }

  for (const key of [
    "canonicalRoot",
    "candidate",
    "currentReader",
    "output",
    "label",
  ]) {
    if (!args[key]) {
      fail(`Missing required argument: ${key}`);
    }
  }

  return args;
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
  );
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      key =>
        `${JSON.stringify(key)}:${stableStringify(value[key])}`,
    )
    .join(",")}}`;
}

function walkJson(directory) {
  const result = [];

  if (!fs.existsSync(directory)) {
    return result;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walkJson(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json")
    ) {
      result.push(full);
    }
  }

  return result.sort();
}

function normalizeBook(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BOOK_ALIASES = new Map(
  Object.entries({
    gen: "genesis",
    genesis: "genesis",
    exod: "exodus",
    exodus: "exodus",
    lev: "leviticus",
    leviticus: "leviticus",
    num: "numbers",
    numbers: "numbers",
    deut: "deuteronomy",
    deuteronomy: "deuteronomy",
    josh: "joshua",
    joshua: "joshua",
    judg: "judges",
    judges: "judges",
    ruth: "ruth",
    "1sam": "1 samuel",
    "1 sam": "1 samuel",
    "1 samuel": "1 samuel",
    "2sam": "2 samuel",
    "2 sam": "2 samuel",
    "2 samuel": "2 samuel",
    "1kgs": "1 kings",
    "1 kgs": "1 kings",
    "1 kings": "1 kings",
    "2kgs": "2 kings",
    "2 kgs": "2 kings",
    "2 kings": "2 kings",
    "1chr": "1 chronicles",
    "1 chr": "1 chronicles",
    "1 chronicles": "1 chronicles",
    "2chr": "2 chronicles",
    "2 chr": "2 chronicles",
    "2 chronicles": "2 chronicles",
    ezra: "ezra",
    neh: "nehemiah",
    nehemiah: "nehemiah",
    esth: "esther",
    esther: "esther",
    job: "job",
    ps: "psalms",
    psalm: "psalms",
    psalms: "psalms",
    prov: "proverbs",
    proverbs: "proverbs",
    eccl: "ecclesiastes",
    ecclesiastes: "ecclesiastes",
    song: "song of solomon",
    "song of songs": "song of solomon",
    "song of solomon": "song of solomon",
    isa: "isaiah",
    isaiah: "isaiah",
    jer: "jeremiah",
    jeremiah: "jeremiah",
    lam: "lamentations",
    lamentations: "lamentations",
    ezek: "ezekiel",
    ezekiel: "ezekiel",
    dan: "daniel",
    daniel: "daniel",
    hos: "hosea",
    hosea: "hosea",
    joel: "joel",
    amos: "amos",
    obad: "obadiah",
    obadiah: "obadiah",
    jonah: "jonah",
    mic: "micah",
    micah: "micah",
    nah: "nahum",
    nahum: "nahum",
    hab: "habakkuk",
    habakkuk: "habakkuk",
    zeph: "zephaniah",
    zephaniah: "zephaniah",
    hag: "haggai",
    haggai: "haggai",
    zech: "zechariah",
    zechariah: "zechariah",
    mal: "malachi",
    malachi: "malachi",
    matt: "matthew",
    matthew: "matthew",
    mark: "mark",
    luke: "luke",
    john: "john",
    acts: "acts",
    rom: "romans",
    romans: "romans",
    "1cor": "1 corinthians",
    "1 cor": "1 corinthians",
    "1 corinthians": "1 corinthians",
    "2cor": "2 corinthians",
    "2 cor": "2 corinthians",
    "2 corinthians": "2 corinthians",
    gal: "galatians",
    galatians: "galatians",
    eph: "ephesians",
    ephesians: "ephesians",
    phil: "philippians",
    philippians: "philippians",
    col: "colossians",
    colossians: "colossians",
    "1thess": "1 thessalonians",
    "1 thess": "1 thessalonians",
    "1 thessalonians": "1 thessalonians",
    "2thess": "2 thessalonians",
    "2 thess": "2 thessalonians",
    "2 thessalonians": "2 thessalonians",
    "1tim": "1 timothy",
    "1 tim": "1 timothy",
    "1 timothy": "1 timothy",
    "2tim": "2 timothy",
    "2 tim": "2 timothy",
    "2 timothy": "2 timothy",
    titus: "titus",
    phlm: "philemon",
    philemon: "philemon",
    heb: "hebrews",
    hebrews: "hebrews",
    jas: "james",
    james: "james",
    "1pet": "1 peter",
    "1 pet": "1 peter",
    "1 peter": "1 peter",
    "2pet": "2 peter",
    "2 pet": "2 peter",
    "2 peter": "2 peter",
    "1john": "1 john",
    "1 john": "1 john",
    "2john": "2 john",
    "2 john": "2 john",
    "3john": "3 john",
    "3 john": "3 john",
    jude: "jude",
    rev: "revelation",
    revelation: "revelation",
  }),
);

function canonicalBookName(value) {
  const normalized = normalizeBook(value);
  return BOOK_ALIASES.get(normalized) || normalized;
}

function candidateText(record) {
  return String(
    record?.sources?.find(source =>
      /king james|authorized version/i.test(
        String(source?.sourceName ?? ""),
      ),
    )?.text ??
      record?.sources?.[0]?.text ??
      record?.text ??
      "",
  );
}

function candidateKey(book, chapter, verse) {
  return `${canonicalBookName(book)}:${Number(
    chapter,
  )}:${Number(verse)}`;
}

function buildReaderState(document, label) {
  if (!Array.isArray(document)) {
    fail(`${label} must be a verse array.`);
  }

  const map = new Map();
  const ordered = [];

  for (const record of document) {
    const key = candidateKey(
      record?.book,
      record?.chapter,
      record?.verse,
    );
    const text = candidateText(record);

    if (!record?.book || !record?.chapter || !record?.verse) {
      fail(
        `Invalid ${label} coordinate: ${JSON.stringify(record)}`,
      );
    }

    if (!text) {
      fail(`${label} text missing for ${key}`);
    }

    if (map.has(key)) {
      fail(`Duplicate ${label} coordinate: ${key}`);
    }

    const entry = {
      key,
      text,
      record,
      index: ordered.length,
      book: canonicalBookName(record.book),
      chapter: Number(record.chapter),
      verse: Number(record.verse),
    };

    map.set(key, entry);
    ordered.push(entry);
  }

  if (map.size !== 31102) {
    fail(
      `${label} inventory drift: expected 31102, found ${map.size}`,
    );
  }

  return {
    map,
    ordered,
  };
}

function normalizedTextTokens(text) {
  return tokenizeDisplayText(String(text ?? "")).map(normalized);
}

function arraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function joinReaderText(entries) {
  return entries
    .map(entry => String(entry.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCanonicalTopology({
  record,
  filename,
  oldTokens,
  currentReader,
  candidateReader,
}) {
  const startKey = candidateKey(
    recordBookName(record, filename),
    record?.chapter,
    record?.verse,
  );
  const start = currentReader.map.get(startKey);

  if (!start) {
    fail(
      `Current reader coordinate missing for canonical block ${record?.reference ?? startKey}`,
    );
  }

  const canonicalTokens = oldTokens.map(normalized);
  const matches = [];

  for (let span = 1; span <= 12; span += 1) {
    const currentEntries = currentReader.ordered.slice(
      start.index,
      start.index + span,
    );

    if (currentEntries.length !== span) {
      break;
    }

    if (
      currentEntries.some(
        entry => entry.book !== start.book,
      )
    ) {
      break;
    }

    const joinedCurrentText = joinReaderText(currentEntries);
    const joinedCurrentTokens =
      normalizedTextTokens(joinedCurrentText);

    if (arraysEqual(canonicalTokens, joinedCurrentTokens)) {
      const candidateEntries = currentEntries.map(entry => {
        const candidate = candidateReader.map.get(entry.key);

        if (!candidate) {
          fail(
            `KJV2006 candidate coordinate missing for ${entry.key}`,
          );
        }

        return candidate;
      });

      matches.push({
        startKey,
        span,
        currentEntries,
        candidateEntries,
        coveredKeys: currentEntries.map(entry => entry.key),
        currentText: joinedCurrentText,
        expectedText: joinReaderText(candidateEntries),
      });
    }
  }

  if (matches.length !== 1) {
    fail(
      `Canonical KJV topology was not uniquely resolved for ${record?.reference ?? startKey}: ${JSON.stringify({
        startKey,
        matches: matches.map(match => ({
          span: match.span,
          coveredKeys: match.coveredKeys,
        })),
        canonicalTokenCount: canonicalTokens.length,
      })}`,
    );
  }

  return matches[0];
}

function recordBookName(record, filename) {
  const direct = record?.book ?? record?.source?.book;

  if (direct) {
    const resolved = canonicalBookName(direct);
    if (BOOK_ALIASES.has(normalizeBook(direct))) {
      return resolved;
    }
  }

  const reference = String(record?.reference ?? "");
  const match = /^(.*?)\s+\d+:\d+/.exec(reference);

  if (match) {
    const resolved = canonicalBookName(match[1]);
    if (resolved) return resolved;
  }

  return canonicalBookName(
    path.basename(filename, ".json"),
  );
}

function tokenText(token) {
  return String(
    token?.text ??
      token?.surface ??
      token?.word ??
      "",
  );
}

function normalized(token) {
  return normalizedToken(token);
}

const ROUTE_ARRAY_KEYS = [
  "alignedSourceTokenIds",
  "sourceTokenIds",
  "alignedSourceEntityIds",
  "sourceEntityIds",
];

const ROUTE_SCALAR_KEYS = [
  "sourceTokenId",
  "sourceEntityId",
  "entityId",
  "lexicalEntityId",
  "alignmentStatus",
  "alignmentMethod",
  "alignmentKind",
  "alignmentConfidence",
  "alignmentReason",
  "alignmentSource",
  "alignmentProvenance",
  "approvedRouteId",
  "compoundDefinitionId",
];

function uniqueStrings(values) {
  return [
    ...new Set(
      (values || [])
        .map(String)
        .filter(Boolean),
    ),
  ].sort();
}

function routeEntityIds(token) {
  return uniqueStrings([
    ...(Array.isArray(token?.alignedSourceEntityIds)
      ? token.alignedSourceEntityIds
      : []),
    ...(Array.isArray(token?.sourceEntityIds)
      ? token.sourceEntityIds
      : []),
    token?.sourceEntityId,
    token?.entityId,
    token?.lexicalEntityId,
  ]);
}

function hasRoute(token) {
  return (
    routeIds(token).length > 0 ||
    routeEntityIds(token).length > 0
  );
}

function routeSignature(token) {
  return JSON.stringify({
    routes: uniqueStrings(routeIds(token)),
    entities: routeEntityIds(token),
  });
}

function extractRoutePayload(token) {
  const payload = {};

  for (const key of ROUTE_ARRAY_KEYS) {
    if (
      Array.isArray(token?.[key]) &&
      token[key].length
    ) {
      payload[key] = uniqueStrings(token[key]);
    }
  }

  for (const key of ROUTE_SCALAR_KEYS) {
    if (
      token?.[key] !== undefined &&
      token?.[key] !== null
    ) {
      payload[key] = token[key];
    }
  }

  return payload;
}

function applyPayload(target, payload) {
  for (const [key, value] of Object.entries(payload)) {
    target[key] = Array.isArray(value)
      ? [...value]
      : value;
  }
}

function alignmentCounts(oldTokens, newTokens) {
  const oldCounts = new Map();
  const newCounts = new Map();

  for (const token of oldTokens.filter(hasRoute)) {
    const signature = routeSignature(token);
    oldCounts.set(
      signature,
      (oldCounts.get(signature) || 0) + 1,
    );
  }

  for (const token of newTokens.filter(hasRoute)) {
    const signature = routeSignature(token);
    newCounts.set(
      signature,
      (newCounts.get(signature) || 0) + 1,
    );
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

  return {
    preserved,
    dropped,
    added,
  };
}

function missingOldRouteIndexes(oldTokens, newTokens) {
  const available = new Map();

  for (const token of newTokens.filter(hasRoute)) {
    const signature = routeSignature(token);
    available.set(
      signature,
      (available.get(signature) || 0) + 1,
    );
  }

  const missing = [];

  for (let index = 0; index < oldTokens.length; index += 1) {
    const token = oldTokens[index];
    if (!hasRoute(token)) continue;

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

function lcsMapping(oldTokens, newTokens) {
  const oldNorm = oldTokens.map(normalized);
  const newNorm = newTokens.map(normalized);
  const rows = oldNorm.length + 1;
  const columns = newNorm.length + 1;
  const table = Array.from(
    { length: rows },
    () => new Uint16Array(columns),
  );

  for (
    let oldIndex = oldNorm.length - 1;
    oldIndex >= 0;
    oldIndex -= 1
  ) {
    for (
      let newIndex = newNorm.length - 1;
      newIndex >= 0;
      newIndex -= 1
    ) {
      if (
        oldNorm[oldIndex] &&
        oldNorm[oldIndex] === newNorm[newIndex]
      ) {
        table[oldIndex][newIndex] =
          table[oldIndex + 1][newIndex + 1] + 1;
      } else {
        table[oldIndex][newIndex] = Math.max(
          table[oldIndex + 1][newIndex],
          table[oldIndex][newIndex + 1],
        );
      }
    }
  }

  const mapping = new Map();
  let oldIndex = 0;
  let newIndex = 0;

  while (
    oldIndex < oldNorm.length &&
    newIndex < newNorm.length
  ) {
    if (
      oldNorm[oldIndex] &&
      oldNorm[oldIndex] === newNorm[newIndex]
    ) {
      mapping.set(oldIndex, newIndex);
      oldIndex += 1;
      newIndex += 1;
    } else if (
      table[oldIndex + 1][newIndex] >=
      table[oldIndex][newIndex + 1]
    ) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }

  return mapping;
}

function indexesForNormalized(tokens, value) {
  const indexes = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (normalized(tokens[index]) === value) {
      indexes.push(index);
    }
  }

  return indexes;
}

function occurrenceOrdinal(tokens, targetIndex, value) {
  let ordinal = -1;

  for (let index = 0; index <= targetIndex; index += 1) {
    if (normalized(tokens[index]) === value) {
      ordinal += 1;
    }
  }

  return ordinal;
}

function sameScalarPayload(tokens) {
  if (!tokens.length) {
    return null;
  }

  const signatures = new Set(
    tokens.map(routeSignature),
  );

  if (signatures.size !== 1) {
    return null;
  }

  return extractRoutePayload(tokens[0]);
}

function preserveRoutes(oldTokens, newTokens) {
  const before = alignmentCounts(oldTokens, newTokens);
  const missing = new Set(
    missingOldRouteIndexes(oldTokens, newTokens),
  );
  const resolved = new Set();
  const claimed = new Set();
  const actions = [];
  const lcs = lcsMapping(oldTokens, newTokens);

  function transfer(oldIndex, newIndex, method) {
    if (
      !missing.has(oldIndex) ||
      resolved.has(oldIndex) ||
      newIndex === undefined ||
      newIndex < 0 ||
      newIndex >= newTokens.length ||
      claimed.has(newIndex)
    ) {
      return false;
    }

    const oldToken = oldTokens[oldIndex];
    const newToken = newTokens[newIndex];

    if (
      !normalized(oldToken) ||
      normalized(oldToken) !== normalized(newToken)
    ) {
      return false;
    }

    applyPayload(
      newToken,
      extractRoutePayload(oldToken),
    );
    claimed.add(newIndex);
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

  for (const oldIndex of missing) {
    transfer(
      oldIndex,
      lcs.get(oldIndex),
      "ordered-exact-token",
    );
  }

  for (const oldIndex of missing) {
    if (resolved.has(oldIndex)) continue;

    const value = normalized(oldTokens[oldIndex]);
    if (!value) continue;

    const oldMatches = indexesForNormalized(
      oldTokens,
      value,
    );
    const newMatches = indexesForNormalized(
      newTokens,
      value,
    );

    if (oldMatches.length !== newMatches.length) {
      continue;
    }

    const ordinal = occurrenceOrdinal(
      oldTokens,
      oldIndex,
      value,
    );

    transfer(
      oldIndex,
      newMatches[ordinal],
      "equal-count-occurrence",
    );
  }

  for (
    let newIndex = 0;
    newIndex < newTokens.length;
    newIndex += 1
  ) {
    if (
      claimed.has(newIndex) ||
      hasRoute(newTokens[newIndex])
    ) {
      continue;
    }

    const targetValue = normalized(newTokens[newIndex]);
    if (!targetValue) continue;

    let applied = false;

    for (
      let oldStart = 0;
      oldStart < oldTokens.length && !applied;
      oldStart += 1
    ) {
      for (
        let span = 2;
        span <= 3 &&
        oldStart + span <= oldTokens.length;
        span += 1
      ) {
        const indexes = Array.from(
          { length: span },
          (_, offset) => oldStart + offset,
        );
        const combined = indexes
          .map(index => normalized(oldTokens[index]))
          .join("");

        if (
          !combined ||
          combined !== targetValue
        ) {
          continue;
        }

        const routedIndexes = indexes.filter(
          index =>
            missing.has(index) &&
            !resolved.has(index),
        );

        if (!routedIndexes.length) continue;

        const routedTokens = routedIndexes.map(
          index => oldTokens[index],
        );
        const payload =
          sameScalarPayload(routedTokens);

        if (!payload) continue;

        applyPayload(newTokens[newIndex], payload);
        claimed.add(newIndex);

        for (const oldIndex of routedIndexes) {
          resolved.add(oldIndex);
        }

        actions.push({
          method: "safe-punctuation-hyphen-merge",
          oldIndexes: routedIndexes,
          newIndexes: [newIndex],
          oldText: indexes
            .map(index => tokenText(oldTokens[index]))
            .join(" "),
          newText: tokenText(newTokens[newIndex]),
          signatures: routedTokens.map(routeSignature),
        });

        applied = true;
        break;
      }
    }
  }

  const unresolved = [...missing]
    .filter(index => !resolved.has(index))
    .map(index => ({
      oldIndex: index,
      oldText: tokenText(oldTokens[index]),
      normalized: normalized(oldTokens[index]),
      signature: routeSignature(oldTokens[index]),
      reason:
        "no-deterministic-same-token-or-compatible-merge-target",
    }));

  const after = alignmentCounts(oldTokens, newTokens);

  if (after.dropped > before.dropped) {
    fail(
      `Route preservation increased dropped signatures from ${before.dropped} to ${after.dropped}`,
    );
  }

  return {
    before,
    after,
    actions,
    unresolved,
  };
}

function nonKjvDigest(canonicalRoot) {
  const hash = crypto.createHash("sha256");
  let files = 0;
  let records = 0;

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(canonicalRoot, corpus),
    )) {
      files += 1;
      const relative = path
        .relative(canonicalRoot, file)
        .replace(/\\/g, "/");
      const document = readJson(file);

      for (const objectKey of Object.keys(document).sort()) {
        records += 1;
        const record = structuredClone(
          document[objectKey],
        );

        if (record?.translations) {
          delete record.translations.kjv;
        }

        hash.update(relative);
        hash.update("\0");
        hash.update(objectKey);
        hash.update("\0");
        hash.update(stableStringify(record));
        hash.update("\n");
      }
    }
  }

  return {
    sha256: hash.digest("hex"),
    files,
    records,
  };
}

function uniqueRouteUniverse(canonicalRoot) {
  const routes = new Set();

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(canonicalRoot, corpus),
    )) {
      const document = readJson(file);
      const filename = path.basename(file);

      if (
        !ownsCanonicalFile(
          corpus,
          document,
          filename,
        )
      ) {
        continue;
      }

      for (const record of Object.values(document)) {
        const kjv = record?.translations?.kjv;
        const tokens = Array.isArray(kjv?.tokens)
          ? kjv.tokens
          : [];

        for (const token of tokens.filter(hasRoute)) {
          routes.add(routeSignature(token));
        }
      }
    }
  }

  return routes;
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.canonicalRoot)) {
    fail(
      `Canonical root missing: ${args.canonicalRoot}`,
    );
  }

  if (!fs.existsSync(args.candidate)) {
    fail(`KJV candidate missing: ${args.candidate}`);
  }

  if (!fs.existsSync(args.currentReader)) {
    fail(`Current KJV reader missing: ${args.currentReader}`);
  }

  fs.mkdirSync(args.output, { recursive: true });

  const candidateHash = sha256File(args.candidate);
  const expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829";

  if (candidateHash !== expectedCandidateHash) {
    fail(
      `KJV candidate hash drift. Expected ${expectedCandidateHash}, found ${candidateHash}`,
    );
  }

  const candidateReader = buildReaderState(
    readJson(args.candidate),
    "KJV2006 candidate",
  );
  const currentReader = buildReaderState(
    readJson(args.currentReader),
    "Current production KJV reader",
  );

  const candidateKeySet = new Set(candidateReader.map.keys());
  const currentKeySet = new Set(currentReader.map.keys());

  const readerCoordinateMismatches = [
    ...candidateKeySet,
  ].filter(key => !currentKeySet.has(key)).concat(
    [...currentKeySet].filter(key => !candidateKeySet.has(key)),
  );

  if (readerCoordinateMismatches.length) {
    fail(
      `Current and KJV2006 reader coordinate sets differ: ${readerCoordinateMismatches
        .slice(0, 20)
        .join(", ")}`,
    );
  }

  const usedCandidateKeys = new Set();
  const topologyByRecord = new Map();
  const readerCoordinateCoverage = new Map();
  const routeUniverseBefore =
    uniqueRouteUniverse(args.canonicalRoot);
  const nonKjvBefore =
    nonKjvDigest(args.canonicalRoot);

  const totals = {
    ownedFiles: 0,
    skippedNonOwnedFiles: 0,
    canonicalRecords: 0,
    kjvBlocks: 0,
    representedReaderCoordinates: 0,
    singleVerseBlocks: 0,
    compoundVerseBlocks: 0,
    maximumReaderSpan: 0,
    exactTextBlocks: 0,
    changedTextBlocks: 0,
    exactTokenBlocksBefore: 0,
    retokenizedBlocks: 0,
    oldTokens: 0,
    newTokens: 0,
    oldRoutedTokens: 0,
    newRoutedTokens: 0,
    droppedRouteSignaturesBeforePreservation: 0,
    droppedRouteSignaturesAfterPreservation: 0,
    recoveredRouteSignatures: 0,
    unresolvedOldRoutedTokens: 0,
    orderedExactActions: 0,
    equalCountOccurrenceActions: 0,
    safeMergeActions: 0,
  };

  const recordReports = [];

  for (const corpus of ["hebrew", "greek-nt"]) {
    const directory = path.join(
      args.canonicalRoot,
      corpus,
    );

    for (const file of walkJson(directory)) {
      const filename = path.basename(file);
      const document = readJson(file);

      if (
        !ownsCanonicalFile(
          corpus,
          document,
          filename,
        )
      ) {
        totals.skippedNonOwnedFiles += 1;
        continue;
      }

      totals.ownedFiles += 1;
      let changedFile = false;

      for (const [objectKey, record] of Object.entries(
        document,
      )) {
        totals.canonicalRecords += 1;
        const kjv = record?.translations?.kjv;

        if (!kjv) continue;

        totals.kjvBlocks += 1;

        const oldText = String(kjv.text ?? "");
        const oldTokens = Array.isArray(kjv.tokens)
          ? kjv.tokens
          : [];
        const topology = resolveCanonicalTopology({
          record,
          filename,
          oldTokens,
          currentReader,
          candidateReader,
        });
        const topologyId = `${corpus}/${filename}#${objectKey}`;

        topologyByRecord.set(topologyId, topology);

        for (const key of topology.coveredKeys) {
          if (usedCandidateKeys.has(key)) {
            fail(
              `KJV reader coordinate represented by multiple canonical blocks: ${key}`,
            );
          }

          usedCandidateKeys.add(key);
          readerCoordinateCoverage.set(
            key,
            topologyId,
          );
        }

        totals.representedReaderCoordinates +=
          topology.coveredKeys.length;
        totals.maximumReaderSpan = Math.max(
          totals.maximumReaderSpan,
          topology.span,
        );

        if (topology.span === 1) {
          totals.singleVerseBlocks += 1;
        } else {
          totals.compoundVerseBlocks += 1;
        }

        const expectedText = topology.expectedText;
        const tokenized = tokenizeDisplayText(
          expectedText,
        ).map(token => structuredClone(token));
        const oldNorm = oldTokens.map(normalized);
        const expectedNorm = tokenized.map(normalized);
        const tokenSequenceExact =
          JSON.stringify(oldNorm) ===
          JSON.stringify(expectedNorm);
        const textExact = oldText === expectedText;

        totals.oldTokens += oldTokens.length;
        totals.oldRoutedTokens +=
          oldTokens.filter(hasRoute).length;

        if (textExact && tokenSequenceExact) {
          totals.exactTextBlocks += 1;
          totals.exactTokenBlocksBefore += 1;
          totals.newTokens += oldTokens.length;
          totals.newRoutedTokens +=
            oldTokens.filter(hasRoute).length;
          continue;
        }

        if (textExact) {
          totals.exactTextBlocks += 1;
        } else {
          totals.changedTextBlocks += 1;
        }

        const beforeWithoutRoutes =
          alignmentCounts(oldTokens, tokenized);
        const preservation =
          preserveRoutes(oldTokens, tokenized);

        kjv.text = expectedText;
        kjv.tokens = tokenized;
        changedFile = true;
        totals.retokenizedBlocks += 1;
        totals.newTokens += tokenized.length;
        totals.newRoutedTokens +=
          tokenized.filter(hasRoute).length;
        totals.droppedRouteSignaturesBeforePreservation +=
          beforeWithoutRoutes.dropped;
        totals.droppedRouteSignaturesAfterPreservation +=
          preservation.after.dropped;
        totals.recoveredRouteSignatures +=
          beforeWithoutRoutes.dropped -
          preservation.after.dropped;
        totals.unresolvedOldRoutedTokens +=
          preservation.unresolved.length;

        for (const action of preservation.actions) {
          if (action.method === "ordered-exact-token") {
            totals.orderedExactActions += 1;
          } else if (
            action.method === "equal-count-occurrence"
          ) {
            totals.equalCountOccurrenceActions += 1;
          } else if (
            action.method ===
            "safe-punctuation-hyphen-merge"
          ) {
            totals.safeMergeActions += 1;
          }
        }

        if (
          !textExact ||
          preservation.before.dropped > 0 ||
          preservation.actions.length > 0
        ) {
          recordReports.push({
            corpus,
            filename,
            objectKey,
            reference: String(
              record?.reference ?? objectKey,
            ),
            canonicalStartKey: topology.startKey,
            readerSpan: topology.span,
            coveredReaderCoordinates:
              topology.coveredKeys,
            oldText,
            newText: expectedText,
            oldTokenCount: oldTokens.length,
            newTokenCount: tokenized.length,
            ...preservation,
          });
        }
      }

      if (changedFile) {
        writeJson(file, document);
      }
    }
  }

  if (totals.ownedFiles !== 66) {
    fail(
      `Owned canonical file count drift: expected 66, found ${totals.ownedFiles}`,
    );
  }

  if (
    totals.kjvBlocks !== 31062 ||
    totals.representedReaderCoordinates !== 31102 ||
    usedCandidateKeys.size !== 31102
  ) {
    fail(
      `KJV canonical topology inventory drift: ${JSON.stringify({
        canonicalKjvBlocks: totals.kjvBlocks,
        representedReaderCoordinates:
          totals.representedReaderCoordinates,
        uniqueCandidateCoordinatesUsed:
          usedCandidateKeys.size,
        compoundVerseBlocks:
          totals.compoundVerseBlocks,
        maximumReaderSpan:
          totals.maximumReaderSpan,
      })}`,
    );
  }

  const unusedCandidateKeys = [
    ...candidateReader.map.keys(),
  ].filter(key => !usedCandidateKeys.has(key));

  if (unusedCandidateKeys.length) {
    fail(
      `Unused KJV candidate coordinates: ${unusedCandidateKeys
        .slice(0, 20)
        .join(", ")}`,
    );
  }

  const textMismatches = [];
  const tokenMismatches = [];

  for (const corpus of ["hebrew", "greek-nt"]) {
    for (const file of walkJson(
      path.join(args.canonicalRoot, corpus),
    )) {
      const filename = path.basename(file);
      const document = readJson(file);

      if (
        !ownsCanonicalFile(
          corpus,
          document,
          filename,
        )
      ) {
        continue;
      }

      for (const [objectKey, record] of Object.entries(
        document,
      )) {
        const kjv = record?.translations?.kjv;
        if (!kjv) continue;

        const topologyId = `${corpus}/${filename}#${objectKey}`;
        const topology = topologyByRecord.get(topologyId);

        if (!topology) {
          fail(
            `Missing topology verification state for ${topologyId}`,
          );
        }

        const expectedText = topology.expectedText;

        if (String(kjv.text ?? "") !== expectedText) {
          textMismatches.push({
            corpus,
            filename,
            reference:
              record?.reference ?? objectKey,
            expectedText,
            actualText: kjv.text ?? null,
          });
        }

        const actualTokens = Array.isArray(kjv.tokens)
          ? kjv.tokens.map(normalized)
          : [];
        const expectedTokens = tokenizeDisplayText(
          expectedText,
        ).map(normalized);

        if (
          JSON.stringify(actualTokens) !==
          JSON.stringify(expectedTokens)
        ) {
          tokenMismatches.push({
            corpus,
            filename,
            reference:
              record?.reference ?? objectKey,
            actualCount: actualTokens.length,
            expectedCount: expectedTokens.length,
          });
        }
      }
    }
  }

  const nonKjvAfter =
    nonKjvDigest(args.canonicalRoot);
  const routeUniverseAfter =
    uniqueRouteUniverse(args.canonicalRoot);
  const introducedRouteSignatures = [
    ...routeUniverseAfter,
  ].filter(
    signature =>
      !routeUniverseBefore.has(signature),
  );

  if (nonKjvAfter.sha256 !== nonKjvBefore.sha256) {
    fail(
      "Non-KJV canonical content changed during KJV preview.",
    );
  }

  if (introducedRouteSignatures.length) {
    fail(
      `KJV preview introduced ${introducedRouteSignatures.length} route signatures not present before migration.`,
    );
  }

  const report = {
    milestone: "P05.12AA",
    label: args.label,
    generatedAtUtc: new Date().toISOString(),
    candidate: {
      path: path
        .relative(process.cwd(), args.candidate)
        .replace(/\\/g, "/"),
      sha256: candidateHash,
      verses: candidateReader.map.size,
      currentReaderPath: path
        .relative(process.cwd(), args.currentReader)
        .replace(/\\/g, "/"),
    },
    canonical: {
      root: path
        .relative(process.cwd(), args.canonicalRoot)
        .replace(/\\/g, "/"),
      nonKjvDigestBefore: nonKjvBefore,
      nonKjvDigestAfter: nonKjvAfter,
      routeSignatureUniverseBefore:
        routeUniverseBefore.size,
      routeSignatureUniverseAfter:
        routeUniverseAfter.size,
    },
    totals,
    verification: {
      textMismatches,
      tokenMismatches,
      introducedRouteSignatures,
    },
    gates: {
      candidateHashLocked:
        candidateHash === expectedCandidateHash,
      all66OwnedCanonicalFilesProcessed:
        totals.ownedFiles === 66,
      all31062CanonicalKjvBlocksMapped:
        totals.kjvBlocks === 31062,
      all31102ReaderCoordinatesRepresented:
        totals.representedReaderCoordinates === 31102 &&
        usedCandidateKeys.size === 31102,
      canonicalSpanTopologyResolved:
        totals.singleVerseBlocks +
          totals.compoundVerseBlocks ===
        totals.kjvBlocks,
      allKjvTextExactToKjv2006:
        textMismatches.length === 0,
      allKjvTokenSequencesExact:
        tokenMismatches.length === 0,
      noNonKjvCanonicalChanges:
        nonKjvAfter.sha256 === nonKjvBefore.sha256,
      noNewRouteSignaturesIntroduced:
        introducedRouteSignatures.length === 0,
      unresolvedRoutesFailClosed: true,
      safeToReviewKjvCanonicalPreview: true,
      safeToPromoteProductionKjv: false,
    },
  };

  writeJson(
    path.join(
      args.output,
      "kjv-canonical-alignment-preview-summary.json",
    ),
    report,
  );
  writeJson(
    path.join(
      args.output,
      "kjv-canonical-alignment-records.json",
    ),
    recordReports,
  );
  writeJson(
    path.join(
      args.output,
      "kjv-canonical-span-topology.json",
    ),
    [...topologyByRecord.entries()]
      .filter(([, topology]) => topology.span > 1)
      .map(([topologyId, topology]) => ({
        topologyId,
        startKey: topology.startKey,
        span: topology.span,
        coveredReaderCoordinates:
          topology.coveredKeys,
        currentText: topology.currentText,
        candidateText: topology.expectedText,
      })),
  );
  writeJson(
    path.join(
      args.output,
      "kjv-canonical-alignment-unresolved.json",
    ),
    recordReports
      .filter(
        record => record.unresolved.length > 0,
      )
      .map(record => ({
        corpus: record.corpus,
        filename: record.filename,
        reference: record.reference,
        oldText: record.oldText,
        newText: record.newText,
        unresolved: record.unresolved,
      })),
  );

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
