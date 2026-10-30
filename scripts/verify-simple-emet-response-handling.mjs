import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import { createUiFixture } from './lib/ui-fixture-runtime.mjs';

// Synthetic responses exercise the real provider -> verifier -> API construction.
// They are not captures of the two production model responses (not retained).
const questions = ['Who is Jesus Christ?', 'Who is Yahushua the Messiah?'];
let response, calls = [], events = [], logs = [], allow = true, complete = true, unavailableCorpus = false;
class FakeOpenAI {
  constructor(options) {
    assert.equal(options.maxRetries, 0);
    this.responses = { create: async (input) => { calls.push(input); return response; } };
  }
}
const fixture = createUiFixture({ globals: {
  process: { cwd: () => process.cwd(), env: { OPENAI_API_KEY: 'fixture-only', EMET_AI_FAST_ENGINE: 'true', EMET_AI_SIMPLE_MODEL: 'fixture-configured-model' } }, Buffer,
  console: { ...console, info: (...args) => logs.push(args) },
}, modules: {
  'server-only': {}, 'node:path': { default: path }, 'node:crypto': crypto,
  'node:fs': { default: { readFileSync: (...args) => { if (unavailableCorpus) throw Error('CONFIDENTIAL_FILE_PATH'); return fs.readFileSync(...args); } } },
  openai: { default: FakeOpenAI },
  './SimpleEmetAccess': { canUseSimpleEmet: async () => allow, claimSimpleRequest: async () => 'claimed', simpleRequestKey: () => 'simple-emet@1:fixture' },
  '../EmetAiQuota': {
    reserveEmetAiQuestion: async () => { events.push('reserve'); return { allowed: true, charged: false }; },
    completeEmetAiQuestion: async (_,source) => { events.push(source); return complete; },
    refundFailedEmetAiQuestion: async () => { events.push('refund'); return true; },
    getEmetAiUsageSummary: async () => ({ allowed: true }),
  },
} });
const { handleSimpleEmet } = fixture.load('app/lib/emet/experimental/SimpleEmetRequest.ts');
const { resolveSimpleReference, verifySimpleDraft } = fixture.load('app/lib/emet/experimental/SimpleEmetScripture.ts');
const model = fixture.load('app/lib/emet/experimental/SimpleEmet.ts');
const input = { userId: 'fixture-owner', requestId: '11111111-1111-4111-8111-111111111111', conversationId: '11111111-1111-4111-8111-111111111111', history: [], context: null };
const draft = {
  status: 'complete', answer: 'He is the Messiah, sent by the Father, and mediator (John 17:3, 1 Timothy 2:5).',
  support: 'theological-synthesis', references: [{ reference: 'John 17:3', translation: 'web' }, { reference: '1 Timothy 2:5', translation: 'web' }], quotations: [], limitations: [],
};
const completed = (value) => ({ status: 'completed', output_text: JSON.stringify(value), usage: { output_tokens: 250, output_tokens_details: { reasoning_tokens: 100 } } });
async function run(question, value) { response = value; events = []; return handleSimpleEmet({ ...input, question }); }
for (const question of questions) {
  let result = await run(question, completed(draft));
  assert.equal(result.status, 200);
  assert.equal(result.body.answer.answer, draft.answer);
  assert.equal(result.body.answer.citations.length,2);
  assert.equal(result.body.diagnostics.code, 'complete');
  assert.equal(result.body.diagnostics.modelAnswerStatus, 'complete');
  assert.equal(result.body.diagnostics.json, 'valid'); assert.equal(result.body.diagnostics.structure, 'valid');
  assert.deepEqual(events, ['reserve','model']);
  assert.equal(calls.at(-1).model,'fixture-configured-model');
  assert.equal(JSON.parse(calls.at(-1).input.at(-1).content).question, question);
  assert.equal(JSON.parse(calls.at(-1).input.at(-1).content).readerContext, null); // All Scripture
  const failures = [
    [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '', usage: { output_tokens: 2200, output_tokens_details: { reasoning_tokens: 2200 } } }, 502, 'model-incomplete', 'model-response'],
    [{ ...completed(draft), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 502, 'model-incomplete', 'model-response'],
    [{ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output_text: 'CONFIDENTIAL_PARTIAL' }, 502, 'model-incomplete', 'model-response'],
    [{ status: 'failed', error: { message: 'CONFIDENTIAL_PROVIDER_ERROR' } }, 502, 'model-not-completed', 'model-response'],
    [{ status: 'completed', output: [{ type:'message',content:[{ type:'refusal',refusal:'CONFIDENTIAL_REFUSAL' }] }], output_text:'' }, 502, 'model-refusal', 'model-response'],
    [{ status: 'completed', output_text: '' }, 502, 'empty-output', 'model-response'],
    [{ status: 'completed', output_text: '{CONFIDENTIAL_MALFORMED' }, 502, 'invalid-json', 'json-parsing'],
    [completed({ ...draft, support: 'unsupported' }), 502, 'invalid-structure', 'structured-output'],
    [completed({ ...draft, extra: 'CONFIDENTIAL_EXTRA' }), 502, 'invalid-structure', 'structured-output'],
    [completed(null), 502, 'invalid-structure', 'structured-output'],
    [completed({ ...draft, references: [] }), 502, 'citations-missing', 'citation-resolution'],
    [completed({ ...draft, references: [{ reference:'John 999:3',translation:'web' }] }), 502, 'citation-unresolved', 'citation-resolution'],
    [completed({ ...draft, references: [{ reference: '1 Timothy 2:999', translation: 'web' }] }), 502, 'citation-unresolved', 'citation-resolution'],
    [completed({ ...draft, references: [{ reference:'John 17:3',translation:'brenton' }] }), 502, 'citation-unresolved', 'citation-resolution'],
    [completed({ ...draft, quotations: [{ reference: 'John 17:3', translation: 'web', text: 'A fabricated quotation from Scripture.' }] }), 502, 'quotation-unverified', 'quotation-verification'],
    [completed({ ...draft, quotations: [{ reference: 'John 17:3', text: 'Missing translation' }] }), 502, 'invalid-structure', 'structured-output'],
    [completed({ ...draft, status:'insufficient-evidence', answer:'The evidence does not establish this.', references:[] }), 422, 'model-insufficient-evidence', 'model-answer'],
    [completed({ ...draft, status:'insufficient-evidence', references:[{ reference:'John 999:1', translation:'web' }] }), 502, 'citation-unresolved', 'citation-resolution'],
  ];
  for (const [value,status,code,stage] of failures) {
    result = await run(question,value);
    assert.equal(result.status,status,code);
    assert.equal(result.body.diagnostics.code,code); assert.equal(result.body.diagnostics.stage,stage);
    assert.deepEqual(events,['reserve','refund','fail-closed']);
    assert.doesNotMatch(JSON.stringify(result.body),/CONFIDENTIAL/);
    assert.equal(result.body.status, status === 422 ? 'insufficient-evidence' : code.includes('citation') || code.includes('quotation') ? 'verification-failed' : 'answer-unavailable');
    if (code==='model-incomplete') {
      assert.equal(result.body.diagnostics.json,'not-attempted');
      assert.equal(result.body.diagnostics.incompleteReason,value.incomplete_details.reason);
      if (value.usage) { assert.equal(result.body.diagnostics.outputTokens,value.usage.output_tokens); assert.equal(result.body.diagnostics.reasoningTokens,value.usage.output_tokens_details.reasoning_tokens); }
    }
  }
}
// The comma boundary must preserve numbered books without weakening verse lists.
for (const book of ['1 Timothy','2 Timothy','1 John','2 John','3 John']) {
  const ref = book+' 1:1';
  const refs = [...draft.references.slice(0,1), { reference:ref,translation:'web' }];
  assert.equal(verifySimpleDraft({ ...draft, answer:`John 17:3, ${ref}`, references:refs }).ok,true,book);
}
assert.equal(verifySimpleDraft({ ...draft, answer:'John 17:3, 5', references:[{reference:'John 17:3,5',translation:'web'}] }).ok,true);
assert.equal(verifySimpleDraft({ ...draft, answer:'John 17:3, 1 says this.', references:draft.references }).ok,true);
assert.equal(verifySimpleDraft({ ...draft, answer:'John 17:3, 999', references:draft.references }).ok,true);
for (const translation of ['web','kjv','brenton']) {
 const verse=resolveSimpleReference('Genesis 1:1',translation)[0];
 const value={...draft,answer:`Genesis 1:1 says “${verse.text}”`,references:[{reference:'Genesis 1:1',translation}]};
 const result=await run(questions[0],completed(value));assert.equal(result.status,200);assert.match(result.body.answer.citations[0].evidenceId,new RegExp(`^scripture:${translation}:`));
}
const raw = model.inspectSimpleResponse({ status:'CONFIDENTIAL_STATUS', incomplete_details:{reason:'CONFIDENTIAL_REASON'}, output_text:'CONFIDENTIAL_OUTPUT' });
assert.equal(raw.diagnostics.responseStatus,'unknown'); assert.equal(raw.diagnostics.incompleteReason,'other'); assert.doesNotMatch(JSON.stringify(raw),/CONFIDENTIAL/);
allow=false; const before=logs.length; assert.equal((await run(questions[0],completed(draft))).status,403); assert.equal(logs.length,before); allow=true;
complete=false; const quotaFailure=await run(questions[0],completed(draft));assert.equal(quotaFailure.status,503);assert.equal(quotaFailure.body.diagnostics.code,'usage-completion-failed');complete=true;
assert.doesNotMatch(JSON.stringify(logs),/CONFIDENTIAL|Who is|Jesus|Yahushua|apiKey|fixture-only|reasoning_summary/);
console.log('PASS: both reported questions, real response pipeline with All Scripture fixtures, numbered-book comma regression, incomplete/refusal/empty/malformed/schema failures, genuine insufficiency, false references/quotes, strict translation preservation, safe owner diagnostics, authorization and usage settlement. No paid calls.');

