import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import * as crypto from 'node:crypto';
import { createUiFixture } from './lib/ui-fixture-runtime.mjs';

// Execute actual access, quota wrapper and service code. The private-table/RPC
// fixture models the checked-in transaction contract, not a live Supabase DB.
const env={EMET_PUBLIC_ENGINE:'simple',EMET_SIMPLE_OWNER_ENABLED:'true',EMET_OWNER_EMAILS:'owner@example.invalid',OPENAI_API_KEY:'fixture-only',EMET_AI_FAST_ENGINE:'true',EMET_AI_SIMPLE_MODEL:'fixture-model'};
let now=Date.parse('2026-10-30T00:00:00Z');
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const ordinary={id:'22222222-2222-4222-8222-222222222222',email:'reader@example.invalid',email_confirmed_at:'2026-01-01'};
const owner={id:'33333333-3333-4333-8333-333333333333',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'};
let user=ordinary,used=0,limit=2,rpcCalls=0,hold=false,release,reservationRace=false;
let draft={status:'complete',answer:'According to John 17:3, the Father is distinguished from the Messiah he sent.',support:'theological-synthesis',references:[{reference:'John 17:3',translation:'web'}],limitations:[]};
const rows=[],calls=[],events=[];
function table(name){
 const tests=[];let update;
 const select=()=>{
  if(name==='emet_accounts')return[{plan_code:'free',subscription_status:'inactive'}];
  if(name==='emet_plans')return[{code:'free',name:'Free',monthly_question_limit:limit}];
  if(name==='emet_usage_periods')return[{question_limit:limit,questions_used:used}];
  assert.equal(name,'emet_question_requests');return rows.filter(row=>tests.every(test=>test(row)));
 };
 const result=()=>{const selected=select();if(update)for(const row of selected)Object.assign(row,update);return{data:selected,error:null};};
 const query={
  select(){return query;},eq(key,value){tests.push(row=>row[key]===value);return query;},
  like(key,value){tests.push(row=>row[key]?.startsWith(value.slice(0,-1)));return query;},
  is(key,value){tests.push(row=>(row[key]??null)===value);return query;},
  gte(key,value){tests.push(row=>row[key]>=value);return query;},order(){return query;},limit(){return query;},
  update(value){update=value;return query;},
  maybeSingle(){const out=result();return Promise.resolve({...out,data:out.data[0]||null});},
  then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},
  insert(value){
   if(rows.some(row=>row.user_id===value.user_id&&row.request_id===value.request_id))return Promise.resolve({error:{code:'23505'}});
   rows.push({created_at:new ClockDate().toISOString(),completed_at:null,...value});events.push({type:'insert',...value});return Promise.resolve({error:null});
  },
 };return query;
}
const client={from:table,auth:{getUser:async()=>({data:{user},error:null})},async rpc(name,args){
 if(name==='reserve_emet_question'){
  rpcCalls++;
  const existing=rows.find(row=>row.user_id===user.id&&row.request_id===args.p_request_id);
  // Reproduces the existing RPC's existing-row shortcut: the old owner-only
  // preinsert would return allowed without charging. The test forbids that row.
  assert.equal(existing,undefined,'Ordinary request must not exist before quota RPC');
  if(reservationRace){reservationRace=false;used++;rows.push({user_id:user.id,request_id:args.p_request_id,cache_key:args.p_cache_key,allowed:true,charged:true,created_at:new ClockDate().toISOString(),completed_at:null});return{data:[{allowed:true,charged:false,question_limit:limit,questions_used:used,questions_remaining:limit-used}],error:null};}
  const allowed=used<limit;if(allowed)used++;
  rows.push({user_id:user.id,request_id:args.p_request_id,cache_key:args.p_cache_key,allowed,charged:allowed,created_at:new ClockDate().toISOString(),completed_at:null});
  return{data:[{allowed,charged:allowed,question_limit:limit,questions_used:used,questions_remaining:Math.max(0,limit-used)}],error:null};
 }
 assert.equal(name,'refund_failed_emet_question');
 const row=rows.find(row=>row.user_id===user.id&&row.request_id===args.p_request_id);
 if(row?.charged){used--;Object.assign(row,{charged:false,allowed:false,completed_at:new ClockDate().toISOString(),result_source:'fail-closed'});return{data:true,error:null};}
 return{data:false,error:null};
}};
class FakeOpenAI{constructor(options){assert.equal(options.maxRetries,0);this.responses={create:async input=>{calls.push(input);if(hold)await new Promise(resolve=>{release=resolve;});return{status:'completed',output_text:JSON.stringify(draft),usage:{output_tokens:100}};}};}}
const supabase={createSupabaseServerClient:async()=>client,getVerifiedSupabaseUser:async()=>user,getVerifiedSupabaseUserId:async()=>user?.id||null};
const admin={createSupabaseAdminClient:()=>({from:table})};
const fixture=createUiFixture({globals:{process:{env,cwd:()=>process.cwd()},Date:ClockDate,Buffer,console:{...console,info(){}}},modules:{
 'server-only':{},'node:fs':{default:fs},'node:path':{default:path},'node:crypto':crypto,openai:{default:FakeOpenAI},
 '../../supabase/server':supabase,'../supabase/server':supabase,'../../supabase/admin':admin,'../supabase/admin':admin,
}});
const access=fixture.load('app/lib/emet/experimental/SimpleEmetAccess.ts');
const routing=fixture.load('app/lib/emet/EmetPublicRouting.ts');
const service=fixture.load('app/lib/emet/experimental/SimpleEmetRequest.ts');
let count=1;
const makeInput=()=>({userId:user?.id||ordinary.id,requestId:`11111111-1111-4111-8111-${String(count++).padStart(12,'0')}`,conversationId:'11111111-1111-4111-8111-111111111111',question:'An authorized question',history:[],context:null});
assert.equal((await access.getSimpleEmetAccess(ordinary.id)).authorized,true);assert.equal((await access.getSimpleEmetAccess(ordinary.id)).ownerDiagnostics,false);
assert.equal((await access.getSimpleEmetAccess(owner.id)).authorized,false);
const first=makeInput();hold=true;const pending=service.handleSimpleEmet(first);await new Promise(resolve=>setImmediate(resolve));
assert.equal(used,1);assert.equal(rpcCalls,1);assert.equal(calls.length,1);
assert.equal(rows.find(row=>row.request_id===first.requestId).charged,true);
assert.equal((await service.handleSimpleEmet(first)).status,409);assert.equal(used,1);
assert.equal((await service.handleSimpleEmet(makeInput())).status,429);assert.equal(calls.length,1);
now+=20_000;assert.equal((await service.handleSimpleEmet(makeInput())).status,429,'Pending request blocks another bucket');
hold=false;release();let result=await pending;
assert.equal(result.status,200);assert.equal(result.body.diagnostics,undefined);assert.equal(result.body.answer.unresolvedReferences,undefined);assert.equal(result.body.shareStudyId,undefined);
assert.equal(rows.find(row=>row.request_id===first.requestId).result_source,'model');
now+=20_000;result=await service.handleSimpleEmet(makeInput());assert.equal(result.status,200);assert.equal(used,2);
now+=20_000;const beforeQuota=calls.length;assert.equal((await service.handleSimpleEmet(makeInput())).status,429);assert.equal(used,2);assert.equal(calls.length,beforeQuota);
limit=3;now+=20_000;const validDraft=draft;draft={...draft,answer:'An answer with unresolved sources',references:[{reference:'Invented 999:1',translation:'web'}]};
result=await service.handleSimpleEmet(makeInput());assert.equal(result.status,200);assert.equal(result.body.status,'complete-unverified');assert.equal(used,3,'A completed answer consumes its reservation');assert.equal(result.body.answer.citations.length,0);assert.equal(result.body.answer.answer,'An answer with unresolved sources');assert.equal(result.body.diagnostics,undefined);assert.equal(result.body.answer.unresolvedReferences,undefined);assert.equal(result.body.shareStudyId,undefined);
limit=4;now+=20_000;const insufficientDraft=draft;draft={...draft,status:'insufficient-evidence'};result=await service.handleSimpleEmet(makeInput());assert.equal(result.status,422);assert.equal(used,3,'Genuine insufficient evidence refunds ordinary usage');assert.equal(result.body.diagnostics,undefined);draft=insufficientDraft;
limit=4;now+=20_000;reservationRace=true;const raced=makeInput(),beforeRace=calls.length;
result=await service.handleSimpleEmet(raced);assert.equal(result.status,409);assert.equal(calls.length,beforeRace);assert.equal(used,4,'Do not refund the reservation owned by another worker');rows.find(row=>row.request_id===raced.requestId).completed_at=new ClockDate().toISOString();
user=owner;now+=20_000;const ownerRequest=makeInput();const beforeOwnerRpc=rpcCalls;
result=await service.handleSimpleEmet(ownerRequest);assert.equal(result.status,200);assert.equal(result.body.status,'complete-unverified');assert.ok(result.body.diagnostics);assert.equal(result.body.answer.answer,'An answer with unresolved sources');assert.equal(result.body.shareStudyId,undefined);
assert.equal(rpcCalls,beforeOwnerRpc);assert.equal(rows.find(row=>row.request_id===ownerRequest.requestId).charged,false);assert.equal(used,4);
assert.equal((await service.handleSimpleEmet(ownerRequest)).status,409);
env.EMET_SIMPLE_OWNER_ENABLED='false';now+=20_000;result=await service.handleSimpleEmet(makeInput());assert.equal(result.status,200);assert.equal(result.body.answer.unresolvedReferences,undefined);assert.equal(result.body.diagnostics,undefined);env.EMET_SIMPLE_OWNER_ENABLED='true';
draft=validDraft;env.EMET_PUBLIC_ENGINE='current';assert.equal(routing.getPublicEmetEngine(),'current');const beforeRollback=calls.length;assert.equal((await service.handleSimpleEmet(makeInput())).status,403);assert.equal(calls.length,beforeRollback);
env.EMET_PUBLIC_ENGINE='malformed';assert.equal(routing.getPublicEmetEngine(),null);assert.equal((await service.handleSimpleEmet(makeInput())).status,403);
delete env.EMET_PUBLIC_ENGINE;assert.equal(routing.getPublicEmetEngine(),'simple');
user=null;assert.equal((await service.handleSimpleEmet(makeInput())).status,403);
console.log('PASS: actual public access/quota/service modules with transaction-contract fixtures: ordinary charging and exhaustion, no preinsert bypass, duplicate and cross-bucket in-flight guards, refunds, unlimited owner idempotency, private diagnostics, unverified public warnings without private details, no publication IDs, rollback/config/auth denial. No paid calls.');

