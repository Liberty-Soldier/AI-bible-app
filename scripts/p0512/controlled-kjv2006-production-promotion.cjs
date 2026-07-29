#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const MILESTONE = 'P05.12AP';
const PURPOSE = 'CONTROLLED KJV2006 PRODUCTION PROMOTION AFTER WEB/BRENTON SERIALIZATION STABILIZATION';
const EXPECTED = Object.freeze({
  promotionFiles: 1261,
  rollbackFiles: 1192,
  visibleCoordinates: 31102,
  supportedCoordinates: 31085,
  failClosedCoordinates: 17,
  runtimeFiles: 1189,
  overlayFiles: 69,
  routableVisibleTokens: 339548,
  sourceTokens: 438452,
  textChanges: 3865,
  suppressedRoutes: 1,
});
const TARGETS = Object.freeze([
  'app/data/scripture/generatedKJV.json',
  'app/data/scripture/generatedKJV.ts',
  'public/scripture/runtime/kjv',
  'public/data/bibleiq/word-study-kjv-reader',
  'app/data/scripture/CanonicalVerseStore.ts',
]);
const PROTECTED_NON_TARGETS = Object.freeze([
  'app/data/scripture/generatedKJV.integrity.json',
  'app/data/scripture/generatedWEB.json',
  'app/data/scripture/generatedWEB.ts',
  'app/data/scripture/generatedWEB.integrity.json',
  'app/data/scripture/generatedBrenton.json',
  'app/data/scripture/generatedBrenton.ts',
  'app/data/scripture/generatedBrenton.integrity.json',
  '.private/scripture/canonical',
  'app/data/bibleiq/canonical',
  '.private/alignment',
  'public/scripture/runtime/web',
  'public/scripture/runtime/brenton',
  'public/data/bibleiq/word-study',
  'app/data/scripture/ReaderVerseAdapter.ts',
  'scripts/split-scripture-runtime.js',
  '.gitattributes',
]);

