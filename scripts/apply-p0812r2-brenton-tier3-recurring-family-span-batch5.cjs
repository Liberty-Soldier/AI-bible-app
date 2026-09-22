"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");

const DEFAULT_PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-tier3-recurring-family-span-batch5/manifest.json";
const RUNTIME_ROOT="public/data/bibleiq/word-study/lxx";
const RUNTIME_MANIFEST="public/data/bibleiq/word-study/manifest.json";
const OVERLAY="public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const CONSUMER="app/data/scripture/CanonicalVerseStore.ts";

const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const parse=b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,""));
function fail(m){throw new Error(`[Brenton Tier3 Batch5] ${m}`);}
function checksum(doc){const {checksum:ignored,...body}=doc;return sha(Buffer.from(JSON.stringify(body)));}

function loadPlan(root,planPath){
  const p=parse(fs.readFileSync(planPath||path.join(root,DEFAULT_PLAN)));
  if(p.batchId!=="p0812r2-brenton-tier3-recurring-family-span-batch5"||
     p.proof?.families!==439||
     p.proof?.spans!==2649||
     p.proof?.displayRoutePositions!==7440||
     p.proof?.meaningfulRoutePositions!==3083||
     p.routes?.length!==7440||
     p.spans?.length!==2649||
     checksum(p)!==p.checksum){
    fail("sealed Batch5 plan changed");
  }
  const ch=sha(fs.readFileSync(path.join(root,CONSUMER)));
  if(ch!==p.consumer.requiredSha256&&ch!=="2bc980850c58457c513f0c0a0faf6a10b9adf00d4fa7d66e300b0ce014d8517a")fail(`Brenton span consumer hash mismatch: ${ch}`);
  return p;
}
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
function stable(v){return JSON.stringify(v);}
function alignedCount(book){
  let n=0;
  for(const verse of Object.values(book.verses||{})){
    for(const tr of new Set([...Object.keys(verse.a||{}),...Object.keys(verse.v||{})])){
      n+=new Set([...Object.keys(verse.a?.[tr]||{}),...Object.keys(verse.v?.[tr]||{})]).size;
    }
  }
  return n;
}
function countVBrenton(books){
  let n=0;
  for(const book of books.values()){
    for(const verse of Object.values(book.verses||{})){
      n+=Object.keys(verse?.v?.brenton||{}).length;
    }
  }
  return n;
}
function prepare(root=process.cwd(),{planPath=null}={}){
  const plan=loadPlan(root,planPath);
  const original=new Map();
  function load(rel){const b=fs.readFileSync(path.join(root,rel));original.set(rel,b);return parse(b);}
  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT)).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/${f}`)]));
  const manifest=load(RUNTIME_MANIFEST);
  const overlay=parse(fs.readFileSync(path.join(root,OVERLAY)));

  const beforeV=countVBrenton(books);
  if(![0,7440].includes(beforeV))fail(`unexpected v.brenton count before Batch5: ${beforeV}`);

  const state=[];
  const touchedFiles=new Set();

  for(const r of plan.routes){
    const book=books.get(r.runtimeFile),verse=book?.verses?.[r.runtimeVerseKey];
    if(!verse)fail(`runtime verse missing: ${r.reference}`);
    const di=String(r.displayIndex);

    const num=numericRoute(verse,r.displayIndex);
    const over=r.topologyMode==="OVERLAY"?overlay.records?.[r.readerRecordId]?.routes?.[di]:null;
    if(num||over)fail(`Batch5 target now has single-token route: ${r.reference} @${di}`);

    verse.v??={};
    verse.v.brenton??={};
    const current=verse.v.brenton[di];
    if(current===undefined)state.push("PRE");
    else if(stable(current)===stable(r.compactV2))state.push("POST");
    else fail(`Batch5 target v.brenton differs from sealed route: ${r.reference} @${di}`);
  }

  const distinct=[...new Set(state)];
  if(distinct.length!==1)fail(`Batch5 mixed PRE/POST state: ${distinct.join(",")}`);
  const mode=distinct[0];

  if(mode==="PRE"){
    for(const r of plan.routes){
      const book=books.get(r.runtimeFile),verse=book.verses[r.runtimeVerseKey];
      verse.v??={}; verse.v.brenton??={};
      verse.v.brenton[String(r.displayIndex)]=r.compactV2;
      touchedFiles.add(r.runtimeFile);
    }
  }

  const afterV=countVBrenton(books);
  if(afterV!==7440)fail(`final v.brenton count wrong: ${afterV}`);

  // Re-verify all sealed routes in memory.
  for(const r of plan.routes){
    const verse=books.get(r.runtimeFile)?.verses?.[r.runtimeVerseKey];
    const got=verse?.v?.brenton?.[String(r.displayIndex)];
    if(stable(got)!==stable(r.compactV2))fail(`sealed v.brenton mismatch after apply: ${r.reference} @${r.displayIndex}`);
  }

  const proposed=new Map();
  for(const file of touchedFiles){
    const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
    proposed.set(`${RUNTIME_ROOT}/${file}`,bytes);
    const stats=manifest.corpora?.lxx?.books?.[file];
    if(!stats)fail(`runtime manifest stats missing for ${file}`);
    stats.bytes=bytes.length;
    stats.checksum=sha(bytes);
    if(Object.hasOwn(stats,"sha256"))stats.sha256=sha(bytes);
    stats.alignedDisplayTokens=alignedCount(book);
  }

  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{})
      .flatMap(c=>Object.values(c.books||{}))
      .reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(RUNTIME_MANIFEST,Buffer.from(JSON.stringify(manifest)+"\n"));

  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  return {plan,state:mode,changes,original,touchedFiles:[...touchedFiles].sort()};
}

function prepareForLegacyReplay(root=process.cwd(),{planPath=null}={}){
  const plan=loadPlan(root,planPath);
  const original=new Map();
  function load(rel){const b=fs.readFileSync(path.join(root,rel));original.set(rel,b);return parse(b);}

  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT)).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/${f}`)]));
  const manifest=load(RUNTIME_MANIFEST);

  let removed=0;
  const touchedFiles=new Set();

  for(const r of plan.routes){
    const book=books.get(r.runtimeFile),verse=book?.verses?.[r.runtimeVerseKey];
    if(!verse)fail(`runtime verse missing during legacy prep: ${r.reference}`);
    const di=String(r.displayIndex);
    const current=verse?.v?.brenton?.[di];

    if(current===undefined)continue;
    if(stable(current)!==stable(r.compactV2)){
      fail(`Batch5 legacy-prep target differs from sealed route: ${r.reference} @${di}`);
    }

    delete verse.v.brenton[di];
    if(Object.keys(verse.v.brenton).length===0)delete verse.v.brenton;
    if(Object.keys(verse.v).length===0)delete verse.v;
    removed++;
    touchedFiles.add(r.runtimeFile);
  }

  const proposed=new Map();
  for(const file of touchedFiles){
    const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
    proposed.set(`${RUNTIME_ROOT}/${file}`,bytes);

    const stats=manifest.corpora?.lxx?.books?.[file];
    if(!stats)fail(`runtime manifest stats missing during legacy prep for ${file}`);
    stats.bytes=bytes.length;
    stats.checksum=sha(bytes);
    if(Object.hasOwn(stats,"sha256"))stats.sha256=sha(bytes);
    stats.alignedDisplayTokens=alignedCount(book);
  }

  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{})
      .flatMap(c=>Object.values(c.books||{}))
      .reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(RUNTIME_MANIFEST,Buffer.from(JSON.stringify(manifest)+"\n"));

  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  const written=[];
  try{
    for(const [rel,b] of changes){
      written.push(rel);
      fs.writeFileSync(path.join(root,rel),b);
    }
  }catch(err){
    for(const rel of written.reverse()){
      const b=original.get(rel);
      if(b)fs.writeFileSync(path.join(root,rel),b);
    }
    throw err;
  }

  return {
    removedRoutes:removed,
    changedFiles:changes.length,
    touchedFiles:[...touchedFiles].sort()
  };
}

