const fs = require("fs");
const path = require("path");

const {
  normalizeBookName,
  isOldTestamentBook,
  isNewTestamentBook
} = require("../shared/corpus-ownership.cjs");

function normalizeWord(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedToken(token) {
  const supplied = String(token?.normalized ?? "").trim();

  if (supplied) {
    return normalizeWord(supplied);
  }

  return normalizeWord(token?.text);
}

function routeIds(token) {
  const result = new Set();

  for (const key of [
    "alignedSourceTokenIds",
    "sourceTokenIds",
    "alignedTokenIds"
  ]) {
    const values = token?.[key];

    if (Array.isArray(values)) {
      for (const value of values) {
        if (typeof value === "string" && value.trim()) {
          result.add(value.trim());
        }
      }
    }
  }

  return [...result];
}

function entityIds(token) {
  const result = new Set();

  for (const key of [
    "alignedSourceEntityIds",
    "sourceEntityIds",
    "alignedEntityIds"
  ]) {
    const values = token?.[key];

    if (Array.isArray(values)) {
      for (const value of values) {
        if (typeof value === "string" && value.trim()) {
          result.add(value.trim());
        }
      }
    }
  }

  return [...result];
}

function isAligned(token) {
  return (
    routeIds(token).length > 0 ||
    entityIds(token).length > 0 ||
    token?.alignmentStatus === "aligned"
  );
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findRecord(data, objectKey, reference) {
  if (objectKey && data[objectKey]) {
    return {
      objectKey,
      record: data[objectKey]
    };
  }

  if (reference && data[reference]) {
    return {
      objectKey: reference,
      record: data[reference]
    };
  }

  const matches = Object.entries(data).filter(
    ([, record]) =>
      String(record?.reference ?? "") === String(reference)
  );

  if (matches.length !== 1) {
    throw new Error(
      `Unable to resolve exactly one canonical record: ${reference}`
    );
  }

  return {
    objectKey: matches[0][0],
    record: matches[0][1]
  };
}

function localSourceIds(corpus, record, filename) {
  const result = new Set();
  const book =
    String(record?.book ?? "").trim() ||
    path.basename(filename, ".json");

  const chapter = Number(record?.chapter);
  const verse = Number(record?.verse);

  (record.sourceTokens ?? []).forEach((sourceToken, arrayIndex) => {
    for (const key of [
      "id",
      "tokenId",
      "sourceTokenId",
      "sourceId",
      "canonicalTokenId"
    ]) {
      const value = sourceToken?.[key];

      if (typeof value === "string" && value.trim()) {
        result.add(value.trim());
      }
    }

    const tokenIndex = Number.isInteger(sourceToken?.index)
      ? sourceToken.index
      : arrayIndex;

    if (
      book &&
      Number.isFinite(chapter) &&
      Number.isFinite(verse)
    ) {
      result.add(
        `${corpus}:${book}:${chapter}:${verse}:${tokenIndex}`
      );
    }
  });

  return result;
}

function occurrenceOrdinal(tokens, normalized, targetIndex) {
  const matchingIndexes = [];

  (tokens ?? []).forEach((token, index) => {
    if (normalizedToken(token) === normalized) {
      matchingIndexes.push(index);
    }
  });

  return {
    matchingIndexes,
    ordinal: matchingIndexes.indexOf(targetIndex)
  };
}

function readPlan(root) {
  const file = path.join(
    root,
    "scripts",
    "p0510",
    "p0510-canonical-source-plan.json"
  );

  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing P05.10 canonical plan: ${path.relative(root, file)}`
    );
  }

  const plan = JSON.parse(fs.readFileSync(file, "utf8"));

  if (
    plan?.version !== "p0510-canonical-source-plan@1" ||
    plan?.blocks?.length !== 51 ||
    plan?.routes?.length !== 207
  ) {
    throw new Error("Invalid P05.10 canonical source plan.");
  }

  return plan;
}


function normalizeFileBase(file) {
  return path
    .basename(file, ".json")
    .replace(/^(?:0\d+|\d{2,})[-_\s]+/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function findBookInValue(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) {
      const found = findBookInValue(item);
      if (found) return found;
    }

    return null;
  }

  if (typeof value !== "object") return null;

  const direct =
    value.book ||
    value.bookName ||
    value.bookId ||
    value.osisBook ||
    value.ref?.book ||
    value.reference?.book ||
    value.metadata?.book ||
    value.meta?.book;

  if (direct) {
    return normalizeBookName(direct);
  }

  const likelyArrays = [
    value.verses,
    value.records,
    value.tokens,
    value.items,
    value.data,
    value.entries
  ];

  for (const array of likelyArrays) {
    if (!Array.isArray(array)) continue;

    for (const item of array.slice(0, 50)) {
      const found = findBookInValue(item);
      if (found) return found;
    }
  }

  for (const child of Object.values(value).slice(0, 50)) {
    const found = findBookInValue(child);
    if (found) return found;
  }

  return null;
}

function detectCanonicalBook(data, filename) {
  const fromData = findBookInValue(data);

  if (fromData) return fromData;

  return normalizeBookName(
    normalizeFileBase(filename)
  );
}

function ownsCanonicalFile(corpus, data, filename) {
  const book = detectCanonicalBook(data, filename);

  if (corpus === "hebrew") {
    return isOldTestamentBook(book);
  }

  if (corpus === "greek-nt") {
    return isNewTestamentBook(book);
  }

  return true;
}

const canonicalWebBookAliases = new Map(
  Object.entries({
    gen: "Gen",
    genesis: "Gen",
    exod: "Exod",
    exodus: "Exod",
    lev: "Lev",
    leviticus: "Lev",
    num: "Num",
    numbers: "Num",
    deut: "Deut",
    deuteronomy: "Deut",
    josh: "Josh",
    joshua: "Josh",
    judg: "Judg",
    judges: "Judg",
    ruth: "Ruth",
    "1sam": "1Sam",
    "1samuel": "1Sam",
    "2sam": "2Sam",
    "2samuel": "2Sam",
    "1kgs": "1Kgs",
    "1kings": "1Kgs",
    "2kgs": "2Kgs",
    "2kings": "2Kgs",
    "1chr": "1Chr",
    "1chronicles": "1Chr",
    "2chr": "2Chr",
    "2chronicles": "2Chr",
    ezra: "Ezra",
    neh: "Neh",
    nehemiah: "Neh",
    esth: "Esth",
    esther: "Esth",
    job: "Job",
    ps: "Ps",
    psalm: "Ps",
    psalms: "Ps",
    prov: "Prov",
    proverbs: "Prov",
    eccl: "Eccl",
    ecclesiastes: "Eccl",
    song: "Song",
    songofsolomon: "Song",
    songofsongs: "Song",
    isa: "Isa",
    isaiah: "Isa",
    jer: "Jer",
    jeremiah: "Jer",
    lam: "Lam",
    lamentations: "Lam",
    ezek: "Ezek",
    ezekiel: "Ezek",
    dan: "Dan",
    daniel: "Dan",
    hos: "Hos",
    hosea: "Hos",
    joel: "Joel",
    amos: "Amos",
    obad: "Obad",
    obadiah: "Obad",
    jonah: "Jonah",
    mic: "Mic",
    micah: "Mic",
    nah: "Nah",
    nahum: "Nah",
    hab: "Hab",
    habakkuk: "Hab",
    zeph: "Zeph",
    zephaniah: "Zeph",
    hag: "Hag",
    haggai: "Hag",
    zech: "Zech",
    zechariah: "Zech",
    mal: "Mal",
    malachi: "Mal",
    matt: "Matt",
    matthew: "Matt",
    mark: "Mark",
    luke: "Luke",
    john: "John",
    acts: "Acts",
    rom: "Rom",
    romans: "Rom",
    "1cor": "1Cor",
    "1corinthians": "1Cor",
    "2cor": "2Cor",
    "2corinthians": "2Cor",
    gal: "Gal",
    galatians: "Gal",
    eph: "Eph",
    ephesians: "Eph",
    phil: "Phil",
    philippians: "Phil",
    col: "Col",
    colossians: "Col",
    "1thess": "1Thess",
    "1thessalonians": "1Thess",
    "2thess": "2Thess",
    "2thessalonians": "2Thess",
    "1tim": "1Tim",
    "1timothy": "1Tim",
    "2tim": "2Tim",
    "2timothy": "2Tim",
    titus: "Titus",
    phlm: "Phlm",
    philemon: "Phlm",
    heb: "Heb",
    hebrews: "Heb",
    jas: "Jas",
    james: "Jas",
    "1pet": "1Pet",
    "1peter": "1Pet",
    "2pet": "2Pet",
    "2peter": "2Pet",
    "1john": "1John",
    "2john": "2John",
    "3john": "3John",
    jude: "Jude",
    rev: "Rev",
    revelation: "Rev"
  })
);

function normalizeCanonicalBookAlias(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function referenceBookPart(reference) {
  const match = String(reference ?? "").match(
    /^(.+?)[.:](\d+)[.:](\d+)$/
  );

  return match ? match[1] : null;
}

function canonicalWebBookAlias(record, filename) {
  const candidates = [
    record?.book,
    referenceBookPart(record?.reference),
    normalizeFileBase(filename)
  ];

  for (const candidate of candidates) {
    const alias = canonicalWebBookAliases.get(
      normalizeCanonicalBookAlias(candidate)
    );

    if (alias) return alias;
  }

  return null;
}

module.exports = {
  normalizeWord,
  normalizedToken,
  routeIds,
  entityIds,
  isAligned,
  arraysEqual,
  findRecord,
  localSourceIds,
  occurrenceOrdinal,
  readPlan,
  detectCanonicalBook,
  ownsCanonicalFile,
  canonicalWebBookAlias
};
