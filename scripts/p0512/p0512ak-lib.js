"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const EXPECTED = Object.freeze({
  milestone: "P05.12AK",
  aj: {
    blocks: 31102,
    supportedBlocks: 31085,
    readerOnlyFailClosedBlocks: 17,
    routedSourceTokens: 438452,
    sourceRouteEdges: 31091,
    ownedFiles: 66,
    ownedRecords: 31086,
    sourceTokens: 438452,
    readerCoordinates: 31102,
    multiTargetSourceCoordinates: 3,
    multiSourceReaderCoordinates: 6,
  },
});

function fail(message) { throw new Error(`[P05.12AK] ${message}`); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function sha256File(file) { const h = crypto.createHash("sha256"); h.update(fs.readFileSync(file)); return h.digest("hex"); }
function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name));
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a,b)=>a.localeCompare(b));
}
function hashTree(root) {
  if (!fs.existsSync(root)) return null;
  const files = listFilesRecursive(root);
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const hash = sha256File(file);
    digest.update(rel, "utf8"); digest.update("\0", "utf8"); digest.update(hash, "utf8"); digest.update("\n", "utf8");
  }
  return { files: files.length, sha256: digest.digest("hex") };
}
function parseArgs(argv) {
  const out = {};
  for (let i=0;i<argv.length;i+=1) {
    const a=argv[i];
    if (!a.startsWith("--")) continue;
    const key=a.slice(2); const next=argv[i+1];
    if (next && !next.startsWith("--")) { out[key]=next; i+=1; } else out[key]=true;
  }
  return out;
}
function gitInfo(repoRoot) {
  function run(args) { return childProcess.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim(); }
  return { branch: run(["branch","--show-current"]), commit: run(["rev-parse","HEAD"]) };
}
function relativeFromRoot(repoRoot, target) { return path.relative(repoRoot, target).split(path.sep).join("/"); }
function sameBytes(a,b) { return fs.readFileSync(a).equals(fs.readFileSync(b)); }

function findLatestAjReport(repoRoot) {
  const reportsRoot = path.join(repoRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportsRoot)) fail(`Missing P05.12 reports root: ${reportsRoot}`);
  const candidates = listFilesRecursive(reportsRoot)
    .filter((f)=>path.basename(f).toLowerCase()==="p0512aj-summary.json")
    .map((file)=>({ file, summary: readJson(file), mtimeMs: fs.statSync(file).mtimeMs }))
    .filter((x)=>x.summary?.milestone==="P05.12AJ")
    .sort((a,b)=>{
      const ad=Date.parse(a.summary.generatedAtUtc||"")||a.mtimeMs;
      const bd=Date.parse(b.summary.generatedAtUtc||"")||b.mtimeMs;
      return bd-ad;
    });
  if (!candidates.length) fail("No P05.12AJ summary found under .private/reports/P05.12.");
  const passing = candidates.find((x)=>x.summary?.authorization?.safeToRetainStagedKjvTranslationBlocks===true && Object.values(x.summary?.gates||{}).every(Boolean));
  if (!passing) fail(`Found ${candidates.length} P05.12AJ summaries, but none is a fully passing retained candidate.`);
  return { reportDir: path.dirname(passing.file), summaryPath: passing.file, summary: passing.summary };
}

function verifyManifest(reportDir) {
  const manifestPath = path.join(reportDir, "checksums.sha256");
  if (!fs.existsSync(manifestPath)) fail(`AJ checksum manifest missing: ${manifestPath}`);
  const lines = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const entries=[]; const errors=[];
  for (const line of lines) {
    const match=line.match(/^([a-fA-F0-9]{64})\s\s(.+)$/);
    if (!match) { errors.push({type:"malformed",line}); continue; }
    const rel=match[2].replace(/\\/g,"/"); const full=path.join(reportDir,...rel.split("/"));
    if (!fs.existsSync(full)) { errors.push({type:"missing",path:rel}); continue; }
    const actual=sha256File(full); if (actual!==match[1].toLowerCase()) errors.push({type:"mismatch",path:rel,expected:match[1].toLowerCase(),actual});
    entries.push(rel);
  }
  const actual=listFilesRecursive(reportDir).map((f)=>relativeFromRoot(reportDir,f)).filter((r)=>r!=="checksums.sha256");
  const unexpected=actual.filter((r)=>!entries.includes(r));
  const missing=entries.filter((r)=>!actual.includes(r));
  return { manifestPath, entries: entries.length, errors, unexpected, missing, passed: errors.length===0 && unexpected.length===0 && missing.length===0 };
}

