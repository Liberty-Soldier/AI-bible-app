const fs = require("fs");
const path = require("path");
const vm = require("vm");
const readline = require("readline");

const repo = process.argv[2];
const reportPath = process.argv[3];
const backupRoot = process.argv[4];

const TARGETS = [
  "H1665",
  "H4257",
  "H5155",
  "H516",
  "H760",
  "H7802"
];

const METADATA_TARGET = "H3390";

const ENTITY_ROOT = path.join(
  repo,
  "public",
  "data",
  "bibleiq",
  "word-study",
  "entities"
);

const HEBREW_ENTITY_ROOT = path.join(ENTITY_ROOT, "hebrew");

const WLC_BOOK_ROOT = path.join(
  repo,
  ".private",
  "scripture",
  "canonical",
  "source-graphs",
  "wlc-morpheme",
  "v2",
  "books"
);

const LEXICON_FILE = path.join(
  repo,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

const ENTITY_BUILDER = path.join(
  repo,
  "scripts",
  "build-word-study-entity-runtime.js"
);

const PERMANENT_REPAIR = path.join(
  repo,
  "scripts",
  "apply-phase1-hebrew-entity-runtime-repair.cjs"
);

const MANIFEST = path.join(
  ENTITY_ROOT,
  "manifest.json"
);

function fail(message) {
  throw new Error(message);
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function unique(values) {
  return [...new Set(
    values
      .flat()
      .filter(v => v != null)
      .map(v => String(v).trim())
      .filter(Boolean)
  )];
}

function backup(file) {
  if (!exists(file)) return null;
  if (!backupRoot) return null;

  const rel = path.relative(repo, file);
  const dst = path.join(backupRoot, rel);

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(file, dst);

  return dst;
}

function normalizeStrong(value) {
  const m = String(value || "").match(/H?(\d+)/i);
  if (!m) return null;
  return `H${Number(m[1])}`;
}

function cleanDefinition(value, strong) {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  text = text.replace(
    new RegExp(`^${strong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\s*`, "i"),
    ""
  );

  return text.trim();
}

function lexicalMeaning(entry, strong) {
  const candidates = [
    ...(Array.isArray(entry?.shortDefinitions)
      ? entry.shortDefinitions
      : []),

    entry?.shortDefinition,

    ...(Array.isArray(entry?.glosses)
      ? entry.glosses
      : []),

    entry?.gloss,

    entry?.meaning,

    entry?.usage,

    entry?.fullDefinition
  ];

  for (const candidate of candidates) {
    const clean = cleanDefinition(candidate, strong);
    if (clean) return clean;
  }

  return "";
}

function lexicalGlosses(entry, strong) {
  const values = [];

  if (Array.isArray(entry?.glosses)) {
    values.push(...entry.glosses);
  }

  if (entry?.gloss) values.push(entry.gloss);
  if (entry?.shortDefinition) values.push(entry.shortDefinition);

  const cleaned = unique(
    values.map(v => cleanDefinition(v, strong))
  );

  if (cleaned.length) return cleaned;

  const fallback = lexicalMeaning(entry, strong);
  return fallback ? [fallback] : [];
}

function lexicalShortDefinitions(entry, strong) {
  const values = [];

  if (Array.isArray(entry?.shortDefinitions)) {
    values.push(...entry.shortDefinitions);
  }

  if (entry?.shortDefinition) {
    values.push(entry.shortDefinition);
  }

  const cleaned = unique(
    values.map(v => cleanDefinition(v, strong))
  );

  if (cleaned.length) return cleaned;

  const fallback = lexicalMeaning(entry, strong);
  return fallback ? [fallback] : [];
}

function loadLexicon() {
  if (!exists(LEXICON_FILE)) {
    fail(`Missing generated Hebrew lexicon: ${LEXICON_FILE}`);
  }

  const raw = readJson(LEXICON_FILE);

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.entries)
      ? raw.entries
      : Object.values(raw?.entries || raw || {});

  const byStrong = new Map();

  for (const entry of list) {
    const strong = normalizeStrong(
      entry?.strong ||
      entry?.lexicalId ||
      entry?.id
    );

    if (!strong) continue;

    if (!byStrong.has(strong)) {
      byStrong.set(strong, entry);
      continue;
    }

    // Prefer entry with richer lexical evidence.
    const current = byStrong.get(strong);

    const currentScore = [
      current?.lemma,
      current?.transliteration,
      current?.shortDefinition,
      current?.gloss,
      current?.fullDefinition
    ].filter(Boolean).length;

    const nextScore = [
      entry?.lemma,
      entry?.transliteration,
      entry?.shortDefinition,
      entry?.gloss,
      entry?.fullDefinition
    ].filter(Boolean).length;

    if (nextScore > currentScore) {
      byStrong.set(strong, entry);
    }
  }

  return byStrong;
}

function listBookFiles() {
  return fs.readdirSync(WLC_BOOK_ROOT)
    .filter(name =>
      name.endsWith(".jsonl") &&
      !name.endsWith(".constructions.jsonl")
    )
    .map(name => path.join(WLC_BOOK_ROOT, name))
    .sort();
}

async function collectOccurrences(targetSet) {
  const result = new Map();

  for (const strong of targetSet) {
    result.set(strong, []);
  }

  for (const file of listBookFiles()) {
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });

    for await (const raw of rl) {
      if (!raw.trim()) continue;

      let row;

      try {
        row = JSON.parse(raw);
      } catch {
        continue;
      }

      const found = new Set();

      const top = normalizeStrong(row?.strong);

      if (top && targetSet.has(top)) {
        found.add(top);
      }

      for (const component of Array.isArray(row?.components)
        ? row.components
        : []) {

        const componentStrong = normalizeStrong(
          component?.strong
        );

        if (
          componentStrong &&
          targetSet.has(componentStrong)
        ) {
          found.add(componentStrong);
        }

        const entityMatch = String(
          component?.route?.entityId || ""
        ).match(/^word:hebrew:(H\d+)$/i);

        if (
          entityMatch &&
          targetSet.has(entityMatch[1].toUpperCase())
        ) {
          found.add(entityMatch[1].toUpperCase());
        }
      }

      for (const strong of found) {
        result.get(strong).push({
          occurrenceId: row.occurrenceId,
          wlcReference: row.wlcReference,
          canonicalReference: row.canonicalReference,
          order: row.order,
          surface: row.surface,
          normalizedSurface: row.normalizedSurface,
          morphRaw: row.morphRaw,
          components: row.components || []
        });
      }
    }
  }

  return result;
}

