#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function fail(message) {
  throw new Error(`[Hebrew Strong English evidence compiler] ${message}`);
}
function existsFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function readJson(file) {
  if (!existsFile(file)) fail(`Missing required file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function normalizedStrong(value) {
  const match = /^H0*(\d+)([A-Za-z]?)$/u.exec(String(value || "").trim());
  return match
    ? `H${Number(match[1])}${match[2] || ""}`
    : String(value || "").trim();
}
function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9']+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}
function englishTerms(value) {
  return normalizeEnglish(value).match(/[a-z]+(?:'[a-z]+)?/gu) || [];
}
function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:times|#215);/giu, "×")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}
function splitTopLevelUsage(value) {
  const text = stripTags(value);
  const out = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    else if ((ch === "," || ch === ";") && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((item) => item.trim()).filter(Boolean);
}
function classifyUsageSegment(segment) {
  const raw = String(segment || "").trim();
  const marked = /^\s*[×x]\s+/iu.test(raw);
  const withoutMarker = raw.replace(/^\s*[×x]\s+/iu, "").trim();
  const withoutTerminal = withoutMarker.replace(/[.?!:]+$/gu, "").trim();

  // Tier-A direct evidence is intentionally narrow. It must be one plain
  // English lexical item, not a phrase, parenthetical expansion, slash list,
  // hyphen template, or Strong's marked/idiomatic usage.
  const directLexeme = /^[A-Za-z]+(?:'[A-Za-z]+)?$/u.test(withoutTerminal)
    ? normalizeEnglish(withoutTerminal)
    : "";

  const markedLexeme = marked && /^[A-Za-z]+(?:'[A-Za-z]+)?$/u.test(withoutTerminal)
    ? normalizeEnglish(withoutTerminal)
    : "";

  return { raw, marked, directLexeme: marked ? "" : directLexeme, markedLexeme };
}
function collectFields(value, keyPath = [], out = []) {
  if (typeof value === "string") {
    const key = String(keyPath[keyPath.length - 1] || "");
    if (/(?:strongs?_?def|kjv_?def|definition|meaning|usage|gloss|short.?definition)/iu.test(key)) {
      const clean = value.replace(/\s+/gu, " ").trim();
      if (clean) out.push({ key, value: clean });
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectFields(value[i], [...keyPath, String(i)], out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectFields(child, [...keyPath, key], out);
    }
  }
  return out;
}

function main() {
  const sourceFile = path.resolve(arg("--source", ""));
  const outputFile = path.resolve(arg("--output", ""));
  const reportFileArg = arg("--report", null);
  const reportFile = reportFileArg ? path.resolve(reportFileArg) : null;

  if (!sourceFile || !outputFile) {
    fail("Usage: --source <StrongHebrewDictionary.json> --output <evidence.json> [--report <summary.json>]");
  }

  const source = readJson(sourceFile);
  const dictionary = source?.dict && typeof source.dict === "object" ? source.dict : source;
  if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
    fail(`Unexpected Strong Hebrew dictionary shape: ${sourceFile}`);
  }

  const entries = {};
  const fixtureEvidence = {};

  for (const [rawStrong, record] of Object.entries(dictionary)) {
    const strong = normalizedStrong(rawStrong);
    if (!/^H\d+[A-Za-z]?$/u.test(strong)) continue;

    const fields = collectFields(record);
    const semanticStrings = [...new Set(fields.map((row) => row.value))].sort((a, b) => a.localeCompare(b));
    const broadTerms = [...new Set(semanticStrings.flatMap(englishTerms))].sort((a, b) => a.localeCompare(b));

    const usageStrings = fields
      .filter((row) => /usage|kjv_?def/iu.test(row.key))
      .map((row) => row.value);

    const direct = new Set();
    const marked = new Set();
    const segments = [];

    for (const usage of usageStrings) {
      for (const segment of splitTopLevelUsage(usage)) {
        const classified = classifyUsageSegment(segment);
        segments.push(classified);
        if (classified.directLexeme) direct.add(classified.directLexeme);
        if (classified.markedLexeme) marked.add(classified.markedLexeme);
      }
    }

    if (!broadTerms.length && !direct.size && !marked.size) continue;

    entries[strong] = {
      direct: [...direct].sort((a, b) => a.localeCompare(b)),
      marked: [...marked].sort((a, b) => a.localeCompare(b)),
      broad: broadTerms,
    };

    if (strong === "H559" || strong === "H8669") {
      fixtureEvidence[strong] = {
        semanticStrings,
        usageStrings,
        usageSegments: segments,
        direct: entries[strong].direct,
        marked: entries[strong].marked,
        broad: entries[strong].broad,
      };
    }
  }

  const core = {
    schema: "emetsees-hebrew-strong-english-evidence@2.0.0",
    evidencePolicy: {
      direct: "single unmarked top-level KJV usage alternative only",
      marked: "single top-level usage alternative explicitly prefixed by multiplication-sign/x marker",
      broad: "diagnostic token vocabulary only; never sufficient for automatic collision repair",
    },
    sourceSha256: sha256File(sourceFile),
    sourceBytes: fs.statSync(sourceFile).size,
    recordCount: Object.keys(dictionary).length,
    semanticEntryCount: Object.keys(entries).length,
    entries: Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })),
    ),
  };

  const checksum = sha256Buffer(Buffer.from(JSON.stringify(core), "utf8"));
  const output = { ...core, checksum };
  writeJson(outputFile, output);

  const h559 = output.entries?.H559 || {};
  const h8669 = output.entries?.H8669 || {};
  if (!Array.isArray(h8669.direct) || !h8669.direct.includes("desire")) {
    fail("Compiled evidence does not classify H8669 -> desire as direct unmarked usage.");
  }
  if (Array.isArray(h559.direct) && h559.direct.includes("desire")) {
    fail("Compiled evidence incorrectly classifies H559 -> desire as direct unmarked usage.");
  }
  if (!Array.isArray(h559.marked) || !h559.marked.includes("desire")) {
    fail("Compiled evidence does not preserve H559 -> × desire as marked usage.");
  }

  if (reportFile) {
    writeJson(reportFile, {
      schema: output.schema,
      sourceFile,
      sourceSha256: output.sourceSha256,
      sourceBytes: output.sourceBytes,
      recordCount: output.recordCount,
      semanticEntryCount: output.semanticEntryCount,
      checksum,
      fixtureEvidence,
    });
  }

  console.log(`Wrote: ${outputFile}`);
  console.log(`Evidence checksum: ${checksum}`);
  console.log("H8669 direct desire: yes");
  console.log("H559 direct desire: no");
  console.log("H559 marked desire: yes");
}

try { main(); }
catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
