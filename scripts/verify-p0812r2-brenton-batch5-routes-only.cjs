"use strict";
const fs=require("fs"),path=require("path");
const ROOT=process.cwd();
const PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-tier3-recurring-family-span-batch5/manifest.json";
const RUNTIME="public/data/bibleiq/word-study/lxx";

function readJson(f){return JSON.parse(fs.readFileSync(f,"utf8").replace(/^\uFEFF/,""))}
function stable(v){return JSON.stringify(v)}
function fail(m,d=null){
  console.error(JSON.stringify({result:"FAIL",message:m,detail:d},null,2));
  process.exit(1);
}

const plan=readJson(path.join(ROOT,PLAN));

if(
  plan.batchId!=="p0812r2-brenton-tier3-recurring-family-span-batch5" ||
  plan.proof?.displayRoutePositions!==7440 ||
  plan.proof?.meaningfulRoutePositions!==3083 ||
  plan.routes?.length!==7440
){
  fail("Batch5 sealed manifest/routes contract changed",{
    batchId:plan.batchId,
    proof:plan.proof,
    routeCount:plan.routes?.length
  });
}

const cache=new Map();
function book(f){
  if(!cache.has(f)){
    cache.set(f,readJson(path.join(ROOT,RUNTIME,f)));
  }
  return cache.get(f);
}

let ok=0;
const issues=[];

for(const r of plan.routes){
  const verse=book(r.runtimeFile)?.verses?.[r.runtimeVerseKey];
  if(!verse){
    issues.push({
      reference:r.reference,
      displayIndex:r.displayIndex,
      reason:"VERSE_MISSING"
    });
    continue;
  }

  const got=verse?.v?.brenton?.[String(r.displayIndex)];
  if(stable(got)!==stable(r.compactV2)){
    issues.push({
      reference:r.reference,
      displayIndex:r.displayIndex,
      reason:"ROUTE_MISMATCH"
    });
  }else{
    ok++;
  }
}

if(issues.length){
  fail("Batch5 sealed routes not fully preserved",{
    ok,
    issueCount:issues.length,
    sample:issues.slice(0,50)
  });
}

console.log(JSON.stringify({
  result:"PASS_BATCH5_ROUTES_ONLY",
  verifiedRoutes:ok,
  expectedRoutes:7440,
  globalVBrentonCountIntentionallyIgnored:true
},null,2));
