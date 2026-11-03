import assert from 'node:assert/strict';import * as crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {createUiFixture} from '../lib/ui-fixture-runtime.mjs';
const corpus=createUiFixture({modules:{'server-only':{},'node:crypto':crypto,'node:fs':{default:fs},'node:path':{default:path},'./store':{conversationStore:()=>null}},globals:{process:{cwd:()=>process.cwd()}}});
const {eligibleSimpleSources}=corpus.load('app/lib/conversations/simplePublication.ts');const {resolveSimpleReference}=corpus.load('app/lib/emet/experimental/SimpleEmetScripture.ts');
const owner=crypto.randomUUID(),id=crypto.randomUUID();let currentUser=owner;
const source={...resolveSimpleReference('John 17:3','web')[0],verification:'locked-corpus-text'};
const row={id,owner_user_id:owner,source_kind:'simple',source_passages:[source],question:'Selected question',answer:'Exact selected answer',citations:[{reference:source.reference,translation:source.translation}],qualifications:['Material qualification'],published_at:null,privateHistory:'DO NOT EXPOSE'};
const db={from(table){assert.equal(table,'emet_shared_studies');const filters=[];let update;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},not(k,op,v){assert.equal(op,'is');filters.push(r=>r[k]!==v);return q;},update(v){update=v;return q;},async maybeSingle(){if(!filters.every(fn=>fn(row)))return{data:null,error:null};if(update)Object.assign(row,update);return{data:row,error:null};}};return q;}};
const fixture=createUiFixture({modules:{'server-only':{},'node:crypto':crypto,'next/server':{NextResponse:Response},'../supabase/admin':{createSupabaseAdminClient:()=>db},'@/app/lib/supabase/server':{getVerifiedSupabaseUserId:async()=>currentUser},'./EmetAiCachedAnswerAuthority':{isEmetAiCachedAnswerAuthorityVerified:()=>false},'../conversations/simplePublication':{eligibleSimpleSources}}});
const service=fixture.load('app/lib/emet/EmetSharedStudy.ts');const api=fixture.load('app/api/emet/share/route.ts');
function req(method,body,origin){return new Request(`http://localhost/api/emet/share?id=${id}`,{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});}
assert.equal(await service.getPublishedSharedStudy(id),null);assert.equal((await api.POST(req('POST',{studyId:id}))).status,200);
const published=await service.getPublishedSharedStudy(id);assert.equal(published.question,row.question);assert.equal(published.answer,row.answer);assert.deepEqual(Array.from(published.qualifications),['Material qualification']);assert.equal(published.owner_user_id,undefined);assert.equal(published.privateHistory,undefined);
assert.equal((await (await api.GET(req('GET'))).json()).published,true);
currentUser=crypto.randomUUID();for(const method of ['POST','DELETE','GET'])assert.equal((await api[method](req(method,method==='GET'?null:{studyId:id}))).status,404);assert.ok(row.published_at);
currentUser=owner;assert.equal((await api.DELETE(req('DELETE',{studyId:id},'https://attacker.invalid'))).status,403);assert.ok(row.published_at);
assert.equal((await api.DELETE(req('DELETE',{studyId:id}))).status,200);assert.equal(row.published_at,null);assert.equal(await service.getPublishedSharedStudy(id),null);assert.equal((await api.DELETE(req('DELETE',{studyId:id}))).status,200);
row.source_passages=[{...source,text:'Fabricated text'}];assert.equal((await api.POST(req('POST',{studyId:id}))).status,404);assert.equal(row.published_at,null);
// Old published snapshots receive the same exact service-framing cleanup as chat.
row.source_passages=[source];row.published_at=new Date().toISOString();
row.answer='Please check the passages and limitations below before relying on this explanation.\n\nExact substantive answer';
row.qualifications=['EMET can make mistakes. Always verify its answers against Scripture.','Material qualification'];
const historical=await service.getPublishedSharedStudy(id);
assert.equal(historical.answer,'Exact substantive answer');assert.deepEqual(Array.from(historical.qualifications),['Material qualification']);
assert.match(row.answer,/^Please check/);assert.equal(row.qualifications.length,2);
currentUser=null;for(const method of ['POST','GET','DELETE'])assert.equal((await api[method](req(method,method==='GET'?null:{studyId:id}))).status,401);
for(const file of ['app/shared/[id]/page.tsx','app/shared/[id]/og/route.tsx'])assert.match(fs.readFileSync(file,'utf8'),/dynamic = "force-dynamic"/);
assert.match(fs.readFileSync('app/shared/[id]/og/route.tsx','utf8'),/"Cache-Control": "no-store"/);
console.log('PASS: actual owner-scoped publish/status/revoke handlers; explicit publication; revocation removes public snapshot; other owners/anonymous/origin rejected; invalid sources denied; selected question/answer/qualifications only; dynamic HTML and no-store OG. No model calls.');
// A late status read cannot restore "public" after a successful revoke.
const {elements,text}=await import('../lib/ui-fixture-runtime.mjs');let finishStatus,gets=0;
const controls=createUiFixture({globals:{window:{confirm:()=>true},fetch:async(url,options)=>{
 if(options?.method==='DELETE')return{ok:true};gets++;if(gets===1)return{ok:true,json:async()=>({published:true})};return new Promise(resolve=>{finishStatus=()=>resolve({ok:true,json:async()=>({published:true})});});
}}});const Control=controls.load('app/components/emet/PublicLinkControl.tsx').default;
let tree=controls.render(Control,{studyId:id,version:0});elements(tree,e=>e.type==='details')[0].props.onToggle({currentTarget:{open:true}});tree=controls.render();await new Promise(r=>setImmediate(r));tree=controls.render();assert.match(text(tree),/Revoke public link/);
controls.render(Control,{studyId:id,version:1});await new Promise(r=>setImmediate(r));tree=controls.render();elements(tree,e=>e.type==='button')[0].props.onClick();await new Promise(r=>setImmediate(r));finishStatus();await new Promise(r=>setImmediate(r));tree=controls.render();assert.match(text(tree),/not public/);assert.doesNotMatch(text(tree),/Revoke public link/);
console.log('PASS: a stale status response cannot undo the UI state of successful link revocation.');
