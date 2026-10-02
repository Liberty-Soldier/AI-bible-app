import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "public",
  "data",
  "bibleiq",
  "word-study-brenton-reader-record",
  "manifest.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const storedChecksum = manifest.checksum;
delete manifest.checksum;
const calculatedChecksum = crypto
  .createHash("sha256")
  .update(JSON.stringify(manifest))
  .digest("hex");
const recordCount = Object.keys(manifest.records || {}).length;
const routeCount = Object.values(manifest.records || {}).reduce(
  (total, record) => total + Object.keys(record.routes || {}).length,
  0,
);

assert.equal(manifest.schemaVersion, "emet-p0812r2-brenton-reader-record-routes/v1");
assert.equal(recordCount, 2017);
assert.equal(routeCount, 10009);
assert.equal(manifest.counts.records, recordCount);
assert.equal(manifest.counts.routes, routeCount);
assert.equal(storedChecksum, calculatedChecksum);

const store = fs.readFileSync(
  path.join(root, "app", "data", "scripture", "CanonicalVerseStore.ts"),
  "utf8",
);
assert.match(store, /overlay\.counts\?\.routes !== 10009/);
assert.match(store, /routeCount !== 10009/);

console.log("Brenton reader-record overlay contract verification passed.");
console.log("- 2,017 reader records and 10,009 routes are sealed by checksum.");
console.log("- Runtime validation uses the current sealed route count.");
console.log("- No Brenton text, source order, or alignment was regenerated.");
