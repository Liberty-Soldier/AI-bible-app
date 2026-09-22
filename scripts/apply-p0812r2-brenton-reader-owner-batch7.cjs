"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");

const DEFAULT_LOCK="app/data/bibleiq/runtime-locks/p0812r2-brenton-reader-owner-batch7/manifest.json";
const RUNTIME_ROOT="public/data/bibleiq/word-study/lxx";
const RUNTIME_MANIFEST="public/data/bibleiq/word-study/manifest.json";
const B5="app/data/bibleiq/runtime-locks/p0812r2-brenton-tier3-recurring-family-span-batch5/manifest.json";
const B6="app/data/bibleiq/runtime-locks/p0812r2-brenton-bulk-compact-span-batch6/manifest.json";

const parse=b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,""));
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
function fail(m,d=null){throw new Error(`[Brenton Reader Owner Batch7] ${m}${d?` ${JSON.stringify(d)}`:""}`)}
function checksum(doc){const {checksum:ignored,...body}=doc;return sha(Buffer.from(JSON.stringify(body)));}
function stable(v){return JSON.stringify(v);}

function loadContract(root,lockPath){
  const lock=parse(fs.readFileSync(lockPath||path.join(root,DEFAULT_LOCK)));
  if(lock.batchId!=="p0812r2-brenton-reader-owner-batch7"||lock.expected?.ownerEntries!==95400)fail("Batch7 lock contract changed");
  const b5=parse(fs.readFileSync(path.join(root,B5)));
  const b6=parse(fs.readFileSync(path.join(root,B6)));
  if(b5.batchId!=="p0812r2-brenton-tier3-recurring-family-span-batch5"||b5.routes?.length!==7440)fail("Batch5 sealed route contract changed");
  if(b6.batchId!=="p0812r2-brenton-bulk-compact-span-batch6"||b6.spans?.length!==23302||b6.proof?.displayRouteEntries!==87960)fail("Batch6 sealed span contract changed");
  return {lock,b5,b6};
}

function buildOwnerPlan(root,lockPath){
  const {lock,b5,b6}=loadContract(root,lockPath);
  const owners=new Map();
  function add(readerRecordId,runtimeFile,runtimeVerseKey,displayIndex,compactV2,batch,reference){
    const key=`${runtimeFile}|${runtimeVerseKey}|${Number(displayIndex)}`;
    if(owners.has(key))fail("duplicate runtime owner coordinate",{key,prior:owners.get(key),next:{readerRecordId,batch,reference}});
    owners.set(key,{readerRecordId:String(readerRecordId),runtimeFile,runtimeVerseKey,displayIndex:Number(displayIndex),compactV2,batch,reference});
  }
  for(const r of b5.routes) add(r.readerRecordId,r.runtimeFile,r.runtimeVerseKey,r.displayIndex,r.compactV2,"BATCH5",r.reference);
  for(const s of b6.spans){
    for(let di=Number(s.displayStart);di<=Number(s.displayEnd);di++) add(s.readerRecordId,s.runtimeFile,s.runtimeVerseKey,di,s.compactV2,"BATCH6",s.reference);
  }
  if(owners.size!==95400)fail("owner plan count wrong",{actual:owners.size});
  return {lock,owners};
}

function alignedCount(book){
  let n=0;
  for(const verse of Object.values(book.verses||{})){
    for(const tr of new Set([...Object.keys(verse.a||{}),...Object.keys(verse.v||{})])){
      n+=new Set([...Object.keys(verse.a?.[tr]||{}),...Object.keys(verse.v?.[tr]||{})]).size;
    }
  }
  return n;
}
function countOwners(books){
  let n=0;
  for(const book of books.values())for(const verse of Object.values(book.verses||{}))n+=Object.keys(verse?.vo?.brenton||{}).length;
  return n;
}

