const { createBuildConfiguration } = require("./sdk/BuildConfiguration");
const { loadSourceUniverse } = require("./sdk/SourceLoader");
const { runPass } = require("./sdk/PassRunner");

const { produceCR0 } = require("./passes/P01-produce-cr0");
const { produceCR1 } = require("./passes/P02-produce-cr1");
const { produceCR2 } = require("./passes/P03-produce-cr2");
const { produceCR3 } = require("./passes/P04-produce-cr3");
const { produceCR4 } = require("./passes/P05-produce-cr4");
const { produceEvidenceGraph } = require("./passes/P06-produce-evidence-graph");
const { produceSyntaxGraph } = require("./passes/P08-produce-syntax-graph");
const { produceRelationshipGraphV2 } = require("./passes/P09-produce-relationship-graph-v2");
const { produceEventGraph } = require("./passes/P10-produce-event-graph");
const { produceThemeGraph } = require("./passes/P11-produce-theme-graph");
const { produceRuntimeArtifacts } = require("./passes/P12-produce-runtime-artifacts");

function main() {
  console.log("");
  console.log("========================================");
  console.log(" Scripture Evidence Engine (SEE)");
  console.log("========================================");
  console.log("");

  const config = createBuildConfiguration();

  console.log(`Compiler Version : ${config.compilerVersion}`);
  console.log(`Build Profile    : ${config.profile}`);
  console.log("");

  const sourceUniverse = loadSourceUniverse(config);

  console.log(`Loaded Source Universe (${sourceUniverse.sources.length} source${sourceUniverse.sources.length === 1 ? "" : "s"})`);
  console.log("");

  const cr0 = runPass(config, {
    id: "P01",
    title: "P01 Produce CR0 Canonical Universe",
    output: "CR0",
    execute: () => produceCR0(sourceUniverse),
    after: r => {
      console.log(`  Sources : ${r.stats.sources}`);
      console.log(`  Books   : ${r.stats.books}`);
      console.log(`  Chapters: ${r.stats.chapters}`);
      console.log(`  Verses  : ${r.stats.verses}`);
    }
  });

  const cr1 = runPass(config, {
    id: "P02",
    title: "P02 Produce CR1 Witness Graph",
    output: "CR1",
    execute: () => produceCR1(cr0.data, sourceUniverse),
    after: r => console.log(`  Witnesses : ${r.stats.witnesses}`)
  });

  const cr2 = runPass(config, {
    id: "P03",
    title: "P03 Produce CR2 Source Token Graph",
    output: "CR2",
    execute: () => produceCR2(sourceUniverse),
    after: r => {
      console.log(`  Verses : ${r.stats.verses}`);
      console.log(`  Sources: ${r.stats.sources}`);
    }
  });

  const cr3 = runPass(config, {
    id: "P04",
    title: "P04 Produce CR3 Source Token Index",
    output: "CR3",
    execute: () => produceCR3(sourceUniverse),
    after: r => {
      console.log(`  Strongs : ${r.stats.strongs}`);
      console.log(`  Tokens  : ${r.stats.tokens}`);
    }
  });

  const cr4 = runPass(config, {
    id: "P05",
    title: "P05 Produce CR4 Occurrence Graph",
    output: "CR4",
    execute: () => produceCR4(sourceUniverse),
    after: r => console.log(`  Lemmas : ${r.stats.lemmas}`)
  });

  const evidence = runPass(config, {
    id: "P06",
    title: "P06 Produce Evidence Graph",
    output: "EvidenceGraph",
    execute: () => produceEvidenceGraph(cr4.data),
    after: r => console.log(`  Evidence Nodes : ${r.stats.evidenceNodes}`)
  });

  const syntax = runPass(config, {
    id: "P08",
    title: "P08 Produce Syntax Graph",
    output: "SyntaxGraph",
    execute: () => produceSyntaxGraph(sourceUniverse),
    after: r => {
      console.log(`  Verses : ${r.stats.verses}`);
      console.log(`  Clauses: ${r.stats.clauses}`);
    }
  });

  const relationships = runPass(config, {
    id: "P09",
    title: "P09 Produce Relationship Graph",
    output: "RelationshipGraph",
    execute: () => produceRelationshipGraphV2(syntax.data),
    after: r => {
      console.log(`  Verses       : ${r.stats.verses}`);
      console.log(`  Relationships: ${r.stats.relationships}`);
    }
  });

  const events = runPass(config, {
    id: "P10",
    title: "P10 Produce Event Graph",
    output: "EventGraph",
    execute: () => produceEventGraph(relationships.data),
    after: r => {
      console.log(`  Verses: ${r.stats.verses}`);
      console.log(`  Events: ${r.stats.events}`);
    }
  });

  const themes = runPass(config, {
    id: "P11",
    title: "P11 Produce Theme Graph",
    output: "ThemeGraph",
    execute: () => produceThemeGraph(events.data),
    after: r => console.log(`  Themes: ${r.stats.themes}`)
  });

  runPass(config, {
    id: "P12",
    title: "P12 Produce Runtime Artifacts",
    output: "RuntimeArtifacts",
    execute: () => produceRuntimeArtifacts(config, {
      evidenceGraph: evidence.data,
      relationshipGraph: relationships.data,
      eventGraph: events.data,
      themeGraph: themes.data
    }),
after: r => {
  console.log(`  Full Indexes      : ${r.stats.fullIndexes}`);
  console.log(`  Lite Indexes      : ${r.stats.liteIndexes}`);
  console.log(`  Evidence Lite Nodes: ${r.stats.evidenceLiteNodes}`);
}
  });

  console.log("");
  console.log("========================================");
  console.log(" SEE BUILD COMPLETE");
  console.log("========================================");
  console.log("");
}

main();