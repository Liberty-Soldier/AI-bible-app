#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");
const {
  EXPECTED,fail,ensureDir,readJson,writeJson,sha256File,parseArgs,gitInfo,relativeFromRoot,
  findLatestAjReport,verifyAj,snapshotItems,compareItems,profileJsonFile,findCanonicalSample,scanCode,packageScripts
}=require("./p0512ak-lib");

function main(){
  const args=parseArgs(process.argv.slice(2));
  const repoRoot=path.resolve(args["repo-root"]||process.cwd());
  const outputDir=path.resolve(args["output-dir"]||"");
  if(!args["output-dir"]) fail("--output-dir is required.");
  const allowed=path.join(repoRoot,".private","reports","P05.12");
  const rel=path.relative(allowed,outputDir); if(rel.startsWith("..")||path.isAbsolute(rel)) fail(`Output must stay under ${allowed}`);
  ensureDir(outputDir);
  const repository=gitInfo(repoRoot); if(repository.branch!=="main") fail(`Must run on main; current branch=${repository.branch}`);

  const ajReport=findLatestAjReport(repoRoot);
  const aj=verifyAj(ajReport); if(!aj.passed) fail(`Latest retained P05.12AJ report failed independent verification: ${JSON.stringify(aj.gates)}`);
  const ajProtectedAfterPath=path.join(aj.reportDir,"protected-state-after.json");
  if(!fs.existsSync(ajProtectedAfterPath)) fail(`AJ protected-state-after missing: ${ajProtectedAfterPath}`);
  const ajProtectedAfter=readJson(ajProtectedAfterPath);
  const currentProtected={items:snapshotItems(repoRoot,ajProtectedAfter.items)};
  const protectedComparison=compareItems(ajProtectedAfter.items,currentProtected.items);

  const build=aj.build;
  const ajBlocks=path.join(aj.candidateA,"kjv-translation-blocks.json");
  const kjvCandidate=path.join(repoRoot,...String(build.inputs?.kjv2006Candidate?.path||"").split("/"));
  const retainedCanonical=path.join(repoRoot,...String(build.inputs?.retainedCanonical?.path||"").split("/"));

  const artifacts={
    productionKjvJson:profileJsonFile(path.join(repoRoot,"app","data","scripture","generatedKJV.json")),
    stagedKjv2006Candidate:profileJsonFile(kjvCandidate),
    stagedAjTranslationBlockFirst:profileJsonFile(ajBlocks,{firstArrayOnly:true}),
    retainedAiCanonicalSample:findCanonicalSample(retainedCanonical),
    livePrivateCanonicalSample:findCanonicalSample(path.join(repoRoot,".private","scripture","canonical")),
    liveAppCanonicalSample:findCanonicalSample(path.join(repoRoot,"app","data","bibleiq","canonical")),
  };
  // Keep artifact report compact: retain schema/sample but remove absolute paths and cap full samples.
  for(const item of Object.values(artifacts)){
    if(item?.path) item.path=relativeFromRoot(repoRoot,item.path);
    if(item?.root) item.root=relativeFromRoot(repoRoot,item.root);
    if(item?.file) item.file=relativeFromRoot(repoRoot,item.file);
  }

  const code=scanCode(repoRoot);
  const scripts=packageScripts(repoRoot);
  const isRuntimeConsumer=(file)=>!file.startsWith("scripts/");
  const visibleConsumers=[...new Set([...(code.byTerm.generatedKJV||[]),...(code.byTerm.generatedWEB||[]),...(code.byTerm.generatedBrenton||[])].filter(isRuntimeConsumer))].sort();
  const canonicalConsumers=[...new Set([...(code.byTerm.canonical||[]),...(code.byTerm.sourceTokens||[]),...(code.byTerm.alignedSourceTokenIds||[]),...(code.byTerm["translations.kjv"]||[]),...(code.byTerm["translations?.kjv"]||[])].filter(isRuntimeConsumer))].sort();
  const kjvTranslationConsumers=[...new Set([...(code.byTerm["translations.kjv"]||[]),...(code.byTerm["translations?.kjv"]||[]),...(code.byTerm.alignedSourceTokenIds||[])].filter(isRuntimeConsumer))].sort();

  const mode = kjvTranslationConsumers.length ? "embedded-canonical-kjv-translation-blocks" : (canonicalConsumers.length ? "canonical-consumer-present-contract-needs-explicit-adapter" : "unresolved");
  const contract={
    milestone:EXPECTED.milestone,
    purpose:"ISOLATED KJV RUNTIME-INTEGRATION CONTRACT",
    repository,
    retainedAjReport:relativeFromRoot(repoRoot,aj.reportDir),
    inputs:{
      ajSummary:{path:relativeFromRoot(repoRoot,aj.summaryPath),sha256:sha256File(aj.summaryPath)},
      ajTranslationBlocks:{path:relativeFromRoot(repoRoot,ajBlocks),sha256:sha256File(ajBlocks),bytes:fs.statSync(ajBlocks).size},
      kjv2006Candidate:{path:relativeFromRoot(repoRoot,kjvCandidate),sha256:fs.existsSync(kjvCandidate)?sha256File(kjvCandidate):null},
      retainedAiCanonical:{path:relativeFromRoot(repoRoot,retainedCanonical)},
    },
    runtimeOwnership:{
      visibleReaderArtifacts:["app/data/scripture/generatedKJV.json","app/data/scripture/generatedKJV.ts"],
      canonicalArtifacts:[".private/scripture/canonical","app/data/bibleiq/canonical"],
      visibleReaderConsumers:visibleConsumers,
      canonicalConsumers,
      kjvTranslationConsumers,
      packageScripts:scripts,
    },
    integrationMode:mode,
    exactApplicationRequirements:[
      "Keep KJV2006 visible text exact at all 31,102 reader coordinates.",
      "Install the retained P05.12AI corrected canonical token routes without changing semantic source-token content.",
      "Install the P05.12AJ reader-coordinate KJV translation blocks through the runtime consumer identified by this contract.",
      "Keep the 17 reader-only coordinates visible and fail closed.",
      "Preserve explicit one-source-to-many and many-source-to-one topology.",
      "Leave WEB, Brenton, alignments, and all non-KJV canonical content unchanged.",
      "Require rollback artifacts and atomic replacement in the later promotion stage."
    ],
    stagingOnly:true,
    productionPromotionAuthorized:false,
  };

  const gates={
    ajIndependentVerificationPassed:aj.passed,
    ajManifestPassed:aj.manifest.passed,
    ajRepeatedBuildsIdentical:aj.comparisons.every((x)=>x.identical),
    ajCountsAndTopologyExact:Object.values(aj.gates).every(Boolean),
    productionProtectedStateStillMatchesAj:protectedComparison.identical,
    productionKjvExists:artifacts.productionKjvJson.exists===true,
    kjv2006CandidateExists:artifacts.stagedKjv2006Candidate.exists===true,
    retainedAiCanonicalSampleResolved:artifacts.retainedAiCanonicalSample.exists===true && artifacts.retainedAiCanonicalSample.sampleFound!==false,
    liveCanonicalSampleResolved:(artifacts.livePrivateCanonicalSample.sampleFound!==false)||(artifacts.liveAppCanonicalSample.sampleFound!==false),
    visibleReaderConsumersResolved:visibleConsumers.length>0,
    canonicalConsumersResolved:canonicalConsumers.length>0,
    integrationModeResolved:mode!=="unresolved",
    stagingOnly:true,
    productionPromotionNotAuthorized:true,
  };

  writeJson(path.join(outputDir,"runtime-integration-contract.json"),contract);
  writeJson(path.join(outputDir,"artifact-schema-profiles.json"),artifacts);
  writeJson(path.join(outputDir,"runtime-code-references.json"),code);
  writeJson(path.join(outputDir,"protected-state-current.json"),currentProtected);
  writeJson(path.join(outputDir,"protected-state-vs-aj.json"),protectedComparison);
  writeJson(path.join(outputDir,"aj-independent-verification.json"),{
    reportDir:relativeFromRoot(repoRoot,aj.reportDir),summaryPath:relativeFromRoot(repoRoot,aj.summaryPath),
    manifest:{entries:aj.manifest.entries,passed:aj.manifest.passed,errors:aj.manifest.errors,unexpected:aj.manifest.unexpected,missing:aj.manifest.missing},
    comparisons:aj.comparisons,gates:aj.gates,passed:aj.passed
  });
  const summary={
    milestone:EXPECTED.milestone,
    schemaVersion:"p0512ak-summary@1",
    purpose:"ISOLATED KJV RUNTIME-INTEGRATION CONTRACT",
    repository,
    retainedAjReport:relativeFromRoot(repoRoot,aj.reportDir),
    counts:{
      codeFilesScanned:code.scannedFiles,
      codeReferenceHits:code.hits.length,
      visibleReaderConsumers:visibleConsumers.length,
      canonicalConsumers:canonicalConsumers.length,
      kjvTranslationConsumers:kjvTranslationConsumers.length,
    },
    integrationMode:mode,
    gates,
    authorization:{
      safeToCreateIsolatedKjvApplicationPreview:Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv:false,
      productionPromotionPerformed:false,
    }
  };
  writeJson(path.join(outputDir,"build-summary.json"),summary);
  process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);
  if(!Object.values(gates).every(Boolean)) process.exitCode=1;
}
try{main();}catch(error){process.stderr.write(`${error?.stack||error}\n`);process.exitCode=1;}
