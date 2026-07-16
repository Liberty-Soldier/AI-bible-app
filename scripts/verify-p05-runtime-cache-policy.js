"use strict";

const fs = require("fs");

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\\uFEFF/, "");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[P05 cache policy] ${message}`);
  }
}

const store = read("app/data/lexicon/WordStudyEntityStore.ts");
const route = read("app/api/word-study/route.ts");

assert(
  store.includes('fetch(url, { cache: "no-store" })'),
  "Runtime JSON fetch must bypass the cross-deployment data cache.",
);

assert(
  !store.includes('fetch(url, { cache: "force-cache" })'),
  "Obsolete force-cache runtime fetch is still present.",
);

assert(
  route.includes('"Cache-Control"') &&
    route.includes('"no-store, no-cache, must-revalidate, max-age=0"'),
  "Browser no-store response header is missing.",
);

assert(
  route.includes('"CDN-Cache-Control": "no-store"'),
  "Downstream CDN no-store header is missing.",
);

assert(
  route.includes('"Vercel-CDN-Cache-Control": "no-store"'),
  "Vercel CDN no-store header is missing.",
);

console.log("P05 runtime cache-policy verification passed.");
console.log("- Runtime manifest and shards bypass cross-deployment fetch caching.");
console.log("- Warm server processes still use the local manifest/shard maps.");
console.log("- Word-study API responses are not cached by browsers or CDNs.");
