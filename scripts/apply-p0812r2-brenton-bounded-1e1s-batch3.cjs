"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");

const DEFAULT_PLAN="app/data/bibleiq/runtime-locks/p0812r2-brenton-bounded-1e1s-batch3/manifest.json";
const RUNTIME_ROOT="public/data/bibleiq/word-study";
const OVERLAY="public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const READER="app/data/scripture/generatedBrenton.json";
const READER_INTEGRITY="app/data/scripture/generatedBrenton.integrity.json";
const BATCH1="app/data/bibleiq/runtime-locks/p0812r2-brenton-compact-batch1/manifest.json";
const BATCH2="app/data/bibleiq/runtime-locks/p0812r2-brenton-nonparity-coordinate-batch2/manifest.json";
const TOKENIZER="scripts/canonical/utils/tokenize.js";

const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const parse=b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,""));
const routable=v=>/^word:lxx:L\d+$/.test(String(v||""));
function fail(m){throw new Error(`[Brenton bounded 1E1S batch 3] ${m}`);}
function checksum(doc){const {checksum:ignored,...body}=doc;return sha(Buffer.from(JSON.stringify(body)));}
function sameRoute(a,b){
  if(a==null||b==null)return a==null&&b==null;
  return Number(a.sourceIndex)===Number(b.sourceIndex)&&String(a.sourceId||"")===String(b.sourceId||"")&&String(a.entityId||"")===String(b.entityId||"");
}
function numericRoute(verse,index){
  const raw=verse?.a?.brenton?.[String(index)];
  if(raw===undefined)return null;
  const si=Number(raw),row=verse?.s?.[si];
  return {sourceIndex:si,sourceId:String(row?.[0]||""),entityId:String(row?.[4]||"")};
}
function overlayRoute(rec,index){
  const r=rec?.routes?.[String(index)];
  if(!Array.isArray(r)||r.length!==3)return null;
  return {sourceIndex:Number(r[0]),sourceId:String(r[1]||""),entityId:String(r[2]||"")};
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
function verifyCanonicalInventory(root,rows){
  const croot=path.join(root,"app/data/bibleiq/canonical/lxx");
  const actual=fs.readdirSync(croot).filter(x=>x.endsWith(".json")).sort();
  const expected=rows.map(x=>path.basename(x.Name||x.name||x.File||x.file||x.Path||x.path||x)).sort();
  if(actual.length!==49||JSON.stringify(actual)!==JSON.stringify(expected))fail("Locked canonical LXX file set changed.");
  for(const x of rows){
    if(typeof x==="string")continue;
    const name=path.basename(x.Name||x.name||x.File||x.file||x.Path||x.path||"");
    const h=String(x.SHA256||x.sha256||x.Hash||x.hash||"").toLowerCase();
    if(h&&sha(fs.readFileSync(path.join(croot,name))).toLowerCase()!==h)fail(`Locked canonical LXX hash changed: ${name}`);
  }
}
function routeAt(books,overlay,c,index){
  return c.topologyMode==="OVERLAY"
    ? overlayRoute(overlay.records?.[c.readerRecordId],index)
    : numericRoute(books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey],index);
}
function allOwners(books,overlay,c){
  const out=[],verse=books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey];
  for(const [di,si] of Object.entries(verse?.a?.brenton||{})){
    const row=verse.s?.[Number(si)];
    if(row&&String(row[0]||"")===c.to.sourceId)out.push({mode:"NUMERIC",readerRecordId:null,displayIndex:Number(di)});
  }
  for(const [rid,rec] of Object.entries(overlay.records||{})){
    if(rec.runtimeFile!==c.runtimeFile||rec.runtimeVerseKey!==c.runtimeVerseKey)continue;
    for(const [di,r] of Object.entries(rec.routes||{})){
      if(Array.isArray(r)&&String(r[1]||"")===c.to.sourceId)out.push({mode:"OVERLAY",readerRecordId:rid,displayIndex:Number(di)});
    }
  }
  return out;
}
function ownerIsCandidate(owners,c){
  const mode=c.topologyMode==="OVERLAY"?"OVERLAY":"NUMERIC";
  return owners.length===1&&owners[0].mode===mode&&
    (mode!=="OVERLAY"||owners[0].readerRecordId===c.readerRecordId)&&
    owners[0].displayIndex===Number(c.displayIndex);
}
function loadPlan(root,planPath){
  const p=parse(fs.readFileSync(planPath||path.join(root,DEFAULT_PLAN)));
  if(p.batchId!=="p0812r2-brenton-bounded-1e1s-batch3"||
     p.counts?.routes!==1481||p.counts?.numeric!==1387||p.counts?.overlay!==94||
     p.candidates?.length!==1481||checksum(p)!==p.checksum)fail("Batch 3 sealed plan changed.");
  if(sha(fs.readFileSync(path.join(root,READER)))!==p.locked.generatedBrentonSha256)fail("Locked Brenton reader changed.");
  if(sha(fs.readFileSync(path.join(root,READER_INTEGRITY)))!==p.locked.generatedBrentonIntegritySha256)fail("Locked Brenton integrity changed.");
  verifyCanonicalInventory(root,p.locked.canonicalInventory);
  return p;
}
function verifyPriorBatches(root,books,overlay){
  const b1=parse(fs.readFileSync(path.join(root,BATCH1)));
  if(checksum(b1)!==b1.checksum||b1.checksum!=="e4036b82b6adf45c6e16fb83d1c20a2938923dd525dc01fd0598bd8876729b58"||b1.count!==37||b1.candidates?.length!==37)fail("Batch 1 seal changed.");
  for(const c of b1.candidates){
    const verse=books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey];
    const expected={sourceIndex:Number(c.sourceIndex),sourceId:String(c.occurrenceId),entityId:String(c.entityId)};
    const actual=c.topologyMode==="OVERLAY"?overlayRoute(overlay.records?.[c.readerRecordId],c.displayIndex):numericRoute(verse,c.displayIndex);
    if(!sameRoute(actual,expected))fail(`Batch 1 route missing: ${c.reference} @${c.displayIndex}`);
  }
  const b2=parse(fs.readFileSync(path.join(root,BATCH2)));
  if(checksum(b2)!==b2.checksum||b2.checksum!=="1d811492df221bbdaec4b1bee1de30b2c6e733870b524f909eef3081cbc433ef"||
     b2.correctness?.components!==484||b2.transactions?.length!==484)fail("Batch 2 seal changed.");
  for(const tx of b2.transactions){
    const verse=books.get(tx.runtimeFile)?.verses?.[tx.runtimeVerseKey];
    if(!verse)fail(`Batch 2 verse missing: ${tx.reference}`);
    for(const [idx,expected] of Object.entries(tx.post||{})){
      if(!sameRoute(numericRoute(verse,Number(idx)),expected))fail(`Batch 2 post-state missing: ${tx.reference} @${idx}`);
    }
  }
}
function prepareBatch3(root=process.cwd(),{planPath=null}={}){
  const plan=loadPlan(root,planPath),read=rel=>fs.readFileSync(path.join(root,rel)),original=new Map();
  function load(rel){const b=read(rel);original.set(rel,b);return parse(b);}
  const files=fs.readdirSync(path.join(root,RUNTIME_ROOT,"lxx")).filter(x=>x.endsWith(".json")).sort();
  const books=new Map(files.map(f=>[f,load(`${RUNTIME_ROOT}/lxx/${f}`)]));
  const manifest=load(`${RUNTIME_ROOT}/manifest.json`),overlay=load(OVERLAY);
  if(checksum(overlay)!==overlay.checksum||Object.keys(overlay.records||{}).length!==2017)fail("Overlay seal invalid.");
  const overlayCount=Object.values(overlay.records||{}).reduce((n,r)=>n+Object.keys(r.routes||{}).length,0);
  if(![9915,10009].includes(overlayCount)||overlay.counts?.routes!==overlayCount)fail(`Unexpected overlay route count: ${overlayCount}`);
  let numericCount=0;
  for(const book of books.values())for(const verse of Object.values(book.verses||{}))numericCount+=Object.keys(verse?.a?.brenton||{}).length;
  if(![141686,143073].includes(numericCount))fail(`Unexpected numeric route count: ${numericCount}`);
  verifyPriorBatches(root,books,overlay);

  const reader=parse(read(READER)),records=new Map((reader.verses||[]).map(r=>[String(r.id),r]));
  const {tokenizeDisplayText}=require(path.join(root,TOKENIZER));
  const states=[],targets=new Set(),sources=new Set();

  for(const c of plan.candidates){
    const tk=`${c.readerRecordId}|${Number(c.displayIndex)}`,sk=`${c.runtimeFile}|${c.runtimeVerseKey}|${c.to.sourceId}`;
    if(targets.has(tk))fail(`Duplicate target: ${tk}`);targets.add(tk);
    if(sources.has(sk))fail(`Duplicate source: ${sk}`);sources.add(sk);

    const verse=books.get(c.runtimeFile)?.verses?.[c.runtimeVerseKey];
    if(!verse)fail(`Runtime verse missing: ${c.reference}`);
    const row=verse.s?.[Number(c.to.sourceIndex)];
    if(!row||String(row[0]||"")!==c.to.sourceId||String(row[4]||"")!==c.to.entityId||!routable(row[4]))fail(`Source identity changed: ${c.reference}`);

    const rec=records.get(c.readerRecordId);
    if(!rec)fail(`Reader record missing: ${c.readerRecordId}`);
    const tokens=tokenizeDisplayText(String(rec.text??rec.display?.text??rec.content??rec.verseText??""));
    if(String(tokens[c.displayIndex]?.text??"")!==c.displayText)fail(`Display token changed: ${c.reference}`);

    if(c.topologyMode==="OVERLAY"){
      const o=overlay.records?.[c.readerRecordId];
      if(!o||o.runtimeFile!==c.runtimeFile||o.runtimeVerseKey!==c.runtimeVerseKey)fail(`Overlay topology changed: ${c.reference}`);
    }else if(c.topologyMode==="NUMERIC_FALLBACK"){
      if(overlay.records?.[c.readerRecordId])fail(`Numeric target unexpectedly has overlay: ${c.reference}`);
      if(verse.v?.brenton?.[String(c.displayIndex)]!==undefined)fail(`Numeric target has span route: ${c.reference}`);
    }else fail(`Unknown topology: ${c.topologyMode}`);

    const left=routeAt(books,overlay,c,Number(c.leftBoundary.displayIndex));
    const right=routeAt(books,overlay,c,Number(c.rightBoundary.displayIndex));
    if(!left||left.sourceIndex!==Number(c.leftBoundary.sourceIndex)||left.sourceId!==String(c.leftBoundary.sourceOccurrenceId))fail(`Left anchor changed: ${c.reference}`);
    if(!right||right.sourceIndex!==Number(c.rightBoundary.sourceIndex)||right.sourceId!==String(c.rightBoundary.sourceOccurrenceId))fail(`Right anchor changed: ${c.reference}`);
    if(Number(c.to.sourceIndex)!==Number(c.leftBoundary.sourceIndex)+1||Number(c.to.sourceIndex)!==Number(c.rightBoundary.sourceIndex)-1)fail(`Source gap changed: ${c.reference}`);

    const expected={sourceIndex:Number(c.to.sourceIndex),sourceId:String(c.to.sourceId),entityId:String(c.to.entityId)};
    const current=routeAt(books,overlay,c,Number(c.displayIndex));
    const state=current==null?"PRE":sameRoute(current,expected)?"POST":"CONFLICT";
    if(state==="CONFLICT")fail(`Target conflict: ${c.reference}`);
    const owners=allOwners(books,overlay,c);
    if(state==="PRE"&&owners.length!==0)fail(`PRE source already owned: ${c.reference}`);
    if(state==="POST"&&!ownerIsCandidate(owners,c))fail(`POST source ownership not unique: ${c.reference}`);
    states.push(state);
  }

  const distinct=[...new Set(states)];
  if(distinct.length!==1)fail(`Mixed Batch 3 state: ${distinct.join(",")}`);
  const state=distinct[0];

  if(state==="PRE"){
    for(const c of plan.candidates){
      if(c.topologyMode==="OVERLAY"){
        overlay.records[c.readerRecordId].routes[String(c.displayIndex)]=[Number(c.to.sourceIndex),String(c.to.sourceId),String(c.to.entityId)];
      }else{
        const verse=books.get(c.runtimeFile).verses[c.runtimeVerseKey];
        verse.a||={};verse.a.brenton||={};verse.m||={};verse.m.brenton||={};
        verse.a.brenton[String(c.displayIndex)]=Number(c.to.sourceIndex);
        verse.m.brenton[String(c.displayIndex)]="p0812r2-bounded-1e1s-batch3";
      }
    }
  }

  overlay.counts.routes=Object.values(overlay.records||{}).reduce((n,r)=>n+Object.keys(r.routes||{}).length,0);
  if(overlay.counts.routes!==10009)fail(`Final overlay count wrong: ${overlay.counts.routes}`);
  overlay.checksum=checksum(overlay);

  let finalNumeric=0;
  for(const book of books.values())for(const verse of Object.values(book.verses||{}))finalNumeric+=Object.keys(verse?.a?.brenton||{}).length;
  if(finalNumeric!==143073)fail(`Final numeric count wrong: ${finalNumeric}`);

  for(const c of plan.candidates){
    const expected={sourceIndex:Number(c.to.sourceIndex),sourceId:String(c.to.sourceId),entityId:String(c.to.entityId)};
    if(!sameRoute(routeAt(books,overlay,c,Number(c.displayIndex)),expected))fail(`Final target mismatch: ${c.reference}`);
    if(!ownerIsCandidate(allOwners(books,overlay,c),c))fail(`Final source owner not unique: ${c.reference}`);
  }

  const proposed=new Map([[OVERLAY,Buffer.from(JSON.stringify(overlay)+"\n")]]);
  const numericFiles=new Set(plan.candidates.filter(c=>c.topologyMode==="NUMERIC_FALLBACK").map(c=>c.runtimeFile));
  for(const file of numericFiles){
    const book=books.get(file),bytes=Buffer.from(JSON.stringify(book)+"\n");
    proposed.set(`${RUNTIME_ROOT}/lxx/${file}`,bytes);
    const st=manifest.corpora?.lxx?.books?.[file];
    if(!st)fail(`Manifest book missing: ${file}`);
    st.bytes=bytes.length;st.checksum=sha(bytes);if(Object.hasOwn(st,"sha256"))st.sha256=sha(bytes);st.alignedDisplayTokens=alignedCount(book);
  }
  for(const field of ["verses","sourceTokens","alignedDisplayTokens","bytes"]){
    manifest.totals[field]=Object.values(manifest.corpora||{}).flatMap(c=>Object.values(c.books||{})).reduce((n,b)=>n+Number(b[field]||0),0);
  }
  manifest.checksum=checksum(manifest);
  proposed.set(`${RUNTIME_ROOT}/manifest.json`,Buffer.from(JSON.stringify(manifest)+"\n"));

  const changes=[...proposed].filter(([rel,b])=>!original.get(rel)?.equals(b));
  return {plan,state,changes,original};
}
function applyBatch3(root=process.cwd(),{verifyOnly=false,planPath=null}={}){
  const p=prepareBatch3(root,{planPath});
  if(verifyOnly&&p.changes.length)fail(`Batch 3 not fully applied: ${p.changes.length} files differ.`);
  if(!verifyOnly){
    const written=[];
    try{for(const [rel,b] of p.changes){written.push(rel);fs.writeFileSync(path.join(root,rel),b);}}
    catch(e){for(const rel of written.reverse()){const b=p.original.get(rel);if(b)fs.writeFileSync(path.join(root,rel),b);}throw e;}
  }
  return {routes:p.plan.counts.routes,numeric:p.plan.counts.numeric,overlay:p.plan.counts.overlay,startingState:p.state,changedFiles:p.changes.length,verifyOnly};
}
function prepareForLegacyReplay(root=process.cwd(),{planPath=null}={}){
  const plan=loadPlan(root,planPath),file=path.join(root,OVERLAY),overlay=parse(fs.readFileSync(file));
  if(checksum(overlay)!==overlay.checksum||Object.keys(overlay.records||{}).length!==2017)fail("Overlay seal invalid before replay prep.");
  const count=Object.values(overlay.records||{}).reduce((n,r)=>n+Object.keys(r.routes||{}).length,0);
  if(![9915,10009].includes(count))fail(`Unexpected overlay count before replay prep: ${count}`);
  let removed=0;
  for(const c of plan.candidates.filter(x=>x.topologyMode==="OVERLAY")){
    const rec=overlay.records?.[c.readerRecordId];
    if(!rec||rec.runtimeFile!==c.runtimeFile||rec.runtimeVerseKey!==c.runtimeVerseKey)fail(`Overlay topology changed: ${c.reference}`);
    const key=String(c.displayIndex),r=rec.routes?.[key];
    if(r===undefined)continue;
    const expected=[Number(c.to.sourceIndex),String(c.to.sourceId),String(c.to.entityId)];
    if(JSON.stringify(r)!==JSON.stringify(expected))fail(`Unexpected Batch 3 overlay target route: ${c.reference}`);
    delete rec.routes[key];removed++;
  }
  overlay.counts.routes=Object.values(overlay.records||{}).reduce((n,r)=>n+Object.keys(r.routes||{}).length,0);
  if(overlay.counts.routes!==9915)fail(`Replay prep did not restore 9915-route overlay: ${overlay.counts.routes}`);
  overlay.checksum=checksum(overlay);
  const bytes=Buffer.from(JSON.stringify(overlay)+"\n"),old=fs.readFileSync(file);
  if(!old.equals(bytes))fs.writeFileSync(file,bytes);
  return {removedOverlayBatch3Routes:removed,overlayRoutes:overlay.counts.routes};
}
if(require.main===module){
  const root=process.cwd(),planPath=process.env.EMET_BATCH3_PLAN||null;
  if(process.argv.includes("--prepare-legacy-replay"))console.log(JSON.stringify(prepareForLegacyReplay(root,{planPath}),null,2));
  else if(process.argv.includes("--dry-run")){const p=prepareBatch3(root,{planPath});console.log(JSON.stringify({startingState:p.state,plannedChangedFiles:p.changes.length,routes:p.plan.counts.routes},null,2));}
  else console.log(JSON.stringify(applyBatch3(root,{verifyOnly:process.argv.includes("--verify"),planPath}),null,2));
}
module.exports={prepareBatch3,applyBatch3,prepareForLegacyReplay};
