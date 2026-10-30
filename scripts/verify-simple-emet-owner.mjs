import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import { createUiFixture } from './lib/ui-fixture-runtime.mjs';
const env = { EMET_SIMPLE_OWNER_ENABLED: 'true', EMET_OWNER_EMAILS: 'owner@example.invalid', OPENAI_API_KEY: 'fixture-key', EMET_AI_FAST_ENGINE: 'true', EMET_AI_SIMPLE_MODEL: 'fixture-current-model' };
const user = { id: 'owner-id', email: 'owner@example.invalid', email_confirmed_at: '2026-01-01' };
let authenticated = user;
let calls = [];
const draft = { status: 'complete', answer: 'John 17:3 distinguishes the Father from His Messiah.', support: 'theological-synthesis', references: [{ reference: 'John 17:3', translation: 'web' }], quotations: [], limitations: [] };
const rows = [];
const admin = { from(table) {
  assert.equal(table, 'emet_question_requests');
  const predicates = [];
  const query = {
    select() { return query; }, eq(key,value) { predicates.push(row => row[key] === value); return query; },
    like(key,value) { predicates.push(row => row[key]?.startsWith(value.slice(0,-1))); return query; },
    is(key,value) { predicates.push(row => (row[key] ?? null) === value); return query; },
    gte() { return query; }, limit() { return Promise.resolve({ data: rows.filter(row => predicates.every(test => test(row))), error: null }); },
    maybeSingle() { return Promise.resolve({ data: rows.find(row => predicates.every(test => test(row))) || null, error: null }); },
    insert(row) { if (rows.some(old => old.user_id === row.user_id && old.request_id === row.request_id)) return Promise.resolve({ error: { code: '23505' } }); rows.push(row); return Promise.resolve({ error: null }); },
  }; return query;
} };
class FakeOpenAI { constructor(options) { assert.equal(options.maxRetries,0); this.responses = { create: async input => { calls.push(input); return { status: 'completed', output_text: JSON.stringify(draft) }; } }; } }
const fixture = createUiFixture({ globals: { process: { env, cwd: () => process.cwd() }, Buffer }, modules: {
  'server-only': {}, 'node:fs': { default: fs }, 'node:path': { default: path }, 'node:crypto': crypto,
  openai: { default: FakeOpenAI },
  '../../supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated }, error: null }) } }) },
  '../../supabase/admin': { createSupabaseAdminClient: () => admin },
} });
const access = fixture.load('app/lib/emet/experimental/SimpleEmetAccess.ts');
assert.equal(await access.canUseSimpleEmet('owner-id'), true);
for (const bad of [null, { ...user, email: 'other@example.invalid' }, { ...user, email_confirmed_at: undefined }]) { authenticated = bad; assert.equal(await access.canUseSimpleEmet('owner-id'), false); }
authenticated = user;
assert.equal(await access.canUseSimpleEmet('spoofed-id'), false);
env.EMET_SIMPLE_OWNER_ENABLED = 'false'; assert.equal(await access.canUseSimpleEmet(), false); env.EMET_SIMPLE_OWNER_ENABLED = 'true';
assert.equal(await access.claimSimpleRequest('owner-id','request-a','simple-emet@1:fixture'), 'claimed');
assert.equal(await access.claimSimpleRequest('owner-id','request-a','simple-emet@1:fixture'), 'duplicate');
assert.equal(await access.claimSimpleRequest('owner-id','request-b','simple-emet@1:fixture'), 'rate-limited');
rows.find(row => row.request_id === 'request-a').completed_at = 'complete';
assert.equal(await access.claimSimpleRequest('owner-id','request-c','simple-emet@1:fixture'), 'rate-limited');
assert.notEqual(access.simpleRequestKey('a','b','c'), access.simpleRequestKey('a','b','d'));
assert.match(access.simpleRequestKey('a','b','c'), /^simple-emet@1:/);
const model = fixture.load('app/lib/emet/experimental/SimpleEmet.ts');
assert.equal(model.configuredSimpleEmetModel(), 'fixture-current-model');
const history = [{ question: 'Who is the Father?', answer: 'Previous answer, including the position being challenged.' }];
assert.equal(model.parseSimpleHistory(history).length, 1);
assert.equal(model.parseSimpleHistory(Array(7).fill(history[0])), null);
assert.equal(model.parseSimpleHistory([{ question: 'q', answer: 'x'.repeat(10001) }]), null);
await model.generateSimpleEmet('Your previous answer contradicts Scripture', history, null);
assert.equal(calls.length, 1); assert.equal(calls[0].model, 'fixture-current-model'); assert.equal(calls[0].store, false);
assert.equal(calls[0].input[2].content, history[0].answer);
assert.match(calls[0].input[3].content, /Your previous answer contradicts Scripture/);
assert.equal(calls[0].input[0].content, model.SIMPLE_EMET_SYSTEM);
assert.doesNotMatch(JSON.stringify(model.SIMPLE_EMET_SCHEMA), /authorityId|claimId|planner/);
const scripture = fixture.load('app/lib/emet/experimental/SimpleEmetScripture.ts');
assert.equal(scripture.verifySimpleDraft(draft).ok, true);
for (const translation of ['web','kjv','brenton']) {
  const verse = scripture.resolveSimpleReference('Genesis 1:1', translation)[0];
  const checked = scripture.verifySimpleDraft({ ...draft, answer: `Genesis 1:1 says “${verse.text}”`, references: [{ reference: 'Genesis 1:1', translation }] });
  assert.equal(checked.ok, true); assert.match(checked.citations[0].evidenceId, new RegExp(`scripture:${translation}:`));
}
for (const reference of ['John 999:3', 'Invented 8:9']) assert.equal(scripture.verifySimpleDraft({ ...draft, references: [{ reference, translation: 'web' }] }).ok, false, reference);
assert.equal(scripture.verifySimpleDraft({ ...draft, quotations: [{ reference: 'John 17:3', translation: 'web', text: 'A completely fabricated divine quotation.' }] }).ok, false);
assert.equal(scripture.verifySimpleDraft({ ...draft, references: [{ reference: 'John 17:3', translation: 'brenton' }] }).ok, false);
let allowed = true, claim = 'claimed', quota = { allowed: true, charged: false }, fail = false, generated = draft;
const events = [];
const serviceFixture = createUiFixture({ modules: {
 'server-only': {}, './SimpleEmetAccess': { canUseSimpleEmet: async () => allowed, claimSimpleRequest: async () => claim, simpleRequestKey: () => 'simple-emet@1:isolated' },
 './SimpleEmet': { ...model, generateSimpleEmet: async () => { events.push('generate'); if (fail) throw Error('private detail'); return model.inspectSimpleResponse({ status: "completed", output_text: JSON.stringify(generated) }); } },
 './SimpleEmetScripture': scripture,
 '../EmetAiQuota': { reserveEmetAiQuestion: async (_,key) => { assert.match(key,/^simple-emet@1:/); events.push('reserve'); return quota; }, completeEmetAiQuestion: async (_,source) => { events.push(source); return true; }, refundFailedEmetAiQuestion: async () => events.push('refund'), getEmetAiUsageSummary: async () => quota },
} });
const service = serviceFixture.load('app/lib/emet/experimental/SimpleEmetRequest.ts');
const input = { userId: 'owner-id', requestId: '11111111-1111-4111-8111-111111111111', question: 'Who?', conversationId: 'isolated', history, context: null };
let result = await service.handleSimpleEmet(input); assert.equal(result.status,200); assert.equal(result.body.answer.answer,draft.answer); assert.equal(result.body.shareStudyId,undefined); assert.deepEqual(events,['reserve','generate','model']);
allowed = false; assert.equal((await service.handleSimpleEmet(input)).status,403); allowed = true;
claim = 'duplicate'; assert.equal((await service.handleSimpleEmet(input)).status,409);
claim = 'rate-limited'; assert.equal((await service.handleSimpleEmet(input)).status,429); claim = 'claimed';
assert.equal((await service.handleSimpleEmet({ ...input, history: Array(7).fill(history[0]) })).status,400);
quota = { allowed: false }; assert.equal((await service.handleSimpleEmet(input)).status,429); quota = { allowed: true };
generated = { ...draft, references: [{ reference: 'John 999:3', translation: 'web' }] }; assert.equal((await service.handleSimpleEmet(input)).status,502); assert.ok(events.includes('refund'));
generated = { ...draft, status: 'insufficient-evidence' }; assert.equal((await service.handleSimpleEmet(input)).status,422);
fail = true; result = await service.handleSimpleEmet(input); assert.equal(result.status,503); assert.doesNotMatch(JSON.stringify(result),/private detail/);
for (const file of fs.readdirSync('app/lib/emet/experimental')) assert.doesNotMatch(fs.readFileSync(`app/lib/emet/experimental/${file}`,'utf8'), /EmetAiIdentity|setSupabaseEmetAiRequestCache|appendSupabaseEmetConversationLedger|EmetAiPlanner/);
const route = fs.readFileSync('app/api/emet/ask/route.ts','utf8');
assert.ok(route.indexOf('getVerifiedSupabaseUserId()') < route.indexOf('if (body.engine === "simple")'));
assert.ok(route.indexOf('if (body.engine === "simple")') < route.indexOf('const performanceTrace'));
console.log('PASS: owner authorization, authenticated identity, disabled flag, atomic rate limits/idempotency, configured model, bounded multi-turn history, one mocked call, all translation verification, fabricated references/quotes, usage reservation/completion/refunds, safe failures, cache/ledger isolation and unchanged existing engine. No paid calls.');
const routeModules = {};
for (const match of route.matchAll(/from "([^"]+)"/g)) routeModules[match[1]] = new Proxy({}, { get: (_,name) => () => { throw Error(`Unexpected existing-engine call: ${String(name)}`); } });
let routeUser = null, currentEntered = false;
routeModules['next/server'] = { NextResponse: { json: (body,options) => ({ body, ...options }) } };
routeModules['@/app/lib/supabase/server'] = { getVerifiedSupabaseUserId: async () => routeUser };
routeModules['@/app/lib/emet/EmetAiConversation'] = { parseEmetConversationContext: () => ({}) };
routeModules['@/app/lib/emet/experimental/SimpleEmetRequest'] = { handleSimpleEmet: service.handleSimpleEmet };
routeModules['@/app/lib/emet/EmetAiPerformance'] = { createEmetAiPerformanceTrace: () => { currentEntered = true; throw Error('current-path-marker'); } };
const routeFixture = createUiFixture({ modules: routeModules, globals: { process: { env: { EMET_LIVE_ENABLED: 'true' } } } });
const post = routeFixture.load('app/api/emet/ask/route.ts').POST;
const body = { ...input, context: undefined, conversationId: input.requestId, engine: 'simple', simpleHistory: history };
assert.equal((await post({ json: async () => body })).status,401);
routeUser = 'owner-id'; allowed = false;
assert.equal((await post({ json: async () => body })).status,403);
allowed = true; fail = false; generated = draft;
assert.equal((await post({ json: async () => body })).status,200);
assert.equal(currentEntered,false);
assert.equal((await post({ json: async () => ({ ...body, engine: 'unknown' }) })).status,400);
for (const engine of [undefined,'current']) {
 await assert.rejects(() => post({ json: async () => ({ ...body, engine }) }),/current-path-marker/);
 assert.equal(currentEntered,true); currentEntered = false;
}
console.log('PASS: actual shared API route rejects unauthenticated/unauthorized selection; Simple bypasses old engine internals; absent/current selection retains the existing path.');
