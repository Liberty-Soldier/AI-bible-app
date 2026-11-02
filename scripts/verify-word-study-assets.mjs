// Actual recovered corpus/runtime and consumer checks. Optional HTTP tests use
// localhost only; Word Study endpoints load cached data and never generate AI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createUiFixture} from './lib/ui-fixture-runtime.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected='40cdb6a8c540d778da0db4369630fa95b6d094ec504d7aee6908356bddb105ec';
execFileSync(process.execPath,['scripts/recover-word-study-runtime.cjs','--verify-only'],{stdio:'pipe'});
const recovered=JSON.parse(fs.readFileSync('app/data/bibleiq/runtime-locks/word-study-build-inputs/provenance.json'));
const batch2=JSON.parse(fs.readFileSync('app/data/bibleiq/runtime-locks/p0812r2-brenton-nonparity-coordinate-batch2/manifest.json'));
assert.equal(sha(fs.readFileSync('app/data/bibleiq/runtime-locks/word-study-build-inputs/brenton-pre-batch2-overlay.json')),batch2.lockedInputs.overlaySha256);
assert.equal(recovered.result.manifestSha256,expected);
assert.equal(sha(fs.readFileSync('app/data/bibleiq/runtime-locks/word-study-build-inputs/CanonicalVerseStore.snapshot')),recovered.consumer.sha256);
assert.equal(recovered.consumer.sha256,'2bc980850c58457c513f0c0a0faf6a10b9adf00d4fa7d66e300b0ce014d8517a');
assert.equal(sha(fs.readFileSync('public/data/bibleiq/word-study-brenton-reader-record/manifest.json')),recovered.result.finalOverlaySha256);
const f=createUiFixture({modules:{'server-only':{},'node:crypto':crypto},globals:{fetch:async url=>{
 const file=path.join(process.cwd(),'public',new URL(url).pathname);assert(fs.existsSync(file),`Runtime request must exist: ${file}`);return{ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
}}});
const consumer=f.load('app/data/scripture/CanonicalVerseStore.ts');
const cases=[['Genesis','web','hebrew','H7225'],['John','web','greek-nt','G0746'],['Genesis','kjv','hebrew','H7225'],['John','kjv','greek-nt','G0746'],['Genesis','brenton','lxx','L701836']];
for(const [book,translation,source,lexical] of cases){
 const input={origin:'https://fixture.invalid',book,chapter:1,verse:1,translation,displayTokenIndex:2,...(translation==='brenton'?{readerRecordId:'brenton:GEN:1:1'}:{})};
 const availability=await consumer.getCanonicalChapterTokenAvailability({...input});assert(Object.keys(availability).length);
 const hit=await consumer.findCanonicalHit(input);assert(hit&&hit.sourceToken);assert.equal(hit.sourceToken.source,source);assert(hit.sourceToken.id);assert.match(hit.entityId,new RegExp(`^word:${source}:`));
 console.log(`PASS: ${translation} ${book} 1:1 beginning -> ${hit.sourceToken.id}, ${hit.entityId}`);
}
const arg=process.argv.find(a=>a.startsWith('--http-base='));
if(arg){
 const base=new URL(arg.slice('--http-base='.length));assert(['localhost','127.0.0.1'].includes(base.hostname),'Only local HTTP is permitted');
 const r=await fetch(new URL('/data/bibleiq/word-study/manifest.json',base));assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),expected);
 for(const [book,translation,source,lexical] of cases){
  const query=new URLSearchParams({book,chapter:'1',verse:'1',translation,displayTokenIndex:'2',displayWord:'beginning',...(translation==='brenton'?{readerRecordId:'brenton:GEN:1:1'}:{})});
  const response=await fetch(new URL(`/api/word-study?${query}`,base));assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.resolved,true);assert.equal(data.resolutionType,'verse-context');assert.equal(data.preferredSource,source);assert.equal(data.entity.id,`word:${source}:${lexical}`);
  assert.equal(data.entity.meaningInVerse.reference,`${book} 1:1`);assert.equal(data.entity.meaningInVerse.lexicalId,lexical);assert.equal(data.entity.meaningInVerse.selectedEnglish,'beginning');assert(data.entity.meaningInVerse.sourceWord);assert.equal(data.entity.alignment.source,source);assert.equal(data.entity.alignment.lexicalId,lexical);
  console.log(`PASS HTTP: ${translation} ${book} 1:1 ${lexical} substantive verse-context/translation/source identity`);
 }
}
console.log('PASS: recovered source provenance, 115 runtime file seals, all three corpora, existing consumer routes, and unchanged final Brenton overlay. No AI calls.');
