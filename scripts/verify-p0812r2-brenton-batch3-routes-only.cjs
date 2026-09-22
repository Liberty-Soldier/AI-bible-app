"use strict";
const fs=require("fs"),path=require("path");
const ROOT=process.cwd();
const PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-bounded-1e1s-batch3/manifest.json";
const OVERLAY="public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const RUNTIME="public/data/bibleiq/word-study/lxx";
function readJson(f){return JSON.parse(fs.readFileSync(f,"utf8").replace(/^\uFEFF/,""));}
function fail(m,d=null){console.error(JSON.stringify({result:"FAIL",message:m,detail:d},null,2));process.exit(1);}
function numericRoute(verse,index){
  const raw=verse?.a?.brenton?.[String(index)];
  if(raw===undefined)return null;
  const si=Number(raw),row=verse?.s?.[si];
  return row?{sourceIndex:si,sourceId:String(row[0]||""),entityId:String(row[4]||"")}:null;
}
function overlayRoute(rec,index){
  const r=rec?.routes?.[String(index)];
  if(!Array.isArray(r)||r.length!==3)return null;
  return {sourceIndex:Number(r[0]),sourceId:String(r[1]||""),entityId:String(r[2]||"")};
}
function same(a,b){return Boolean(a&&b&&Number(a.sourceIndex)===Number(b.sourceIndex)&&String(a.sourceId||"")===String(b.sourceId||"")&&String(a.entityId||"")===String(b.entityId||""));}
const plan=readJson(path.join(ROOT,PLAN));
if(plan.batchId!=="p0812r2-brenton-bounded-1e1s-batch3"||plan.candidates?.length!==1481)fail("Batch3 manifest contract changed");
const overlay=readJson(path.join(ROOT,OVERLAY));
const cache=new Map();
function book(file){if(!cache.has(file))cache.set(file,readJson(path.join(ROOT,RUNTIME,file)));return cache.get(file);}
let ok=0; const issues=[];
for(const c of plan.candidates){
  let actual;
  if(c.topologyMode==="OVERLAY") actual=overlayRoute(overlay.records?.[c.readerRecordId],c.displayIndex);
  else actual=numericRoute(book(c.runtimeFile)?.verses?.[c.runtimeVerseKey],c.displayIndex);
  const expected={sourceIndex:Number(c.to.sourceIndex),sourceId:String(c.to.sourceId),entityId:String(c.to.entityId)};
  if(!same(actual,expected)) issues.push({reference:c.reference,readerRecordId:c.readerRecordId,displayIndex:c.displayIndex,topologyMode:c.topologyMode,expected,actual});
  else ok++;
}
if(issues.length)fail("Batch3 sealed routes not fully preserved after Batch4",{ok,issues:issues.slice(0,50),issueCount:issues.length});
console.log(JSON.stringify({result:"PASS_BATCH3_ROUTES_ONLY",verifiedRoutes:ok,globalNumericCountIntentionallyIgnored:true},null,2));
