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

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
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
  const byPath = new Map(after.map(row => [row.path, row]));
  const differences = [];

  for (const left of before) {
    const right = byPath.get(left.path);
    if (!right || JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push({ before: left, after: right || null });
    }
  }

  return differences;
}

function replaceRequired(text, oldValue, newValue, label) {
  const occurrences = text.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `[P06.2] Expected one occurrence of ${label}; found ${occurrences}.`
    );
  }
  return text.replace(oldValue, newValue);
}

function replaceOptional(text, oldValue, newValue) {
  return text.includes(oldValue) ? text.replace(oldValue, newValue) : text;
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
    throw new Error(`[P06.2] Missing rollback evidence for ${relative}.`);
  }
}

function copyAsset(packageAssets, repositoryRoot, sourceName, destinationRelative) {
  const source = path.join(packageAssets, sourceName);
  const destination = path.join(repositoryRoot, destinationRelative);

  if (!fs.existsSync(source)) {
    throw new Error(`[P06.2] Missing package asset ${sourceName}.`);
  }

  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function patchLayout(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/layout.tsx");
  let text = fs.readFileSync(file, "utf8");

  text = text.replace(
    /^import GlobalAskButton from "@\/app\/components\/GlobalAskButton";\r?\n/m,
    ""
  );
  text = text.replace(/\s*<GlobalAskButton \/>\r?\n/, "\n");

  if (!text.includes('manifest: "/manifest.webmanifest"')) {
    text = replaceRequired(
      text,
      '  applicationName: "EMETSEES",\n',
      '  applicationName: "EMETSEES",\n' +
        '  manifest: "/manifest.webmanifest",\n' +
        '  icons: {\n' +
        '    icon: [\n' +
        '      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },\n' +
        '      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },\n' +
        '    ],\n' +
        '    apple: "/icons/apple-touch-icon.png",\n' +
        '    shortcut: "/favicon.ico",\n' +
        '  },\n',
      "layout metadata applicationName"
    );
  }

  fs.writeFileSync(file, text, "utf8");
}

function writeThemeProvider(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/ThemeProvider.tsx");
  const source = `"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
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
const LEGACY_STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function readStoredTheme(): Theme {
  const stored =
    localStorage.getItem(PRIMARY_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_STORAGE_KEY);

  return stored === "dark" ? "dark" : "light";
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("light");

  useLayoutEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (
        event.key !== PRIMARY_STORAGE_KEY &&
        event.key !== LEGACY_STORAGE_KEY
      ) {
        return;
      }

      const next = event.newValue === "dark" ? "dark" : "light";
      setThemeState(next);
      applyTheme(next);
    }

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem(PRIMARY_STORAGE_KEY, next);
    localStorage.setItem(LEGACY_STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

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

  ensureDir(path.dirname(file));
  fs.writeFileSync(file, source, "utf8");
}

function writeBrandComponents(repositoryRoot) {
  const directory = path.join(repositoryRoot, "app/components/branding");
  ensureDir(directory);

  const logo = `"use client";

type LogoVariant = "auto" | "gold" | "black" | "white";

export default function EmetseesLogo({
  size = 36,
  className = "",
  variant = "auto",
  priority = false,
}: {
  size?: number;
  className?: string;
  variant?: LogoVariant;
  priority?: boolean;
}) {
  const dimensions = { width: size, height: size };

  if (variant !== "auto") {
    return (
      <img
        src={\`/brand/emetsees-mark-\${variant}.png\`}
        alt=""
        aria-hidden="true"
        decoding={priority ? "sync" : "async"}
        className={\`block object-contain \${className}\`}
        style={dimensions}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={\`relative inline-flex shrink-0 \${className}\`}
      style={dimensions}
    >
      <img
        src="/brand/emetsees-mark-black.png"
        alt=""
        className="emetsees-logo-light absolute inset-0 h-full w-full object-contain"
      />
      <img
        src="/brand/emetsees-mark-white.png"
        alt=""
        className="emetsees-logo-dark absolute inset-0 h-full w-full object-contain"
      />
    </span>
  );
}
`;

  const wordmark = `import EmetseesLogo from "@/app/components/branding/EmetseesLogo";

export default function EmetseesWordmark({
  compact = false,
  showDescriptor = false,
  className = "",
}: {
  compact?: boolean;
  showDescriptor?: boolean;
  className?: string;
}) {
  const logoSize = compact ? 30 : 48;

  return (
    <div
      className={\`inline-flex items-center \${compact ? "gap-2.5" : "gap-3.5"} \${className}\`}
    >
      <span className={\`rounded-2xl bg-[var(--brand-soft)] \${compact ? "p-1.5" : "p-2.5"}\`}>
        <EmetseesLogo size={logoSize} variant="gold" priority />
      </span>

      <span className="min-w-0 text-left">
        <span
          className={\`block font-black tracking-[0.11em] text-[var(--foreground)] \${compact ? "text-sm" : "text-2xl sm:text-[1.7rem]"}\`}
        >
          EMETSEES
        </span>
        {showDescriptor ? (
          <span className="mt-1 block text-sm font-semibold text-[var(--muted)]">
            Scripture-first Bible study
          </span>
        ) : null}
      </span>
    </div>
  );
}
`;

  fs.writeFileSync(path.join(directory, "EmetseesLogo.tsx"), logo, "utf8");
  fs.writeFileSync(path.join(directory, "EmetseesWordmark.tsx"), wordmark, "utf8");
}

function writeMobileBottomNav(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/MobileBottomNav.tsx");
  const source = `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
import { usePremiumAccess } from "@/app/components/premium/PremiumAccessProvider";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

function Icon({
  name,
}: {
  name: "home" | "read" | "library" | "settings";
}) {
  const paths = {
    home: (
      <>
        <path d="M3 10.8 12 3l9 7.8" />
        <path d="M5.5 9.5V21h13V9.5" />
      </>
    ),
    read: (
      <>
        <path d="M4 5.5c2.7-.8 5.4-.3 8 1.5v14c-2.6-1.8-5.3-2.3-8-1.5z" />
        <path d="M20 5.5c-2.7-.8-5.4-.3-8 1.5v14c2.6-1.8 5.3-2.3 8-1.5z" />
      </>
    ),
    library: (
      <>
        <path d="M4 4h4v16H4z" />
        <path d="M10 4h4v16h-4z" />
        <path d="m16 5 4-1 2.5 15-4 1z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function MobileBottomNav({
  autoHide = false,
}: {
  autoHide?: boolean;
}) {
  const pathname = usePathname();
  const visible = useReaderChromeVisibility();
  const { requestUpgrade } = usePremiumAccess();
  const shouldShow = !autoHide || visible;

  const items = [
    { href: "/", label: "Home", icon: "home" as const },
    { href: "/read", label: "Read", icon: "read" as const },
    { href: "/library", label: "Library", icon: "library" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

  function activeFor(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary navigation"
      className={\`premium-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/96 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl transition-transform duration-200 \${shouldShow ? "translate-y-0" : "translate-y-full"}\`}
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-end">
        <Link
          href={items[0].href}
          className={\`premium-nav-item \${activeFor(items[0].href) ? "is-active" : ""}\`}
        >
          <Icon name={items[0].icon} />
          <span>{items[0].label}</span>
        </Link>

        <Link
          href={items[1].href}
          className={\`premium-nav-item \${activeFor(items[1].href) ? "is-active" : ""}\`}
        >
          <Icon name={items[1].icon} />
          <span>{items[1].label}</span>
        </Link>

        <button
          type="button"
          aria-label="Ask EMET"
          onClick={() =>
            requestUpgrade("ask-emet", "Opened from primary navigation")
          }
          className="premium-ask-nav"
        >
          <span className="premium-ask-nav-mark">
            <EmetseesLogo size={28} variant="gold" />
          </span>
          <span>Ask</span>
        </button>

        <Link
          href={items[2].href}
          className={\`premium-nav-item \${activeFor(items[2].href) ? "is-active" : ""}\`}
        >
          <Icon name={items[2].icon} />
          <span>{items[2].label}</span>
        </Link>

        <Link
          href={items[3].href}
          className={\`premium-nav-item \${activeFor(items[3].href) ? "is-active" : ""}\`}
        >
          <Icon name={items[3].icon} />
          <span>{items[3].label}</span>
        </Link>
      </div>
    </nav>
  );
}
`;

  fs.writeFileSync(file, source, "utf8");
}

function writeGlobalStyles(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/globals.css");
  const source = `@import "tailwindcss";

:root {
  --background: #fffdf9;
  --surface: #f7f4ed;
  --surface-soft: #efeae0;
  --foreground: #111214;
  --muted: #66635f;
  --border: #e5dfd4;
  --accent: #141416;
  --accent-text: #ffffff;
  --brand: #c78a13;
  --brand-strong: #a76a05;
  --brand-soft: #fff3d6;
  --shadow-sm: 0 8px 24px rgba(25, 20, 12, 0.06);
  --shadow-md: 0 18px 50px rgba(25, 20, 12, 0.12);
}

:root[data-theme="dark"] {
  --background: #08090a;
  --surface: #121315;
  --surface-soft: #1b1c1f;
  --foreground: #f6f4ef;
  --muted: #aaa59c;
  --border: #2b2c2f;
  --accent: #f7f4ed;
  --accent-text: #0b0b0c;
  --brand: #e0a72d;
  --brand-strong: #f0bd4a;
  --brand-soft: #2b2110;
  --shadow-sm: 0 8px 24px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 18px 50px rgba(0, 0, 0, 0.4);
}

:root[data-theme="light"] {
  --background: #fffdf9;
  --surface: #f7f4ed;
  --surface-soft: #efeae0;
  --foreground: #111214;
  --muted: #66635f;
  --border: #e5dfd4;
  --accent: #141416;
  --accent-text: #ffffff;
  --brand: #c78a13;
  --brand-strong: #a76a05;
  --brand-soft: #fff3d6;
  --shadow-sm: 0 8px 24px rgba(25, 20, 12, 0.06);
  --shadow-md: 0 18px 50px rgba(25, 20, 12, 0.12);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--background);
  color: var(--foreground);
  text-rendering: optimizeLegibility;
}

body {
  min-height: 100%;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  letter-spacing: -0.008em;
}

button,
a,
input,
textarea,
select {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

::selection {
  background: color-mix(in srgb, var(--brand) 24%, transparent);
}

.emetsees-logo-dark {
  display: none;
}

:root[data-theme="dark"] .emetsees-logo-light {
  display: none;
}

:root[data-theme="dark"] .emetsees-logo-dark {
  display: block;
}

.premium-bottom-nav {
  box-shadow: 0 -10px 30px rgba(20, 17, 11, 0.055);
}

.premium-nav-item {
  display: flex;
  min-height: 3.65rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  border-radius: 0.9rem;
  color: var(--muted);
  font-size: 0.69rem;
  font-weight: 650;
  transition:
    color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}

.premium-nav-item:active {
  transform: scale(0.97);
}

.premium-nav-item.is-active {
  color: var(--foreground);
}

.premium-nav-item.is-active svg {
  color: var(--brand);
}

.premium-ask-nav {
  display: flex;
  min-height: 3.65rem;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.1rem;
  color: var(--foreground);
  font-size: 0.69rem;
  font-weight: 750;
}

.premium-ask-nav-mark {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  margin-top: -1.1rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--brand) 45%, var(--border));
  border-radius: 999px;
  background: var(--foreground);
  box-shadow: var(--shadow-md);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}

.premium-ask-nav:active .premium-ask-nav-mark {
  transform: scale(0.95);
  box-shadow: var(--shadow-sm);
}

[data-word-token="true"] {
  text-decoration: none !important;
  cursor: pointer;
}

[data-word-token="true"]:hover {
  background: color-mix(in srgb, var(--brand) 9%, transparent);
}

[data-word-token="true"]:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand) 55%, transparent);
  outline-offset: 0.12em;
}

[data-word-token="true"][class*="bg-amber"] {
  background: color-mix(in srgb, var(--brand) 16%, transparent) !important;
  box-shadow: inset 0 -0.08em 0 color-mix(in srgb, var(--brand) 50%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

  fs.writeFileSync(file, source, "utf8");
}

function patchHome(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/page.tsx");
  let text = fs.readFileSync(file, "utf8");

  text = replaceOptional(
    text,
    'className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]"',
    'className="min-h-screen bg-[var(--background)] px-5 pb-28 pt-6 text-[var(--foreground)]"'
  );
  text = replaceOptional(
    text,
    'className="mb-8 flex flex-col items-center pt-8 text-center"',
    'className="mb-7 flex flex-col items-center pt-4 text-center"'
  );
  text = replaceOptional(
    text,
    'placeholder="Ask EMET... (paid)"',
    'placeholder="Ask a question about Scripture"'
  );
  text = replaceOptional(
    text,
    'className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3"',
    'className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 shadow-[var(--shadow-sm)]"'
  );
  text = replaceOptional(
    text,
    'className="ml-3 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)]"',
    'className="ml-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-text)] transition active:scale-[0.98]"'
  );
  text = replaceOptional(
    text,
    'className="mt-8 block rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5"',
    'className="mt-8 block rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition active:scale-[0.995]"'
  );
  text = text.replace(
    /className="rounded-2xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\] p-4 text-center"/g,
    'className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-[var(--shadow-sm)] transition active:scale-[0.98]"'
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchReader(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "app/read/[book]/[chapter]/page.tsx"
  );
  let text = fs.readFileSync(file, "utf8");

  text = replaceOptional(
    text,
    "Tap an underlined word for its source-based explanation.\n                Tap a verse number for highlights, notes, bookmarks,\n                copy, and share.",
    "Tap a word to inspect its source evidence. Tap a verse number\n                for highlights, notes, bookmarks, copy, and share."
  );
  text = replaceOptional(text, 'className="mb-10"', 'className="mb-8"');

  fs.writeFileSync(file, text, "utf8");
}

function patchWordStudy(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/components/WordStudySheet.tsx");
  let text = fs.readFileSync(file, "utf8");

  const replacements = [
    [
      'snap === "expanded" ? "h-[92dvh]" : "h-[78dvh]"',
      'snap === "expanded" ? "h-[92dvh]" : "h-[74dvh]"'
    ],
    [
      'className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4"',
      'className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-3"'
    ],
    [
      'className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--border)]"',
      'className="mx-auto mb-3 block h-1.5 w-11 rounded-full bg-[var(--border)]"'
    ],
    [
      'className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-24"',
      'className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-20"'
    ],
    [
      'className="mt-2 break-words text-[2.35rem] font-bold leading-[1.02] tracking-[-0.045em]"',
      'className="mt-2 break-words text-[2.05rem] font-bold leading-[1.04] tracking-[-0.04em]"'
    ],
    [
      'className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition hover:border-amber-500/35 active:scale-[0.995]"',
      'className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition hover:border-amber-500/35 active:scale-[0.995]"'
    ],
    [
      'className="rounded-[1.55rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"',
      'className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"'
    ],
    [
      'className="w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm font-black text-amber-800 dark:text-amber-200"',
      'className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200"'
    ],
  ];

  for (const [oldValue, newValue] of replacements) {
    text = replaceOptional(text, oldValue, newValue);
  }

  text = replaceOptional(
    text,
    `              Back to reading
`,
    `              Done
`
  );

  const oldGlosses = `              <div className="mt-2 flex flex-wrap gap-2">
                {definitions.slice(1, 7).map((definition) => (
                  <span
                    key={definition}
                    className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-sm font-semibold"
                  >
                    {definition}
                  </span>
                ))}
              </div>`;

  const newGlosses = `              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[var(--muted)]">
                {definitions.slice(1, 7).map((definition) => (
                  <li key={definition} className="flex gap-2">
                    <span aria-hidden="true" className="text-[var(--brand)]">•</span>
                    <span>{definition}</span>
                  </li>
                ))}
              </ul>`;

  text = replaceOptional(text, oldGlosses, newGlosses);
  fs.writeFileSync(file, text, "utf8");
}

function patchPremiumCopy(repositoryRoot) {
  const roots = [
    path.join(repositoryRoot, "app/components/premium"),
    path.join(repositoryRoot, "app/ask")
  ];

  const replacements = [
    [
      "Paid plans are coming in P06.",
      "Ask EMET is coming soon."
    ],
    [
      "This lock is the final entitlement boundary.",
      "Ask contextual questions about a verse or word and follow the Scriptural evidence."
    ],
    [
      "Paid plans are coming soon in P06.",
      "Ask EMET is coming soon."
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

function writeManifest(repositoryRoot) {
  const manifest = {
    name: "EMETSEES",
    short_name: "EMETSEES",
    description:
      "Read Scripture, inspect source-word evidence, and follow Scripture-grounded explanations.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#fffdf9",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };

  const file = path.join(repositoryRoot, "public/manifest.webmanifest");
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const apply = hasFlag("--apply");
  const packageAssets = path.join(
    repositoryRoot,
    "scripts",
    "p06",
    "assets"
  );

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P06.2",
    purpose: "PREMIUM UX FOUNDATION AND BRAND INTEGRATION",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedApplication: apply,
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    changedFiles: [],
    premiumCopyFiles: [],
    protectedState: {},
    build: {},
    authorization: {
      premiumFoundationApplied: false,
      safeToReviewOnDevice: false
    }
  };

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);
  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(
      `[P06.2] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`
    );
  }

  const requiredFiles = [
    "app/layout.tsx",
    "app/globals.css",
    "app/page.tsx",
    "app/read/[book]/[chapter]/page.tsx",
    "app/components/ThemeProvider.tsx",
    "app/components/MobileBottomNav.tsx",
    "app/components/WordStudySheet.tsx",
    "app/components/premium/PremiumAccessProvider.tsx",
    "app/components/useReaderChromeVisibility.ts"
  ];

  for (const relative of requiredFiles) {
    const absolute = path.join(repositoryRoot, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`[P06.2] Missing required file ${relative}.`);
    }
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);
  if (npmPreflight.status !== 0) {
    throw new Error("[P06.2] npm launcher preflight failed.");
  }

  const protectedBefore = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), protectedBefore);

  const managedPaths = [
    "app/layout.tsx",
    "app/globals.css",
    "app/page.tsx",
    "app/read/[book]/[chapter]/page.tsx",
    "app/components/ThemeProvider.tsx",
    "app/components/MobileBottomNav.tsx",
    "app/components/WordStudySheet.tsx",
    "app/components/branding/EmetseesLogo.tsx",
    "app/components/branding/EmetseesWordmark.tsx",
    "public/brand",
    "public/icons",
    "public/manifest.webmanifest",
    "public/favicon.ico",
    "app/icon.png",
    "app/apple-icon.png"
  ];

  const premiumFiles = walkFiles(path.join(repositoryRoot, "app/components/premium"))
    .filter(file => /\.(tsx|ts|jsx|js)$/.test(file))
    .map(file => relativePath(repositoryRoot, file));

  for (const relative of [...new Set([...managedPaths, ...premiumFiles])]) {
    backupPath(repositoryRoot, outputRoot, relative);
  }

  if (!apply) {
    writeJson(path.join(outputRoot, "p062-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P06.2",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToReviewOnDevice: false,
      nextStep: "Rerun with -Apply."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    patchLayout(repositoryRoot);
    writeThemeProvider(repositoryRoot);
    writeBrandComponents(repositoryRoot);
    writeMobileBottomNav(repositoryRoot);
    writeGlobalStyles(repositoryRoot);
    patchHome(repositoryRoot);
    patchReader(repositoryRoot);
    patchWordStudy(repositoryRoot);
    report.premiumCopyFiles = patchPremiumCopy(repositoryRoot);
    writeManifest(repositoryRoot);

    const assetCopies = [
      ["emetsees-mark-black.png", "public/brand/emetsees-mark-black.png"],
      ["emetsees-mark-white.png", "public/brand/emetsees-mark-white.png"],
      ["emetsees-mark-gold.png", "public/brand/emetsees-mark-gold.png"],
      ["icon-192.png", "public/icons/icon-192.png"],
      ["icon-512.png", "public/icons/icon-512.png"],
      ["icon-maskable-512.png", "public/icons/icon-maskable-512.png"],
      ["apple-touch-icon.png", "public/icons/apple-touch-icon.png"],
      ["favicon.ico", "public/favicon.ico"],
      ["app-icon-512.png", "app/icon.png"],
      ["apple-touch-icon.png", "app/apple-icon.png"]
    ];

    for (const [sourceName, destination] of assetCopies) {
      copyAsset(packageAssets, repositoryRoot, sourceName, destination);
    }

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
      throw new Error("[P06.2] Production build failed.");
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
        `[P06.2] Protected Scripture state changed: ${JSON.stringify(protectedDifferences)}`
      );
    }

    const status = run("git", ["status", "--short"], repositoryRoot);
    const diff = run("git", ["diff", "--stat"], repositoryRoot);
    fs.writeFileSync(path.join(outputRoot, "git-status.txt"), status.stdout, "utf8");
    fs.writeFileSync(path.join(outputRoot, "git-diff-stat.txt"), diff.stdout, "utf8");

    report.changedFiles = [...new Set([
      ...managedPaths,
      ...report.premiumCopyFiles
    ])];
    report.authorization.premiumFoundationApplied = true;
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
      for (const relative of [...new Set([...managedPaths, ...premiumFiles])].reverse()) {
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

  writeJson(path.join(outputRoot, "p062-summary.json"), report);

  const verdict = report.authorization.safeToReviewOnDevice
    ? {
        milestone: "P06.2",
        verdict: "PREMIUM_UX_FOUNDATION_PASSED",
        lightModeDefault: true,
        globalFloatingAskRemoved: true,
        askIntegratedIntoBottomNavigation: true,
        transparentBrandAssetsInstalled: true,
        appIconsInstalled: true,
        productionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToReviewOnDevice: true,
        nextStep:
          "Review Home, Reader, Library, Settings, Ask EMET, and the word-study sheet on the actual phone. Upload screenshots or a short recording for final screen-specific polish."
      }
    : {
        milestone: "P06.2",
        verdict: "PREMIUM_UX_FOUNDATION_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToReviewOnDevice: false,
        nextStep: "Upload this report. Do not commit the failed changes."
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
        milestone: "P06.2",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
}