function verifyAj(report) {
  const s=report.summary; const e=EXPECTED.aj;
  const reportDir=report.reportDir;
  const candidateA=path.join(reportDir,"candidate-a"); const candidateB=path.join(reportDir,"candidate-b");
  const required=["kjv-translation-blocks.json","kjv-translation-block-topology.json","kjv-translation-block-validation.json","build-summary.json"];
  const comparisons=required.map((name)=>{
    const a=path.join(candidateA,name), b=path.join(candidateB,name);
    if (!fs.existsSync(a)||!fs.existsSync(b)) fail(`AJ repeated-build artifact missing: ${name}`);
    return { file:name, identical:sameBytes(a,b), sha256:sha256File(a), bytes:fs.statSync(a).size };
  });
  const manifest=verifyManifest(reportDir);
  const validation=readJson(path.join(candidateA,"kjv-translation-block-validation.json"));
  const build=readJson(path.join(candidateA,"build-summary.json"));
  const gates={
    manifestPassed:manifest.passed,
    repeatedArtifactsIdentical:comparisons.every((x)=>x.identical),
    summaryAllGatesPassed:Object.values(s.gates||{}).every(Boolean),
    candidateAllGatesPassed:Object.values(validation.gates||{}).every(Boolean),
    zeroValidationErrors:Array.isArray(validation.errors)&&validation.errors.length===0,
    blocksExact:Number(s.totals?.blocks)===e.blocks,
    supportedExact:Number(s.totals?.supportedBlocks)===e.supportedBlocks,
    readerOnlyFailClosedExact:Number(s.totals?.readerOnlyFailClosedBlocks)===e.readerOnlyFailClosedBlocks,
    routedSourceTokensExact:Number(s.totals?.routedSourceTokens)===e.routedSourceTokens,
    sourceRouteEdgesExact:Number(s.totals?.sourceRouteEdges)===e.sourceRouteEdges,
    ownedFilesExact:Number(s.totals?.ownedFiles)===e.ownedFiles,
    ownedRecordsExact:Number(s.totals?.ownedRecords)===e.ownedRecords,
    sourceTokensExact:Number(s.totals?.sourceTokens)===e.sourceTokens,
    readerCoordinatesExact:Number(s.totals?.readerCoordinates)===e.readerCoordinates,
    topologyExact:Number(s.topology?.multiTargetSourceCoordinates)===e.multiTargetSourceCoordinates && Number(s.topology?.multiSourceReaderCoordinates)===e.multiSourceReaderCoordinates,
    stagingOnly:s.authorization?.productionPromotionPerformed===false && s.authorization?.safeToPromoteProductionKjv===false,
    protectedStateWasUnchanged:s.gates?.protectedProductionStateUnchanged===true,
  };
  return { reportDir, summaryPath:report.summaryPath, candidateA, candidateB, summary:s, build, validation, manifest, comparisons, gates, passed:Object.values(gates).every(Boolean) };
}

function snapshotItems(repoRoot, templateItems) {
  const items=[];
  for (const item of templateItems||[]) {
    const rel=item.path; const full=path.join(repoRoot,...rel.split("/"));
    if (!fs.existsSync(full)) { items.push({path:rel,exists:false}); continue; }
    const st=fs.statSync(full);
    if (st.isDirectory()) { const tree=hashTree(full); items.push({path:rel,exists:true,type:"directory",files:tree.files,sha256:tree.sha256}); }
    else items.push({path:rel,exists:true,type:"file",bytes:st.size,sha256:sha256File(full)});
  }
  return items;
}
function compareItems(before,after) {
  const a=new Map((before||[]).map((x)=>[x.path,x])); const b=new Map((after||[]).map((x)=>[x.path,x]));
  const paths=[...new Set([...a.keys(),...b.keys()])].sort(); const changes=[];
  for (const p of paths) if (JSON.stringify(a.get(p))!==JSON.stringify(b.get(p))) changes.push({path:p,before:a.get(p),after:b.get(p)});
  return {identical:changes.length===0,changes};
}

function shape(value, depth=0) {
  if (value===null) return "null";
  if (Array.isArray(value)) {
    if (depth>=4) return {type:"array",length:value.length};
    return {type:"array",length:value.length,item:value.length?shape(value[0],depth+1):null};
  }
  if (typeof value!=="object") return typeof value;
  const keys=Object.keys(value).sort();
  const fields={};
  for (const key of keys.slice(0,80)) fields[key]=depth>=4?typeof value[key]:shape(value[key],depth+1);
  return {type:"object",keys:keys.length,fields};
}
function firstArrayObject(file) {
  const fd=fs.openSync(file,"r");
  const chunk=Buffer.alloc(65536); let text=""; let pos=0; let started=false; let depth=0; let inString=false; let escape=false; let start=-1;
  try {
    while (true) {
      const n=fs.readSync(fd,chunk,0,chunk.length,pos); if (!n) break; pos+=n; text+=chunk.toString("utf8",0,n);
      for (let i=0;i<text.length;i+=1) {
        const ch=text[i];
        if (!started) { if (ch==="{") { started=true; depth=1; start=i; } continue; }
        if (inString) { if (escape) escape=false; else if (ch==="\\") escape=true; else if (ch==='"') inString=false; continue; }
        if (ch==='"') { inString=true; continue; }
        if (ch==="{") depth+=1; else if (ch==="}") depth-=1;
        if (depth===0) return JSON.parse(text.slice(start,i+1));
      }
      if (started && start>0) { text=text.slice(start); start=0; }
      if (text.length>16*1024*1024) fail(`Could not isolate first array object in ${file}`);
    }
  } finally { fs.closeSync(fd); }
  fail(`No JSON object found in array file ${file}`);
}
function profileJsonFile(file,{firstArrayOnly=false}={}) {
  if (!fs.existsSync(file)) return {exists:false,path:file};
  const st=fs.statSync(file); let value;
  if (firstArrayOnly) value=firstArrayObject(file); else value=readJson(file);
  const rootType=firstArrayOnly?"array":"unknown";
  return {exists:true,path:file,bytes:st.size,sha256:sha256File(file),rootType,shape:shape(value),sample:value};
}