function parseWlcReference(reference) {
  const m = String(reference || "")
    .match(/^([^\.]+)\.(\d+)\.(\d+)$/);

  if (!m) return null;

  return {
    book: m[1],
    chapter: Number(m[2]),
    verse: Number(m[3])
  };
}

function lexicalSurface(row, strong) {
  const component = (row.components || [])
    .find(c => normalizeStrong(c?.strong) === strong);

  return String(
    component?.surface ||
    row.surface ||
    ""
  );
}

function occurrenceCompact(strong, rows) {
  const references = [];
  const formCounts = new Map();

  rows.forEach((row, index) => {
    const ref = parseWlcReference(row.wlcReference);
    if (!ref) return;

    const surface = lexicalSurface(row, strong);

    if (surface) {
      formCounts.set(
        surface,
        (formCounts.get(surface) || 0) + 1
      );
    }

    references.push([
      ref.book,
      ref.chapter,
      ref.verse,
      Number.isInteger(row.order)
        ? row.order
        : index,
      `p01:word:hebrew:${strong}:reference:${index}`,
      []
    ]);
  });

  const first = references.length
    ? references[0].slice(0, 3)
    : null;

  const last = references.length
    ? references[references.length - 1].slice(0, 3)
    : null;

  return {
    c: rows.length,
    t: rows.length,
    u: rows.length,
    a: 0,
    v: 0,
    ta: 0,
    ...(first ? { f: first } : {}),
    ...(last ? { l: last } : {}),
    r: references,
    p: references
  };
}

