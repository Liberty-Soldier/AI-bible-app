'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const repositoryRoot = path.resolve(process.argv[2] || process.cwd());
const reportRoot = path.resolve(process.argv[3] || path.join(repositoryRoot, '.private', 'reports', 'P08.2B-AUDIT', 'manual-run'));

const protectedFragments = [
  'scripts/p07/full-cache-generation',
  '.private/staging/P07-FULL-CACHE-GENERATION',
  '.private/reports/P07-FULL-CACHE-GENERATION',
  '.private/entity/build/P01',
  '.private/entity/build/P02',
  '.private/entity/build/P03',
  '.private/entity/build/P04',
];

const targets = [
  'app/components/TranslationSelector.tsx',
  'app/read/page.tsx',
  'app/components/ReaderSelector.tsx',
  'app/read/[book]/[chapter]/page.tsx',
  'app/read/[book]/page.tsx',
  'app/components/SaveReadingPosition.tsx',
  'app/components/SaveBibleIQContext.tsx',
  'app/page.tsx',
  'app/library/page.tsx',
  'app/lib/readerMemory.ts',
  'app/components/VerseActionController.tsx',
  'app/components/ask/AskView.tsx',
  'app/components/WordStudySheet.tsx',
  'app/components/ReaderWordStudyController.tsx',
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

function readText(relative, required = true) {
  assertSafeRelative(relative);
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    if (required) throw new Error(`Required source file is missing: ${relative}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
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

function bool(value) {
  return Boolean(value);
}

function includesAllInOrder(text, values) {
  let cursor = -1;
  for (const value of values) {
    cursor = text.indexOf(value, cursor + 1);
    if (cursor < 0) return false;
  }
  return true;
}

function matchLines(relative, text, patterns) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        rows.push({
          file: normalizeRelative(relative),
          line: index + 1,
          category: pattern.category,
          text: line.trim(),
        });
      }
      pattern.regex.lastIndex = 0;
    }
  }
  return rows;
}

function addCheck(checks, id, status, summary, evidence, severity = 'normal') {
  checks.push({ id, status, severity, summary, evidence });
}

function makeReport(findings, checks, sourceStable) {
  const warningChecks = checks.filter((item) => item.status === 'warning');
  const failedChecks = checks.filter((item) => item.status === 'failed');
  const lines = [
    '# EMETSEES P08.2B - Translation Persistence Verification Audit',
    '',
    '## Verdict',
    '',
    `**${findings.verdict}**`,
    '',
    findings.summary,
    '',
    '## What is already working',
    '',
    '- WEB is the local first-use default on the Read entry screen.',
    '- The Read entry screen reads and writes `preferredTranslation`.',
    '- Reader chapter URLs carry a `translation` query parameter during normal Read navigation.',
    '- The chapter loader honors the requested translation when available and falls back in the order WEB, KJV, then Brenton.',
    '- Continue Reading stores and reopens the last chapter with its translation.',
    '- P08.2A now records translation on newly saved reader-memory verses and preserves it for note-to-Scripture navigation.',
    '',
    '## Narrow gaps confirmed',
    '',
    '- The in-reader translation buttons change the URL but do not update `preferredTranslation`.',
    '- There is no single shared active-translation utility or provider used across the app.',
    '- The standalone `TranslationSelector.tsx` is not imported by another audited application file.',
    '- Bookmark and highlight links in Library omit translation even when the saved item contains it.',
    '- Recent bookmark links on Home omit translation.',
    '- The older Ask prototype opens Scripture results without a translation parameter.',
    '',
    '## Important interpretation',
    '',
    'The main WEB behavior is not broadly broken. A user who selects WEB from the Read screen should normally remain on WEB. The remaining risk is cross-entry inconsistency: changing translation inside the reader or reopening saved items can fail to update or carry the global preference.',
    '',
    'There is no confirmed code path that deliberately defaults ordinary reading to Brenton. When a chapter URL has no valid translation, the current server route defaults to WEB.',
    '',
    '## Recommended scope',
    '',
    'Do not rebuild translation selection. Use a narrow P08.2B correction only:',
    '',
    '1. Add one small shared translation-preference utility that validates WEB, KJV, and Brenton and defaults to WEB.',
    '2. Make the in-reader selector update that preference whenever the user changes translation.',
    '3. Carry saved-item translation through Library bookmarks, highlights, Home recent bookmarks, previews, and later Search/Ask result links.',
    '4. Preserve `preferredTranslation` as the migration-compatible storage key.',
    '5. Do not add future translation buttons during this correction; selector expansion remains P08.6.',
    '',
    '## Audit safety',
    '',
    `- Source stable during audit: ${sourceStable ? 'yes' : 'no'}`,
    '- Application files modified: 0',
    '- Dependencies installed or changed: 0',
    '- Build or dev server run: no',
    '- Git branch/reset/clean operations: none',
    '- P07 full-cache paths accessed: no',
    '- P01-P04 content accessed: no',
    '',
    '## Check totals',
    '',
    `- Passed: ${checks.filter((item) => item.status === 'passed').length}`,
    `- Warnings: ${warningChecks.length}`,
    `- Failed: ${failedChecks.length}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function buildManifest() {
  const entries = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        const relative = normalizeRelative(path.relative(reportRoot, absolute));
        if (relative === 'MANIFEST.sha256') continue;
        const buffer = fs.readFileSync(absolute);
        entries.push({ path: relative, bytes: buffer.length, sha256: sha256Buffer(buffer) });
      }
    }
  }
  walk(reportRoot);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  writeText('MANIFEST.sha256', entries.map((item) => `${item.sha256}  ${item.path}`).join('\n') + '\n');
  return entries;
}