function applyBatch5(root=process.cwd(),{verifyOnly=false,planPath=null}={}){
  const p=prepare(root,{planPath});
  if(verifyOnly&&p.changes.length)fail(`Batch5 not fully applied: ${p.changes.length} files differ`);
  if(!verifyOnly){
    const written=[];
    try{
      for(const [rel,b] of p.changes){
        written.push(rel);fs.writeFileSync(path.join(root,rel),b);
      }
    }catch(err){
      for(const rel of written.reverse()){
        const b=p.original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b);
      }
      throw err;
    }
  }
  return {routes:p.plan.routes.length,spans:p.plan.spans.length,startingState:p.state,changedFiles:p.changes.length,touchedFiles:p.touchedFiles,verifyOnly};
}
if(require.main===module){
  const root=process.cwd(),planPath=process.env.EMET_BATCH5_PLAN||null;
  if(process.argv.includes("--prepare-legacy-replay")){
    console.log(JSON.stringify(prepareForLegacyReplay(root,{planPath}),null,2));
  }else if(process.argv.includes("--dry-run")){
    const p=prepare(root,{planPath});
    console.log(JSON.stringify({startingState:p.state,plannedChangedFiles:p.changes.length,routes:p.plan.routes.length,spans:p.plan.spans.length,touchedFiles:p.touchedFiles},null,2));
  }else{
    console.log(JSON.stringify(applyBatch5(root,{verifyOnly:process.argv.includes("--verify"),planPath}),null,2));
  }
}
module.exports={prepareBatch5:prepare,prepareForLegacyReplay,applyBatch5};
