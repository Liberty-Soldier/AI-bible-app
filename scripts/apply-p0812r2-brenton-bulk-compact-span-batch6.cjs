"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");

const DEFAULT_PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-bulk-compact-span-batch6/manifest.json";
const RUNTIME_ROOT="public/data/bibleiq/word-study/lxx";
const RUNTIME_MANIFEST="public/data/bibleiq/word-study/manifest.json";
const OVERLAY="public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const CONSUMER="app/data/scripture/CanonicalVerseStore.ts";

const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const parse=b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,""));
function fail(m){throw new Error(`[Brenton Bulk Batch6] ${m}`);}
function checksum(doc){const {checksum:ignored,...body}=doc;return sha(Buffer.from(JSON.stringify(body)));}

function loadPlan(root,planPath){
  const p=parse(fs.readFileSync(planPath||path.join(root,DEFAULT_PLAN)));
  if(p.batchId!=="p0812r2-brenton-bulk-compact-span-batch6"||
     p.proof?.approvedSpans!==23302||
     p.proof?.displayRouteEntries!==87960||
     p.proof?.meaningfulRoutePositions!==36373||
     p.proof?.sourceOverlapConflicts!==0||
     p.spans?.length!==23302||
     checksum(p)!==p.checksum){
    fail("sealed Batch6 plan changed");
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
function sourceRowMatches(row,route,si){
  return Boolean(row &&
    String(row[0]||"")===String(route.o||"") &&
    String(row[4]||"")===String(route.e||"") &&
    Number(si)>=0);
}
function validateSpanCurrent(span,verse,overlay){
  const left=span.leftBoundary,right=span.rightBoundary;
  let lr,rr;
  if(span.topologyMode==="OVERLAY"){
    const rec=overlay.records?.[span.readerRecordId];
    if(!rec)fail(`overlay record missing: ${span.reference}`);
    lr=overlayRoute(rec,left.displayIndex);
    rr=overlayRoute(rec,right.displayIndex);
  }else{
    if(overlay.records?.[span.readerRecordId])fail(`numeric span now has overlay record: ${span.reference}`);
    lr=numericRoute(verse,left.displayIndex);
    rr=numericRoute(verse,right.displayIndex);
  }
  if(!lr||lr.sourceIndex!==Number(left.sourceIndex)||lr.sourceId!==String(left.sourceOccurrenceId)){
    fail(`left boundary changed: ${span.reference}`);
  }
  if(!rr||rr.sourceIndex!==Number(right.sourceIndex)||rr.sourceId!==String(right.sourceOccurrenceId)){
    fail(`right boundary changed: ${span.reference}`);
  }

  const sis=span.compactV2?.si||[],routes=span.compactV2?.routes||[];
  if(sis.length<1||sis.length!==routes.length)fail(`invalid compact source list: ${span.reference}`);
  for(let i=0;i<sis.length;i++){
    const si=Number(sis[i]),row=verse?.s?.[si];
    if(!sourceRowMatches(row,routes[i],si))fail(`source identity changed: ${span.reference}`);
    if(i>0&&si!==Number(sis[i-1])+1)fail(`source no longer contiguous: ${span.reference}`);
  }
  if(Number(sis[0])!==lr.sourceIndex+1||Number(sis[sis.length-1])!==rr.sourceIndex-1){
    fail(`source no longer exactly bounded: ${span.reference}`);
  }
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
  if(![7440,95400].includes(beforeV))fail(`unexpected v.brenton count before Batch6: ${beforeV}`);

  const states=[];
  const touchedFiles=new Set();
  const displayTargets=new Set();

  for(const s of plan.spans){
    const book=books.get(s.runtimeFile),verse=book?.verses?.[s.runtimeVerseKey];
    if(!verse)fail(`runtime verse missing: ${s.reference}`);
    validateSpanCurrent(s,verse,overlay);

    for(let di=Number(s.displayStart);di<=Number(s.displayEnd);di++){
      const key=`${s.runtimeFile}|${s.runtimeVerseKey}|${di}`;
      if(displayTargets.has(key))fail(`duplicate Batch6 display target: ${key}`);
      displayTargets.add(key);

      const num=numericRoute(verse,di);
      const over=s.topologyMode==="OVERLAY"?overlayRoute(overlay.records?.[s.readerRecordId],di):null;
      if(num||over)fail(`Batch6 target has single-token route: ${s.reference} @${di}`);

      verse.v??={};verse.v.brenton??={};
      const current=verse.v.brenton[String(di)];
      if(current===undefined)states.push("PRE");
      else if(stable(current)===stable(s.compactV2))states.push("POST");
      else fail(`Batch6 target v.brenton differs from sealed route: ${s.reference} @${di}`);
    }
  }

  if(displayTargets.size!==87960)fail(`Batch6 display target count wrong: ${displayTargets.size}`);
  const distinct=[...new Set(states)];
  if(distinct.length!==1)fail(`Batch6 mixed PRE/POST state: ${distinct.join(",")}`);
  const state=distinct[0];

  if(state==="PRE"){
    for(const s of plan.spans){
      const verse=books.get(s.runtimeFile).verses[s.runtimeVerseKey];
      verse.v??={};verse.v.brenton??={};
      for(let di=Number(s.displayStart);di<=Number(s.displayEnd);di++){
        verse.v.brenton[String(di)]=s.compactV2;
      }
      touchedFiles.add(s.runtimeFile);
    }
  }

  const afterV=countVBrenton(books);
  if(afterV!==95400)fail(`final v.brenton count wrong: ${afterV}`);

  for(const s of plan.spans){
    const verse=books.get(s.runtimeFile)?.verses?.[s.runtimeVerseKey];
    for(let di=Number(s.displayStart);di<=Number(s.displayEnd);di++){
      const got=verse?.v?.brenton?.[String(di)];
      if(stable(got)!==stable(s.compactV2))fail(`sealed Batch6 mismatch: ${s.reference} @${di}`);
    }
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
  return {plan,state,changes,original,touchedFiles:[...touchedFiles].sort()};
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

  for(const s of plan.spans){
    const verse=books.get(s.runtimeFile)?.verses?.[s.runtimeVerseKey];
    if(!verse)fail(`runtime verse missing during legacy prep: ${s.reference}`);

    for(let di=Number(s.displayStart);di<=Number(s.displayEnd);di++){
      const current=verse?.v?.brenton?.[String(di)];
      if(current===undefined)continue;
      if(stable(current)!==stable(s.compactV2)){
        fail(`Batch6 legacy-prep target differs from sealed route: ${s.reference} @${di}`);
      }
      delete verse.v.brenton[String(di)];
      removed++;
      touchedFiles.add(s.runtimeFile);
    }

    if(verse.v?.brenton&&Object.keys(verse.v.brenton).length===0)delete verse.v.brenton;
    if(verse.v&&Object.keys(verse.v).length===0)delete verse.v;
  }

  if(removed!==0&&removed!==87960)fail(`Batch6 legacy-prep removed unexpected count: ${removed}`);

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
    for(const [rel,b] of changes){written.push(rel);fs.writeFileSync(path.join(root,rel),b);}
  }catch(err){
    for(const rel of written.reverse()){const b=original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b);}
    throw err;
  }
  return {removedRoutes:removed,changedFiles:changes.length,touchedFiles:[...touchedFiles].sort()};
}

function applyBatch6(root=process.cwd(),{verifyOnly=false,planPath=null}={}){
  const p=prepare(root,{planPath});
  if(verifyOnly&&p.changes.length)fail(`Batch6 not fully applied: ${p.changes.length} files differ`);
  if(!verifyOnly){
    const written=[];
    try{
      for(const [rel,b] of p.changes){written.push(rel);fs.writeFileSync(path.join(root,rel),b);}
    }catch(err){
      for(const rel of written.reverse()){const b=p.original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b);}
      throw err;
    }
  }
  return {spans:p.plan.spans.length,displayRoutes:87960,startingState:p.state,changedFiles:p.changes.length,touchedFiles:p.touchedFiles,verifyOnly};
}

if(require.main===module){
  const root=process.cwd(),planPath=process.env.EMET_BATCH6_PLAN||null;
  if(process.argv.includes("--prepare-legacy-replay")){
    console.log(JSON.stringify(prepareForLegacyReplay(root,{planPath}),null,2));
  }else if(process.argv.includes("--dry-run")){
    const p=prepare(root,{planPath});
    console.log(JSON.stringify({startingState:p.state,plannedChangedFiles:p.changes.length,spans:p.plan.spans.length,displayRoutes:87960,touchedFiles:p.touchedFiles},null,2));
  }else{
    console.log(JSON.stringify(applyBatch6(root,{verifyOnly:process.argv.includes("--verify"),planPath}),null,2));
  }
}
module.exports={prepareBatch6:prepare,prepareForLegacyReplay,applyBatch6};