function identityCompact(strong, entry, rows) {
  const morphology = unique(
    rows.map(row => row.morphRaw)
  );

  const forms = new Map();

  for (const row of rows) {
    const surface = lexicalSurface(row, strong);
    if (!surface) continue;

    forms.set(
      surface,
      (forms.get(surface) || 0) + 1
    );
  }

  const glosses = lexicalGlosses(entry, strong);
  const definitions =
    lexicalShortDefinitions(entry, strong);

  if (!glosses.length || !definitions.length) {
    fail(
      `${strong} has no usable lexical meaning evidence in generatedHebrewLexiconV12.json`
    );
  }

  const lemma =
    String(entry?.lemma || "").trim() ||
    lexicalSurface(rows[0] || {}, strong);

  const normalizedLemma =
    String(entry?.normalizedLemma || "").trim() ||
    strong.replace(/^H/, "");

  const transliteration =
    String(entry?.transliteration || "").trim();

  if (!lemma) {
    fail(`${strong} has no usable lemma.`);
  }

  if (!transliteration) {
    fail(`${strong} has no usable transliteration.`);
  }

  const identity = {
    l: lemma,
    n: normalizedLemma,
    x: strong,
    s: strong,
    g: "hebrew",
    t: transliteration
  };

  if (entry?.pronunciation) {
    identity.p = String(entry.pronunciation);
  }

  const pos = unique([
    ...(Array.isArray(entry?.partsOfSpeech)
      ? entry.partsOfSpeech
      : []),

    entry?.partOfSpeech
  ]);

  if (pos.length) identity.ps = pos;

  identity.gl = glosses;
  identity.d = definitions;

  const witnesses = unique([
    ...(Array.isArray(entry?.sources)
      ? entry.sources
      : []),

    ...(Array.isArray(entry?.witnesses)
      ? entry.witnesses
      : [])
  ]);

  if (witnesses.length) identity.w = witnesses;
  if (morphology.length) identity.m = morphology;

  identity.f = [
    rows.length,
    forms.size,
    [...forms.entries()]
  ];

  return identity;
}

function buildCompactEntity(strong, entry, rows) {
  return {
    c: "hebrew",

    i: identityCompact(
      strong,
      entry,
      rows
    ),

    o: occurrenceCompact(
      strong,
      rows
    ),

    r: {
      a: false,
      t: 0,
      c: [],
      m: [],
      b: []
    },

    k: {
      a: false,
      c: [0, 0, 0, 0]
    },

    h: {
      s: "base-ready",
      a: 1,
      e: true,
      g: false,
      l: true,
      x: true,
      r: true,
      c: "0.1.0"
    }
  };
}

function getBuilderShardFunction() {
  const source = fs.readFileSync(
    ENTITY_BUILDER,
    "utf8"
  );

  const countMatch = source.match(
    /const\s+SHARD_COUNT\s*=\s*(\d+)\s*;/
  );

  if (!countMatch) {
    fail(
      "Could not determine SHARD_COUNT from build-word-study-entity-runtime.js"
    );
  }

  const shardCount = Number(countMatch[1]);

  const fnStart = source.indexOf(
    "function hashEntityId("
  );

  const shardFnStart = source.indexOf(
    "function shardIdForEntity("
  );

  if (
    fnStart < 0 ||
    shardFnStart < 0 ||
    shardFnStart <= fnStart
  ) {
    fail(
      "Could not locate entity shard functions in build-word-study-entity-runtime.js"
    );
  }

  const hashSource = source.slice(
    fnStart,
    shardFnStart
  );

  let depth = 0;
  let end = -1;

  const braceStart = source.indexOf(
    "{",
    shardFnStart
  );

  for (
    let i = braceStart;
    i < source.length;
    i++
  ) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;

    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end < 0) {
    fail(
      "Could not parse shardIdForEntity function."
    );
  }

  const shardSource = source.slice(
    shardFnStart,
    end
  );

  const sandbox = {
    SHARD_COUNT: shardCount
  };

  vm.createContext(sandbox);

  vm.runInContext(
    `
      ${hashSource}
      ${shardSource}
      this.__shardIdForEntity = shardIdForEntity;
    `,
    sandbox
  );

  if (
    typeof sandbox.__shardIdForEntity !== "function"
  ) {
    fail(
      "Failed to load builder shard function."
    );
  }

  return {
    shardCount,
    shardIdForEntity:
      sandbox.__shardIdForEntity
  };
}

function loadShard(file) {
  if (!exists(file)) {
    return {
      version: 1,
      corpus: "hebrew",
      shard: path.basename(file, ".json"),
      entities: {}
    };
  }

  const shard = readJson(file);

  if (
    !shard ||
    typeof shard !== "object" ||
    !shard.entities ||
    typeof shard.entities !== "object"
  ) {
    fail(`Unexpected shard schema: ${file}`);
  }

  return shard;
}

