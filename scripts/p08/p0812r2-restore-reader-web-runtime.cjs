#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const os = require("os");

const EXPECTED = Object.freeze({
  files: 1189,
  bytes: 14701615,
  fingerprint: "a65443c1420c68622fece961f17555f0844554533ed40b4697d9af34ecb96d7a",
});
const SCHEMA = "emetsees-p0812r2-reader-web-runtime-lock/v1";
const AUTHORITY = "APPROVED_R13_READER_WEB";

function fail(message) {
  throw new Error(`[P08.12R2 Reader WEB lock] ${message}`);
}
function shaBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function shaText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
function safeRelativePath(value) {
  const rel = String(value || "").replace(/\\/g, "/");
  if (!rel ||
      path.posix.isAbsolute(rel) ||
      rel.split("/").includes("..") ||
      path.posix.normalize(rel) !== rel ||
      !rel.endsWith(".json")) {
    fail(`Unsafe payload path: ${rel}`);
  }
  return rel;
}
function payloadRows(payload, expected) {
  if (payload?.schemaVersion !== SCHEMA) fail("Payload schema mismatch.");
  if (payload?.sourceAuthority !== AUTHORITY) fail("Payload source authority mismatch.");
  if (String(payload?.r13Fingerprint || "").toLowerCase() !== expected.fingerprint) {
    fail("Payload R13 fingerprint declaration mismatch.");
  }
  if (payload?.fileCount !== expected.files ||
      payload?.totalBytes !== expected.bytes ||
      !Array.isArray(payload?.files) ||
      payload.files.length !== expected.files) {
    fail("Payload count/byte contract mismatch.");
  }

  const seen = new Set();
  const rows = [];
  let totalBytes = 0;
  for (const file of payload.files) {
    const rel = safeRelativePath(file?.path);
    if (seen.has(rel)) fail(`Duplicate payload path: ${rel}`);
    seen.add(rel);
    const data = Buffer.from(String(file?.dataBase64 || ""), "base64");
    const digest = shaBuffer(data);
    if (data.length !== file?.bytes || digest !== String(file?.sha256 || "").toLowerCase()) {
      fail(`Payload file checksum mismatch: ${rel}`);
    }
    rows.push({ path: rel, bytes: data.length, sha256: digest, data });
    totalBytes += data.length;
  }

  const fingerprintRows = rows
    .map(({ path: rel, bytes, sha256 }) => ({ path: rel, bytes, sha256 }));
  const fingerprint = shaText(fingerprintRows.map(
    (row) => `${row.path}\t${row.bytes}\t${row.sha256}\n`,
  ).join(""));
  if (totalBytes !== expected.bytes || fingerprint !== expected.fingerprint) {
    fail(`Payload aggregate mismatch: bytes=${totalBytes} fingerprint=${fingerprint}`);
  }
  return rows;
}
function stableDirState(root) {
  const rows = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const data = fs.readFileSync(full);
        rows.push({ path: rel, bytes: data.length, sha256: shaBuffer(data) });
      } else {
        fail(`Unsupported restored filesystem entry: ${rel}`);
      }
    }
  }
  walk(root);
  return {
    files: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    fingerprint: shaText(rows.map(
      (row) => `${row.path}\t${row.bytes}\t${row.sha256}\n`,
    ).join("")),
  };
}
function restore(payloadFile, outputRoot, expected = EXPECTED) {
  if (!fs.existsSync(payloadFile) || !fs.statSync(payloadFile).isFile()) {
    fail(`Tracked Reader WEB payload is missing: ${payloadFile}`);
  }
  let payload;
  try {
    payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(payloadFile)).toString("utf8"));
  } catch (error) {
    fail(`Unable to decode tracked Reader WEB payload: ${error.message}`);
  }
  const rows = payloadRows(payload, expected);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const row of rows) {
    const target = path.join(outputRoot, ...row.path.split("/"));
    const resolvedRoot = path.resolve(outputRoot);
    const resolvedTarget = path.resolve(target);
    if (resolvedTarget !== resolvedRoot &&
        !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      fail(`Resolved output escaped Reader root: ${row.path}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.data);
  }

  const state = stableDirState(outputRoot);
  if (state.files !== expected.files ||
      state.bytes !== expected.bytes ||
      state.fingerprint !== expected.fingerprint) {
    fail(
      `Restored tree mismatch: files=${state.files}/${expected.files} ` +
      `bytes=${state.bytes}/${expected.bytes} ` +
      `fingerprint=${state.fingerprint}/${expected.fingerprint}`,
    );
  }
  return state;
}
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0812r2-reader-restore-"));
  try {
    const files = [
      { path: "Genesis/1.json", data: Buffer.from("{\"v\":1}\n") },
      { path: "Genesis/2.json", data: Buffer.from("{\"v\":2}\n") },
    ];
    const digestRows = files.map((item) => ({
      path: item.path,
      bytes: item.data.length,
      sha256: shaBuffer(item.data),
    })).sort((a, b) => a.path.localeCompare(b.path));
    const expected = {
      files: digestRows.length,
      bytes: digestRows.reduce((sum, row) => sum + row.bytes, 0),
      fingerprint: shaText(digestRows.map(
        (row) => `${row.path}\t${row.bytes}\t${row.sha256}\n`,
      ).join("")),
    };
    const payload = {
      schemaVersion: SCHEMA,
      sourceAuthority: AUTHORITY,
      r13Fingerprint: expected.fingerprint,
      fileCount: expected.files,
      totalBytes: expected.bytes,
      files: files.map((item) => ({
        path: item.path,
        bytes: item.data.length,
        sha256: shaBuffer(item.data),
        dataBase64: item.data.toString("base64"),
      })),
    };
    const payloadFile = path.join(tmp, "payload.json.gz");
    fs.writeFileSync(payloadFile, zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
    const state = restore(payloadFile, path.join(tmp, "out"), expected);
    if (state.fingerprint !== expected.fingerprint) fail("Self-test restored fingerprint mismatch.");
    console.log("P08.12R2 Reader WEB restore self-test PASS");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    const root = process.cwd();
    const payloadFile = path.join(
      root, "scripts", "p08", "p0812r2-reader-web-runtime-r13.json.gz",
    );
    const outputRoot = path.join(root, "public", "scripture", "runtime", "web");
    const state = restore(payloadFile, outputRoot, EXPECTED);
    console.log(
      `[P08.12R2 Reader WEB lock] PASS: ${state.files} files / ` +
      `${state.bytes} bytes / R13 ${state.fingerprint}`,
    );
  }
}
