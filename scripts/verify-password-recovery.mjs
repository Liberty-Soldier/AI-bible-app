import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import fs from 'node:fs';
import {createUiFixture,elements,text} from './lib/ui-fixture-runtime.mjs';
const id=crypto.randomUUID(),session=crypto.randomUUID();let user={id,updated_at:'2026-11-03T00:00:00Z'},claims={sub:id,session_id:session},now=Date.now();
let origin='https://emetsees.com',host='emetsees.com',emailError=null,updateError=null,exchangeType='recovery',exchangeError=null,otpError=null,throws=false;
const jar=new Map(),calls=[];const cookieStore={get:name=>jar.has(name)?{value:jar.get(name)}:undefined,set(name,value,options){calls.push(['cookie',name,options]);if(options.maxAge===0)jar.delete(name);else jar.set(name,value);}};
const client={auth:{
 getUser:async()=>({data:{user},error:null}),getClaims:async()=>({data:{claims},error:null}),
 resetPasswordForEmail:async(email,options)=>{calls.push(['recover',email,options]);if(throws)throw Error('PRIVATE provider error');return{error:emailError};},
 exchangeCodeForSession:async(code,options)=>{calls.push(['exchange',code,options]);return{data:{user,session:{},redirectType:exchangeType},error:exchangeError};},
 verifyOtp:async(options)=>{calls.push(['otp',options]);return{data:{user,session:{}},error:otpError};},
 updateUser:async(options)=>{calls.push(['update',options]);if(!updateError)user={...user,updated_at:'2026-11-03T00:01:00Z'};return{data:{user},error:updateError};},
 signOut:async(options)=>{calls.push(['signout',options]);return{error:null};},
}};
function redirect(url){throw Object.assign(new Error('REDIRECT'),{url});}
const f=createUiFixture({modules:{'server-only':{},'node:crypto':crypto,'next/headers':{cookies:async()=>cookieStore,headers:async()=>new Headers({origin,host})},'next/navigation':{redirect},'next/link':{default:'a'},'next/server':{NextResponse:{redirect:url=>new Response(null,{status:307,headers:{Location:String(url)}})}},'./server':{createSupabaseServerClient:async()=>client},'@/app/lib/supabase/server':{createSupabaseServerClient:async()=>client,getVerifiedSupabaseUser:async()=>null}},globals:{Buffer,FormData,Response,Date:class extends Date{static now(){return now;}},process:{env:{NODE_ENV:'production',SUPABASE_SECRET_KEY:'OFFLINE-ONLY-FAKE-RECOVERY-SIGNING-SECRET'}},console:{log(){throw Error('Unexpected logging');},error(){throw Error('Unexpected logging');}}}});
const recovery=f.load('app/lib/supabase/recovery.ts'),actions=f.load('app/auth/recovery-actions.ts'),callback=f.load('app/auth/recovery/route.ts');
const form=(values)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};const idle={status:'idle'};
const count=name=>calls.filter(c=>c[0]===name).length;
const result=await actions.requestRecoveryAction(idle,form({email:'OWNER@example.invalid'}));assert.equal(result.status,'sent');assert.equal(calls.find(c=>c[0]==='recover')[2].redirectTo,'https://emetsees.com/auth/recovery');
emailError={message:'No such account'};assert.deepEqual(await actions.requestRecoveryAction(idle,form({email:'unknown@example.invalid'})),result);
emailError={status:429,message:'Rate limit PRIVATE'};assert.deepEqual(await actions.requestRecoveryAction(idle,form({email:'unknown@example.invalid'})),result);emailError=null;
throws=true;assert.deepEqual(await actions.requestRecoveryAction(idle,form({email:'unknown@example.invalid'})),result);throws=false;
assert.equal((await actions.requestRecoveryAction(idle,form({email:'invalid'}))).status,'error');
origin='https://www.emetsees.com';let prior=count('recover');await assert.rejects(()=>actions.requestRecoveryAction(idle,form({email:'owner@example.invalid'})),e=>e.url==='https://emetsees.com/auth/forgot-password');assert.equal(count('recover'),prior);origin='https://emetsees.com';
assert.equal(recovery.recoveryOrigin('https://evil.invalid'),'https://emetsees.com');assert.equal(recovery.recoveryOrigin('http://localhost:3000'),'https://emetsees.com');
const request=query=>({nextUrl:new URL('https://emetsees.com/auth/recovery'+query)});
let response=await callback.GET(request('?code=FAKE-CODE&next=https://evil.invalid'));assert.equal(response.headers.get('location'),'https://emetsees.com/auth/reset-password');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'private, no-store');assert(await recovery.recoverySession());
const [cookieName,grant]=[...jar.entries()][0];assert.match(cookieName,/^__Host-/);const options=calls.find(c=>c[0]==='cookie'&&c[2].maxAge>0)[2];assert(options.httpOnly&&options.secure&&options.sameSite==='lax'&&options.path==='/');
jar.set(cookieName,grant+'tamper');assert.equal(await recovery.recoverySession(),null);jar.set(cookieName,grant);
const savedClaims=claims;claims={...claims,sub:crypto.randomUUID()};assert.equal(await recovery.recoverySession(),null);claims={...savedClaims,session_id:crypto.randomUUID()};assert.equal(await recovery.recoverySession(),null);claims=savedClaims;
now+=601000;assert.equal(await recovery.recoverySession(),null);now-=601000;
jar.clear();assert.equal(await recovery.recoverySession(),null);prior=count('update');assert.equal((await actions.updateRecoveryPasswordAction(idle,form({password:'new-password',confirmPassword:'new-password'}))).status,'expired');assert.equal(count('update'),prior);
for(const query of ['', '?error=PRIVATE_PROVIDER_DETAIL','?token_hash=FAKE&type=signup','?code=FAKE&token_hash=FAKE&type=recovery']){response=await callback.GET(request(query));assert.equal(response.headers.get('location'),'https://emetsees.com/auth/reset-password?expired=1');assert.equal(jar.size,0);}
exchangeType='signup';response=await callback.GET(request('?code=FAKE'));assert.match(response.headers.get('location'),/expired=1$/);assert.equal(jar.size,0);exchangeType='recovery';
exchangeError={message:'Code already used or expired PRIVATE'};response=await callback.GET(request('?code=FAKE'));assert.match(response.headers.get('location'),/expired=1$/);exchangeError=null;
otpError={message:'Expired PRIVATE'};response=await callback.GET(request('?token_hash=FAKE&type=recovery'));assert.match(response.headers.get('location'),/expired=1$/);otpError=null;
response=await callback.GET(request('?token_hash=FAKE&type=recovery'));assert.equal(response.headers.get('location'),'https://emetsees.com/auth/reset-password');assert.equal(calls.filter(c=>c[0]==='otp').at(-1)[1].type,'recovery');assert(await recovery.recoverySession());
assert.equal((await actions.updateRecoveryPasswordAction(idle,form({password:'long-password',confirmPassword:'different'}))).status,'error');assert.equal(count('update'),prior);
assert.equal((await actions.updateRecoveryPasswordAction(idle,form({password:'short',confirmPassword:'short'}))).status,'error');assert.equal(count('update'),prior);
updateError={code:'weak_password',message:'PRIVATE policy details'};let r=await actions.updateRecoveryPasswordAction(idle,form({password:'long-password',confirmPassword:'long-password'}));assert.match(r.message,/stronger password/);assert(!r.message.includes('PRIVATE'));
updateError={status:429};r=await actions.updateRecoveryPasswordAction(idle,form({password:'long-password',confirmPassword:'long-password'}));assert.match(r.message,/Wait/);
updateError=null;const finalGrant=[...jar.entries()][0];r=await actions.updateRecoveryPasswordAction(idle,form({password:' password with spaces ',confirmPassword:' password with spaces '}));assert.equal(r.status,'complete');assert.equal(calls.filter(c=>c[0]==='update').at(-1)[1].password,' password with spaces ');assert.equal(jar.size,0);assert.equal(calls.filter(c=>c[0]==='signout').at(-1)[1].scope,'local');
jar.set(...finalGrant);assert.equal(await recovery.recoverySession(),null,'A changed user revision invalidates a copied pre-update grant');jar.clear();
const page=f.load('app/auth/page.tsx');let tree=await page.default({searchParams:Promise.resolve({})});const links=elements(tree,e=>e.type==='a'&&text(e)==='Forgot password?');assert.equal(links.length,1);assert.equal(links[0].props.href,'/auth/forgot-password');tree=await page.default({searchParams:Promise.resolve({mode:'signup'})});assert.equal(elements(tree,e=>e.type==='a'&&text(e)==='Forgot password?').length,0);
const forgot=f.load('app/auth/forgot-password/page.tsx');host='www.emetsees.com';await assert.rejects(()=>forgot.default(),e=>e.url==='https://emetsees.com/auth/forgot-password');host='emetsees.com';await forgot.default();
// Exercise existing sign-in/signup/confirmation handlers with synthetic credentials.
let signedPassword;client.auth.signInWithPassword=async({password})=>{signedPassword=password;return{error:null};};client.auth.signUp=async()=>({data:{session:null},error:null});
const existing=f.load('app/auth/actions.ts');await assert.rejects(()=>existing.signInAction(form({email:'test@example.invalid',password:' password with spaces ',next:'/settings'})),e=>e.url==='/settings');assert.equal(signedPassword,' password with spaces ');
await assert.rejects(()=>existing.signUpAction(form({email:'test@example.invalid',password:'long-password'})),e=>e.url.includes('Check+your+email'));
const confirmation=f.load('app/auth/callback/route.ts');response=await confirmation.GET({nextUrl:new URL('https://emetsees.com/auth/callback?code=FAKE&next=/settings'),url:'https://emetsees.com/auth/callback'});assert.equal(response.headers.get('location'),'https://emetsees.com/settings');
for(const file of ['app/auth/recovery/route.ts','app/auth/recovery-actions.ts','app/lib/supabase/recovery.ts'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/console\.(?:log|info|error|warn)/);
console.log('PASS actual recovery request/update handlers, existing sign-in/signup/confirmation, recovery-only PKCE and token-hash exchanges, missing/expired/wrong-flow links, indistinguishable unknown-email/rate/provider results, mismatch/policy enforcement, signed expiring user/session/revision grants, tamper/cross-account/replay rejection, local signout, canonical redirects, private response headers and no credential logging. All auth accounts/provider calls are offline fixtures, not real password resets.');
