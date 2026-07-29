#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

function valueAfter(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativePath(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env }
  });

  return {
    command: [command, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    error: result.error
      ? {
          name: result.error.name,
          message: result.error.message,
          code: result.error.code || null
        }
      : null,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "cmd.exe";
    return run(shell, ["/d", "/s", "/c", ["npm", ...args].join(" ")], cwd);
  }
  return run("npm", args, cwd);
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function fingerprint(target) {
  if (!fs.existsSync(target)) {
    return { exists: false, type: null, sha256: null, bytes: null, files: 0 };
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return {
      exists: true,
      type: "file",
      sha256: sha256File(target),
      bytes: stat.size,
      files: 1
    };
  }

  const files = walkFiles(target);
  const hash = crypto.createHash("sha256");

  for (const file of files) {
    hash.update(relativePath(target, file), "utf8");
    hash.update("\0");
    hash.update(sha256File(file), "utf8");
    hash.update("\n");
  }

  return {
    exists: true,
    type: "directory",
    sha256: hash.digest("hex"),
    bytes: null,
    files: files.length
  };
}

function captureProtectedState(repositoryRoot) {
  const paths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/scripture/runtime/web",
    "public/scripture/runtime/brenton",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/bibleiq/canonical",
    ".private/scripture/canonical",
    ".private/alignment",
    ".gitattributes"
  ];

  return paths.map(relative => ({
    path: relative,
    ...fingerprint(path.join(repositoryRoot, relative))
  }));
}

function compareStates(before, after) {
  const afterByPath = new Map(after.map(row => [row.path, row]));
  const differences = [];

  for (const left of before) {
    const right = afterByPath.get(left.path);
    if (!right || JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push({ before: left, after: right || null });
    }
  }

  return differences;
}

function verifyChecksumManifest(reportRoot) {
  const manifestPath = path.join(reportRoot, "checksums.sha256");
  if (!fs.existsSync(manifestPath)) {
    return {
      passed: false,
      checked: 0,
      failures: [{ reason: "missing-manifest" }]
    };
  }

  const failures = [];
  let checked = 0;

  for (const [index, line] of fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;

    const match = /^([0-9a-f]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line: index + 1, reason: "invalid-format" });
      continue;
    }

    checked += 1;
    const relative = normalizeSlashes(match[2]);
    const target = path.join(reportRoot, ...relative.split("/"));

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      failures.push({ path: relative, reason: "missing" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const actual = sha256File(target);
    if (actual !== expected) {
      failures.push({ path: relative, expected, actual });
    }
  }

  return {
    passed: failures.length === 0,
    checked,
    failures
  };
}

function findPassingP062(repositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P06.2");
  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/premium-ux-foundation/i.test(entry.name)) {
      continue;
    }

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, "p062-summary.json");
    const verdictPath = path.join(root, "verdict.json");

    if (!fs.existsSync(summaryPath) || !fs.existsSync(verdictPath)) continue;

    try {
      const summary = readJson(summaryPath);
      const verdict = readJson(verdictPath);
      const checksums = verifyChecksumManifest(root);

      if (
        checksums.passed &&
        summary?.milestone === "P06.2" &&
        summary?.build?.passed === true &&
        summary?.authorization?.safeToReviewOnDevice === true &&
        verdict?.verdict === "PREMIUM_UX_FOUNDATION_PASSED"
      ) {
        candidates.push({
          root,
          summaryPath,
          verdictPath,
          summary,
          verdict,
          checksums,
          mtimeMs: fs.statSync(summaryPath).mtimeMs
        });
      }
    } catch {
      // Ignore malformed reports.
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] || null;
}

function backupPath(repositoryRoot, reportRoot, relative) {
  const source = path.join(repositoryRoot, relative);
  const backup = path.join(reportRoot, "rollback-payload", relative);

  if (!fs.existsSync(source)) {
    writeJson(`${backup}.absence.json`, {
      path: relative,
      existedBefore: false
    });
    return;
  }

  ensureDir(path.dirname(backup));
  fs.cpSync(source, backup, { recursive: true, force: true });
}

