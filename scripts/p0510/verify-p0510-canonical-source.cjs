const fs = require("fs");
const path = require("path");

const {
  normalizedToken,
  routeIds,
  arraysEqual,
  findRecord,
  readPlan,
  ownsCanonicalFile,
  canonicalWebBookAlias
} = require("./p0510-canonical-utils.cjs");

const {
  tokenizeDisplayText
} = require("../canonical/utils/tokenize");

function buildCleanWebMap(root) {
  const generated = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "app",
        "data",
        "scripture",
        "generatedWEB.json"
      ),
      "utf8"
    )
  );

  const aliases = new Map(
    Object.entries({
      genesis: "Gen",
      exodus: "Exod",
      leviticus: "Lev",
      numbers: "Num",
      deuteronomy: "Deut",
      joshua: "Josh",
      judges: "Judg",
      ruth: "Ruth",
      "1 samuel": "1Sam",
      "2 samuel": "2Sam",
      "1 kings": "1Kgs",
      "2 kings": "2Kgs",
      "1 chronicles": "1Chr",
      "2 chronicles": "2Chr",
      ezra: "Ezra",
      nehemiah: "Neh",
      esther: "Esth",
      job: "Job",
      psalm: "Ps",
      psalms: "Ps",
      proverbs: "Prov",
      ecclesiastes: "Eccl",
      "song of solomon": "Song",
      "song of songs": "Song",
      isaiah: "Isa",
      jeremiah: "Jer",
      lamentations: "Lam",
      ezekiel: "Ezek",
      daniel: "Dan",
      hosea: "Hos",
      joel: "Joel",
      amos: "Amos",
      obadiah: "Obad",
      jonah: "Jonah",
      micah: "Mic",
      nahum: "Nah",
      habakkuk: "Hab",
      zephaniah: "Zeph",
      haggai: "Hag",
      zechariah: "Zech",
      malachi: "Mal",
      matthew: "Matt",
      mark: "Mark",
      luke: "Luke",
      john: "John",
      acts: "Acts",
      romans: "Rom",
      "1 corinthians": "1Cor",
      "2 corinthians": "2Cor",
      galatians: "Gal",
      ephesians: "Eph",
      philippians: "Phil",
      colossians: "Col",
      "1 thessalonians": "1Thess",
      "2 thessalonians": "2Thess",
      "1 timothy": "1Tim",
      "2 timothy": "2Tim",
      titus: "Titus",
      philemon: "Phlm",
      hebrews: "Heb",
      james: "Jas",
      "1 peter": "1Pet",
      "2 peter": "2Pet",
      "1 john": "1John",
      "2 john": "2John",
      "3 john": "3John",
      jude: "Jude",
      revelation: "Rev"
    })
  );

  const map = new Map();

  for (const record of generated) {
    const book = String(record.book ?? "")
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const alias = aliases.get(book);

    if (!alias) {
      throw new Error(`Unsupported WEB book: ${record.book}`);
    }

    const text =
      record?.sources?.find(source =>
        /world english bible/i.test(
          String(source?.sourceName ?? "")
        )
      )?.text ??
      record?.sources?.[0]?.text ??
      "";

    map.set(
      `${alias}:${Number(record.chapter)}:${Number(record.verse)}`,
      text
    );
  }

  return map;
}

