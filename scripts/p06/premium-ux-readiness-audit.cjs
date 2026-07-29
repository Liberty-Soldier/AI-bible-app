#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function valueAfter(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
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

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf8");
}

function walkFiles(root, options = {}) {
  const ignore = new Set(
    options.ignore || [
      ".git",
      ".next",
      "node_modules",
      ".vercel",
      "coverage",
      "dist",
      "build",
      ".private"
    ]
  );

  const result = [];
  if (!fs.existsSync(root)) return result;

  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) result.push(full);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function uniqueMatches(text, regex, normalize = value => value) {
  const values = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    values.add(normalize(match[1] ?? match[0]));
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return [...values].sort();
}

function safeReadText(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 5 * 1024 * 1024) return null;
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function findOccurrences(text, regex, limit = 100) {
  const results = [];
  let match;

  while ((match = regex.exec(text)) !== null && results.length < limit) {
    results.push({
      line: lineNumberAt(text, match.index),
      excerpt: match[0].replace(/\s+/g, " ").slice(0, 240)
    });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }

  return results;
}

function routeFromPagePath(relative) {
  const normalized = normalizeSlashes(relative);
  if (!normalized.startsWith("app/") || !/\/page\.(tsx|ts|jsx|js)$/.test(normalized)) {
    return null;
  }

  let route = normalized
    .replace(/^app/, "")
    .replace(/\/page\.(tsx|ts|jsx|js)$/, "")
    .replace(/\/\([^/]+\)/g, "");

  if (!route) route = "/";
  return route;
}

function classifyFile(relative) {
  const lower = relative.toLowerCase();
  if (/globals?\.css$/.test(lower) || lower.endsWith(".css")) return "style";
  if (/\/layout\.(tsx|ts|jsx|js)$/.test(lower)) return "layout";
  if (/\/page\.(tsx|ts|jsx|js)$/.test(lower)) return "page";
  if (/reader|verse|scripture/.test(lower)) return "reader";
  if (/word-study|wordstudy|lexicon|strong|evidence|bottom-sheet|bottomsheet|sheet/.test(lower)) return "word-study";
  if (/nav|header|footer|tabs|menu|drawer/.test(lower)) return "navigation";
  if (/loading|skeleton|error|empty|locked|upgrade|paywall/.test(lower)) return "state";
  return "other";
}

function analyzeMarkup(relative, text) {
  const issues = [];

  const clickableDivs = findOccurrences(
    text,
    /<(div|span)\b[^>]*\bonClick\s*=\s*\{[^>]*>/g,
    50
  );
  for (const item of clickableDivs) {
    issues.push({
      severity: "medium",
      rule: "clickable-nonsemantic-element",
      file: relative,
      ...item
    });
  }

  const images = findOccurrences(text, /<img\b[^>]*>/g, 50);
  for (const item of images) {
    if (!/\balt\s*=/.test(item.excerpt)) {
      issues.push({
        severity: "medium",
        rule: "image-missing-alt",
        file: relative,
        ...item
      });
    }
  }

  const iconOnlyButtons = findOccurrences(
    text,
    /<button\b(?![^>]*aria-label)[^>]*>\s*(?:<[^>]+>\s*){1,4}<\/button>/g,
    50
  );
  for (const item of iconOnlyButtons) {
    issues.push({
      severity: "medium",
      rule: "possible-icon-only-button-without-aria-label",
      file: relative,
      ...item
    });
  }

  const hardcodedStyles = findOccurrences(text, /\bstyle\s*=\s*\{\{/g, 50);
  for (const item of hardcodedStyles) {
    issues.push({
      severity: "low",
      rule: "inline-style-object",
      file: relative,
      ...item
    });
  }

  const autofocus = findOccurrences(text, /\bautoFocus\b/g, 20);
  for (const item of autofocus) {
    issues.push({
      severity: "low",
      rule: "autofocus-review",
      file: relative,
      ...item
    });
  }

  return issues;
}

function analyzeStyles(relative, text) {
  return {
    file: relative,
    bytes: Buffer.byteLength(text, "utf8"),
    cssVariables: uniqueMatches(text, /(--[a-zA-Z0-9-_]+)\s*:/g),
    hexColors: uniqueMatches(text, /(#[0-9a-fA-F]{3,8})\b/g, value => value.toLowerCase()),
    rgbColors: uniqueMatches(text, /((?:rgb|rgba|hsl|hsla)\([^)]+\))/g),
    fontFamilies: uniqueMatches(text, /font-family\s*:\s*([^;}\n]+)/g, value => value.trim()),
    fontSizes: uniqueMatches(text, /font-size\s*:\s*([^;}\n]+)/g, value => value.trim()),
    lineHeights: uniqueMatches(text, /line-height\s*:\s*([^;}\n]+)/g, value => value.trim()),
    borderRadii: uniqueMatches(text, /border-radius\s*:\s*([^;}\n]+)/g, value => value.trim()),
    shadows: uniqueMatches(text, /box-shadow\s*:\s*([^;}\n]+)/g, value => value.trim()),
    transitions: uniqueMatches(text, /transition(?:-property)?\s*:\s*([^;}\n]+)/g, value => value.trim()),
    zIndexes: uniqueMatches(text, /z-index\s*:\s*([^;}\n]+)/g, value => value.trim()),
    mediaQueries: uniqueMatches(text, /(@media[^{]+)/g, value => value.trim())
  };
}

