import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import * as crypto from 'node:crypto';
import {createUiFixture} from './lib/ui-fixture-runtime.mjs';
// Offline signed-identity fixtures, not live Supabase/customer sessions.
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const users=[{id:crypto.randomUUID(),email:'owner@example.invalid',email_confirmed_at:'2026-01-01'}, {id:crypto.randomUUID(),email:'reader@example.invalid',email_confirmed_at:'2026-01-01'}];
const sessions=users.map(user=>{const body=Buffer.from(JSON.stringify(user));return {body,signature:crypto.sign(null,body,privateKey)};});let session=sessions[0];
const auth={createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:session&&crypto.verify(null,session.body,publicKey,session.signature)?JSON.parse(session.body):null},error:null})}})};
const env={OPENAI_API_KEY:'offline-fixture-key',EMET_PUBLIC_ENGINE:'simple',EMET_SIMPLE_OWNER_ENABLED:'true',EMET_OWNER_EMAILS:users[0].email};
const events=[];let generated,fail=false;
const base={status:'complete',support:'theological-synthesis',limitations:[]};
const fixtures=[
 ['Is the trinity in the bible?',{...base,answer:'The Bible does not present the Trinity as an explicit doctrine, term, or formulated creed. John 17:3 identifies the Father and distinguishes the Messiah he sent.',references:[{reference:'jn. 17 : 3 (WEB)',translation:'web'},{reference:'1 john 5 : 7 – 8',translation:'web'}]}],
 ["Does Yahweh require keeping the Sabbath?",{...base,answer:'Exodus 20:8–11 commands remembering the Sabbath day and keeping it holy.',references:[{reference:'exod. 20 : 8 – 11',translation:'web'}]}],
 ["Did Abraham keep Yahweh's commandments?",{...base,answer:'Genesis 26:5 says Abraham obeyed Yahweh’s voice and kept his commandments.',references:[{reference:'gen. 26 : 5',translation:'web'}]}],
 ['Who is Yahweh, and is Yahshua the same person?',{...base,answer:'John 17:3 distinguishes the Father from the Messiah whom he sent.',references:[{reference:'John 17:3; 20:17',translation:'web'}]}],
];
const f=createUiFixture({modules:{'server-only':{},'node:crypto':crypto,'node:fs':{default:fs},'node:path':{default:path},'../../supabase/server':auth,'../../supabase/admin':{createSupabaseAdminClient:()=>null},
 openai:{default:class {constructor(){this.responses={create:async()=>{if(fail)throw Error('CONFIDENTIAL provider detail');return{status:'completed',output_text:JSON.stringify(generated)};}};}}},
 './SimpleEmet':{configuredSimpleEmetModel:()=> 'unchanged-fixture-model',parseSimpleHistory:x=>x,generateSimpleEmet:async()=>{if(fail)throw Error('CONFIDENTIAL provider detail');return {draft:generated,diagnostics:{code:generated.status==='complete'?'draft-ready':'model-insufficient-evidence',stage:'model-answer',modelAnswerStatus:generated.status}};}},
 '../EmetAiQuota':{reserveEmetAiQuestion:async()=>{events.push('reserve');return{allowed:true,charged:true,unlimited:false};},completeEmetAiQuestion:async(_,status)=>{events.push(status);return true;},refundFailedEmetAiQuestion:async()=>events.push('refund'),getEmetAiUsageSummary:async()=>({questionsRemaining:3})},
},globals:{process:{env,cwd:()=>process.cwd()},Buffer,console:{...console,info(){}}}});
// Keep the real authenticated access check; replace request persistence only.
const access=f.load('app/lib/emet/experimental/SimpleEmetAccess.ts');
const serviceFixture=createUiFixture({modules:{'server-only':{},'./SimpleEmetAccess':{...access,claimSimpleRequest:async()=> 'claimed'},'./SimpleEmet':f.load('app/lib/emet/experimental/SimpleEmet.ts'),'./SimpleEmetScripture':f.load('app/lib/emet/experimental/SimpleEmetScripture.ts'),'../EmetAiQuota':{reserveEmetAiQuestion:async()=>{events.push('reserve');return{allowed:true,charged:true,unlimited:false};},completeEmetAiQuestion:async(_,status)=>{events.push(status);return true;},refundFailedEmetAiQuestion:async()=>events.push('refund'),getEmetAiUsageSummary:async()=>({questionsRemaining:3})}},globals:{console:{...console,info(){}}}});
const service=serviceFixture.load('app/lib/emet/experimental/SimpleEmetRequest.ts');
async function run(user,question,draft){generated=draft;events.length=0;return service.handleSimpleEmet({userId:user.id,requestId:crypto.randomUUID(),conversationId:crypto.randomUUID(),history:[],context:null,question});}
for(const [i,user] of users.entries()){
 session=sessions[i];const allowed=await access.getSimpleEmetAccess(user.id);assert.equal(allowed.authorized,true);assert.equal(allowed.ownerDiagnostics,i===0);
 assert.equal((await access.getSimpleEmetAccess(users[1-i].id)).authorized,false,'A different claimed account cannot reuse the authenticated session');
 for(const [question,draft] of fixtures){const r=await run(user,question,draft);assert.equal(r.status,200);assert.equal(r.body.status,'complete');assert.equal(r.body.answer.answer,draft.answer);assert(r.body.answer.citations.length);assert.equal(r.body.answer.verificationStatus,'references-verified');assert.equal(Boolean(r.body.diagnostics),i===0);}
 const [q,draft]=fixtures[0];
 let r=await run(user,q,{...draft,references:[...draft.references,{reference:'John 999:1',translation:'web'}]});assert.equal(r.status,200);assert.equal(r.body.status,'complete-unverified');assert.equal(r.body.answer.answer,draft.answer);assert(r.body.answer.citations.every(c=>!c.reference.includes('999')));assert.equal(Boolean(r.body.answer.unresolvedReferences),i===0);
 r=await run(user,q,{...draft,status:'insufficient-evidence'});assert.equal(r.status,200);assert.equal(r.body.status,'complete-unverified');assert.equal(r.body.answer.status,'insufficient-evidence','Keep the original model assessment');assert.equal(r.body.answer.referenceVerificationStatus,'references-verified');assert.equal(r.body.answer.verificationStatus,'unverified','Do not certify or publish a model-limited answer');assert(events.includes('refund'));
 r=await run(user,'An unsupported question',{...base,status:'insufficient-evidence',support:'does-not-establish',answer:'These passages do not establish that detail.',references:[],limitations:['Scripture does not specify that detail.']});assert.equal(r.status,200);assert.equal(r.body.answer.answer,'These passages do not establish that detail.');assert.equal(r.body.answer.verificationStatus,'unverified');assert.equal(r.body.answer.citations.length,0);
 fail=true;r=await run(user,q,draft);fail=false;assert.equal(r.status,503);assert.match(r.body.answer,/Please try again/);assert(!JSON.stringify(r.body).includes('CONFIDENTIAL'));assert.equal(Boolean(r.body.diagnostics),i===0);
}
session=null;assert.equal((await access.getSimpleEmetAccess(users[0].id)).authorized,false);
const privacy=createUiFixture({modules:{'server-only':{},'../supabase/admin':{createSupabaseAdminClient:()=>null}}});const {privateResponse}=privacy.load('app/lib/conversations/store.ts');
for(const status of ['insufficient-evidence','complete-unverified']){
 const old={status,diagnostics:{code:'PRIVATE_CODE'},usage:{},answer:{status:'insufficient-evidence',answer:fixtures[0][1].answer,verificationStatus:'unverified',unresolvedReferences:[{reference:'PRIVATE_REFERENCE'}],limitations:['Owner diagnostic: PRIVATE_CODE (citation-resolution).','Material limitation remains.']}};
 const safe=privateResponse(old);assert.equal(safe.answer.answer,old.answer.answer);assert.equal(safe.status,status);assert.equal(safe.answer.verificationStatus,'unverified');assert.deepEqual(Array.from(safe.answer.limitations),['Material limitation remains.']);assert(!JSON.stringify(safe).includes('PRIVATE_'));
}
const scripture=f.load('app/lib/emet/experimental/SimpleEmetScripture.ts');
for(const ref of ['John 17:3 (KJV)','Invented 1:1','John 999:1','John 17:3; Invented 1:1'])assert.equal(scripture.resolveSimpleReference(ref,'web'),null);
assert.equal(scripture.resolveSimpleReference('Daniel 13:1','brenton'),null,'Never infer a Greek-edition mapping');
assert(scripture.resolveSimpleReference('John 1:1-30','web')?.length===30);
console.log('PASS four ordinary questions, normalization and bounded source resolution, partial invalid sources, original model insufficiency retained without 422, genuine unsupported explanation, provider retry/refund, two separately signed authenticated identity fixtures with real owner allowlist checks, anonymous/spoof denial and historical metadata redaction. No live-model or live-Supabase acceptance is claimed.');
// Actual history GET and idempotent-request replay re-sanitize legacy JSON.
const ownerId=users[0].id,conversation=crypto.randomUUID(),requestId=crypto.randomUUID();
const oldResponse={status:'insufficient-evidence',source:'simple-owner-model',diagnostics:{code:'PRIVATE_CODE'},answer:{status:'insufficient-evidence',answer:fixtures[0][1].answer,verificationStatus:'unverified',unresolvedReferences:[{reference:'PRIVATE_REF'}],limitations:['Owner diagnostic: PRIVATE_CODE','A concrete limitation.']}};
const db={from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(){return q;},gt(){return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>({data:filters.some(([k,v])=>k==='owner_user_id'&&v!==ownerId)?null:{id:conversation},error:null}),then(resolve,reject){assert.equal(table,'emet_conversation_turns');return Promise.resolve({data:[{request_id:requestId,response:oldResponse}],error:null}).then(resolve,reject);}};return q;},rpc:async()=>({data:{status:'complete',response:oldResponse,httpStatus:422},error:null})};
const getId=async()=>{const r=await (await auth.createSupabaseServerClient()).auth.getUser();return r.data.user?.id||null;};
const historyFixture=createUiFixture({modules:{'server-only':{},'node:crypto':crypto,'node:fs':{default:fs},'node:path':{default:path},'next/server':{NextResponse:Response},'../supabase/admin':{createSupabaseAdminClient:()=>db},'@/app/lib/supabase/server':{getVerifiedSupabaseUserId:getId},'../supabase/server':{getVerifiedSupabaseUserId:getId}},globals:{Response}});
const historyApi=historyFixture.load('app/api/emet/conversations/route.ts');session=sessions[0];
let historyResult=await historyApi.GET(new Request(`https://fixture.invalid/api/emet/conversations?id=${conversation}`));assert.equal(historyResult.status,200);let historyBody=await historyResult.json();assert.equal(historyBody.turns[0].response.answer.answer,oldResponse.answer.answer);assert(!JSON.stringify(historyBody).includes('PRIVATE_'));
session=sessions[1];assert.equal((await historyApi.GET(new Request(`https://fixture.invalid/api/emet/conversations?id=${conversation}`))).status,404);
const replay=historyFixture.load('app/lib/conversations/withConversation.ts').withConversation;session=sessions[0];let generatedAgain=false;
const replayResult=await replay(new Request('https://fixture.invalid/api/emet/ask',{method:'POST',body:JSON.stringify({persistConversation:true,conversationId:conversation,requestId,question:'Original question'})}),async()=>{generatedAgain=true;throw Error('Must not call generation');});
const replayBody=await replayResult.json();assert.equal(replayResult.status,422,'Preserve historical transport status');assert.equal(replayBody.answer.answer,oldResponse.answer.answer);assert(!JSON.stringify(replayBody).includes('PRIVATE_'));assert.equal(generatedAgain,false);
session=null;assert.equal((await replay(new Request('https://fixture.invalid/api/emet/ask',{method:'POST',body:JSON.stringify({persistConversation:true})}),async()=>{throw Error('Unauthenticated generation');})).status,401);
console.log('PASS actual history GET and idempotent replay redact historical owner metadata, retain text/status, enforce ownership and authentication, and make zero generation or quota calls.');