// Both public AI routes obey the server selection, regardless of client fields.
for(const file of ['app/api/emet/ask/route.ts','app/api/emet/explain/route.ts']){
 const source=fs.readFileSync(file,'utf8');const modules={};let selected='simple',routeUser=ordinary.id,seen=[],legacy=false;
 for(const match of source.matchAll(/from "([^"]+)"/g))modules[match[1]]=new Proxy({}, {get:(_,key)=>()=>{throw Error(`Unexpected original-engine call ${String(key)}`);}});
 modules['next/server']={NextResponse:{json:(body,options)=>({body,...options})}};
 modules['@/app/lib/emet/EmetPublicRouting']={getPublicEmetEngine:()=>selected};
 modules['@/app/lib/supabase/server']={getVerifiedSupabaseUserId:async()=>routeUser};
 modules['@/app/lib/emet/EmetAiConversation']={parseEmetConversationContext:()=>({recentExchanges:[{question:'Prior question',answer:'Prior answer',outcome:'answered'}]})};
 modules['@/app/lib/emet/experimental/SimpleEmetRequest']={handleSimpleEmet:async input=>{seen.push(input);return{status:200,body:{status:'complete'}};}};
 modules['@/app/lib/emet/EmetAiPerformance']={createEmetAiPerformanceTrace:()=>{legacy=true;throw Error('secure-original-path-marker');}};
 const api=createUiFixture({modules,globals:{process:{env:{EMET_LIVE_ENABLED:'true'}}}}).load(file);
 const base={question:'Follow-up',requestId:crypto.randomUUID(),conversationId:crypto.randomUUID(),context:{book:'Genesis',chapter:1,verse:1,translation:'web',displayWord:'beginning',displayTokenIndex:0,sourceCorpus:'hebrew'}};
 for(const engine of [undefined,'simple','current']){const out=await api.POST({json:async()=>({...base,engine})});assert.equal(out.status,200);assert.equal(seen.at(-1).history[0].answer,'Prior answer');}
 assert.equal(legacy,false);selected='current';
 for(const engine of [undefined,'simple','current']){await assert.rejects(()=>api.POST({json:async()=>({...base,engine})}),/secure-original-path-marker/);assert.equal(legacy,true);legacy=false;}
 selected=null;assert.equal((await api.POST({json:async()=>base})).status,503);
 routeUser=null;selected='simple';assert.equal((await api.POST({json:async()=>base})).status,401);
 routeUser=ordinary.id;assert.equal((await api.POST({json:async()=>null})).status,400);
}
console.log('PASS: ask/explain server routing, client selector cannot override default or rollback, invalid config fails closed, legacy history remains available, anonymous and malformed requests rejected.');
const sessionModules={
 'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
 '@/app/lib/emet/EmetPublicRouting':{getPublicEmetEngine:()=>routing.getPublicEmetEngine()},
 '@/app/lib/supabase/server':{getVerifiedSupabaseUserId:async()=>user?.id||null},
 '@/app/lib/emet/EmetAiQuota':fixture.load('app/lib/emet/EmetAiQuota.ts'),
 '@/app/lib/emet/experimental/SimpleEmetAccess':access,
};
const session=createUiFixture({modules:sessionModules}).load('app/api/emet/session/route.ts');
user=ordinary;let sessionResult=await session.GET();assert.equal(sessionResult.body.engine,'simple');assert.equal(sessionResult.body.ownerDiagnostics,false);assert.equal(sessionResult.body.simpleAvailable,undefined);
user=owner;sessionResult=await session.GET();assert.equal(sessionResult.body.ownerDiagnostics,true);
env.EMET_PUBLIC_ENGINE='current';sessionResult=await session.GET();assert.equal(sessionResult.body.engine,'current');
user=null;assert.equal((await session.GET()).status,401);
console.log('PASS: authenticated session exposes server engine and self-account diagnostic capability only; ordinary accounts cannot obtain owner capabilities.');