function copySnapshot(repositoryRoot, outputRoot, relative) {
  const source = path.join(repositoryRoot, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return null;

  const target = path.join(outputRoot, "source-snapshots", relative);
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);

  return {
    source: relative,
    snapshot: relativePath(outputRoot, target),
    sha256: sha256File(source),
    bytes: fs.statSync(source).size
  };
}

function parsePackage(repositoryRoot) {
  const packagePath = path.join(repositoryRoot, "package.json");
  if (!fs.existsSync(packagePath)) return null;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return {
      name: packageJson.name || null,
      version: packageJson.version || null,
      scripts: packageJson.scripts || {},
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {}
    };
  } catch (error) {
    return { parseError: error.message };
  }
}

function parseDomFile(file) {
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, "utf8");

  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  return {
    bytes: Buffer.byteLength(html, "utf8"),
    title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || null,
    h1Count: countMatches(html, /<h1\b/gi),
    h2Count: countMatches(html, /<h2\b/gi),
    buttonCount: countMatches(html, /<button\b/gi),
    linkCount: countMatches(html, /<a\b/gi),
    inputCount: countMatches(html, /<input\b/gi),
    dialogCount: countMatches(html, /\brole=["']dialog["']/gi),
    ariaLabelCount: countMatches(html, /\baria-label=/gi),
    disabledCount: countMatches(html, /\bdisabled(?:=|\s|>)/gi),
    visibleTextPreview: textContent.slice(0, 1500)
  };
}

function generateMarkdown(report) {
  const lines = [];
  lines.push("# EMETSEES P06.1 Premium UX Readiness Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Audit status");
  lines.push("");
  lines.push(`- Production build: **${report.runtime.buildPassed ? "PASS" : "FAIL"}**`);
  lines.push(`- Local server reached: **${report.runtime.serverReached ? "YES" : "NO"}**`);
  lines.push(`- Browser screenshots captured: **${report.runtime.screenshotCount}**`);
  lines.push(`- Source files scanned: **${report.source.filesScanned}**`);
  lines.push(`- Routes found: **${report.source.routes.length}**`);
  lines.push(`- Heuristic accessibility issues: **${report.source.accessibilityIssues.length}**`);
  lines.push("");
  lines.push("## Product-facing routes");
  lines.push("");
  for (const route of report.source.routes) {
    lines.push(`- \`${route.route}\` — \`${route.file}\``);
  }
  lines.push("");
  lines.push("## Visual evidence");
  lines.push("");
  if (report.runtime.captures.length === 0) {
    lines.push("No screenshots were captured. Review the browser/server logs.");
  } else {
    for (const capture of report.runtime.captures) {
      lines.push(
        `- ${capture.name}: ${capture.status} — desktop=${capture.desktopScreenshot || "none"}, mobile=${capture.mobileScreenshot || "none"}`
      );
    }
  }
  lines.push("");
  lines.push("## Source signals requiring review");
  lines.push("");
  const signalRows = Object.entries(report.source.signals);
  for (const [key, value] of signalRows) {
    lines.push(`- ${key}: **${value.total}** occurrence(s) across ${value.files.length} file(s)`);
  }
  lines.push("");
  lines.push("## Automated accessibility heuristics");
  lines.push("");
  if (report.source.accessibilityIssues.length === 0) {
    lines.push("No issues were found by the limited static heuristics.");
  } else {
    for (const issue of report.source.accessibilityIssues.slice(0, 100)) {
      lines.push(
        `- **${issue.severity}** \`${issue.rule}\` — \`${issue.file}:${issue.line}\` — ${issue.excerpt}`
      );
    }
  }
  lines.push("");
  lines.push("## Style-system inventory");
  lines.push("");
  lines.push(`- Style files: ${report.source.styleFiles.length}`);
  lines.push(`- Unique hexadecimal colors: ${report.source.styleTotals.hexColors.length}`);
  lines.push(`- Unique CSS variables: ${report.source.styleTotals.cssVariables.length}`);
  lines.push(`- Unique font sizes: ${report.source.styleTotals.fontSizes.length}`);
  lines.push(`- Unique border radii: ${report.source.styleTotals.borderRadii.length}`);
  lines.push(`- Unique shadows: ${report.source.styleTotals.shadows.length}`);
  lines.push("");
  lines.push("## Next review");
  lines.push("");
  lines.push(
    "Upload the complete report ZIP. The visual screenshots, DOM captures, source snapshots, style inventory, and build logs will be used to create one prioritized premium-UX implementation plan."
  );
  lines.push("");

  return lines.join("\n");
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const files = walkFiles(repositoryRoot);
  const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".mdx"]);
  const scanned = files.filter(file => sourceExtensions.has(path.extname(file).toLowerCase()));

  const routeRows = [];
  const classifications = {};
  const styleRows = [];
  const accessibilityIssues = [];
  const keyFiles = [];
  const signalDefinitions = {
    todoFixme: /\b(?:TODO|FIXME|HACK|XXX)\b/gi,
    consoleLogging: /\bconsole\.(?:log|warn|error|debug)\s*\(/g,
    placeholderLanguage: /\bplaceholder\b/gi,
    legacyBibleIqBranding: /\bBibleIQ\b/g,
    insufficientEvidence: /\binsufficient-evidence\b/gi,
    evidenceReadyCopy: /\bEvidence-ready explanation\b/gi,
    loadingCopy: /\bloading\b/gi,
    upgradeCopy: /\bupgrade\b/gi,
    paidCopy: /\bpaid\b/gi
  };
  const signals = Object.fromEntries(
    Object.keys(signalDefinitions).map(key => [key, { total: 0, files: [] }])
  );

  const extensionCounts = {};
  const scannedRows = [];

  for (const file of scanned) {
    const relative = relativePath(repositoryRoot, file);
    const extension = path.extname(file).toLowerCase();
    extensionCounts[extension] = (extensionCounts[extension] || 0) + 1;

    const text = safeReadText(file);
    if (text === null) continue;

    const classification = classifyFile(relative);
    classifications[classification] = (classifications[classification] || 0) + 1;

    const route = routeFromPagePath(relative);
    if (route) routeRows.push({ route, file: relative });

    if (classification !== "other") keyFiles.push(relative);

    if ([".tsx", ".jsx"].includes(extension)) {
      accessibilityIssues.push(...analyzeMarkup(relative, text));
    }

    if ([".css", ".scss"].includes(extension)) {
      styleRows.push(analyzeStyles(relative, text));
    }

    for (const [key, regex] of Object.entries(signalDefinitions)) {
      regex.lastIndex = 0;
      const count = countMatches(text, regex);
      if (count > 0) {
        signals[key].total += count;
        signals[key].files.push({ file: relative, count });
      }
    }

    scannedRows.push({
      file: relative,
      classification,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256File(file),
      lines: text.split(/\r?\n/).length
    });
  }

  routeRows.sort((a, b) => a.route.localeCompare(b.route));
  keyFiles.sort();

  const styleTotals = {
    cssVariables: [...new Set(styleRows.flatMap(row => row.cssVariables))].sort(),
    hexColors: [...new Set(styleRows.flatMap(row => row.hexColors))].sort(),
    rgbColors: [...new Set(styleRows.flatMap(row => row.rgbColors))].sort(),
    fontFamilies: [...new Set(styleRows.flatMap(row => row.fontFamilies))].sort(),
    fontSizes: [...new Set(styleRows.flatMap(row => row.fontSizes))].sort(),
    lineHeights: [...new Set(styleRows.flatMap(row => row.lineHeights))].sort(),
    borderRadii: [...new Set(styleRows.flatMap(row => row.borderRadii))].sort(),
    shadows: [...new Set(styleRows.flatMap(row => row.shadows))].sort(),
    transitions: [...new Set(styleRows.flatMap(row => row.transitions))].sort(),
    zIndexes: [...new Set(styleRows.flatMap(row => row.zIndexes))].sort()
  };

  const snapshotCandidates = [...new Set([
    "app/layout.tsx",
    "app/globals.css",
    "app/page.tsx",
    "app/read/[book]/[chapter]/page.tsx",
    "app/data/types.ts",
    ...keyFiles.filter(relative =>
      /(reader|verse|word-study|wordstudy|bottom-sheet|bottomsheet|header|navigation|navbar|tabs|settings|library)/i.test(relative)
    ).slice(0, 80)
  ])];

  const snapshots = snapshotCandidates
    .map(relative => copySnapshot(repositoryRoot, outputRoot, relative))
    .filter(Boolean);

  const runtimeRoot = path.join(outputRoot, "runtime");
  const domRoot = path.join(runtimeRoot, "dom");
  const screenshotRoot = path.join(runtimeRoot, "screenshots");
  ensureDir(domRoot);
  ensureDir(screenshotRoot);

  const captureManifestPath = path.join(runtimeRoot, "capture-manifest.json");
  const captureManifest = fs.existsSync(captureManifestPath)
    ? readJsonSafe(captureManifestPath)
    : { captures: [] };

  const captures = Array.isArray(captureManifest?.captures)
    ? captureManifest.captures.map(capture => ({
        ...capture,
        domAnalysis: capture.domFile
          ? parseDomFile(path.join(outputRoot, capture.domFile))
          : null
      }))
    : [];

  const buildResultPath = path.join(runtimeRoot, "build-result.json");
  const serverResultPath = path.join(runtimeRoot, "server-result.json");

  const buildResult = fs.existsSync(buildResultPath)
    ? readJsonSafe(buildResultPath)
    : { passed: false, status: null, missing: true };

  const serverResult = fs.existsSync(serverResultPath)
    ? readJsonSafe(serverResultPath)
    : { reached: false, missing: true };

  const report = {
    milestone: "P06.1",
    purpose: "PREMIUM UX READINESS AUDIT",
    generatedAt: new Date().toISOString(),
    repository: {
      root: repositoryRoot
    },
    package: parsePackage(repositoryRoot),
    runtime: {
      buildPassed: buildResult?.passed === true,
      buildResult,
      serverReached: serverResult?.reached === true,
      serverResult,
      browser: captureManifest?.browser || null,
      captures,
      screenshotCount: captures.reduce(
        (total, capture) =>
          total +
          (capture.desktopScreenshot ? 1 : 0) +
          (capture.mobileScreenshot ? 1 : 0),
        0
      )
    },
    source: {
      filesScanned: scannedRows.length,
      extensionCounts,
      classifications,
      routes: routeRows,
      keyFiles,
      scannedFiles: scannedRows,
      signals,
      accessibilityIssues,
      styleFiles: styleRows,
      styleTotals,
      snapshots
    },
    limitations: [
      "Static accessibility findings are heuristics and are not a substitute for keyboard and screen-reader testing.",
      "Screenshots show visual state but not animation quality, gestures, perceived latency, or the complete word-tap interaction.",
      "The audit does not modify source code, Scripture data, canonical data, alignments, or production runtime."
    ]
  };

  writeJson(path.join(outputRoot, "p061-premium-ux-audit.json"), report);
  writeText(
    path.join(outputRoot, "P061-PREMIUM-UX-AUDIT.md"),
    generateMarkdown(report)
  );

  console.log(JSON.stringify({
    milestone: "P06.1",
    filesScanned: scannedRows.length,
    routes: routeRows.length,
    buildPassed: report.runtime.buildPassed,
    serverReached: report.runtime.serverReached,
    screenshotCount: report.runtime.screenshotCount,
    accessibilityIssues: accessibilityIssues.length
  }, null, 2));
}

function readJsonSafe(file) {
  try {
    return readJson(file);
  } catch (error) {
    return {
      parseError: error.message,
      path: normalizeSlashes(file)
    };
  }
}

try {
  main();
} catch (error) {
  const output = valueAfter("--output");
  if (output) {
    try {
      ensureDir(path.resolve(output));
      writeJson(path.join(path.resolve(output), "audit-fatal-error.json"), {
        milestone: "P06.1",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
}