// Integrated citation envelope: these are actual provider/verifier/request handlers.
for (const [question,answer,references] of [
 ['Should a believer sin?', 'Compare 1 John 1:8–2:2. At 10:30 we discussed the phrase “deliberately choosing to sin”.', [{ reference:'1 John 1:8-2:2',translation:'web' }]],
 ['Can a believer eat pork?', 'The phrase “eating pork is permissible” is an interpretation to examine, not a Scripture quotation (Leviticus 11:7–8).', [{ reference:'Leviticus 11:7-8',translation:'web' }]],
]) {
 const result=await run(question,completed({...draft,answer,references}));
 assert.equal(result.status,200);assert.equal(result.body.answer.answer,answer);
 assert.equal(result.body.answer.sourceVerification,'locked-corpus-text');
 assert.equal(result.body.answer.scriptureQuotations.length,0);
 assert.equal(result.body.answer.claims.length,0);
 for(const citation of result.body.answer.citations) {
  const locked=resolveSimpleReference(citation.reference,citation.translation)[0];
  assert.equal(citation.text,locked.text);assert.equal(citation.verification,'locked-corpus-text');
 }
 assert.match(result.body.answer.limitations.at(-1),/not independently verified/);
}
for(const answer of ['At 10:30 we discussed Romans 6:1–2.','Rom. 999:1','1 John 1:8–2:2','“This unattributed explanatory phrase is not a verified Scripture quotation.”']) {
 const result=await run(questions[0],completed({...draft,answer}));assert.equal(result.status,200);
 assert.equal(result.body.answer.citations.length,2);assert.equal(result.body.answer.scriptureQuotations.length,0);
 assert.equal(result.body.answer.answer,answer);
}
for(const reference of ['Romans 999:1','Invented 1:1','Romans 6:1garbage','Romans 6:1; Invented 8:1','1 John 2:2-1:8','1 John 1:8-999:1','John 1:1-21:25']) {
 const result=await run(questions[0],completed({...draft,references:[{reference,translation:'web'}]}));
 assert.equal(result.status,502,reference);assert.equal(result.body.diagnostics.code,'citation-unresolved');
 assert.equal(result.body.answer.citations,undefined);
}
const quoteReferences=[{reference:'Genesis 1:1',translation:'web'},{reference:'Romans 6:1',translation:'web'}];
const genesis=resolveSimpleReference('Genesis 1:1','web')[0];
let result=await run(questions[0],completed({...draft,references:quoteReferences,quotations:[{reference:'Genesis 1:1',translation:'web',text:genesis.text}]}));
assert.equal(result.status,200);assert.equal(result.body.answer.scriptureQuotations.length,1);
for(const quotation of [
 {reference:'Romans 6:1',translation:'web',text:genesis.text}, // real text, wrong attribution, pooled rescue prohibited
 {reference:'Genesis 1:1',translation:'kjv',text:resolveSimpleReference('Genesis 1:1','kjv')[0].text}, // undeclared translation
 {reference:'Genesis 1:1',translation:'web',text:'Fabricated Scripture quotation.'},
 {reference:'John 999:1',translation:'web',text:genesis.text},
]) {
 result=await run(questions[0],completed({...draft,references:quoteReferences,quotations:[quotation]}));
 assert.equal(result.status,502);assert.equal(result.body.diagnostics.code,'quotation-unverified');
}
const range='1 John 1:8-2:2';const rangeText=resolveSimpleReference(range,'web').map(v=>v.text).join(' ');
result=await run(questions[0],completed({...draft,references:[{reference:range,translation:'web'}],quotations:[{reference:range,translation:'web',text:rangeText}]}));assert.equal(result.status,200);
const missingQuotations={...draft};delete missingQuotations.quotations;
assert.equal(model.inspectSimpleResponse(completed(missingQuotations)).diagnostics.code,'invalid-structure');
console.log('PASS: integrated envelope for sin/pork fixtures, cross-chapter source/quote resolution, prose preservation, server corpus text, malformed/invented sources, attributed/false quotations, translation isolation, no implicit source promotion and no claim-support certification.');
