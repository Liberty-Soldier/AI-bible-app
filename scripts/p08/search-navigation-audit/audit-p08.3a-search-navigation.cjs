'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const repositoryRoot = path.resolve(process.argv[2] || process.cwd());
const reportRoot = path.resolve(
  process.argv[3] ||
    path.join(repositoryRoot, '.private', 'reports', 'P08.3A-AUDIT', 'manual-run'),
);

const protectedFragments = [
  'scripts/p07/full-cache-generation',
  '.private/staging/P07-FULL-CACHE-GENERATION',
  '.private/reports/P07-FULL-CACHE-GENERATION',
  '.private/entity/build/P01',
  '.private/entity/build/P02',
  '.private/entity/build/P03',
  '.private/entity/build/P04',
];

const sourceTargets = [
  'package.json',
  'app/layout.tsx',
  'app/page.tsx',
  'app/read/page.tsx',
  'app/read/[book]/[chapter]/page.tsx',
  'app/ask/page.tsx',
  'app/library/page.tsx',
  'app/components/MobileBottomNav.tsx',
  'app/components/ReaderVerseScroller.tsx',
  'app/components/ReaderSelector.tsx',
  'app/components/ask/AskView.tsx',
  'app/components/AskPanel.tsx',
  'app/data/scripture/bookCatalog.ts',
  'app/data/bookAliases.ts',
  'app/data/referenceAliases.ts',
  'app/data/normalizeReference.ts',
  'app/data/sampleVerses.ts',
  'app/data/scripture/allScripture.ts',
  'app/lib/translationPreference.ts',
];

