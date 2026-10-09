import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(
  root,
  "public",
  "scripture",
  "source-phrase-index.json",
);
const verifyOnly = process.argv.includes("--verify");

const corpora = [
  { id: "hebrew", directory: "hebrew", lexicon: "generatedHebrewLexiconV12.json" },
  { id: "lxx", directory: "lxx", lexicon: "generatedLXXGreekLexiconV12.json" },
  { id: "greek-nt", directory: "greek-nt", lexicon: "generatedNTGreekLexiconV12.json" },
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizedLemma(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function lexicalId(token, corpus) {
  if (corpus === "lxx") {
    return String(token.lxxId || token.entityId || "").replace(/^word:lxx:/, "");
  }
  return String(token.strong || token.entityId || "").replace(
    new RegExp(`^word:${corpus}:`),
    "",
  );
}

function normalizedMorphology(value) {
  const segment = String(value || "").split("/").at(-1) || "";
  return segment.replace(/^H(?=[A-Z])/, "").trim();
}

function authoritativeTokens(verse, corpus) {
  const sourceTokens = Array.isArray(verse?.sourceTokens)
    ? verse.sourceTokens
    : [];
  const selected = corpus === "hebrew"
    ? sourceTokens.filter(
        (token) =>
          String(token?.id || "").startsWith("wlc:") &&
          token?.v2Bridge?.kind === "exact-lexical-occurrence",
      )
    : sourceTokens.filter((token) => token?.source === corpus);

  return selected
    .map((token) => ({
      order: Number(
        corpus === "hebrew"
          ? token?.v2Bridge?.sourceSlotOrder
          : token.index,
      ),
      lexicalId: lexicalId(token, corpus),
      lemma: normalizedLemma(token.normalizedLemma || token.lemma),
      morphology: normalizedMorphology(token.morph || token.morphology),
    }))
    .filter(
      (token) =>
        Number.isFinite(token.order) &&
        (token.lexicalId || token.lemma),
    )
    .sort((left, right) => left.order - right.order);
}

function buildIndex() {
  const sourceFiles = [];
  const outputCorpora = {};
  const lexicalDetails = {};

  for (const corpus of corpora) {
    const directory = path.join(
      root,
      "app",
      "data",
      "bibleiq",
      "canonical",
      corpus.directory,
    );
    const files = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort();
    const entries = [];

    for (const file of files) {
      const filePath = path.join(directory, file);
      const source = fs.readFileSync(filePath);
      sourceFiles.push({
        path: path.relative(root, filePath).replaceAll("\\", "/"),
        // Git checks these JSON sources out with CRLF on Windows and LF on
        // Linux. Hash their normalized text so the sealed derived artifact is
        // identical on local Windows builds and Vercel's Linux builders.
        sha256: sha256(source.toString("utf8").replace(/\r\n?/g, "\n")),
      });
      const book = JSON.parse(source.toString("utf8"));

      for (const verse of Object.values(book)) {
        const tokens = authoritativeTokens(verse, corpus.id);
        if (!tokens.length) continue;
        const readerReference =
          verse?.translations?.web?.v2LockedWebAuthority?.readerWebReference ||
          `${verse.book} ${verse.chapter}:${verse.verse}`;
        entries.push([
          readerReference,
          tokens.map((token) => token.lexicalId),
          tokens.map((token) => token.lemma),
          tokens.map((token) => token.morphology),
        ]);
      }
    }

    outputCorpora[corpus.id] = entries;

    const lexiconPath = path.join(root, "app", "data", "lexicon", corpus.lexicon);
    const lexiconSource = fs.readFileSync(lexiconPath);
    sourceFiles.push({
      path: path.relative(root, lexiconPath).replaceAll("\\", "/"),
      sha256: sha256(lexiconSource.toString("utf8").replace(/\r\n?/g, "\n")),
    });
    const records = JSON.parse(lexiconSource.toString("utf8"));
    lexicalDetails[corpus.id] = records.flatMap((record) => {
      const id = corpus.id === "lxx"
        ? String(record.lxxId || record.id || "").replace(/^lxx-greek:/, "")
        : String(record.strong || record.id || "").split(":").at(-1);
      const meaning = String(record.shortDefinition || record.gloss || "").trim();
      if (!id || !record.lemma || !record.transliteration || !meaning) return [];
      return [[id, record.lemma, record.transliteration, meaning]];
    });
  }

  const sourceFingerprint = sha256(
    JSON.stringify(sourceFiles.map((file) => [file.path, file.sha256])),
  );
  const body = {
    schemaVersion: "emet-source-phrase-index@2",
    sourceFingerprint,
    sourceFiles,
    corpora: outputCorpora,
    lexicalDetails,
  };
  const bodyChecksum = sha256(JSON.stringify(body));
  return { ...body, bodyChecksum };
}

const built = buildIndex();

if (verifyOnly) {
  if (!fs.existsSync(outputPath)) {
    throw new Error("The EMET source phrase index is missing.");
  }
  const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  if (
    existing.schemaVersion !== built.schemaVersion ||
    existing.sourceFingerprint !== built.sourceFingerprint ||
    existing.bodyChecksum !== built.bodyChecksum
  ) {
    throw new Error("The EMET source phrase index is stale.");
  }
  console.log("EMET source phrase index verification passed.");
  console.log(`- Source fingerprint: ${built.sourceFingerprint}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(built));
console.log(`Wrote ${path.relative(root, outputPath)}.`);
for (const corpus of corpora) {
  console.log(`- ${corpus.id}: ${built.corpora[corpus.id].length} verses`);
}
console.log(`- Source fingerprint: ${built.sourceFingerprint}`);