function prepare(root=process.cwd(),{lockPath=null}={}){
  const {lock,owners}=buildOwnerPlan(root,lockPath);
  const original=new Map();
  function load(rel){const b=fs.readFileSync(path.join(root,rel));original.set(rel,b);return parse(b)}
  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT)).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/${f}`)]));
  const manifest=load(RUNTIME_MANIFEST);
  const before=countOwners(books);
  if(![0,95400].includes(before))fail("unexpected pre-Batch7 owner count",{before});
  const states=[],touched=new Set();
  for(const [key,o] of owners){
    const verse=books.get(o.runtimeFile)?.verses?.[o.runtimeVerseKey];
    if(!verse)fail("runtime verse missing",{key,reference:o.reference});
    const actualV=verse?.v?.brenton?.[String(o.displayIndex)];
    if(stable(actualV)!==stable(o.compactV2))fail("sealed v.brenton route changed",{key,reference:o.reference});
    const current=verse?.vo?.brenton?.[String(o.displayIndex)];
    if(current===undefined)states.push("PRE");
    else if(String(current)===o.readerRecordId)states.push("POST");
    else fail("owner mismatch",{key,current,expected:o.readerRecordId});
  }
  const distinct=[...new Set(states)];
  if(distinct.length!==1)fail("mixed PRE/POST owner state",{distinct});
  const state=distinct[0];
  if(state==="PRE"){
    for(const o of owners.values()){
      const verse=books.get(o.runtimeFile).verses[o.runtimeVerseKey];
      verse.vo??={}; verse.vo.brenton??={};
      verse.vo.brenton[String(o.displayIndex)]=o.readerRecordId;
      touched.add(o.runtimeFile);
    }
  }
  const after=countOwners(books);
  if(after!==95400)fail("final owner count wrong",{after});
  for(const [key,o] of owners){
    const verse=books.get(o.runtimeFile).verses[o.runtimeVerseKey];
    if(String(verse?.vo?.brenton?.[String(o.displayIndex)]||"")!==o.readerRecordId)fail("sealed owner verify failed",{key});
  }
  const proposed=new Map();
  for(const file of touched){
    const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
    proposed.set(`${RUNTIME_ROOT}/${file}`,bytes);
    const stats=manifest.corpora?.lxx?.books?.[file];
    if(!stats)fail("runtime manifest stats missing",{file});
    stats.bytes=bytes.length;stats.checksum=sha(bytes);if(Object.hasOwn(stats,"sha256"))stats.sha256=sha(bytes);stats.alignedDisplayTokens=alignedCount(book);
  }
  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{}).flatMap(c=>Object.values(c.books||{})).reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(RUNTIME_MANIFEST,Buffer.from(JSON.stringify(manifest)+"\n"));
  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  return {lock,owners,state,changes,original,touchedFiles:[...touched].sort()};
}

function prepareForLegacyReplay(root=process.cwd(),{lockPath=null}={}){
  const {owners}=buildOwnerPlan(root,lockPath);
  const original=new Map();
  function load(rel){const b=fs.readFileSync(path.join(root,rel));original.set(rel,b);return parse(b)}
  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT)).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/${f}`)]));
  const manifest=load(RUNTIME_MANIFEST);
  let removed=0;const touched=new Set();
  for(const [key,o] of owners){
    const verse=books.get(o.runtimeFile)?.verses?.[o.runtimeVerseKey];
    if(!verse)fail("runtime verse missing during legacy prep",{key});
    const current=verse?.vo?.brenton?.[String(o.displayIndex)];
    if(current===undefined)continue;
    if(String(current)!==o.readerRecordId)fail("legacy-prep owner differs from sealed owner",{key,current,expected:o.readerRecordId});
    delete verse.vo.brenton[String(o.displayIndex)];
    if(Object.keys(verse.vo.brenton).length===0)delete verse.vo.brenton;
    if(Object.keys(verse.vo).length===0)delete verse.vo;
    removed++;touched.add(o.runtimeFile);
  }
  if(removed!==0&&removed!==95400)fail("legacy-prep removed unexpected owner count",{removed});
  const proposed=new Map();
  for(const file of touched){
    const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
    proposed.set(`${RUNTIME_ROOT}/${file}`,bytes);
    const stats=manifest.corpora?.lxx?.books?.[file];
    if(!stats)fail("runtime manifest stats missing during prep",{file});
    stats.bytes=bytes.length;stats.checksum=sha(bytes);if(Object.hasOwn(stats,"sha256"))stats.sha256=sha(bytes);stats.alignedDisplayTokens=alignedCount(book);
  }
  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{}).flatMap(c=>Object.values(c.books||{})).reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(RUNTIME_MANIFEST,Buffer.from(JSON.stringify(manifest)+"\n"));
  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  const written=[];
  try{for(const [rel,b] of changes){written.push(rel);fs.writeFileSync(path.join(root,rel),b)}}catch(err){for(const rel of written.reverse()){const b=original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b)}throw err}
  return {removedOwners:removed,changedFiles:changes.length,touchedFiles:[...touched].sort()};
}

function applyBatch7(root=process.cwd(),{verifyOnly=false,lockPath=null}={}){
  const p=prepare(root,{lockPath});
  if(verifyOnly&&p.changes.length)fail("Batch7 not fully applied",{changedFiles:p.changes.length});
  if(!verifyOnly){
    const written=[];
    try{for(const [rel,b] of p.changes){written.push(rel);fs.writeFileSync(path.join(root,rel),b)}}catch(err){for(const rel of written.reverse()){const b=p.original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b)}throw err}
  }
  return {ownerEntries:p.owners.size,startingState:p.state,changedFiles:p.changes.length,touchedFiles:p.touchedFiles,verifyOnly};
}

if(require.main===module){
  const root=process.cwd(),lockPath=process.env.EMET_BATCH7_LOCK||null;
  if(process.argv.includes("--prepare-legacy-replay"))console.log(JSON.stringify(prepareForLegacyReplay(root,{lockPath}),null,2));
  else if(process.argv.includes("--dry-run")){const p=prepare(root,{lockPath});console.log(JSON.stringify({ownerEntries:p.owners.size,startingState:p.state,plannedChangedFiles:p.changes.length,touchedFiles:p.touchedFiles},null,2));}
  else console.log(JSON.stringify(applyBatch7(root,{verifyOnly:process.argv.includes("--verify"),lockPath}),null,2));
}
module.exports={prepareBatch7:prepare,prepareForLegacyReplay,applyBatch7};
