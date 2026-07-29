#!/usr/bin/env node
"use strict";
const fs=require("fs"); const path=require("path"); const crypto=require("crypto");
const {EXPECTED,fail,readJson,writeJson,sha256File,parseArgs,gitInfo,relativeFromRoot,findLatestAjReport,verifyAj,snapshotItems,compareItems}=require("./p0512ak-lib");
function same(a,b){return fs.readFileSync(a).equals(fs.readFileSync(b));}
function main(){
 const args=parseArgs(process.argv.slice(2)); const repoRoot=path.resolve(args["repo-root"]||process.cwd());
 const a=path.resolve(args["candidate-a"]||""); const b=path.resolve(args["candidate-b"]||""); const reportDir=path.resolve(args["report-dir"]||"");
 if(!args["candidate-a"]||!args["candidate-b"]||!args["report-dir"]) fail("--candidate-a, --candidate-b, --report-dir required.");
 const files=["runtime-integration-contract.json","artifact-schema-profiles.json","runtime-code-references.json","protected-state-current.json","protected-state-vs-aj.json","aj-independent-verification.json","build-summary.json"];
 const comparisons=files.map((name)=>({file:name,identical:same(path.join(a,name),path.join(b,name)),candidateASha256:sha256File(path.join(a,name)),candidateBSha256:sha256File(path.join(b,name))}));
 const sa=readJson(path.join(a,"build-summary.json")); const sb=readJson(path.join(b,"build-summary.json"));
 const aj=verifyAj(findLatestAjReport(repoRoot));
 const ajAfter=readJson(path.join(aj.reportDir,"protected-state-after.json"));
 const current={items:snapshotItems(repoRoot,ajAfter.items)}; const protectedComparison=compareItems(ajAfter.items,current.items);
 const gates={
   repeatedBuildArtifactsByteIdentical:comparisons.every((x)=>x.identical),
   repeatedBuildSummariesIdentical:JSON.stringify(sa)===JSON.stringify(sb),
   candidateAAllGatesPassed:Object.values(sa.gates||{}).every(Boolean),
   candidateBAllGatesPassed:Object.values(sb.gates||{}).every(Boolean),
   ajStillPasses:aj.passed,
   protectedProductionStateUnchanged:protectedComparison.identical,
   stagingOnly:sa.authorization?.productionPromotionPerformed===false&&sb.authorization?.productionPromotionPerformed===false,
   productionPromotionNotAuthorized:sa.authorization?.safeToPromoteProductionKjv===false&&sb.authorization?.safeToPromoteProductionKjv===false,
 };
 const summary={
  milestone:EXPECTED.milestone,generatedAtUtc:new Date().toISOString(),repository:gitInfo(repoRoot),purpose:"ISOLATED KJV RUNTIME-INTEGRATION CONTRACT",
  retainedCandidate:relativeFromRoot(repoRoot,a),deterministicBuild:{independentlyRepeated:true,fileComparisons:comparisons,primaryFingerprint:crypto.createHash("sha256").update(comparisons.map((x)=>`${x.file}\0${x.candidateASha256}\n`).join("")).digest("hex")},
  integrationMode:sa.integrationMode,counts:sa.counts,gates,
  authorization:{safeToCreateIsolatedKjvApplicationPreview:Object.values(gates).every(Boolean),safeToPromoteProductionKjv:false,productionPromotionPerformed:false}
 };
 writeJson(path.join(reportDir,"p0512ak-summary.json"),summary); writeJson(path.join(reportDir,"protected-state-final-comparison.json"),protectedComparison);
 process.stdout.write(`${JSON.stringify(summary,null,2)}\n`); if(!Object.values(gates).every(Boolean)) process.exitCode=1;
}
try{main();}catch(error){process.stderr.write(`${error?.stack||error}\n`);process.exitCode=1;}