function findCanonicalSample(root) {
  if (!fs.existsSync(root)) return {exists:false,path:root};
  const files=listFilesRecursive(root).filter((f)=>f.toLowerCase().endsWith(".json"));
  for (const file of files) {
    let data; try { data=readJson(file); } catch { continue; }
    if (!data || typeof data!=="object" || Array.isArray(data)) continue;
    for (const [key,record] of Object.entries(data)) {
      if (Array.isArray(record?.sourceTokens) && record.sourceTokens.length) {
        return {
          exists:true, root, file, relativeFile:relativeFromRoot(root,file), objectKey:key,
          recordShape:shape(record),
          kjvTranslationShape:shape(record?.translations?.kjv ?? null),
          sample:{
            sourceTokenCount:record.sourceTokens.length,
            translationKeys:Object.keys(record?.translations||{}).sort(),
            kjvText:record?.translations?.kjv?.text ?? null,
            kjvTokenCount:Array.isArray(record?.translations?.kjv?.tokens)?record.translations.kjv.tokens.length:null,
          }
        };
      }
    }
  }
  return {exists:true,root,files:files.length,sampleFound:false};
}

const CODE_EXTENSIONS=new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs"]);
const EXCLUDED_DIRS=new Set(["node_modules",".git",".next","dist","build","coverage"]);
const TERMS=["generatedKJV","generatedWEB","generatedBrenton","translations.kjv","translations?.kjv","alignedSourceTokenIds","sourceTokens","tappable","canonical","word-study","wordStudy","sourceRoutes"];
function scanCode(repoRoot) {
  const roots=["app","src","components","lib","scripts"].map((r)=>path.join(repoRoot,r)).filter(fs.existsSync);
  const hits=[]; const scanned=[];
  function walk(dir) {
    const relDir=relativeFromRoot(repoRoot,dir);
    if (relDir.startsWith("app/data")) return;
    for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const full=path.join(dir,entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const st=fs.statSync(full); if (st.size>2*1024*1024) continue;
        scanned.push(relativeFromRoot(repoRoot,full));
        const lines=fs.readFileSync(full,"utf8").split(/\r?\n/); let fileHits=0;
        for (let i=0;i<lines.length;i+=1) {
          const line=lines[i]; const lower=line.toLowerCase();
          const matched=TERMS.filter((t)=>lower.includes(t.toLowerCase()));
          if (matched.length) {
            hits.push({file:relativeFromRoot(repoRoot,full),line:i+1,matched,text:line.trim().slice(0,400)});
            fileHits+=1; if (fileHits>=80) break;
          }
        }
      }
    }
  }
  for (const root of roots) walk(root);
  const byTerm={}; for (const term of TERMS) byTerm[term]=[...new Set(hits.filter((h)=>h.matched.includes(term)).map((h)=>h.file))].sort();
  return {roots:roots.map((r)=>relativeFromRoot(repoRoot,r)),scannedFiles:scanned.length,hits,byTerm};
}

function packageScripts(repoRoot) {
  const p=path.join(repoRoot,"package.json"); if (!fs.existsSync(p)) return {exists:false};
  const data=readJson(p); const relevant={};
  for (const [name,cmd] of Object.entries(data.scripts||{})) if (/scripture|canon|align|reader|runtime|build|kjv|web|brenton/i.test(`${name} ${cmd}`)) relevant[name]=cmd;
  return {exists:true,path:relativeFromRoot(repoRoot,p),relevant};
}

module.exports={EXPECTED,fail,ensureDir,readJson,writeJson,sha256File,listFilesRecursive,hashTree,parseArgs,gitInfo,relativeFromRoot,findLatestAjReport,verifyAj,snapshotItems,compareItems,shape,profileJsonFile,findCanonicalSample,scanCode,packageScripts};