function die(message) { throw new Error(`[${MILESTONE}] ${message}`); }
function normalizeRel(value) {
  const s = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!s || s.startsWith('/') || /^[A-Za-z]:\//.test(s) || s.split('/').includes('..')) die(`Unsafe relative path: ${value}`);
  return s;
}
function abs(root, rel) { return path.join(root, ...normalizeRel(rel).split('/')); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(p, value) { ensureDir(path.dirname(p)); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function shaFile(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}
function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const st = fs.statSync(root);
  if (st.isFile()) return [''];
  const out = [];
  function walk(dir, prefix) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = path.join(dir, ent.name);
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(full, rel);
      else if (ent.isFile()) out.push(rel);
      else die(`Unsupported filesystem entry: ${full}`);
    }
  }
  walk(root, '');
  return out;
}
function snapshotPath(root, rel) {
  const full = abs(root, rel);
  if (!fs.existsSync(full)) return { path: rel, exists: false };
  const st = fs.statSync(full);
  if (st.isFile()) return { path: rel, exists: true, type: 'file', bytes: st.size, sha256: shaFile(full) };
  if (!st.isDirectory()) die(`Unsupported target type: ${rel}`);
  const files = listFiles(full).map(file => ({ path: file, bytes: fs.statSync(path.join(full, ...file.split('/'))).size, sha256: shaFile(path.join(full, ...file.split('/'))) }));
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(`${f.sha256}  ${f.path}\n`);
  return { path: rel, exists: true, type: 'directory', files: files.length, sha256: h.digest('hex'), entries: files };
}
function comparableSnapshot(s) {
  const x = JSON.parse(JSON.stringify(s));
  delete x.path;
  return x;
}
function sameSnapshot(a,b) { return JSON.stringify(comparableSnapshot(a)) === JSON.stringify(comparableSnapshot(b)); }
function snapshotSet(root, rels) { return rels.map(rel => snapshotPath(root, rel)); }
function compareSnapshotSets(a,b) {
  const bm = new Map(b.map(x=>[x.path,x]));
  const changes=[];
  for (const x of a) { const y=bm.get(x.path); if (!y || !sameSnapshot(x,y)) changes.push({path:x.path,before:x,after:y||null}); }
  for (const y of b) if (!a.some(x=>x.path===y.path)) changes.push({path:y.path,before:null,after:y});
  return changes;
}
function parseShaManifest(p) {
  const rows=[];
  for (const raw of fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m=raw.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!m) die(`Malformed checksum line in ${p}: ${raw}`);
    rows.push({sha256:m[1].toLowerCase(), path:normalizeRel(m[2].trim())});
  }
  return rows;
}
function verifyManifest(manifestPath, payloadRoot, expectedCount=null, ignoredActual=[]) {
  const rows=parseShaManifest(manifestPath);
  if (expectedCount !== null && rows.length !== expectedCount) die(`${path.basename(manifestPath)} has ${rows.length} entries; expected ${expectedCount}.`);
  const expectedSet=new Set(rows.map(r=>r.path));
  const ignored=new Set(ignoredActual.map(normalizeRel));
  const actual=listFiles(payloadRoot).filter(x=>!ignored.has(x));
  const missing=rows.filter(r=>!fs.existsSync(abs(payloadRoot,r.path))).map(r=>r.path);
  const unexpected=actual.filter(r=>!expectedSet.has(r));
  const mismatches=[];
  for (const r of rows) {
    const f=abs(payloadRoot,r.path);
    if (fs.existsSync(f) && shaFile(f)!==r.sha256) mismatches.push(r.path);
  }
  return {passed:missing.length===0&&unexpected.length===0&&mismatches.length===0, entries:rows.length, missing, unexpected, mismatches};
}
function copyExact(src,dst) {
  fs.rmSync(dst,{recursive:true,force:true});
  ensureDir(path.dirname(dst));
  const st=fs.statSync(src);
  if (st.isDirectory()) fs.cpSync(src,dst,{recursive:true,force:true,preserveTimestamps:true});
  else fs.copyFileSync(src,dst);
}
function run(command,args,opts={}) {
  const r=cp.spawnSync(command,args,{cwd:opts.cwd,encoding:'utf8',maxBuffer:100*1024*1024,env:opts.env||process.env,shell:false});
  return {command:[command,...args].join(' '),status:r.status,signal:r.signal,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?String(r.error):null};
}
function git(root,args) { const r=run('git',args,{cwd:root}); if(r.status!==0) die(`git ${args.join(' ')} failed: ${r.stderr||r.stdout}`); return r.stdout.trim(); }
function locateLatestAo(root) {
  const base=abs(root,'.private/reports/P05.12');
  if(!fs.existsSync(base)) die('Missing .private/reports/P05.12.');
  const dirs=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort().reverse();
  for(const d of dirs){
    const report=path.join(base,d); const sp=path.join(report,'p0512ao-summary.json');
    if(!fs.existsSync(sp)) continue;
    const s=readJson(sp);
    if(s.milestone==='P05.12AO' && s.authorization?.safeToCreateControlledProductionPromotionStage===true) return {reportDir:report,summary:s};
  }
  die('No passing retained P05.12AO report was found.');
}
function locateLatestB5(root) {
  const base=abs(root,'.private/reports/P05.12');
  if(!fs.existsSync(base)) die('Missing .private/reports/P05.12.');
  const dirs=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort().reverse();
  for(const d of dirs){
    const report=path.join(base,d);
    const sp=path.join(report,'p0512ap-b5-summary.json');
    const vp=path.join(report,'verdict.json');
    if(!fs.existsSync(sp)||!fs.existsSync(vp)) continue;
    const s=readJson(sp), v=readJson(vp);
    if(
      s.milestone==='P05.12AP-B5' &&
      s.authorization?.serializationStabilizationSucceeded===true &&
      s.authorization?.safeToCreateRefreshedKjvPromotion===true &&
      v.verdict==='TRANSLATION_SERIALIZATION_STABILIZATION_PASSED' &&
      v.safeToCreateRefreshedKjvPromotion===true
    ) return {reportDir:report,summary:s,verdict:v};
  }
  die('No passing retained P05.12AP-B5 translation-serialization report was found.');
}
function validateB5Report(root,b5) {
  const report=b5.reportDir, summary=b5.summary, verdict=b5.verdict;
  const checks=verifyManifest(path.join(report,'checksums.sha256'),report,null,['checksums.sha256']);
  if(!checks.passed) die(`P05.12AP-B5 report checksum verification failed: ${JSON.stringify(checks)}`);
  if(summary.transaction?.installed!==true || summary.transaction?.rollbackAttempted!==false) die('P05.12AP-B5 transaction state is invalid.');
  if(summary.transaction?.brentonVerifier?.status!==0 || summary.transaction?.webVerifier?.status!==0 || summary.transaction?.productionBuild?.status!==0) die('P05.12AP-B5 verification/build gates are not passing.');
  if((summary.protectedState?.differences||[]).length!==0) die('P05.12AP-B5 protected-state comparison is not clean.');
  const hashes={
    brenton:String(verdict.approvedBrentonSha256||summary.evidence?.brenton?.candidateSha256||'').toLowerCase(),
    web:String(verdict.approvedWebSha256||summary.evidence?.web?.candidateSha256||'').toLowerCase(),
    gitattributes:String(verdict.gitattributesSha256||summary.evidence?.gitattributes?.proposedSha256||'').toLowerCase(),
  };
  for(const [name,value] of Object.entries(hashes)) if(!/^[0-9a-f]{64}$/.test(value)) die(`P05.12AP-B5 has no valid ${name} SHA-256.`);
  const expected={
    'app/data/scripture/generatedBrenton.json':hashes.brenton,
    'app/data/scripture/generatedWEB.json':hashes.web,
    '.gitattributes':hashes.gitattributes,
  };
  const failures=[];
  for(const [rel,sha256] of Object.entries(expected)){
    const file=abs(root,rel);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()) failures.push({path:rel,reason:'missing'});
    else if(shaFile(file)!==sha256) failures.push({path:rel,reason:'hash',expected:sha256,actual:shaFile(file)});
  }
  const attrs=fs.existsSync(abs(root,'.gitattributes'))?fs.readFileSync(abs(root,'.gitattributes'),'utf8').replace(/\r\n/g,'\n'):'';
  for(const rule of [
    'app/data/scripture/generatedBrenton.json text eol=lf',
    'app/data/scripture/generatedWEB.json text eol=lf',
  ]) if(!attrs.split('\n').some(line=>line.trim()===rule)) failures.push({path:'.gitattributes',reason:'missing-rule',rule});
  if(failures.length) die(`Current WEB/Brenton serialization state does not match passing B5: ${JSON.stringify(failures)}`);
  return {reportChecksumEntries:checks.entries,hashes,expected};
}
function validateAoReport(root,ao) {
  const report=ao.reportDir; const summary=ao.summary;
  const checks=verifyManifest(path.join(report,'checksums.sha256'),report,null,['checksums.sha256']);
  if(!checks.passed) die(`P05.12AO report checksum verification failed: ${JSON.stringify(checks)}`);
  if(summary.gates?.protectedProductionStateUnchanged!==true || summary.gates?.stagingOnly!==true || summary.gates?.productionPromotionNotPerformed!==true) die('P05.12AO summary gates are not passing.');
  if(summary.authorization?.safeToRetainIsolatedProductionPromotionCandidate!==true || summary.authorization?.safeToCreateControlledProductionPromotionStage!==true || summary.authorization?.safeToPromoteProductionKjv!==false) die('P05.12AO authorization state is invalid.');
  const candidate=abs(root,summary.retainedCandidate);
  if(!candidate.startsWith(report+path.sep)) die('Retained AO candidate is outside its report directory.');
  const build=readJson(path.join(candidate,'build-summary.json'));
  if(build.authorization?.safeToCreateControlledProductionPromotionStage!==true || build.gates?.promotionPayloadExact!==true || build.gates?.rollbackPayloadExact!==true || build.gates?.exactProductionPreconditions!==true) die('Retained AO candidate gates are not passing.');
  const installMap=readJson(path.join(candidate,'install-map.json'));
  if(!Array.isArray(installMap)||installMap.length!==5) die('AO install map must contain exactly five targets.');
  const got=installMap.map(x=>normalizeRel(x.targetPath));
  if(JSON.stringify([...got].sort())!==JSON.stringify([...TARGETS].sort())) die(`AO install target path mismatch: ${JSON.stringify(got)}`);
  const promotionRoot=path.join(candidate,'promotion-payload');
  const rollbackRoot=path.join(candidate,'rollback-payload');
  const promotionCheck=verifyManifest(path.join(candidate,'promotion-payload.sha256'),promotionRoot,EXPECTED.promotionFiles);
  const rollbackCheck=verifyManifest(path.join(candidate,'rollback-payload.sha256'),rollbackRoot,EXPECTED.rollbackFiles);
  if(!promotionCheck.passed) die(`AO promotion payload failed verification: ${JSON.stringify(promotionCheck)}`);
  if(!rollbackCheck.passed) die(`AO rollback payload failed verification: ${JSON.stringify(rollbackCheck)}`);
  return {reportChecksumEntries:checks.entries,candidate,build,installMap,promotionRoot,rollbackRoot,promotionCheck,rollbackCheck};
}
function verifyCurrentPreconditions(root,ctx) {
  const failures=[];
  for(const item of ctx.installMap){
    const rel=normalizeRel(item.targetPath); const cur=snapshotPath(root,rel); const exp=item.currentState;
    if(Boolean(cur.exists)!==Boolean(exp.exists)) {failures.push({path:rel,reason:'existence',expected:exp,actual:cur});continue;}
    if(!exp.exists) continue;
    if(cur.type!==exp.type) {failures.push({path:rel,reason:'type',expected:exp,actual:cur});continue;}
    if(exp.type==='file' && (cur.sha256!==exp.sha256||cur.bytes!==exp.bytes)) failures.push({path:rel,reason:'file-fingerprint',expected:exp,actual:cur});
    if(exp.type==='directory') {
      const manifestRows=parseShaManifest(path.join(ctx.candidate,'rollback-payload.sha256')).filter(r=>r.path===rel||r.path.startsWith(`${rel}/`));
      const expectedFiles=manifestRows.map(r=>r.path.slice(rel.length+1)); const actualFiles=listFiles(abs(root,rel));
      if(expectedFiles.length!==actualFiles.length || expectedFiles.some((x,i)=>x!==actualFiles[i])) failures.push({path:rel,reason:'directory-file-set',expectedCount:expectedFiles.length,actualCount:actualFiles.length});
      else for(const r of manifestRows){ if(shaFile(abs(root,r.path))!==r.sha256){failures.push({path:rel,reason:'directory-file-hash',file:r.path});break;} }
    }
  }
  return {passed:failures.length===0,failures};
}
function backupTargets(root,reportDir,ctx){
  const backupRoot=path.join(reportDir,'rollback-payload'); ensureDir(backupRoot);
  const absence=[];
  for(const item of ctx.installMap){
    const rel=normalizeRel(item.targetPath); const src=abs(root,rel); const dst=abs(backupRoot,rel);
    if(fs.existsSync(src)) copyExact(src,dst); else absence.push(rel);
  }
  writeJson(path.join(reportDir,'rollback-absence.json'),absence);
  const verification=verifyManifest(path.join(ctx.candidate,'rollback-payload.sha256'),backupRoot,EXPECTED.rollbackFiles);
  if(!verification.passed) die(`Fresh rollback backup differs from AO rollback payload: ${JSON.stringify(verification)}`);
  return {backupRoot,absence,verification};
}
function prepareTargets(root,reportDir,ctx){
  const prepared=path.join(reportDir,'prepared-promotion-payload'); copyExact(ctx.promotionRoot,prepared);
  const verification=verifyManifest(path.join(ctx.candidate,'promotion-payload.sha256'),prepared,EXPECTED.promotionFiles);
  if(!verification.passed) die(`Prepared promotion payload failed verification: ${JSON.stringify(verification)}`);
  return {prepared,verification};
}
function installTargets(root,prepared,reportDir){
  const journal=[]; const suffix=`.p0512ap-${path.basename(reportDir)}`;
  for(const rel of TARGETS){
    const src=abs(prepared,rel), target=abs(root,rel), next=`${target}${suffix}.new`, old=`${target}${suffix}.old`;
    fs.rmSync(next,{recursive:true,force:true}); fs.rmSync(old,{recursive:true,force:true});
    copyExact(src,next);
    const srcSnap=snapshotPath(prepared,rel), nextSnap=snapshotPath(root,path.relative(root,next).replace(/\\/g,'/'));
    if(!sameSnapshot(srcSnap,nextSnap)) die(`Prepared sibling verification failed for ${rel}.`);
    const existed=fs.existsSync(target);
    if(existed) fs.renameSync(target,old);
    try { fs.renameSync(next,target); }
    catch(err){ if(existed&&fs.existsSync(old)&&!fs.existsSync(target)) fs.renameSync(old,target); throw err; }
    journal.push({path:rel,existed,oldPath:path.relative(root,old).replace(/\\/g,'/')});
    writeJson(path.join(reportDir,'installation-journal.json'),journal);
  }
  return journal;
}
function restoreTargets(root,backupRoot,absence){
  const results=[];
  for(const rel of [...TARGETS].reverse()){
    const target=abs(root,rel); fs.rmSync(target,{recursive:true,force:true});
    if(!absence.includes(rel)) { const src=abs(backupRoot,rel); copyExact(src,target); results.push({path:rel,operation:'restored'}); }
    else results.push({path:rel,operation:'deleted-created-target'});
  }
  return results;
}
function cleanupTransactionSiblings(root,reportDir){
  const suffix=`.p0512ap-${path.basename(reportDir)}`;
  for(const rel of TARGETS){ const target=abs(root,rel); fs.rmSync(`${target}${suffix}.new`,{recursive:true,force:true}); fs.rmSync(`${target}${suffix}.old`,{recursive:true,force:true}); }
}
function verifyInstalled(root,ctx){
  const rows=parseShaManifest(path.join(ctx.candidate,'promotion-payload.sha256'));
  const expectedSet=new Set(rows.map(r=>r.path));
  const actual=[];
  for(const rel of TARGETS){
    const full=abs(root,rel);
    if(!fs.existsSync(full)) continue;
    const st=fs.statSync(full);
    if(st.isFile()) actual.push(rel);
    else for(const child of listFiles(full)) actual.push(`${rel}/${child}`);
  }
  actual.sort();
  const missing=rows.filter(r=>!fs.existsSync(abs(root,r.path))).map(r=>r.path);
  const unexpected=actual.filter(r=>!expectedSet.has(r));
  const mismatches=[];
  for(const r of rows){const f=abs(root,r.path);if(fs.existsSync(f)&&shaFile(f)!==r.sha256)mismatches.push(r.path);}
  return {passed:missing.length===0&&unexpected.length===0&&mismatches.length===0,entries:rows.length,missing,unexpected,mismatches};
}
function validateKjvRuntime(root){
  const errors=[];
  const generated=readJson(abs(root,'app/data/scripture/generatedKJV.json'));
  if(!Array.isArray(generated)||generated.length!==EXPECTED.visibleCoordinates) errors.push(`generatedKJV rows=${Array.isArray(generated)?generated.length:'not-array'}`);
  const coord=new Map();
  if(Array.isArray(generated)) for(const row of generated){
    const key=`${String(row.book).toLowerCase()}:${row.chapter}:${row.verse}`;
    if(coord.has(key)) errors.push(`duplicate generated coordinate ${key}`); else coord.set(key,row);
    if(!row.sources?.[0]?.text || typeof row.sources[0].text!=='string') errors.push(`malformed generated row ${key}`);
  }
  const runtimeRoot=abs(root,'public/scripture/runtime/kjv'); const runtimeFiles=listFiles(runtimeRoot);
  if(runtimeFiles.length!==EXPECTED.runtimeFiles) errors.push(`runtime files=${runtimeFiles.length}`);
  let runtimeRows=0;
  for(const rel of runtimeFiles){
    const rows=readJson(path.join(runtimeRoot,...rel.split('/')));
    if(!Array.isArray(rows)){errors.push(`runtime file not array ${rel}`);continue;}
    runtimeRows+=rows.length;
    for(const row of rows){const key=`${String(row.book).toLowerCase()}:${row.chapter}:${row.verse}`;const g=coord.get(key);if(!g)errors.push(`runtime coordinate absent ${key}`);else if(g.sources?.[0]?.text!==row.sources?.[0]?.text)errors.push(`runtime text mismatch ${key}`);}
  }
  if(runtimeRows!==EXPECTED.visibleCoordinates) errors.push(`runtime rows=${runtimeRows}`);
  const overlayRoot=abs(root,'public/data/bibleiq/word-study-kjv-reader'); const overlayFiles=listFiles(overlayRoot);
  if(overlayFiles.length!==EXPECTED.overlayFiles) errors.push(`overlay files=${overlayFiles.length}`);
  const metadata=readJson(path.join(overlayRoot,'route-metadata.json'));
  if(!Array.isArray(metadata)||metadata.length!==EXPECTED.visibleCoordinates) errors.push(`route metadata rows=${Array.isArray(metadata)?metadata.length:'not-array'}`);
  else {
    const supported=metadata.filter(x=>x.routeStatus==='source-supported'&&!x.failClosed).length;
    const failClosed=metadata.filter(x=>x.failClosed===true).length;
    const routable=metadata.reduce((n,x)=>n+(Number(x.routableVisibleTokens)||0),0);
    const sourceTokens=metadata.reduce((n,x)=>n+(Number(x.sourceTokenCount)||0),0);
    if(supported!==EXPECTED.supportedCoordinates) errors.push(`supported=${supported}`);
    if(failClosed!==EXPECTED.failClosedCoordinates) errors.push(`failClosed=${failClosed}`);
    if(routable!==EXPECTED.routableVisibleTokens) errors.push(`routable=${routable}`);
    if(sourceTokens!==EXPECTED.sourceTokens) errors.push(`sourceTokens=${sourceTokens}`);
  }
  const suppressed=readJson(path.join(overlayRoot,'suppressed-routes.json'));
  if(!Array.isArray(suppressed)||suppressed.length!==EXPECTED.suppressedRoutes) errors.push(`suppressed routes=${Array.isArray(suppressed)?suppressed.length:'not-array'}`);
  return {passed:errors.length===0,errors,counts:{generatedRows:Array.isArray(generated)?generated.length:null,runtimeFiles:runtimeFiles.length,runtimeRows,overlayFiles:overlayFiles.length}};
}
function writeLog(reportDir,name,result){fs.writeFileSync(path.join(reportDir,`${name}.stdout.log`),result.stdout,'utf8');fs.writeFileSync(path.join(reportDir,`${name}.stderr.log`),result.stderr+(result.error?`\n${result.error}\n`:''),'utf8');writeJson(path.join(reportDir,`${name}.result.json`),{command:result.command,status:result.status,signal:result.signal,error:result.error});}
function runNpm(root,args,env){
  if(process.platform==='win32'){
    const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';
    const commandLine=['npm.cmd',...args].join(' ');
    const r=run(comspec,['/d','/s','/c',commandLine],{cwd:root,env});
    r.command=`${comspec} /d /s /c "${commandLine}"`;
    return r;
  }
  return run('npm',args,{cwd:root,env});
}
function verifyNpmLauncher(root,reportDir,testMode){
  if(testMode){const r={command:'TEST MODE: npm launcher preflight skipped',status:0,signal:null,stdout:'Skipped only in package self-test.\n',stderr:'',error:null};writeLog(reportDir,'npm-launcher-preflight',r);return r;}
  const r=runNpm(root,['--version'],process.env);writeLog(reportDir,'npm-launcher-preflight',r);return r;
}
function runBuild(root,reportDir,testMode){
  if(testMode){const r={command:'TEST MODE: npm run build skipped',status:0,signal:null,stdout:'Skipped only in package self-test.\n',stderr:'',error:null};writeLog(reportDir,'production-build',r);return r;}
  const env={...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--max-old-space-size=8192'].filter(Boolean).join(' ')};
  const r=runNpm(root,['run','build'],env);writeLog(reportDir,'production-build',r);return r;
}
function main(){
  const args=process.argv.slice(2); const rdIndex=args.indexOf('--report-dir');
  if(rdIndex<0||!args[rdIndex+1]) die('Missing --report-dir.');
  const root=process.cwd(); const reportDir=path.resolve(args[rdIndex+1]); const testMode=args.includes('--test-mode');
  ensureDir(reportDir);
  const result={milestone:MILESTONE,purpose:PURPOSE,startedAt:new Date().toISOString(),repository:{},sourceAo:{},preflight:{},promotion:{performed:false},postPromotion:{},rollback:{required:false,performed:false},authorization:{productionPromotionSucceeded:false,safeToCloseP0512:false}};
  let ctx=null,backup=null,protectedBefore=null,targetBefore=null,installed=false;
  try{
    if(!fs.existsSync(path.join(root,'package.json'))&&!testMode) die('Run from the repository root containing package.json.');
    const ao=locateLatestAo(root); ctx=validateAoReport(root,ao);
    const b5=locateLatestB5(root); const stable=validateB5Report(root,b5);
    const branch=testMode?'main':git(root,['branch','--show-current']); const commit=testMode?ao.summary.repository.commit:git(root,['rev-parse','HEAD']);
    result.repository={branch,commit}; result.sourceAo={reportDir:path.relative(root,ao.reportDir).replace(/\\/g,'/'),summarySha256:shaFile(path.join(ao.reportDir,'p0512ao-summary.json')),reportChecksumEntries:ctx.reportChecksumEntries,retainedCandidate:path.relative(root,ctx.candidate).replace(/\\/g,'/')};
    result.sourceTranslationStabilization={reportDir:path.relative(root,b5.reportDir).replace(/\\/g,'/'),summarySha256:shaFile(path.join(b5.reportDir,'p0512ap-b5-summary.json')),verdictSha256:shaFile(path.join(b5.reportDir,'verdict.json')),reportChecksumEntries:stable.reportChecksumEntries,approvedHashes:stable.hashes};
    if(branch!=='main') die(`Branch is ${branch}; expected main.`);
    if(commit!==ao.summary.repository.commit) die(`Commit is ${commit}; AO locked ${ao.summary.repository.commit}.`);
    result.preflight.translationSerialization={passed:true,approvedHashes:stable.hashes};
    const preconditions=verifyCurrentPreconditions(root,ctx); result.preflight.productionPreconditions=preconditions; if(!preconditions.passed) die('Current production does not match the exact AO preconditions.');
    const npmLauncher=verifyNpmLauncher(root,reportDir,testMode); result.preflight.npmLauncher={passed:npmLauncher.status===0,status:npmLauncher.status,error:npmLauncher.error}; if(npmLauncher.status!==0) die(`npm launcher preflight failed: status=${npmLauncher.status}; error=${npmLauncher.error||'none'}`);
    protectedBefore=snapshotSet(root,PROTECTED_NON_TARGETS); targetBefore=snapshotSet(root,TARGETS); writeJson(path.join(reportDir,'protected-state-before.json'),protectedBefore);writeJson(path.join(reportDir,'target-state-before.json'),targetBefore);
    backup=backupTargets(root,reportDir,ctx); result.preflight.rollbackBackup=backup.verification;
    const prepared=prepareTargets(root,reportDir,ctx); result.preflight.preparedPromotionPayload=prepared.verification;
    result.preflight.passed=true; writeJson(path.join(reportDir,'preflight-summary.json'),result.preflight);
    const journal=installTargets(root,prepared.prepared,reportDir); installed=true; result.promotion={performed:true,installedTargets:journal.map(x=>x.path),installationOrder:TARGETS};
    const installedCheck=verifyInstalled(root,ctx); result.postPromotion.payload=installedCheck; if(!installedCheck.passed) die('Installed production payload does not exactly match AO.');
    const dataGate=validateKjvRuntime(root); result.postPromotion.kjvRuntime=dataGate; if(!dataGate.passed) die(`KJV runtime validation failed: ${dataGate.errors.slice(0,10).join('; ')}`);
    if(process.env.P0512AP_FORCE_POST_GATE_FAILURE==='1') die('Forced post-promotion gate failure for rollback self-test.');
    const protectedAfterData=snapshotSet(root,PROTECTED_NON_TARGETS); writeJson(path.join(reportDir,'protected-state-after-data-gates.json'),protectedAfterData);
    const protectedChanges=compareSnapshotSets(protectedBefore,protectedAfterData); result.postPromotion.protectedStateAfterDataGates={passed:protectedChanges.length===0,changes:protectedChanges}; if(protectedChanges.length) die('A protected non-target changed during promotion.');
    const build=runBuild(root,reportDir,testMode); result.postPromotion.productionBuild={passed:build.status===0,status:build.status,error:build.error}; if(build.status!==0) die(`Production build failed: status=${build.status}; error=${build.error||'none'}.`);
    const finalInstalled=verifyInstalled(root,ctx); result.postPromotion.payloadAfterBuild=finalInstalled; if(!finalInstalled.passed) die('Promotion targets changed during production build.');
    const protectedAfter=snapshotSet(root,PROTECTED_NON_TARGETS); writeJson(path.join(reportDir,'protected-state-after.json'),protectedAfter);
    const finalProtectedChanges=compareSnapshotSets(protectedBefore,protectedAfter); result.postPromotion.protectedStateFinal={passed:finalProtectedChanges.length===0,changes:finalProtectedChanges}; if(finalProtectedChanges.length) die('A protected non-target changed during build or verification.');
    result.postPromotion.allGatesPassed=true; result.authorization={productionPromotionSucceeded:true,safeToCloseP0512:true,safeToMoveToNextPhase:true};
    cleanupTransactionSiblings(root,reportDir);
  }catch(err){
    result.error={message:err.message,stack:err.stack}; result.rollback.required=installed;
    if(installed&&backup){
      try{
        result.rollback.actions=restoreTargets(root,backup.backupRoot,backup.absence); cleanupTransactionSiblings(root,reportDir); result.rollback.performed=true;
        const afterRollback=snapshotSet(root,TARGETS); writeJson(path.join(reportDir,'target-state-after-rollback.json'),afterRollback);
        const rollbackChanges=compareSnapshotSets(targetBefore,afterRollback); result.rollback.verified=rollbackChanges.length===0; result.rollback.differences=rollbackChanges;
        const protectedAfterRollback=snapshotSet(root,PROTECTED_NON_TARGETS); const pc=compareSnapshotSets(protectedBefore,protectedAfterRollback); result.rollback.protectedStateRestored=pc.length===0; result.rollback.protectedDifferences=pc;
      }catch(rb){result.rollback.error={message:rb.message,stack:rb.stack};}
    }
    result.authorization={productionPromotionSucceeded:false,safeToCloseP0512:false,safeToMoveToNextPhase:false};
  }finally{
    result.finishedAt=new Date().toISOString();
    try{writeJson(path.join(reportDir,'p0512ap-summary.json'),result);}catch(e){console.error(e);}
  }
  if(!result.authorization.productionPromotionSucceeded){console.error(result.error?.stack||result.error?.message||'Promotion failed.');process.exitCode=2;}
  else console.log(`[${MILESTONE}] Production promotion and all post-promotion gates passed.`);
}
main();