function updateManifestCounts(
  value,
  oldHebrewCount,
  newHebrewCount,
  oldTotalCount,
  newTotalCount,
  keyPath = []
) {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      updateManifestCounts(
        item,
        oldHebrewCount,
        newHebrewCount,
        oldTotalCount,
        newTotalCount,
        [...keyPath, String(index)]
      )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const [key, child] of Object.entries(value)) {
      const lowerPath = [...keyPath, key]
        .join(".")
        .toLowerCase();

      if (
        typeof child === "number" &&
        /entity|entities|count|total/.test(lowerPath)
      ) {
        if (
          child === oldHebrewCount &&
          lowerPath.includes("hebrew")
        ) {
          value[key] = newHebrewCount;
          continue;
        }

        if (
          child === oldTotalCount &&
          !lowerPath.includes("hebrew")
        ) {
          value[key] = newTotalCount;
          continue;
        }
      }

      updateManifestCounts(
        child,
        oldHebrewCount,
        newHebrewCount,
        oldTotalCount,
        newTotalCount,
        [...keyPath, key]
      );
    }
  }

  return value;
}

function hookBuilder() {
  const source = fs.readFileSync(
    ENTITY_BUILDER,
    "utf8"
  );

  const marker =
    "applyPhase1HebrewEntityRuntimeRepair";

  if (source.includes(marker)) {
    return {
      changed: false,
      reason: "hook-already-present"
    };
  }

  backup(ENTITY_BUILDER);

  const hook = `

/* PHASE1_HEBREW_ENTITY_RUNTIME_REPAIR */
require("./apply-phase1-hebrew-entity-runtime-repair.cjs")
  .applyPhase1HebrewEntityRuntimeRepair(process.cwd());
`;

  fs.writeFileSync(
    ENTITY_BUILDER,
    source.replace(/\s*$/, "") + hook + "\n",
    "utf8"
  );

  return {
    changed: true,
    reason: "hook-added"
  };
}

function writePermanentModule() {
  backup(PERMANENT_REPAIR);

  // The module runs this repair runner in permanent mode.
  // It is intentionally tiny so all logic remains deterministic
  // and reviewable in this runner-generated file.
  const content = `
"use strict";

const cp = require("child_process");
const path = require("path");

function applyPhase1HebrewEntityRuntimeRepair(root) {
  const runner = path.join(
    root,
    "scripts",
    "phase1-hebrew-entity-runtime-repair-worker.cjs"
  );

  cp.execFileSync(
    process.execPath,
    [runner, root, "--post-build"],
    {
      cwd: root,
      stdio: "inherit"
    }
  );
}

module.exports = {
  applyPhase1HebrewEntityRuntimeRepair
};
`;

  fs.writeFileSync(
    PERMANENT_REPAIR,
    content.trimStart(),
    "utf8"
  );
}

function writeWorker() {
  const worker = path.join(
    repo,
    "scripts",
    "phase1-hebrew-entity-runtime-repair-worker.cjs"
  );

  backup(worker);

  // Copy this runner's operational portion into a permanent worker.
  // To avoid self-referential runner complexity, the main script
  // itself is copied and invoked with --post-build mode.
  const currentScript = fs.readFileSync(
    __filename,
    "utf8"
  );

  fs.writeFileSync(
    worker,
    currentScript,
    "utf8"
  );

  return worker;
}