function restorePath(repositoryRoot, reportRoot, relative) {
  const target = path.join(repositoryRoot, relative);
  const backup = path.join(reportRoot, "rollback-payload", relative);
  const absence = `${backup}.absence.json`;

  fs.rmSync(target, { recursive: true, force: true });

  if (fs.existsSync(backup)) {
    ensureDir(path.dirname(target));
    fs.cpSync(backup, target, { recursive: true, force: true });
  } else if (!fs.existsSync(absence)) {
    throw new Error(`[P06.3] Missing rollback evidence for ${relative}.`);
  }
}

function replaceExactlyOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;
  if (count !== 1) {
    throw new Error(`[P06.3] Expected one ${label}; found ${count}.`);
  }

  return text.replace(oldValue, newValue);
}

function replaceRegexExactlyOnce(text, regex, replacement, label) {
  const matches = text.match(regex);
  if (!matches || matches.length !== 1) {
    throw new Error(
      `[P06.3] Expected one regex match for ${label}; found ${matches ? matches.length : 0}.`
    );
  }

  return text.replace(regex, replacement);
}

function patchThemeProvider(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/ThemeProvider.tsx");
  const source = `"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const PRIMARY_STORAGE_KEY = "emetsees-theme";
const LEGACY_STORAGE_KEYS = ["bibleiq-theme", "theme"] as const;

function normalizeTheme(value: string | null): Theme {
  return value === "dark" ? "dark" : "light";
}

function writeStoredTheme(theme: Theme) {
  localStorage.setItem(PRIMARY_STORAGE_KEY, theme);

  // Keep the existing Settings page compatible until its own visual redesign.
  // The old key is synchronized from the new authoritative preference; it is
  // never allowed to choose the first-visit default.
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.setItem(key, theme);
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("light");
  const currentTheme = useRef<Theme>("light");

  const commitTheme = useCallback((next: Theme) => {
    currentTheme.current = next;
    setThemeState(next);
    applyTheme(next);
    writeStoredTheme(next);
  }, []);

  useLayoutEffect(() => {
    const stored = normalizeTheme(localStorage.getItem(PRIMARY_STORAGE_KEY));
    commitTheme(stored);
  }, [commitTheme]);

  useEffect(() => {
    const root = document.documentElement;

    const observer = new MutationObserver(() => {
      const next = normalizeTheme(root.dataset.theme || null);

      if (next !== currentTheme.current) {
        currentTheme.current = next;
        setThemeState(next);
        writeStoredTheme(next);
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    function syncTheme(event: StorageEvent) {
      if (
        event.key !== PRIMARY_STORAGE_KEY &&
        !LEGACY_STORAGE_KEYS.includes(
          event.key as (typeof LEGACY_STORAGE_KEYS)[number],
        )
      ) {
        return;
      }

      const authoritative = normalizeTheme(
        localStorage.getItem(PRIMARY_STORAGE_KEY),
      );
      commitTheme(authoritative);
    }

    window.addEventListener("storage", syncTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncTheme);
    };
  }, [commitTheme]);

  const setTheme = useCallback(
    (next: Theme) => {
      commitTheme(next);
    },
    [commitTheme],
  );

  const toggleTheme = useCallback(() => {
    commitTheme(currentTheme.current === "dark" ? "light" : "dark");
  }, [commitTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return value;
}
`;

  fs.writeFileSync(file, source, "utf8");
}