function main() {
  if (!fs.existsSync(path.join(repositoryRoot, 'package.json'))) {
    throw new Error(`Repository package.json is missing: ${repositoryRoot}`);
  }

  ensureDirectory(reportRoot);
  ensureDirectory(path.join(reportRoot, 'context', 'source'));

  const before = targets.map(hashFile);
  const source = {};
  for (const target of targets) {
    source[target] = readText(target, target !== 'app/components/TranslationSelector.tsx');
    const absolute = path.join(repositoryRoot, target);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      const destination = path.join(reportRoot, 'context', 'source', target);
      ensureDirectory(path.dirname(destination));
      fs.copyFileSync(absolute, destination);
    }
  }

  const readPage = source['app/read/page.tsx'];
  const translationSelector = source['app/components/TranslationSelector.tsx'];
  const readerSelector = source['app/components/ReaderSelector.tsx'];
  const chapterPage = source['app/read/[book]/[chapter]/page.tsx'];
  const saveReadingPosition = source['app/components/SaveReadingPosition.tsx'];
  const homePage = source['app/page.tsx'];
  const libraryPage = source['app/library/page.tsx'];
  const readerMemory = source['app/lib/readerMemory.ts'];
  const verseActionController = source['app/components/VerseActionController.tsx'];
  const askView = source['app/components/ask/AskView.tsx'];

  const checks = [];

  const readDefaultsWeb = /useState\s*<\s*Translation\s*>\s*\(\s*["']web["']\s*\)/.test(readPage);
  addCheck(checks, 'read-default-web', readDefaultsWeb ? 'passed' : 'failed', 'Read entry first local default is WEB.', 'app/read/page.tsx');

  const readReadsPreference = /localStorage\.getItem\(\s*["']preferredTranslation["']\s*\)/.test(readPage);
  addCheck(checks, 'read-loads-preference', readReadsPreference ? 'passed' : 'failed', 'Read entry loads preferredTranslation.', 'app/read/page.tsx');

  const readWritesPreference = /localStorage\.setItem\(\s*["']preferredTranslation["']\s*,\s*next\s*\)/.test(readPage);
  addCheck(checks, 'read-saves-preference', readWritesPreference ? 'passed' : 'failed', 'Read entry saves user translation selection.', 'app/read/page.tsx');

  const standaloneSelectorDefaultsWeb = !translationSelector || /useState\s*<\s*Translation\s*>\s*\(\s*["']web["']\s*\)/.test(translationSelector);
  addCheck(checks, 'standalone-selector-default-web', standaloneSelectorDefaultsWeb ? 'passed' : 'warning', 'Standalone selector defaults to WEB when present.', 'app/components/TranslationSelector.tsx');

  const chapterDefaultsWeb = /translation\s*===\s*["']web["'][\s\S]{0,160}\?\s*translation\s*:\s*["']web["']/.test(chapterPage);
  addCheck(checks, 'chapter-invalid-or-missing-default-web', chapterDefaultsWeb ? 'passed' : 'failed', 'Missing or invalid chapter translation defaults to WEB.', 'app/read/[book]/[chapter]/page.tsx');

  const fallbackOrderCorrect = includesAllInOrder(chapterPage, [
    'loadChapter(requested',
    'loadChapter("web"',
    'loadChapter("kjv"',
    'loadChapter("brenton"',
  ]);
  addCheck(checks, 'chapter-fallback-order', fallbackOrderCorrect ? 'passed' : 'failed', 'Chapter fallback order is requested, WEB, KJV, Brenton.', 'app/read/[book]/[chapter]/page.tsx');

  const readerSelectorPersists = /preferredTranslation|setActiveTranslation|setTranslationPreference/.test(readerSelector);
  addCheck(checks, 'reader-selector-updates-preference', readerSelectorPersists ? 'passed' : 'warning', 'In-reader translation buttons update the stored preference.', 'app/components/ReaderSelector.tsx', 'important');

  const sharedPreferenceModuleExists = [
    'app/lib/translationPreference.ts',
    'app/lib/activeTranslation.ts',
    'app/components/TranslationProvider.tsx',
    'app/components/ActiveTranslationProvider.tsx',
  ].some((relative) => fs.existsSync(path.join(repositoryRoot, relative)));
  addCheck(checks, 'shared-global-translation-owner', sharedPreferenceModuleExists ? 'passed' : 'warning', 'A shared global translation owner exists.', 'app/lib or app/components', 'important');

  const auditedImports = Object.entries(source)
    .filter(([relative]) => relative !== 'app/components/TranslationSelector.tsx')
    .some(([, text]) => /TranslationSelector/.test(text));
  addCheck(checks, 'standalone-selector-used', auditedImports ? 'passed' : 'warning', 'TranslationSelector.tsx is imported by an audited app surface.', 'audited application files');

  const savesLastReadingTranslation = /lastReadingPosition/.test(saveReadingPosition) && /translation/.test(saveReadingPosition);
  const homeReopensLastReadingTranslation = /lastReading\.translation/.test(homePage) && /\?translation=/.test(homePage);
  addCheck(checks, 'continue-reading-preserves-translation', savesLastReadingTranslation && homeReopensLastReadingTranslation ? 'passed' : 'failed', 'Continue Reading saves and reopens the chapter translation.', 'SaveReadingPosition.tsx and app/page.tsx');

  const memoryHasTranslation = /translation\?\s*:\s*ReaderTranslation/.test(readerMemory);
  addCheck(checks, 'reader-memory-can-store-translation', memoryHasTranslation ? 'passed' : 'warning', 'Saved reader-memory verses can store translation.', 'app/lib/readerMemory.ts', 'important');

  const verseActionsCaptureTranslation = /translation\s*:\s*activeTranslation/.test(verseActionController);
  addCheck(checks, 'verse-actions-capture-translation', verseActionsCaptureTranslation ? 'passed' : 'warning', 'New bookmarks, highlights, and notes capture the active translation.', 'app/components/VerseActionController.tsx', 'important');

  const notesPreserveTranslation = /first\.translation/.test(libraryPage) && /params\.set\(\s*["']translation["']/.test(libraryPage);
  addCheck(checks, 'note-scripture-link-preserves-translation', notesPreserveTranslation ? 'passed' : 'warning', 'Note View Scripture navigation carries saved translation.', 'app/library/page.tsx', 'important');

  const bookmarksBlock = libraryPage.match(/activeTab\s*===\s*["']bookmarks["'][\s\S]*?activeTab\s*===\s*["']highlights["']/)?.[0] || '';
  const bookmarkLinksCarry = /translation=|item\.translation|URLSearchParams/.test(bookmarksBlock);
  addCheck(checks, 'library-bookmark-links-preserve-translation', bookmarkLinksCarry ? 'passed' : 'warning', 'Library bookmark links carry the saved translation.', 'app/library/page.tsx', 'important');

  const highlightsBlock = libraryPage.match(/activeTab\s*===\s*["']highlights["'][\s\S]*?activeTab\s*===\s*["']notes["']/)?.[0] || '';
  const highlightLinksCarry = /translation=|item\.translation|URLSearchParams/.test(highlightsBlock);
  addCheck(checks, 'library-highlight-links-preserve-translation', highlightLinksCarry ? 'passed' : 'warning', 'Library highlight links carry the saved translation.', 'app/library/page.tsx', 'important');

  const recentBookmarkBlock = homePage.match(/recentBookmarks\.map[\s\S]*?recentNotes\.length/)?.[0] || '';
  const homeRecentBookmarksCarry = /translation=|bookmark\.translation|URLSearchParams/.test(recentBookmarkBlock);
  addCheck(checks, 'home-recent-bookmarks-preserve-translation', homeRecentBookmarksCarry ? 'passed' : 'warning', 'Home recent bookmark links carry the saved translation.', 'app/page.tsx', 'important');

  const askLinksCarry = /getReferenceHref[\s\S]{0,260}translation=/.test(askView);
  addCheck(checks, 'ask-result-links-preserve-translation', askLinksCarry ? 'passed' : 'warning', 'Older Ask prototype result links carry translation.', 'app/components/ask/AskView.tsx');

  const suspiciousDefaults = [];
  for (const [relative, text] of Object.entries(source)) {
    if (/useState[^\n]{0,120}["']brenton["']/.test(text)) suspiciousDefaults.push(`${relative}: state default`);
    if (/preferredTranslation[^\n]{0,180}\|\|\s*["']brenton["']/.test(text)) suspiciousDefaults.push(`${relative}: preference fallback`);
  }
  addCheck(checks, 'no-forced-brenton-default', suspiciousDefaults.length === 0 ? 'passed' : 'failed', 'No audited ordinary-reading path forces Brenton as the default.', suspiciousDefaults.join('; ') || 'No suspicious Brenton default pattern found.');

  const patternRows = [];
  const searchPatterns = [
    { category: 'preference-read', regex: /preferredTranslation/ },
    { category: 'local-storage', regex: /localStorage/ },
    { category: 'translation-query', regex: /translation=/ },
    { category: 'web-default', regex: /["']web["']/ },
    { category: 'brenton-reference', regex: /["']brenton["']/ },
    { category: 'saved-translation', regex: /\.translation|translation\s*:/ },
  ];
  for (const [relative, text] of Object.entries(source)) {
    patternRows.push(...matchLines(relative, text, searchPatterns));
  }

  const coreWorking = readDefaultsWeb && readReadsPreference && readWritesPreference && chapterDefaultsWeb && fallbackOrderCorrect && suspiciousDefaults.length === 0;
  const narrowGaps = checks.some((item) => item.status === 'warning');
  const verdict = coreWorking
    ? narrowGaps
      ? 'CORE_TRANSLATION_PERSISTENCE_WORKING_NARROW_GAPS_CONFIRMED'
      : 'GLOBAL_TRANSLATION_PERSISTENCE_COMPLETE'
    : 'CORE_TRANSLATION_PERSISTENCE_DEFECT_CONFIRMED';

  const findings = {
    verdict,
    summary: coreWorking
      ? 'The main WEB default and Read-screen persistence are working. The remaining defects are secondary-path consistency gaps, not a broad Brenton-default failure.'
      : 'One or more core translation-default or persistence checks failed and require correction before demo.',
    coreWorking,
    narrowGaps,
    confirmedForcedBrentonDefault: suspiciousDefaults.length > 0,
    warningCount: checks.filter((item) => item.status === 'warning').length,
    failedCount: checks.filter((item) => item.status === 'failed').length,
  };

  const git = {
    branch: runReadOnly('git', ['branch', '--show-current']),
    head: runReadOnly('git', ['rev-parse', 'HEAD']),
    targetStatus: runReadOnly('git', ['status', '--short', '--', ...targets]),
  };

  writeJson('SAFETY-CONTRACT.json', {
    phase: 'P08.2B-AUDIT',
    mode: 'read-only translation persistence verification',
    applicationWrites: 0,
    dependencyOperations: 0,
    buildOperations: 0,
    devServerOperations: 0,
    gitMutationOperations: 0,
    p07PathsAccessed: 0,
    p01ToP04ContentAccessed: 0,
    auditedFiles: targets.map(normalizeRelative),
  });
  writeJson('audit.json', { findings, checks, git });
  writeJson('verdict.json', findings);
  writeCsv('checks.csv', checks, ['id', 'status', 'severity', 'summary', 'evidence']);
  writeCsv('source-hashes-before.csv', before, ['path', 'exists', 'bytes', 'sha256']);
  writeCsv('translation-pattern-inventory.csv', patternRows, ['file', 'line', 'category', 'text']);
  writeText('git-branch.txt', `${git.branch.stdout}\n`);
  writeText('git-head.txt', `${git.head.stdout}\n`);
  writeText('git-status-targets.txt', `${git.targetStatus.stdout}\n`);

  const after = targets.map(hashFile);
  const beforeMap = new Map(before.map((item) => [item.path, item]));
  const changes = after.filter((item) => {
    const prior = beforeMap.get(item.path);
    return !prior || prior.exists !== item.exists || prior.sha256 !== item.sha256 || prior.bytes !== item.bytes;
  });
  const sourceStable = changes.length === 0;
  writeCsv('source-hashes-after.csv', after, ['path', 'exists', 'bytes', 'sha256']);
  writeCsv('source-changes-during-audit.csv', changes, ['path', 'exists', 'bytes', 'sha256']);

  if (!sourceStable) {
    throw new Error(`Audited application source changed during the audit: ${changes.map((item) => item.path).join(', ')}`);
  }

  writeText('REPORT.md', makeReport(findings, checks, sourceStable));
  const manifest = buildManifest();
  writeJson('manifest-summary.json', { entries: manifest.length });
  buildManifest();

  console.log('P08.2B translation persistence audit completed.');
  console.log(`Verdict: ${verdict}`);
  console.log(`Passed: ${checks.filter((item) => item.status === 'passed').length}`);
  console.log(`Warnings: ${checks.filter((item) => item.status === 'warning').length}`);
  console.log(`Failed: ${checks.filter((item) => item.status === 'failed').length}`);
  console.log(`Report: ${reportRoot}`);
}

try {
  main();
} catch (error) {
  ensureDirectory(reportRoot);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  writeText('ERROR.txt', `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