async function performRepair({
  permanentHook = true,
  createPermanentFiles = true
} = {}) {
  const targetSet = new Set([
    ...TARGETS,
    METADATA_TARGET
  ]);

  const lexicon = loadLexicon();
  const occurrences =
    await collectOccurrences(targetSet);

  const {
    shardCount,
    shardIdForEntity
  } = getBuilderShardFunction();

  const changedFiles = new Set();
  const repairedEntities = [];

  // Add six missing entities.
  for (const strong of TARGETS) {
    const entityId =
      `word:hebrew:${strong}`;

    const entry = lexicon.get(strong);

    if (!entry) {
      fail(
        `Missing ${strong} from generated Hebrew lexicon.`
      );
    }

    const rows =
      occurrences.get(strong) || [];

    if (!rows.length) {
      fail(
        `${strong} has no WLC source occurrences.`
      );
    }

    const shardId = String(
      shardIdForEntity(entityId)
    ).padStart(2, "0");

    const shardFile = path.join(
      HEBREW_ENTITY_ROOT,
      `${shardId}.json`
    );

    const shard = loadShard(shardFile);

    if (!shard.entities[entityId]) {
      backup(shardFile);

      shard.entities[entityId] =
        buildCompactEntity(
          strong,
          entry,
          rows
        );

      writeJson(shardFile, shard);
      changedFiles.add(shardFile);

      repairedEntities.push({
        strong,
        entityId,
        shardId,
        action: "added",
        occurrences: rows.length
      });
    } else {
      repairedEntities.push({
        strong,
        entityId,
        shardId,
        action: "already-present",
        occurrences: rows.length
      });
    }
  }

  // Repair H3390 metadata.
  {
    const strong = METADATA_TARGET;
    const entityId =
      `word:hebrew:${strong}`;

    const entry = lexicon.get(strong);

    if (!entry) {
      fail(
        `${strong} missing from generated Hebrew lexicon.`
      );
    }

    const shardId = String(
      shardIdForEntity(entityId)
    ).padStart(2, "0");

    const shardFile = path.join(
      HEBREW_ENTITY_ROOT,
      `${shardId}.json`
    );

    const shard = loadShard(shardFile);
    const entity = shard.entities[entityId];

    if (!entity) {
      fail(
        `${strong} compact entity unexpectedly missing.`
      );
    }

    const definitions =
      lexicalShortDefinitions(entry, strong);

    const glosses =
      lexicalGlosses(entry, strong);

    if (
      !definitions.length ||
      !glosses.length
    ) {
      fail(
        `${strong} has no usable reader meaning evidence.`
      );
    }

    const beforeD =
      Array.isArray(entity?.i?.d)
        ? entity.i.d
        : [];

    const beforeGl =
      Array.isArray(entity?.i?.gl)
        ? entity.i.gl
        : [];

    const needsRepair =
      beforeD.length === 0 ||
      beforeGl.length === 0;

    if (needsRepair) {
      backup(shardFile);

      entity.i = entity.i || {};

      if (!beforeD.length) {
        entity.i.d = definitions;
      }

      if (!beforeGl.length) {
        entity.i.gl = glosses;
      }

      writeJson(shardFile, shard);
      changedFiles.add(shardFile);
    }

    repairedEntities.push({
      strong,
      entityId,
      shardId,
      action: needsRepair
        ? "metadata-repaired"
        : "metadata-already-present"
    });
  }

  // Update compact entity manifest counts if present.
  if (exists(MANIFEST)) {
    const manifest = readJson(MANIFEST);

    const files = fs.readdirSync(
      HEBREW_ENTITY_ROOT
    ).filter(x => x.endsWith(".json"));

    let actualHebrew = 0;

    for (const name of files) {
      const shard = readJson(
        path.join(HEBREW_ENTITY_ROOT, name)
      );

      actualHebrew += Object.keys(
        shard.entities || {}
      ).length;
    }

    const oldHebrew = actualHebrew - TARGETS.length;

    // Original total is known from current builder contract.
    const oldTotal = 27206;
    const newTotal =
      oldTotal + TARGETS.length;

    backup(MANIFEST);

    updateManifestCounts(
      manifest,
      oldHebrew,
      actualHebrew,
      oldTotal,
      newTotal
    );

    writeJson(MANIFEST, manifest);
    changedFiles.add(MANIFEST);
  }

  let worker = null;
  let hook = null;

  if (createPermanentFiles) {
    worker = writeWorker();
    writePermanentModule();

    changedFiles.add(worker);
    changedFiles.add(PERMANENT_REPAIR);
  }

  if (permanentHook) {
    hook = hookBuilder();

    if (hook.changed) {
      changedFiles.add(ENTITY_BUILDER);
    }
  }

  return {
    shardCount,
    repairedEntities,
    changedFiles: [...changedFiles]
      .map(file => path.relative(repo, file)),
    hook,
    worker: worker
      ? path.relative(repo, worker)
      : null
  };
}

function scanCompactEntities() {
  const loaded = new Map();

  for (const name of fs.readdirSync(
    HEBREW_ENTITY_ROOT
  ).filter(x => x.endsWith(".json"))) {

    const shard = readJson(
      path.join(
        HEBREW_ENTITY_ROOT,
        name
      )
    );

    for (
      const [entityId, entity]
      of Object.entries(shard.entities || {})
    ) {
      loaded.set(entityId, entity);
    }
  }

  return loaded;
}