function normalizeRelative(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function assertSafeRelative(relative) {
  const normalized = normalizeRelative(relative);
  if (normalized.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe relative path: ${relative}`);
  }
  for (const protectedFragment of protectedFragments) {
    if (normalized.toLowerCase().includes(protectedFragment.toLowerCase())) {
      throw new Error(`Protected path requested: ${relative}`);
    }
  }
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeText(relative, content) {
  const destination = path.join(reportRoot, relative);
  ensureDirectory(path.dirname(destination));
  fs.writeFileSync(destination, content, 'utf8');
}

function writeJson(relative, value) {
  writeText(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(relative, rows, columns) {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }
  writeText(relative, `${lines.join('\n')}\n`);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashFile(relative) {
  assertSafeRelative(relative);
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return { path: normalizeRelative(relative), exists: false, bytes: 0, sha256: '' };
  }
  const buffer = fs.readFileSync(absolute);
  return {
    path: normalizeRelative(relative),
    exists: true,
    bytes: buffer.length,
    sha256: sha256Buffer(buffer),
  };
}

function readText(relative, required = true) {
  assertSafeRelative(relative);
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    if (required) throw new Error(`Required source file is missing: ${relative}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function copyContextFile(relative) {
  assertSafeRelative(relative);
  const source = path.join(repositoryRoot, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
  const destination = path.join(reportRoot, 'context', 'current', relative);
  ensureDirectory(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function runReadOnly(command, args) {
  try {
    const result = childProcess.spawnSync(command, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      command: [command, ...args].join(' '),
      exitCode: Number.isInteger(result.status) ? result.status : -1,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  } catch (error) {
    return {
      command: [command, ...args].join(' '),
      exitCode: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function walkFiles(root, predicate = () => true) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const results = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && predicate(full)) {
        results.push(full);
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function getVerseArray(document) {
  if (Array.isArray(document)) return document;
  if (document && Array.isArray(document.verses)) return document.verses;
  if (document && document.chapter && Array.isArray(document.chapter.verses)) {
    return document.chapter.verses;
  }
  return [];
}

function getSuperscriptions(document) {
  if (document && Array.isArray(document.superscriptions)) {
    return document.superscriptions.length;
  }
  return 0;
}

function inventoryRuntime(translation) {
  const relativeRoot = `public/scripture/runtime/${translation}`;
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const files = walkFiles(absoluteRoot, (full) => full.toLowerCase().endsWith('.json'));
  const chapters = [];
  const schemaCounts = new Map();
  let totalBytes = 0;
  let totalVerses = 0;
  let totalSuperscriptions = 0;
  let parseErrors = 0;
  let sampleVerseKeys = [];
  let sampleDocumentKeys = [];

  for (const file of files) {
    const stat = fs.statSync(file);
    totalBytes += stat.size;
    const relative = normalizeRelative(path.relative(repositoryRoot, file));
    let document;
    let verseCount = 0;
    let superscriptionCount = 0;
    let schema = 'unparsed';
    let error = '';

    try {
      document = JSON.parse(fs.readFileSync(file, 'utf8'));
      const verses = getVerseArray(document);
      verseCount = verses.length;
      superscriptionCount = getSuperscriptions(document);
      totalVerses += verseCount;
      totalSuperscriptions += superscriptionCount;
      const documentKeys = document && !Array.isArray(document) && typeof document === 'object'
        ? Object.keys(document).sort()
        : Array.isArray(document)
          ? ['array']
          : [typeof document];
      const verseKeys = verses[0] && typeof verses[0] === 'object'
        ? Object.keys(verses[0]).sort()
        : [];
      schema = `${documentKeys.join('|')}::${verseKeys.join('|')}`;
      schemaCounts.set(schema, (schemaCounts.get(schema) || 0) + 1);
      if (!sampleDocumentKeys.length) sampleDocumentKeys = documentKeys;
      if (!sampleVerseKeys.length && verseKeys.length) sampleVerseKeys = verseKeys;
    } catch (caught) {
      parseErrors += 1;
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const withinTranslation = normalizeRelative(path.relative(absoluteRoot, file));
    const parts = withinTranslation.split('/');
    chapters.push({
      translation,
      path: relative,
      bookDirectory: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
      chapterFile: parts[parts.length - 1],
      bytes: stat.size,
      verseCount,
      superscriptionCount,
      schema,
      error,
    });
  }

  return {
    translation,
    relativeRoot,
    exists: fs.existsSync(absoluteRoot),
    chapterFiles: files.length,
    totalBytes,
    totalVerses,
    totalSuperscriptions,
    parseErrors,
    bookDirectories: new Set(chapters.map((item) => item.bookDirectory).filter(Boolean)).size,
    sampleDocumentKeys,
    sampleVerseKeys,
    schemas: [...schemaCounts.entries()].map(([schema, count]) => ({ schema, count })),
    chapters,
  };
}

function inventoryRoutes() {
  const appRoot = path.join(repositoryRoot, 'app');
  return walkFiles(appRoot, (full) => path.basename(full) === 'page.tsx').map((full) => {
    const relativeDirectory = normalizeRelative(path.relative(appRoot, path.dirname(full)));
    const route = relativeDirectory === '' ? '/' : `/${relativeDirectory}`;
    return {
      route,
      file: normalizeRelative(path.relative(repositoryRoot, full)),
      isDynamic: route.includes('['),
    };
  });
}

function inventoryPotentialIndexes() {
  const roots = [
    'public/scripture',
    'app/data/scripture',
    'app/data',
    'scripts',
  ];
  const rows = [];
  const namePattern = /(search|index|reference|verse|scripture)/i;
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(repositoryRoot, relativeRoot);
    for (const file of walkFiles(absoluteRoot, (full) => namePattern.test(path.basename(full)))) {
      const normalized = normalizeRelative(path.relative(repositoryRoot, file));
      if (protectedFragments.some((fragment) => normalized.toLowerCase().includes(fragment.toLowerCase()))) {
        continue;
      }
      const stat = fs.statSync(file);
      rows.push({ path: normalized, bytes: stat.size, extension: path.extname(file).toLowerCase() });
    }
  }
  return rows;
}

function countMatches(text, regex) {
  const matched = text.match(regex);
  return matched ? matched.length : 0;
}

function makeReport({ runtime, routes, indexes, findings, git, sourceStable }) {
  const lines = [
    '# EMETSEES P08.3A - Scripture Search Runtime and Navigation Audit',
    '',
    '## Verdict',
    '',
    `**${findings.verdict}**`,
    '',
    findings.summary,
    '',
    '## Runtime inventory',
    '',
  ];

  for (const item of runtime) {
    lines.push(
      `- ${item.translation.toUpperCase()}: ${item.chapterFiles} chapter files, ${item.totalVerses} verses, ${item.bookDirectories} book directories, ${item.totalBytes} bytes, ${item.parseErrors} parse errors.`,
    );
  }

  lines.push(
    '',
    '## Confirmed architecture',
    '',
    `- Dedicated /search route exists: ${findings.searchRouteExists ? 'yes' : 'no'}.`,
    `- /ask route exists: ${findings.askRouteExists ? 'yes' : 'no'}.`,
    `- Read reference jump exists: ${findings.readReferenceJumpExists ? 'yes' : 'no'}.`,
    `- Reader verse focusing exists: ${findings.readerVerseFocusExists ? 'yes' : 'no'}.`,
    `- Reader return navigation exists: ${findings.readerReturnSupportExists ? 'yes' : 'no'}.`,
    `- Bottom navigation includes Search: ${findings.navIncludesSearch ? 'yes' : 'no'}.`,
    `- Bottom navigation includes Library: ${findings.navIncludesLibrary ? 'yes' : 'no'}.`,
    `- Bottom Ask navigates to /ask: ${findings.askNavigatesToRoute ? 'yes' : 'no'}.`,
    `- Home exposes Library access: ${findings.homeExposesLibrary ? 'yes' : 'no'}.`,
    '',
    '## Recommended P08.3 implementation',
    '',
    '1. Generate compact static search indexes from the existing reader-runtime JSON. Do not create a second Scripture source.',
    '2. Add a dedicated client /search route supporting references, words, and quoted phrases.',
    '3. Store the current query, result position, and scroll state in session storage so return navigation preserves the Search screen.',
    '4. Open results in the existing Reader with translation, verse focus, returnTo, and returnLabel parameters.',
    '5. Preserve the existing MobileBottomNav component and change only its information architecture to Home, Read, Search, Ask EMET, Settings.',
    '6. Route Ask EMET to /ask without redesigning the Ask surface during P08.',
    '7. Keep Library available from Home and remove it only from permanent bottom navigation.',
    '',
    '## Safety',
    '',
    `- Audited source remained byte-identical: ${sourceStable ? 'yes' : 'no'}.`,
    '- Application source writes: 0.',
    '- Dependency operations: 0.',
    '- Build operations: 0.',
    '- Dev server operations: 0.',
    '- Git mutation operations: 0.',
    '- Active P07 content access: 0.',
    '- P01-P04 content access: 0.',
    '',
    '## Git context',
    '',
    `- Branch: ${git.branch.stdout || 'unavailable'}`,
    `- HEAD: ${git.head.stdout || 'unavailable'}`,
    '',
  );

  return `${lines.join('\n')}\n`;
}

function main() {
  if (!fs.existsSync(repositoryRoot) || !fs.statSync(repositoryRoot).isDirectory()) {
    throw new Error(`Repository does not exist: ${repositoryRoot}`);
  }
  ensureDirectory(reportRoot);

  const before = sourceTargets.map(hashFile);
  for (const relative of sourceTargets) copyContextFile(relative);

  const runtime = ['web', 'kjv', 'brenton'].map(inventoryRuntime);
  const routes = inventoryRoutes();
  const indexes = inventoryPotentialIndexes();

  const navText = readText('app/components/MobileBottomNav.tsx');
  const readTextSource = readText('app/read/page.tsx');
  const chapterText = readText('app/read/[book]/[chapter]/page.tsx');
  const homeText = readText('app/page.tsx');
  const packageText = readText('package.json');
  const askText = readText('app/ask/page.tsx', false);
  const sampleText = readText('app/data/sampleVerses.ts', false);
  const allScriptureText = readText('app/data/scripture/allScripture.ts', false);

  const searchRouteExists = routes.some((item) => item.route === '/search');
  const askRouteExists = routes.some((item) => item.route === '/ask');
  const readReferenceJumpExists = /handleQuickJump/.test(readTextSource) && /verse=/.test(readTextSource);
  const readerVerseFocusExists = /ReaderVerseScroller/.test(chapterText) && /verse\?/.test(chapterText);
  const readerReturnSupportExists = /returnTo\?/.test(chapterText) && /returnLabel\?/.test(chapterText);
  const navIncludesSearch = /href:\s*["']\/search["']/.test(navText);
  const navIncludesLibrary = /href:\s*["']\/library["']/.test(navText);
  const askNavigatesToRoute = /href=\{?["']\/ask["']/.test(navText) || /href:\s*["']\/ask["']/.test(navText);
  const homeExposesLibrary = /href=["']\/library["']/.test(homeText) || /router\.push\(["']\/library/.test(homeText);
  const bulkScriptureRetired = /allScripture:\s*ScriptureVerse\[\]\s*=\s*\[\]/.test(allScriptureText);
  const sampleVerseCountSignal = countMatches(sampleText, /reference\s*:/g);
  const runtimeUsable = runtime.every((item) => item.exists && item.chapterFiles > 0 && item.parseErrors === 0);
  const readerCountsPlausible = runtime.some((item) => item.totalVerses > 20000);

  const verdict = runtimeUsable && readerCountsPlausible
    ? 'P08_3_SEARCH_RUNTIME_READY_STATIC_INDEX_RECOMMENDED'
    : runtime.some((item) => item.chapterFiles > 0)
      ? 'P08_3_SEARCH_RUNTIME_PARTIAL_REVIEW_REQUIRED'
      : 'P08_3_SEARCH_RUNTIME_NOT_FOUND';

  const findings = {
    verdict,
    summary: runtimeUsable && readerCountsPlausible
      ? 'The existing reader runtime is suitable as the sole source for compact static Scripture Search indexes. No new Scripture corpus or live AI search is needed.'
      : 'The runtime inventory needs review before Search implementation because one or more translation corpora are missing, malformed, or unexpectedly small.',
    runtimeUsable,
    readerCountsPlausible,
    searchRouteExists,
    askRouteExists,
    readReferenceJumpExists,
    readerVerseFocusExists,
    readerReturnSupportExists,
    navIncludesSearch,
    navIncludesLibrary,
    askNavigatesToRoute,
    homeExposesLibrary,
    bulkScriptureRetired,
    sampleVerseCountSignal,
    packageHasBuildScript: /"build"\s*:/.test(packageText),
    askPageBytes: Buffer.byteLength(askText),
  };

  const git = {
    branch: runReadOnly('git', ['branch', '--show-current']),
    head: runReadOnly('git', ['rev-parse', 'HEAD']),
    targetStatus: runReadOnly('git', ['status', '--short', '--', ...sourceTargets]),
  };

  const after = sourceTargets.map(hashFile);
  const sourceStable = before.every((item, index) => {
    const next = after[index];
    return item.path === next.path && item.exists === next.exists && item.sha256 === next.sha256;
  });

  const runtimeSummary = runtime.map(({ chapters, ...summary }) => summary);
  const chapterRows = runtime.flatMap((item) => item.chapters);

  writeJson('SAFETY-CONTRACT.json', {
    phase: 'P08.3A-AUDIT',
    mode: 'read-only Search runtime and navigation preflight',
    applicationWrites: 0,
    dependencyOperations: 0,
    buildOperations: 0,
    devServerOperations: 0,
    gitMutationOperations: 0,
    p07PathsAccessed: 0,
    p01ToP04ContentAccessed: 0,
    auditedSourceFiles: sourceTargets,
    runtimeRootsInspected: runtime.map((item) => item.relativeRoot),
  });
  writeJson('verdict.json', findings);
  writeJson('audit.json', { findings, runtime: runtimeSummary, routes, git });
  writeJson('P08.3-IMPLEMENTATION-MAP.json', {
    sourceOfTruth: 'existing public/scripture/runtime translation chapter JSON',
    indexStrategy: 'compact static per-translation indexes generated deterministically from reader runtime',
    proposedFiles: [
      'app/search/page.tsx',
      'app/lib/scriptureSearch.ts',
      'app/components/MobileBottomNav.tsx',
      'scripts/p08/build-scripture-search-index.cjs',
      'public/scripture/search/web.json',
      'public/scripture/search/kjv.json',
      'public/scripture/search/brenton.json',
    ],
    reusedSystems: [
      'app/data/scripture/bookCatalog.ts',
      'app/data/bookAliases.ts',
      'app/lib/translationPreference.ts',
      'app/read/[book]/[chapter]/page.tsx',
      'app/components/ReaderVerseScroller.tsx',
      'app/components/MobileBottomNav.tsx',
    ],
    deferred: [
      'Ask EMET redesign',
      'accounts and paid entitlements',
      'saved Search history beyond current session',
      'engagement features',
    ],
  });
  writeCsv('runtime-chapter-inventory.csv', chapterRows, [
    'translation',
    'path',
    'bookDirectory',
    'chapterFile',
    'bytes',
    'verseCount',
    'superscriptionCount',
    'schema',
    'error',
  ]);
  writeCsv('route-inventory.csv', routes, ['route', 'file', 'isDynamic']);
  writeCsv('potential-search-index-assets.csv', indexes, ['path', 'bytes', 'extension']);
  writeCsv('source-hashes-before.csv', before, ['path', 'exists', 'bytes', 'sha256']);
  writeCsv('source-hashes-after.csv', after, ['path', 'exists', 'bytes', 'sha256']);
  writeText('git-status-targets.txt', `${git.targetStatus.stdout}\n${git.targetStatus.stderr}\n`);
  writeText('REPORT.md', makeReport({ runtime, routes, indexes, findings, git, sourceStable }));

  if (!sourceStable) {
    throw new Error('Audited application source changed during the read-only audit.');
  }

  console.log('EMETSEES P08.3A Search and navigation audit complete.');
  console.log(`Verdict: ${verdict}`);
  for (const item of runtime) {
    console.log(`${item.translation}: ${item.chapterFiles} files, ${item.totalVerses} verses, ${item.parseErrors} parse errors`);
  }
  console.log(`Routes: ${routes.length}`);
  console.log(`Potential existing index assets: ${indexes.length}`);
  console.log(`Report: ${reportRoot}`);
}

try {
  main();
} catch (error) {
  ensureDirectory(reportRoot);
  const message = error instanceof Error ? `${error.stack || error.message}` : String(error);
  writeText('NODE-FAILURE.txt', `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
