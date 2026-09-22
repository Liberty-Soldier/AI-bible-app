"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");

const DEFAULT_PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-legacy65-failclosed-batch4/manifest.json";
const RUNTIME_ROOT="public/data/bibleiq/word-study";
const READER="app/data/scripture/generatedBrenton.json";
const READER_INTEGRITY="app/data/scripture/generatedBrenton.integrity.json";

const READER_SHA="28786b790c642dd6d67800c25f8062853f49d877cfb23264dbb90fc6cade6c32";
const INTEGRITY_SHA="4769adb231d725ea8409e395686579758320e640f0af08a5ee18a44aa7ef9753";

const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const parse=b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,""));
function fail(m){throw new Error(`[Brenton legacy65 Batch 4] ${m}`);}
function checksum(doc){const {checksum:ignored,...body}=doc;return sha(Buffer.from(JSON.stringify(body)));}

function numericRoute(verse,index){
  const raw=verse?.a?.brenton?.[String(index)];
  if(raw===undefined)return null;
  const si=Number(raw),row=verse?.s?.[si];
  return row?{
    sourceIndex:si,
    sourceId:String(row[0]||""),
    entityId:String(row[4]||"")
  }:null;
}
function sameRoute(a,b){
  if(a==null||b==null)return a==null&&b==null;
  return Number(a.sourceIndex)===Number(b.sourceIndex)&&
    String(a.sourceId||"")===String(b.sourceId||"")&&
    String(a.entityId||"")===String(b.entityId||"");
}
function alignedCount(book){
  let n=0;
  for(const verse of Object.values(book.verses||{})){
    for(const tr of new Set([...Object.keys(verse.a||{}),...Object.keys(verse.v||{})])){
      n+=new Set([
        ...Object.keys(verse.a?.[tr]||{}),
        ...Object.keys(verse.v?.[tr]||{})
      ]).size;
    }
  }
  return n;
}
function loadPlan(root,planPath){
  const p=parse(fs.readFileSync(planPath||path.join(root,DEFAULT_PLAN)));
  if(p.batchId!=="p0812r2-brenton-legacy65-failclosed-batch4"||
     p.counts?.removeRoutes!==65||
     p.candidates?.length!==65||
     checksum(p)!==p.checksum){
    fail("sealed Batch 4 plan changed");
  }
  if(sha(fs.readFileSync(path.join(root,READER)))!==READER_SHA)fail("locked Brenton reader changed");
  if(sha(fs.readFileSync(path.join(root,READER_INTEGRITY)))!==INTEGRITY_SHA)fail("locked Brenton reader integrity changed");
  return p;
}
function countNumeric(books){
  let n=0;
  for(const book of books.values()){
    for(const verse of Object.values(book.verses||{})){
      n+=Object.keys(verse?.a?.brenton||{}).length;
    }
  }
  return n;
}

function prepareBatch4(root=process.cwd(),{planPath=null}={}){
  const plan=loadPlan(root,planPath);
  const read=rel=>fs.readFileSync(path.join(root,rel));
  const original=new Map();
  function load(rel){
    const b=read(rel); original.set(rel,b); return parse(b);
  }

  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT,"lxx")).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/lxx/${f}`)]));
  const manifest=load(`${RUNTIME_ROOT}/manifest.json`);

  const numericBefore=countNumeric(books);
  if(![143073,143008].includes(numericBefore)){
    fail(`unexpected numeric route count before Batch 4: ${numericBefore}`);
  }

  const states=[];
  const targets=new Set();

  for(const c of plan.candidates){
    if(c.runtimeFile!=="Psalms.json")fail(`unexpected Batch 4 runtime file: ${c.runtimeFile}`);
    const tk=`${c.readerRecordId}|${Number(c.displayIndex)}`;
    if(targets.has(tk))fail(`duplicate Batch 4 target: ${tk}`);
    targets.add(tk);

    const verse=books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey];
    if(!verse)fail(`runtime verse missing: ${c.reference}`);

    const current=numericRoute(verse,c.displayIndex);
    const expected={
      sourceIndex:Number(c.from.sourceIndex),
      sourceId:String(c.from.sourceId),
      entityId:String(c.from.entityId)
    };

    if(verse?.v?.brenton?.[String(c.displayIndex)]!==undefined){
      fail(`Batch 4 target also has span route: ${c.reference} @${c.displayIndex}`);
    }

    if(current==null){
      states.push("POST");
    }else if(sameRoute(current,expected)){
      states.push("PRE");
    }else{
      fail(`Batch 4 target route changed: ${c.reference} @${c.displayIndex}`);
    }
  }

  const distinct=[...new Set(states)];
  if(distinct.length!==1)fail(`Batch 4 is in mixed PRE/POST state: ${distinct.join(",")}`);
  const state=distinct[0];

  if(state==="PRE"){
    for(const c of plan.candidates){
      const verse=books.get(c.runtimeFile).verses[c.runtimeVerseKey];
      delete verse.a.brenton[String(c.displayIndex)];
      if(verse.m?.brenton)delete verse.m.brenton[String(c.displayIndex)];
    }
  }

  for(const c of plan.candidates){
    const verse=books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey];
    if(numericRoute(verse,c.displayIndex)!==null){
      fail(`Batch 4 target still routed after in-memory removal: ${c.reference} @${c.displayIndex}`);
    }
  }

  const numericAfter=countNumeric(books);
  if(numericAfter!==143008)fail(`final Batch 4 numeric route count wrong: ${numericAfter}`);

  const proposed=new Map();
  const file="Psalms.json";
  const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
  proposed.set(`${RUNTIME_ROOT}/lxx/${file}`,bytes);

  const stats=manifest.corpora?.lxx?.books?.[file];
  if(!stats)fail("runtime manifest Psalms stats missing");
  stats.bytes=bytes.length;
  stats.checksum=sha(bytes);
  if(Object.hasOwn(stats,"sha256"))stats.sha256=sha(bytes);
  stats.alignedDisplayTokens=alignedCount(book);

  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{})
      .flatMap(c=>Object.values(c.books||{}))
      .reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(`${RUNTIME_ROOT}/manifest.json`,Buffer.from(JSON.stringify(manifest)+"\n"));

  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  return {plan,state,changes,original};
}

function applyBatch4(root=process.cwd(),{verifyOnly=false,planPath=null}={}){
  const p=prepareBatch4(root,{planPath});
  if(verifyOnly&&p.changes.length)fail(`Batch 4 not fully applied: ${p.changes.length} files differ`);
  if(!verifyOnly){
    const written=[];
    try{
      for(const [rel,b] of p.changes){
        written.push(rel); fs.writeFileSync(path.join(root,rel),b);
      }
    }catch(err){
      for(const rel of written.reverse()){
        const b=p.original.get(rel); if(b)fs.writeFileSync(path.join(root,rel),b);
      }
      throw err;
    }
  }
  return {
    removedRoutes:p.plan.counts.removeRoutes,
    startingState:p.state,
    changedFiles:p.changes.length,
    verifyOnly
  };
}

if(require.main===module){
  const root=process.cwd(),planPath=process.env.EMET_BATCH4_PLAN||null;
  if(process.argv.includes("--dry-run")){
    const p=prepareBatch4(root,{planPath});
    console.log(JSON.stringify({startingState:p.state,plannedChangedFiles:p.changes.length,removeRoutes:p.plan.counts.removeRoutes},null,2));
  }else{
    console.log(JSON.stringify(applyBatch4(root,{verifyOnly:process.argv.includes("--verify"),planPath}),null,2));
  }
}

module.exports={prepareBatch4,applyBatch4};
