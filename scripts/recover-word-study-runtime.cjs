// Reproduce the approved compact runtime from recovered, hash-locked inputs.
// Uses existing exporters unchanged. Never writes canonical data or installs
// the historical consumer/overlay into the application. No external downloads.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const inputs = 'app/data/bibleiq/runtime-locks/word-study-build-inputs';
const runtime = 'public/data/bibleiq/word-study';
const overlayPath = 'public/data/bibleiq/word-study-brenton-reader-record/manifest.json';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const contract = parse(fs.readFileSync(path.join(root, inputs, 'provenance.json')));
const expectedManifest = '40cdb6a8c540d778da0db4369630fa95b6d094ec504d7aee6908356bddb105ec';
const expectedOverlay = 'b25d7f3af3093b26dc0889e11de51f061cfb3a1ed80f59a26ac35affb81037ea';
const expectedConsumer = '2bc980850c58457c513f0c0a0faf6a10b9adf00d4fa7d66e300b0ce014d8517a';
function fail(message) { throw new Error(`Word Study recovery: ${message}`); }
if (contract.schemaVersion !== 'emet-word-study-recovered-build-inputs/v1' || contract.result.manifestSha256 !== expectedManifest) fail('recovered provenance contract mismatch');
function verify(directory) {
  const bytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  if (sha(bytes) !== expectedManifest) fail('final manifest differs from verified sealed replay');
  const manifest = parse(bytes);
  if (manifest.version !== 3 || manifest.totals.books !== 115) fail('manifest schema/inventory mismatch');
  let books = 0;
  for (const corpus of ['hebrew', 'greek-nt', 'lxx']) {
    const entries = manifest.corpora[corpus].books;
    const names = fs.readdirSync(path.join(directory, corpus)).filter(f => f.endsWith('.json')).sort();
    if (JSON.stringify(names) !== JSON.stringify(Object.keys(entries).sort())) fail(`${corpus} inventory differs`);
    for (const [file, record] of Object.entries(entries)) {
      const book = fs.readFileSync(path.join(directory, corpus, file));
      if (book.length !== record.bytes || sha(book) !== record.checksum) fail(`${corpus}/${file} failed its file seal`);
      books++;
    }
  }
  if (books !== 115) fail('expected 115 compact books');
  return { manifestSha256: sha(bytes), manifestChecksum: manifest.checksum, ...manifest.totals };
}
if (process.argv.includes('--verify-only')) {
  console.log(JSON.stringify(verify(path.join(root, runtime)), null, 2));
  process.exit(0);
}
const privateRoot = path.join(root, '.private');
fs.mkdirSync(privateRoot, { recursive: true });
const stage = fs.mkdtempSync(path.join(privateRoot, 'word-study-runtime-build-'));
function copy(relative) {
  const destination = path.join(stage, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, relative), destination, { recursive: true });
}
function sealedInput(relative, expected) {
  const bytes = fs.readFileSync(path.join(root, relative));
  let sealed = bytes;
  if (sha(sealed) !== expected) {
    // Windows-created seals are reconstructed in the disposable snapshot only.
    sealed = Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
    if (sha(sealed) !== expected) fail(`sealed input mismatch, beyond line endings: ${relative}`);
  }
  const target = path.join(stage, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, sealed);
}
const sourcePaths = [];
for (const corpus of ['hebrew', 'greek-nt', 'lxx']) {
  const dir = path.join(root, 'app/data/bibleiq/canonical', corpus);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) fail(`missing canonical ${corpus}`);
  for (const file of files) sourcePaths.push(path.join(dir, file));
}
const originalSources = new Map(sourcePaths.map(file => [file, sha(fs.readFileSync(file))]));
const originalOverlay = fs.readFileSync(path.join(root, overlayPath));
try {
  for (const relative of ['app/data/bibleiq/canonical', 'app/data/bibleiq/runtime-locks',
    'app/data/scripture/generatedBrenton.json', 'app/data/scripture/generatedBrenton.integrity.json',
    'app/data/scripture/CanonicalVerseStore.ts', 'public/data/bibleiq/word-study-brenton-reader-record', 'scripts']) copy(relative);
  const recoveredOverlay = fs.readFileSync(path.join(root, inputs, 'brenton-pre-batch2-overlay.json'));
  const consumer = fs.readFileSync(path.join(root, inputs, 'CanonicalVerseStore.snapshot'));
  if (sha(recoveredOverlay) !== expectedOverlay || sha(consumer) !== expectedConsumer) fail('recovered input seal mismatch');
  fs.writeFileSync(path.join(stage, overlayPath), recoveredOverlay);
  fs.writeFileSync(path.join(stage, 'app/data/scripture/CanonicalVerseStore.ts'), consumer);
  const b1 = parse(fs.readFileSync(path.join(root, 'app/data/bibleiq/runtime-locks/p0812r2-brenton-compact-batch1/manifest.json')));
  const b2 = parse(fs.readFileSync(path.join(root, 'app/data/bibleiq/runtime-locks/p0812r2-brenton-nonparity-coordinate-batch2/manifest.json'))).lockedInputs;
  if (b2.overlaySha256 !== expectedOverlay) fail('existing Batch 2 no longer agrees with recovered overlay');
  for (const [file, hash] of Object.entries(b1.inputHashes)) sealedInput(file, hash);
  sealedInput('app/data/bibleiq/runtime-locks/p0812r2-brenton-compact-batch1/manifest.json', b2.batch1ManifestSha256);
  sealedInput('scripts/apply-p0812r2-brenton-compact-batch1.cjs', b2.batch1ApplySha256);
  for (const [file, hash] of Object.entries(b2.canonicalAffectedBookSha256)) sealedInput(`app/data/bibleiq/canonical/lxx/${file}`, hash);
  const approvedProcess = ["scripts/build-word-study-runtime.js", "scripts/p08/final-reader-alignment-completion/reconcile-brenton-reader-runtime.cjs"];
  if (JSON.stringify(contract.process) !== JSON.stringify(approvedProcess)) fail("approved exporter sequence changed");
  for (const script of approvedProcess) execFileSync(process.execPath, ['--max-old-space-size=4096', path.join(stage, script)], {
    cwd: stage, env: { ...process.env, EMETSEES_REPO_ROOT: stage, EMETSEES_P0812_REPORT_DIR: path.join(stage, ".private/reports/P08.12/manual") }, stdio: 'inherit',
  });
  const result = verify(path.join(stage, runtime));
  if (!fs.readFileSync(path.join(stage, overlayPath)).equals(originalOverlay)) fail('final overlay differs from current approved overlay');
  for (const [file, hash] of originalSources) if (sha(fs.readFileSync(file)) !== hash) fail(`canonical input was changed: ${file}`);
  // Preserve the existing entity/explanation and LXX fallback subdirectories.
  fs.cpSync(path.join(stage, runtime), path.join(root, runtime), { recursive: true });
  console.log('PASS: recovered compact runtime; original source/overlay/application consumer preserved.');
  console.log(JSON.stringify(result));
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
