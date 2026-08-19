const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(message) { throw new Error(`[P08.12R2 runtime lock] ${message}`); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function verifyFileContract(root, files, label) {
  const expected = Object.keys(files).sort();
  const actual = [];
  for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
    const dir = path.join(root, corpus);
    if (!fs.existsSync(dir)) fail(`${label}: missing corpus directory ${corpus}`);
    for (const file of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      actual.push(`${corpus}/${file}`);
    }
  }
  actual.push("manifest.json");
  actual.sort();

  if (!same(actual, expected)) {
    fail(`${label}: runtime inventory differs from the locked inventory.`);
  }

  for (const relative of expected) {
    const file = path.join(root, ...relative.split("/"));
    const expectedState = files[relative];
    if (!fs.existsSync(file)) fail(`${label}: missing ${relative}`);
    const stat = fs.statSync(file);
    if (stat.size !== expectedState.bytes) {
      fail(`${label}: byte count mismatch for ${relative}. Expected ${expectedState.bytes}, found ${stat.size}`);
    }
    const digest = sha(file);
    if (digest !== expectedState.sha256) {
      fail(`${label}: SHA mismatch for ${relative}. Expected ${expectedState.sha256}, found ${digest}`);
    }
  }
}

function reconstructBook(generated, bookLock) {
  const out = {};
  for (const key of bookLock.keys) {
    if (key === "verses") {
      const gVerses =
        generated.verses && typeof generated.verses === "object" ? generated.verses : {};
      const deleted = new Set(bookLock.deletedVerses || []);
      const added = bookLock.addedVerses || {};
      const overrides = bookLock.verseOverrides || {};
      const exceptions = bookLock.verseKeyExceptions || {};
      const verseOrder = Array.isArray(bookLock.verseOrder)
        ? bookLock.verseOrder
        : Object.keys(gVerses);

      const verses = {};
      for (const verseKey of verseOrder) {
        if (deleted.has(verseKey)) continue;

        if (Object.prototype.hasOwnProperty.call(added, verseKey)) {
          verses[verseKey] = added[verseKey];
          continue;
        }

        const gVerse = gVerses[verseKey];
        if (!gVerse || typeof gVerse !== "object") {
          fail(`Generated verse missing while applying lock: ${verseKey}`);
        }

        const keyOrder = exceptions[verseKey] || bookLock.defaultVerseKeys || [];
        const fieldOverrides = overrides[verseKey] || {};
        const verse = {};

        for (const field of keyOrder) {
          if (Object.prototype.hasOwnProperty.call(fieldOverrides, field)) {
            verse[field] = fieldOverrides[field];
          } else if (Object.prototype.hasOwnProperty.call(gVerse, field)) {
            verse[field] = gVerse[field];
          } else {
            fail(`Field ${field} missing from generated verse ${verseKey} and no lock override exists.`);
          }
        }
        verses[verseKey] = verse;
      }

      for (const [verseKey, value] of Object.entries(added)) {
        if (!Object.prototype.hasOwnProperty.call(verses, verseKey)) {
          verses[verseKey] = value;
        }
      }

      out.verses = verses;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(bookLock.topOverrides || {}, key)) {
      out[key] = bookLock.topOverrides[key];
    } else if (Object.prototype.hasOwnProperty.call(generated, key)) {
      out[key] = generated[key];
    } else {
      fail(`Top-level field ${key} missing and no lock override exists.`);
    }
  }
  return out;
}

function applyP0812R2RuntimeLock(repositoryRoot = process.cwd()) {
  const runtimeRoot = path.join(repositoryRoot, "public", "data", "bibleiq", "word-study");
  const lockFile = path.join(
    repositoryRoot,
    "app",
    "data",
    "bibleiq",
    "runtime-locks",
    "p0812r2-word-study-runtime-lock.json",
  );

  if (!fs.existsSync(lockFile)) fail(`Lock file is missing: ${lockFile}`);
  const lock = readJson(lockFile);
  if (lock.schemaVersion !== "emet-p0812r2-word-study-runtime-compatibility-lock/v1") {
    fail(`Unsupported lock schema: ${lock.schemaVersion}`);
  }

  const currentManifest = readJson(path.join(runtimeRoot, "manifest.json"));
  if (currentManifest.checksum !== lock.baseline.manifestChecksum) {
    fail(
      `Baseline compiler output changed. Expected manifest checksum ${lock.baseline.manifestChecksum}, ` +
        `found ${currentManifest.checksum}. Refusing to hide upstream runtime changes behind the P08.12R2 lock.`,
    );
  }

  verifyFileContract(runtimeRoot, lock.baseline.files, "baseline");

  for (const [relative, bookLock] of Object.entries(lock.books)) {
    const file = path.join(runtimeRoot, ...relative.split("/"));
    const generated = readJson(file);
    const reconstructed = reconstructBook(generated, bookLock);
    fs.writeFileSync(file, `${JSON.stringify(reconstructed)}\n`, "utf8");
  }

  fs.writeFileSync(
    path.join(runtimeRoot, "manifest.json"),
    `${JSON.stringify(lock.reference.manifest)}\n`,
    "utf8",
  );

  verifyFileContract(runtimeRoot, lock.reference.files, "locked-reference");

  const finalManifest = readJson(path.join(runtimeRoot, "manifest.json"));
  if (finalManifest.checksum !== lock.reference.manifest.checksum) {
    fail("Final manifest checksum does not match the locked R13 reference.");
  }

  console.log(
    `[P08.12R2 runtime lock] PASS: baseline ${lock.baseline.manifestChecksum} -> ` +
      `R13 ${lock.reference.manifest.checksum}; books=${Object.keys(lock.books).length}`,
  );
}

if (require.main === module) {
  applyP0812R2RuntimeLock(process.cwd());
}

module.exports = { applyP0812R2RuntimeLock };