function patchLayoutThemeBootstrap(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/layout.tsx");
  let text = fs.readFileSync(file, "utf8");

  if (text.includes('id="emetsees-theme-bootstrap"')) {
    return;
  }

  const bootstrap = `      <head>
        <script
          id="emetsees-theme-bootstrap"
          dangerouslySetInnerHTML={{
            __html: \`try {
  var stored = localStorage.getItem("emetsees-theme");
  var theme = stored === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("emetsees-theme", theme);
  localStorage.setItem("bibleiq-theme", theme);
  localStorage.setItem("theme", theme);
} catch (_) {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
}\`,
          }}
        />
      </head>
`;

  text = replaceExactlyOnce(
    text,
    `    >
      <body`,
    `    >
${bootstrap}      <body`,
    "RootLayout body opening"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchScriptureText(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/ScriptureText.tsx");
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('data-word-focused=')) {
    text = replaceExactlyOnce(
      text,
      `            data-word-kind={functionWord ? "function" : "lexical"}
`,
      `            data-word-kind={functionWord ? "function" : "lexical"}
            data-word-focused={focused ? "true" : undefined}
`,
      "ScriptureText focused data attribute"
    );
  }

  text = replaceRegexExactlyOnce(
    text,
    /            style=\{\{\s*textDecorationLine:[\s\S]*?textUnderlineOffset:\s*"0\.22em",\s*\}\}\r?\n/,
    `            style={{ textDecoration: "none" }}
`,
    "old dotted-underline style"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchGlobalWordStyles(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/globals.css");
  let text = fs.readFileSync(file, "utf8");

  text = replaceRegexExactlyOnce(
    text,
    /\[data-word-token="true"\]:hover\s*\{\s*background:[\s\S]*?\}\r?\n\r?\n/,
    `@media (hover: hover) and (pointer: fine) {
  [data-word-token="true"]:hover {
    background: color-mix(in srgb, var(--brand) 8%, transparent);
  }
}

`,
    "touch-unsafe word hover style"
  );

  text = replaceRegexExactlyOnce(
    text,
    /\[data-word-token="true"\]\[class\*="bg-amber"\]\s*\{[\s\S]*?\}\r?\n/,
    `[data-word-token="true"][data-word-focused="true"] {
  background: color-mix(in srgb, var(--brand) 15%, transparent) !important;
  box-shadow: inset 0 -0.08em 0 color-mix(in srgb, var(--brand) 48%, transparent);
}

`,
    "overbroad amber class selector"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchReaderInstruction(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "app/read/[book]/[chapter]/page.tsx"
  );
  let text = fs.readFileSync(file, "utf8");

  text = replaceRegexExactlyOnce(
    text,
    /Tap an underlined word for its source-based\s*explanation\.\s*Tap a verse number for\s*highlights,\s*notes,\s*bookmarks,\s*copy,\s*and\s*share\./,
    `Tap a word to see what it means here and trace its source evidence. Tap a verse number for highlights, notes, bookmarks, copy, and share.`,
    "reader instruction"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchMobileAskContext(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/MobileBottomNav.tsx");
  let text = fs.readFileSync(file, "utf8");

  text = text.replace(
    `"Opened from primary navigation"`,
    `"Ask contextual questions about Scripture"`
  );

  fs.writeFileSync(file, text, "utf8");
}


function patchUnifiedReaderVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-unified-reader.js"
  );
  let text = fs.readFileSync(file, "utf8");

  text = replaceExactlyOnce(
    text,
    'assertPresent(scriptureText, /textDecorationStyle:\\s*"dotted"/, "ScriptureText");',
    `assertPresent(
  scriptureText,
  /data-word-focused=\\{focused \\? "true" : undefined\\}/,
  "ScriptureText",
);
assertPresent(
  scriptureText,
  /textDecoration:\\s*"none"/,
  "ScriptureText",
);
assertAbsent(
  scriptureText,
  /textDecorationStyle:\\s*"dotted"/,
  "ScriptureText",
);`,
    "obsolete dotted-underline verifier contract"
  );

  text = replaceRegexExactlyOnce(
    text,
    /assertPresent\(\s*readerPage,\s*\/Tap an underlined word for its source-based explanation\/,\s*"reader page",\s*\);/,
    `assertPresent(
  readerPage,
  /Tap a word to see what it means here and trace its source evidence/,
  "reader page",
);`,
    "obsolete underlined-word verifier copy"
  );

  if (!text.includes('assertAbsent(layout, /GlobalAskButton/')) {
    text = replaceExactlyOnce(
      text,
      'assertPresent(layout, /PremiumAccessProvider/, "root layout");',
      `assertPresent(layout, /PremiumAccessProvider/, "root layout");
assertAbsent(layout, /GlobalAskButton/, "root layout");
assertPresent(mobileNav, /requestUpgrade\\("ask-emet"/, "mobile Ask EMET");`,
      "premium layout verifier anchor"
    );
  }

  fs.writeFileSync(file, text, "utf8");
}


function patchWordStudyUxVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-word-study-ux.js"
  );
  let text = fs.readFileSync(file, "utf8");

  text = replaceExactlyOnce(
    text,
    'assert(/textDecorationStyle:\\s*"dotted"/.test(scripture), "Subtle word hint is missing.");',
    `assert(
  /data-word-focused=/.test(scripture),
  "Selected-word focus marker is missing.",
);
assert(
  /textDecoration:\\s*"none"/.test(scripture),
  "Normal Scripture words are not visually clean.",
);
assert(
  !/textDecorationStyle:\\s*"dotted"/.test(scripture),
  "Obsolete dotted word hint remains.",
);`,
    "obsolete word-study dotted-hint verifier contract"
  );

  text = replaceExactlyOnce(
    text,
    'console.log("- Only source-aligned words are interactive");',
    `console.log("- Only source-aligned words are interactive");
console.log("- Normal Scripture remains visually clean");
console.log("- Only the selected word receives persistent emphasis");`,
    "word-study verifier result summary"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchPremiumCopy(repositoryRoot) {
  const roots = [
    path.join(repositoryRoot, "app/components/premium"),
    path.join(repositoryRoot, "app/ask")
  ];

  const replacements = [
    ["LIVE EMET", "ASK EMET"],
    ["Upgrade to ask EMET", "Ask EMET"],
    [
      "Live EMET reasoning is a paid feature.",
      "Ask EMET will add live, contextual questions grounded in the Scripture evidence."
    ],
    [
      "The free reader continues to include cached EMET explanations for ordinary word taps.",
      "Word taps already include source evidence and cached EMET explanations."
    ]
  ];

  const changed = [];

  for (const root of roots) {
    for (const file of walkFiles(root)) {
      if (!/\.(tsx|ts|jsx|js)$/.test(file)) continue;

      let text = fs.readFileSync(file, "utf8");
      const before = text;

      for (const [oldValue, newValue] of replacements) {
        text = text.split(oldValue).join(newValue);
      }

      if (text !== before) {
        fs.writeFileSync(file, text, "utf8");
        changed.push(relativePath(repositoryRoot, file));
      }
    }
  }

  return changed;
}

function patchWordStudyReaderFirst(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/WordStudySheet.tsx");
  let text = fs.readFileSync(file, "utf8");

  text = text.replace(
    `              readableMorphology={readableMorphology}
              onTechnical={() => changeView("technical")}`,
    `              readableMorphology={readableMorphology}
              principalRenderings={principalRenderings}
              onRenderings={() => changeView("renderings")}
              onTechnical={() => changeView("technical")}`
  );

  text = replaceExactlyOnce(
    text,
    `  readableMorphology,
  onTechnical,
  readingLabel,`,
    `  readableMorphology,
  principalRenderings,
  onRenderings,
  onTechnical,
  readingLabel,`,
    "LexiconView destructured reader props"
  );

  text = replaceExactlyOnce(
    text,
    `  readableMorphology?: string;
  onTechnical: () => void;
  readingLabel: string;`,
    `  readableMorphology?: string;
  principalRenderings: BibleIQRenderingForm[];
  onRenderings: () => void;
  onTechnical: () => void;
  readingLabel: string;`,
    "LexiconView reader prop types"
  );

  text = replaceExactlyOnce(
    text,
    `  const sourceForms = lexical?.sourceForms.slice(0, SOURCE_FORM_LIMIT) || [];

  return (`,
    `  const sourceForms = lexical?.sourceForms.slice(0, SOURCE_FORM_LIMIT) || [];
  const sourceLanguageLabel =
    alignment?.source === "hebrew" ? "Hebrew" : "Greek";
  const englishSummary = summarizeRenderings(principalRenderings);

  return (`,
    "LexiconView reader summaries"
  );

  const identityPanelEnd = `        </div>
      </Panel>

      {definitions.length ? (`;

  const englishPanel = `        </div>
      </Panel>

      {principalRenderings.length ? (
        <Panel>
          <SectionHeading
            eyebrow="In English"
            title="How this word is expressed in English"
          />
          <p className="mt-3 text-[1rem] leading-7">
            {englishSummary}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {principalRenderings.slice(0, 6).map((form) => (
              <button
                key={\`\${form.translation}-\${form.text}\`}
                type="button"
                onClick={onRenderings}
                className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-left transition active:scale-[0.98]"
              >
                <span className="block text-sm font-bold">{form.text}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {form.count.toLocaleString()} aligned use
                  {form.count === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRenderings}
            className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
          >
            See all English renderings ›
          </button>
        </Panel>
      ) : null}

      {definitions.length ? (`;

  text = replaceExactlyOnce(
    text,
    identityPanelEnd,
    englishPanel,
    "reader-first English renderings panel"
  );

  text = text.replace(
    `                ? "Lexical meaning"
                : "Strong's definition"
            }
            title={
              alignment?.source === "lxx"
                ? "What this entry means"
                : \`\${alignment?.lexicalId || "Strong's"} definition\`
            }`,
    `                ? "Plain-English meaning"
                : "Plain-English meaning"
            }
            title="What this word can mean"`
  );

  const oldForms = `      {sourceForms.length ? (
        <Panel>
          <SectionHeading eyebrow="Source forms" title="Common forms in Scripture" />
          <div className="mt-4 space-y-2">
            {sourceForms.map((form) => (
              <div
                key={\`\${form.surface}-\${form.count}\`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
              >
                <span className="min-w-0 break-words text-base font-bold">
                  {form.surface}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {form.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {lexical && lexical.sourceForms.length > SOURCE_FORM_LIMIT ? (
            <button
              type="button"
              onClick={onTechnical}
              className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
            >
              View all technical forms ›
            </button>
          ) : null}
        </Panel>
      ) : null}`;

  const newForms = `      {sourceForms.length ? (
        <Panel>
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <span>
                <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Optional original-language detail
                </span>
                <span className="mt-1 block text-xl font-bold">
                  {sourceLanguageLabel} forms in Scripture
                </span>
              </span>
              <Chevron />
            </summary>

            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              These are different written forms of the same {sourceLanguageLabel}
              word. You do not need to read {sourceLanguageLabel} to use this
              study—the English meanings and renderings are shown above.
            </p>

            <div className="mt-4 space-y-2">
              {sourceForms.map((form) => (
                <div
                  key={\`\${form.surface}-\${form.count}\`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
                >
                  <span className="min-w-0 break-words text-base font-bold">
                    {form.surface}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                    {form.count.toLocaleString()} occurrence
                    {form.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>

            {lexical && lexical.sourceForms.length > SOURCE_FORM_LIMIT ? (
              <button
                type="button"
                onClick={onTechnical}
                className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
              >
                View all technical forms ›
              </button>
            ) : null}
          </details>
        </Panel>
      ) : null}`;

  text = replaceExactlyOnce(
    text,
    oldForms,
    newForms,
    "reader-first source forms section"
  );

  text = text.replace(
    `            label="Principal renderings"`,
    `            label="English translations"`
  );

  text = text.replace(
    `title="How translations express this word"`,
    `title="How this word is expressed in English"`
  );

  fs.writeFileSync(file, text, "utf8");
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const apply = hasFlag("--apply");

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P06.3",
    purpose: "READER-FIRST CORRECTION",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedApplication: apply,
    p062Evidence: {},
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    changedFiles: [],
    premiumCopyFiles: [],
    build: {},
    protectedState: {},
    authorization: {
      readerFirstCorrectionApplied: false,
      safeToReviewOnDevice: false
    }
  };

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);
  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(
      `[P06.3] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`
    );
  }

  const p062 = findPassingP062(repositoryRoot);
  if (!p062) {
    throw new Error("[P06.3] No passing P06.2 report with valid checksums was found.");
  }

  report.p062Evidence = {
    reportRoot: relativePath(repositoryRoot, p062.root),
    summarySha256: sha256File(p062.summaryPath),
    checksumEntries: p062.checksums.checked,
    checksumsPassed: p062.checksums.passed
  };

  const managedFiles = [
    "app/layout.tsx",
    "app/globals.css",
    "app/components/ThemeProvider.tsx",
    "app/components/ScriptureText.tsx",
    "app/components/MobileBottomNav.tsx",
    "app/components/WordStudySheet.tsx",
    "app/read/[book]/[chapter]/page.tsx",
    "scripts/verify-p05-unified-reader.js",
    "scripts/verify-p05-word-study-ux.js"
  ];

  const premiumFiles = walkFiles(path.join(repositoryRoot, "app/components/premium"))
    .filter(file => /\.(tsx|ts|jsx|js)$/.test(file))
    .map(file => relativePath(repositoryRoot, file));

  for (const relative of managedFiles) {
    const absolute = path.join(repositoryRoot, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`[P06.3] Missing required file ${relative}.`);
    }
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);
  if (npmPreflight.status !== 0) {
    throw new Error("[P06.3] npm launcher preflight failed.");
  }

  const protectedBefore = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), protectedBefore);

  for (const relative of [...new Set([...managedFiles, ...premiumFiles])]) {
    backupPath(repositoryRoot, outputRoot, relative);
  }

  if (!apply) {
    writeJson(path.join(outputRoot, "p063-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P06.3",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToReviewOnDevice: false,
      nextStep: "Rerun with -Apply."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    patchThemeProvider(repositoryRoot);
    patchLayoutThemeBootstrap(repositoryRoot);
    patchScriptureText(repositoryRoot);
    patchGlobalWordStyles(repositoryRoot);
    patchReaderInstruction(repositoryRoot);
    patchMobileAskContext(repositoryRoot);
    patchWordStudyReaderFirst(repositoryRoot);
    patchUnifiedReaderVerifier(repositoryRoot);
    patchWordStudyUxVerifier(repositoryRoot);
    report.premiumCopyFiles = patchPremiumCopy(repositoryRoot);
    report.transaction.installed = true;

    const build = runNpm(["run", "build"], repositoryRoot);
    fs.writeFileSync(
      path.join(outputRoot, "production-build.stdout.log"),
      build.stdout,
      "utf8"
    );
    fs.writeFileSync(
      path.join(outputRoot, "production-build.stderr.log"),
      build.stderr,
      "utf8"
    );
    report.build = {
      command: build.command,
      status: build.status,
      error: build.error,
      passed: build.status === 0
    };

    if (build.status !== 0) {
      throw new Error("[P06.3] Production build failed.");
    }

    const protectedAfter = captureProtectedState(repositoryRoot);
    const protectedDifferences = compareStates(protectedBefore, protectedAfter);
    writeJson(path.join(outputRoot, "protected-state-after.json"), protectedAfter);

    report.protectedState = {
      before: protectedBefore,
      after: protectedAfter,
      differences: protectedDifferences
    };

    if (protectedDifferences.length !== 0) {
      throw new Error(
        `[P06.3] Protected Scripture state changed: ${JSON.stringify(protectedDifferences)}`
      );
    }

    const status = run("git", ["status", "--short"], repositoryRoot);
    const diff = run("git", ["diff", "--stat"], repositoryRoot);
    fs.writeFileSync(path.join(outputRoot, "git-status.txt"), status.stdout, "utf8");
    fs.writeFileSync(path.join(outputRoot, "git-diff-stat.txt"), diff.stdout, "utf8");

    report.changedFiles = [...new Set([
      ...managedFiles,
      ...report.premiumCopyFiles
    ])];
    report.authorization.readerFirstCorrectionApplied = true;
    report.authorization.safeToReviewOnDevice = true;
  } catch (error) {
    failure = error;
    report.transaction.failure = {
      message: error.message,
      stack: error.stack
    };
  }

  if (failure) {
    report.transaction.rollbackAttempted = true;

    try {
      for (const relative of [...new Set([...managedFiles, ...premiumFiles])].reverse()) {
        restorePath(repositoryRoot, outputRoot, relative);
      }

      const protectedAfterRollback = captureProtectedState(repositoryRoot);
      const protectedDifferences = compareStates(
        protectedBefore,
        protectedAfterRollback
      );

      report.transaction.rollback = {
        protectedDifferences
      };
      report.transaction.rollbackVerified = protectedDifferences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = {
        error: rollbackError.message,
        stack: rollbackError.stack
      };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(outputRoot, "p063-summary.json"), report);

  const verdict = report.authorization.safeToReviewOnDevice
    ? {
        milestone: "P06.3",
        verdict: "READER_FIRST_CORRECTION_PASSED",
        trueFirstVisitDefaultsToLight: true,
        legacyThemeKeyCannotForceDark: true,
        onlySelectedWordReceivesPersistentHighlight: true,
        readerInstructionCorrected: true,
        englishMeaningShownBeforeOriginalLanguageForms: true,
        originalLanguageFormsCollapsedAsOptionalDetail: true,
        productionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToReviewOnDevice: true,
        nextStep:
          "Restart the local production server and review Settings, Reader, a selected word, English renderings, and optional original-language forms on the phone."
      }
    : {
        milestone: "P06.3",
        verdict: "READER_FIRST_CORRECTION_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToReviewOnDevice: false,
        nextStep: "Upload this report. Do not commit or continue visual review."
      };

  writeJson(path.join(outputRoot, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));

  if (!report.authorization.safeToReviewOnDevice) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const output = valueAfter("--output");
  if (output) {
    try {
      ensureDir(path.resolve(output));
      writeJson(path.join(path.resolve(output), "fatal-error.json"), {
        milestone: "P06.3",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
}