async function verify() {
  const referenced = new Set();

  for (const file of listBookFiles()) {
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });

    for await (const raw of rl) {
      if (!raw.trim()) continue;

      let row;

      try {
        row = JSON.parse(raw);
      } catch {
        continue;
      }

      for (const component of Array.isArray(row.components)
        ? row.components
        : []) {

        const entityId =
          String(
            component?.route?.entityId || ""
          );

        if (
          /^word:hebrew:H\d+$/i.test(entityId)
        ) {
          referenced.add(entityId);
        }
      }
    }
  }

  const loaded = scanCompactEntities();

  const missing = [...referenced]
    .filter(id => !loaded.has(id))
    .sort();

  const missingTransliteration = [];
  const missingMeaning = [];

  for (
    const entityId of referenced
  ) {
    const entity = loaded.get(entityId);

    if (!entity) continue;

    const t =
      String(entity?.i?.t || "").trim();

    const d =
      Array.isArray(entity?.i?.d)
        ? entity.i.d.filter(Boolean)
        : [];

    const gl =
      Array.isArray(entity?.i?.gl)
        ? entity.i.gl.filter(Boolean)
        : [];

    if (!t) {
      missingTransliteration.push(entityId);
    }

    if (!d.length && !gl.length) {
      missingMeaning.push(entityId);
    }
  }

  return {
    referencedUniqueLexicalEntities:
      referenced.size,

    loadedCompactHebrewEntities:
      loaded.size,

    missingReferencedEntities: missing,

    missingTransliteration,
    missingReaderMeaning: missingMeaning,

    ready:
      referenced.size === 8640 &&
      missing.length === 0 &&
      missingTransliteration.length === 0 &&
      missingMeaning.length === 0
  };
}

(async () => {
  const postBuild =
    process.argv.includes("--post-build");

  if (postBuild) {
    const repair =
      await performRepair({
        permanentHook: false,
        createPermanentFiles: false
      });

    const verification = await verify();

    if (!verification.ready) {
      fail(
        `Post-build Hebrew repair verification failed: ${JSON.stringify(verification)}`
      );
    }

    console.log(
      "Phase-1 Hebrew entity runtime repair applied and verified."
    );

    return;
  }

  const repair = await performRepair({
    permanentHook: true,
    createPermanentFiles: true
  });

  const verification = await verify();

  const report = {
    generatedAt:
      new Date().toISOString(),

    mode:
      "WRITE_PHASE1_HEBREW_ENTITY_RUNTIME_REPAIR",

    boundaries: {
      alignmentGeneration: 0,
      alignmentModification: 0,
      wlcSourceModification: 0,
      brentonModification: 0,
      lxxSourceModification: 0,
      deployment: 0
    },

    targets: TARGETS,
    metadataTarget: METADATA_TARGET,

    repair,
    verification,

    verdict:
      verification.ready
        ? "HEBREW_PHASE1_ENTITY_PATH_READY"
        : "HEBREW_PHASE1_ENTITY_REPAIR_FAILED"
  };

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("");
  console.log("====================================================");
  console.log("EMETSEES — HEBREW ENTITY REPAIR");
  console.log("====================================================");
  console.log("");

  for (
    const item of repair.repairedEntities
  ) {
    console.log(
      `${item.strong.padEnd(6)} ${item.action}`
    );
  }

  console.log("");
  console.log(
    `Referenced lexical IDs : ${verification.referencedUniqueLexicalEntities}`
  );

  console.log(
    `Loaded Hebrew entities : ${verification.loadedCompactHebrewEntities}`
  );

  console.log(
    `Missing entities       : ${verification.missingReferencedEntities.length}`
  );

  console.log(
    `Missing transliteration: ${verification.missingTransliteration.length}`
  );

  console.log(
    `Missing reader meaning : ${verification.missingReaderMeaning.length}`
  );

  console.log("");
  console.log(
    `VERDICT: ${report.verdict}`
  );

  console.log("");
  console.log(
    `Report: ${reportPath}`
  );

  console.log("");
})().catch(err => {
  console.error("");
  console.error("REPAIR FAILED");
  console.error(err);
  process.exit(1);
});
