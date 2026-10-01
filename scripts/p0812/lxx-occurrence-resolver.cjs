"use strict";

function normalizeGreek(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ʼ'’]/g, "")
    .replace(/ς/g, "σ")
    .toLowerCase()
    .trim();
}

function parseTaggedOccurrenceStream(stream) {
  const occurrences = [];
  const rx = /(?:^|\s)([^\s<]+)<S>(\d+)<\/S><m>(lxx\.[^<]+)<\/m>/g;

  for (const match of String(stream || "").matchAll(rx)) {
    occurrences.push({
      surface: match[1],
      normalizedSurface: normalizeGreek(match[1]),
      lexicalId: `L${match[2]}`,
      morphology: match[3],
    });
  }

  return occurrences;
}

function exactStreamResolution(sourceTokens, authoritativeOccurrences) {
  if (sourceTokens.length !== authoritativeOccurrences.length) return null;

  const exact = sourceTokens.every(
    (token, index) =>
      normalizeGreek(token.surface) ===
      authoritativeOccurrences[index].normalizedSurface,
  );

  if (!exact) return null;

  return sourceTokens.map((_, index) => ({
    authoritativeIndex: index,
    method: "exact-occurrence-stream",
  }));
}

function lcsTables(left, right) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const prefix = Array.from({ length: rows }, () =>
    new Uint16Array(columns),
  );
  const suffix = Array.from({ length: rows }, () =>
    new Uint16Array(columns),
  );

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      prefix[i][j] =
        left[i - 1] === right[j - 1]
          ? prefix[i - 1][j - 1] + 1
          : Math.max(prefix[i - 1][j], prefix[i][j - 1]);
    }
  }

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      suffix[i][j] =
        left[i] === right[j]
          ? suffix[i + 1][j + 1] + 1
          : Math.max(suffix[i + 1][j], suffix[i][j + 1]);
    }
  }

  return { prefix, suffix, length: prefix[left.length][right.length] };
}

function lcsLengthWithout(left, right, omittedLeftIndex) {
  const filtered = left.filter((_, index) => index !== omittedLeftIndex);
  let previous = new Uint16Array(right.length + 1);

  for (const value of filtered) {
    const current = new Uint16Array(right.length + 1);

    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        value === right[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }

    previous = current;
  }

  return previous[right.length];
}

function uniqueLcsResolution(sourceTokens, authoritativeOccurrences) {
  const left = sourceTokens.map((token) => normalizeGreek(token.surface));
  const right = authoritativeOccurrences.map(
    (occurrence) => occurrence.normalizedSurface,
  );
  const { prefix, suffix, length } = lcsTables(left, right);
  const resolution = sourceTokens.map(() => null);

  for (let i = 0; i < left.length; i += 1) {
    if (lcsLengthWithout(left, right, i) === length) continue;

    const candidates = [];

    for (let j = 0; j < right.length; j += 1) {
      if (left[i] !== right[j]) continue;

      if (prefix[i][j] + 1 + suffix[i + 1][j + 1] === length) {
        candidates.push(j);
      }
    }

    if (candidates.length === 1) {
      resolution[i] = {
        authoritativeIndex: candidates[0],
        method: "unique-monotonic-surface-anchor",
      };
    }
  }

  return resolution;
}

function resolveOccurrenceStream(sourceTokens, authoritativeOccurrences) {
  const exact = exactStreamResolution(sourceTokens, authoritativeOccurrences);
  if (exact) return exact;

  return uniqueLcsResolution(sourceTokens, authoritativeOccurrences);
}

module.exports = {
  normalizeGreek,
  parseTaggedOccurrenceStream,
  resolveOccurrenceStream,
};