function verifyP0510CanonicalRoot({
  root = process.cwd(),
  canonicalRoot,
  label = "canonical root"
}) {
  const plan = readPlan(root);
  const cleanWeb = buildCleanWebMap(root);

  const cache = new Map();

  function load(corpus, filename) {
    const key = `${corpus}|${filename}`;

    if (!cache.has(key)) {
      const file = path.join(canonicalRoot, corpus, filename);

      if (!fs.existsSync(file)) {
        throw new Error(
          `${label} file missing: ${path.relative(root, file)}`
        );
      }

      cache.set(key, {
        file,
        data: JSON.parse(fs.readFileSync(file, "utf8"))
      });
    }

    return cache.get(key);
  }

  const result = {
    label,
    canonicalRoot,
    ownedFiles: 0,
    skippedNonOwnedFiles: 0,
    webBlocksCompared: 0,
    missingCleanWebSources: 0,
    webTextMismatches: [],
    webTokenMismatches: [],
    contaminatedWebBlocks: [],
    approvedBlocksExact: 0,
    approvedBlockMismatches: [],
    approvedRoutesExact: 0,
    approvedRouteMismatches: []
  };

  const forbidden = [
    /The word translated/i,
    /\bNU reads\b/i,
    /\bTR reads\b/i,
    /\bSome manuscripts\b/i,
    /\bSee footnote\b/i,
    /<[^>]+>/
  ];

  for (const corpus of ["hebrew", "greek-nt"]) {
    const directory = path.join(canonicalRoot, corpus);

    for (const filename of fs
      .readdirSync(directory)
      .filter(file => file.endsWith(".json"))
      .sort()) {
      const state = load(corpus, filename);

      if (!ownsCanonicalFile(corpus, state.data, filename)) {
        result.skippedNonOwnedFiles += 1;
        continue;
      }

      result.ownedFiles += 1;

      for (const [objectKey, record] of Object.entries(state.data)) {
        const web = record?.translations?.web;

        if (!web) continue;

        const reference = String(record.reference ?? objectKey);

        const bookAlias = canonicalWebBookAlias(
          record,
          filename
        );

        const key =
          corpus === "greek-nt" &&
          filename === "Rom.json" &&
          plan.romansWebCrosswalk?.[reference]
            ? plan.romansWebCrosswalk[reference]
            : bookAlias
              ? `${bookAlias}:${Number(record.chapter)}:${Number(record.verse)}`
              : null;

        const expectedText = key
          ? cleanWeb.get(key)
          : undefined;

        if (typeof expectedText !== "string") {
          result.missingCleanWebSources += 1;
          continue;
        }

        result.webBlocksCompared += 1;

        if (String(web.text ?? "") !== expectedText) {
          result.webTextMismatches.push({
            corpus,
            filename,
            reference,
            expectedText,
            actualText: web.text ?? null
          });
        }

        const actualTokens = Array.isArray(web.tokens)
          ? web.tokens.map(normalizedToken)
          : [];

        const expectedTokens = tokenizeDisplayText(
          expectedText
        ).map(normalizedToken);

        if (!arraysEqual(actualTokens, expectedTokens)) {
          result.webTokenMismatches.push({
            corpus,
            filename,
            reference,
            actualCount: actualTokens.length,
            expectedCount: expectedTokens.length
          });
        }

        if (
          forbidden.some(pattern =>
            pattern.test(String(web.text ?? ""))
          )
        ) {
          result.contaminatedWebBlocks.push({
            corpus,
            filename,
            reference,
            text: web.text
          });
        }
      }
    }
  }

  for (const candidate of plan.blocks) {
    const state = load(candidate.corpus, candidate.filename);
    const resolved = findRecord(
      state.data,
      candidate.canonicalObjectKey,
      candidate.canonicalReference
    );

    const block =
      resolved.record.translations?.[candidate.translation];

    const actualTokens = Array.isArray(block?.tokens)
      ? block.tokens.map(normalizedToken)
      : [];

    const expectedTokens = tokenizeDisplayText(
      candidate.generatedText
    ).map(normalizedToken);

    if (
      block &&
      String(block.text ?? "") === candidate.generatedText &&
      arraysEqual(actualTokens, expectedTokens)
    ) {
      result.approvedBlocksExact += 1;
    } else {
      result.approvedBlockMismatches.push({
        corpus: candidate.corpus,
        translation: candidate.translation,
        filename: candidate.filename,
        reference: candidate.canonicalReference
      });
    }
  }

  for (const candidate of plan.routes) {
    const state = load(candidate.corpus, candidate.filename);
    const resolved = findRecord(
      state.data,
      candidate.objectKey,
      candidate.reference
    );

    const token =
      resolved.record.translations?.[candidate.translation]?.tokens?.[
        candidate.tokenIndex
      ];

    if (
      token &&
      normalizedToken(token) === candidate.expectedNormalized &&
      arraysEqual(routeIds(token), candidate.sourceTokenIds) &&
      token.alignmentStatus === "aligned" &&
      token.alignmentMethod === "p0510-parallel-kjv"
    ) {
      result.approvedRoutesExact += 1;
    } else {
      result.approvedRouteMismatches.push({
        corpus: candidate.corpus,
        filename: candidate.filename,
        reference: candidate.reference,
        tokenIndex: candidate.tokenIndex
      });
    }
  }

  result.passed =
    result.missingCleanWebSources === 0 &&
    result.webTextMismatches.length === 0 &&
    result.webTokenMismatches.length === 0 &&
    result.contaminatedWebBlocks.length === 0 &&
    result.approvedBlocksExact === plan.blocks.length &&
    result.approvedBlockMismatches.length === 0 &&
    result.approvedRoutesExact === plan.routes.length &&
    result.approvedRouteMismatches.length === 0;

  return result;
}

if (require.main === module) {
  const root = process.cwd();

  const canonicalRoot =
    process.argv.find(value => value.startsWith("--canonical-root="))
      ?.slice("--canonical-root=".length) ||
    path.join(root, ".private", "scripture", "canonical");

  const label =
    process.argv.find(value => value.startsWith("--label="))
      ?.slice("--label=".length) ||
    "canonical root";

  const result = verifyP0510CanonicalRoot({
    root,
    canonicalRoot,
    label
  });

  const reportDirectory = path.join(
    root,
    "reports",
    "p0510-canonical-source-repair"
  );

  fs.mkdirSync(reportDirectory, {
    recursive: true
  });

  const safeLabel = label
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .toLowerCase();

  fs.writeFileSync(
    path.join(reportDirectory, `verify-${safeLabel}.json`),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 2;
  } else {
    console.log(`P05.10 ${label} verification passed.`);
  }
}

module.exports = {
  verifyP0510CanonicalRoot
};
