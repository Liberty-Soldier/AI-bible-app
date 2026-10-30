import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import { createUiFixture } from './lib/ui-fixture-runtime.mjs';

// Synthetic responses exercise the real provider -> verifier -> API construction.
// They are not captures of the two production model responses (not retained).
const questions = ['Who is Jesus Christ?', 'Who is Yahushua the Messiah?'];
let response, calls = [], events = [], logs = [], allow = true, complete = true, unavailableCorpus = false, providerFailure = false, ownerDiagnostics = true;
class FakeOpenAI {
  constructor(options) {
    assert.equal(options.maxRetries, 0);
    this.responses = { create: async (input) => { calls.push(input); if (providerFailure) throw Error('CONFIDENTIAL_PROVIDER_DETAIL'); return response; } };
  }
}
const fixture = createUiFixture({ globals: {
  process: { cwd: () => process.cwd(), env: { OPENAI_API_KEY: 'fixture-only', EMET_AI_FAST_ENGINE: 'true', EMET_AI_SIMPLE_MODEL: 'fixture-configured-model' } }, Buffer,
  console: { ...console, info: (...args) => logs.push(args) },
}, modules: {
  'server-only': {}, 'node:path': { default: path }, 'node:crypto': crypto,
  'node:fs': { default: { readFileSync: (...args) => { if (unavailableCorpus) throw Error('CONFIDENTIAL_FILE_PATH'); return fs.readFileSync(...args); } } },
  openai: { default: FakeOpenAI },
  './SimpleEmetAccess': { getSimpleEmetAccess: async () => ({ authorized: allow, ownerDiagnostics: allow && ownerDiagnostics }), claimSimpleRequest: async () => 'claimed', recordUnlimitedSimpleRequest: async () => 'recorded', simpleRequestKey: () => 'simple-emet@1:fixture' },
  '../EmetAiQuota': {
    reserveEmetAiQuestion: async () => { events.push('reserve'); return { allowed: true, charged: true, unlimited: false }; },
    completeEmetAiQuestion: async (_,source) => { events.push(source); return complete; },
    refundFailedEmetAiQuestion: async () => { events.push('refund'); return true; },
    getEmetAiUsageSummary: async () => ({ allowed: true }),
  },
} });
const { handleSimpleEmet } = fixture.load('app/lib/emet/experimental/SimpleEmetRequest.ts');
const { resolveSimpleReference } = fixture.load('app/lib/emet/experimental/SimpleEmetScripture.ts');
const model = fixture.load('app/lib/emet/experimental/SimpleEmet.ts');
const input = { userId: 'fixture-owner', requestId: '11111111-1111-4111-8111-111111111111', conversationId: '11111111-1111-4111-8111-111111111111', history: [], context: null };
const draft = {
 status:'complete',answer:'According to these passages, the Messiah is sent by the Father (John 17:3).',
 support:'theological-synthesis',references:[{reference:'John 17:3',translation:'web'}],limitations:['This explanation distinguishes the text from interpretation.'],
};
const completed=value=>({status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:600,output_tokens:250,output_tokens_details:{reasoning_tokens:100}}});
async function run(question,value){response=value;events=[];return handleSimpleEmet({...input,question});}
const observed=[
 ['Is it lawful to eat pork?','Leviticus 11:7–8 describes swine as unclean. Later passages must be read in context.',[{reference:'Leviticus 11:7-8',translation:'web'}]],
 ['Can a Christian eat pork?','According to Leviticus 11:7–8, swine is unclean. The phrase “eating pork is permissible” is an interpretation to examine.',[{reference:'Leviticus 11:7-8',translation:'web'}]],
 ['Who is Jesus Christ?','Jesus is the Messiah and Son of the living God (Matthew 16:16). John 17:3 distinguishes the Father from the one he sent.',[{reference:'Matthew 16:16',translation:'web'},{reference:'John 17:3',translation:'web'}]],
 ['Should a believer sin?','Romans 6:1–2 rejects continuing in sin. Compare 1 John 1:8–2:2.',[{reference:'Romans 6:1-2',translation:'web'},{reference:'1 John 1:8-2:2',translation:'web'}]],
 ['Who is Yahushua the Messiah?','According to these passages, he is the Messiah and mediator sent by the Father (John 17:3; 1 Timothy 2:5).',[{reference:'John 17:3',translation:'web'},{reference:'1 Timothy 2:5',translation:'web'}]],
 ['Can a believer eat pork?','Leviticus 11:7–8 names swine as unclean.',[{reference:'Leviticus 11:7-8',translation:'web'}]],
];
for(const [question,answer,references]of observed){
 const value={...draft,answer,references};let result=await run(question,completed(value));
 assert.equal(result.status,200);assert.equal(result.body.status,'complete');assert.equal(result.body.answer.answer,answer);
 assert.equal(result.body.answer.verificationStatus,'references-verified');assert.equal(result.body.shareStudyId,undefined);
 assert.equal(result.body.answer.scriptureQuotations,undefined);
 assert.deepEqual(events,['reserve','model']);
 for(const citation of result.body.answer.citations){const row=resolveSimpleReference(citation.reference,citation.translation)[0];assert.equal(citation.text,row.text);assert.equal(citation.verification,'locked-corpus-text');}
 assert.equal(calls.at(-1).model,'fixture-configured-model');assert.equal(calls.at(-1).max_output_tokens,2200);
 assert.equal(JSON.parse(calls.at(-1).input.at(-1).content).readerContext,null);
 assert.equal(calls.at(-1).input[0].content,model.SIMPLE_EMET_SYSTEM);
 assert.equal(calls.at(-1).text.format.schema.properties.quotations,undefined);
 assert.ok(!calls.at(-1).text.format.schema.required.includes('quotations'));
 // Even obsolete, malformed quotation metadata cannot hide an unrelated answer.
 result=await run(question,completed({...value,quotations:{text:'Fabricated and incorrectly attributed legacy data',reference:'John 999:1'}}));
 assert.equal(result.status,200);assert.equal(result.body.answer.answer,answer);
 assert.doesNotMatch(JSON.stringify(result.body),/Fabricated and incorrectly attributed legacy data/);
 // A complete model answer remains inspectable if one of its source records fails.
 result=await run(question,completed({...value,references:[...references,{reference:'Invented 999:1',translation:'web'}]}));
 assert.equal(result.status,200);assert.equal(result.body.status,'complete-unverified');
 assert.equal(result.body.answer.answer,answer);assert.equal(result.body.answer.verificationStatus,'unverified');
 assert.equal(result.body.answer.unresolvedReferences.length,1);
 assert.ok(result.body.answer.citations.every(c=>!c.reference.includes('Invented')));
 assert.equal(result.body.shareStudyId,undefined);assert.deepEqual(events,['reserve','model']);
}
for(const references of [
 [{reference:'Romans 999:1',translation:'web'}], [{reference:'Romans 6:1garbage',translation:'web'}],
 [{reference:'John 17:3',translation:'brenton'}], [{reference:'Genesis 1:1',translation:'missing'}],
 [{reference:'John 17:3'}], [null], ['John 17:3'], {reference:'John 17:3'}, undefined, [],
]){
 const result=await run(questions[0],completed({...draft,references}));
 assert.equal(result.status,200);assert.equal(result.body.status,'complete-unverified');
 assert.equal(result.body.answer.answer,draft.answer);assert.equal(result.body.answer.citations.length,0);
 assert.equal(result.body.answer.verificationStatus,'unverified');assert.ok(result.body.answer.unresolvedReferences.length);
 assert.deepEqual(events,['reserve','model']);assert.equal(result.body.shareStudyId,undefined);
}
for(const translation of ['web','kjv','brenton']){
 const result=await run(questions[0],completed({...draft,answer:'At 10:30 we examined “an explanatory phrase” and an unannotated Rom. 999:1.',references:[{reference:'Genesis 1:1',translation}]}));
 assert.equal(result.status,200);assert.equal(result.body.answer.citations.length,1);
 assert.equal(result.body.answer.citations[0].translation,translation);
 assert.equal(result.body.answer.citations[0].text,resolveSimpleReference('Genesis 1:1',translation)[0].text);
 assert.equal(result.body.answer.scriptureQuotations,undefined);
}
const errors=[
 [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'CONFIDENTIAL_PARTIAL',usage:{output_tokens:2200,output_tokens_details:{reasoning_tokens:2200}}},'model-incomplete'],
 [{status:'failed',error:{message:'CONFIDENTIAL_ERROR'}},'model-not-completed'],
 [{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'CONFIDENTIAL_REFUSAL'}]}],output_text:''},'model-refusal'],
 [{status:'completed',output_text:''},'empty-output'],
 [{status:'completed',output_text:'{CONFIDENTIAL_MALFORMED'},'invalid-json'],
 [completed({...draft,support:'invalid'}),'invalid-structure'],
 [completed({...draft,extra:'CONFIDENTIAL_EXTRA'}),'invalid-structure'],
];
for(const [value,code]of errors){const result=await run(questions[0],value);assert.equal(result.status,502);assert.equal(result.body.diagnostics.code,code);assert.doesNotMatch(JSON.stringify(result.body),/CONFIDENTIAL/);assert.deepEqual(events,['reserve','refund','fail-closed']);}
for(const references of [[],[{reference:'Invented 1:1',translation:'web'}]]){
 const answer='These passages do not establish the requested conclusion.';
 const result=await run(questions[0],completed({...draft,status:'insufficient-evidence',answer,references}));
 assert.equal(result.status,422);assert.equal(result.body.status,'insufficient-evidence');assert.equal(result.body.diagnostics.code,'model-insufficient-evidence');
 assert.equal(result.body.answer.answer,answer);assert.equal(result.body.answer.verificationStatus,'unverified');assert.deepEqual(events,['reserve','refund','fail-closed']);
}
allow=false;const count=calls.length,logCount=logs.length;assert.equal((await run(questions[0],completed(draft))).status,403);assert.equal(calls.length,count);assert.equal(logs.length,logCount);allow=true;
providerFailure=true;let result=await run(questions[0],completed(draft));assert.equal(result.status,503);assert.equal(result.body.diagnostics.code,'provider-error');assert.doesNotMatch(JSON.stringify(result.body),/CONFIDENTIAL/);providerFailure=false;
complete=false;result=await run(questions[0],completed(draft));assert.equal(result.status,503);assert.equal(result.body.diagnostics.code,'usage-completion-failed');complete=true;
assert.doesNotMatch(JSON.stringify(logs),/CONFIDENTIAL|Who is|Jesus|Yahushua|apiKey|fixture-only|reasoning_summary/);
assert.ok(model.SIMPLE_EMET_SYSTEM.startsWith('You are EMET, a Scripture-first study assistant. Your task is to examine the Biblical text carefully, reason consistently across Scripture, and answer questions using Scripture as the highest authority rather than religious traditions, denominational doctrines, or theological creeds.'));
for(const principle of ['Yahweh is the Father, the one true God.','Yahweh\'s commandments remain authoritative for His people.','Gentile believers are grafted into Israel'])assert.ok(model.SIMPLE_EMET_SYSTEM.includes(principle));
console.log('PASS: six named owner questions through the real response pipeline, no quotation dependency, exact prose preservation, partial/absent/malformed source inspection, strict translations and corpus text, no invented verified citations, no sharing records, genuine insufficiency vs processing errors, accounting, owner authorization, unchanged model settings and Scripture-first framing. No paid calls.');

ownerDiagnostics=false;
let publicResult=await run(questions[0],completed(draft));
assert.equal(publicResult.status,200);assert.equal(publicResult.body.diagnostics,undefined);assert.equal(publicResult.body.answer.unresolvedReferences,undefined);assert.doesNotMatch(JSON.stringify(publicResult.body),/Owner experiment|Owner diagnostic/);
publicResult=await run(questions[0],completed({...draft,references:[{reference:'Invented 999:1',translation:'web'}]}));
assert.equal(publicResult.status,200);assert.equal(publicResult.body.status,'complete-unverified');assert.equal(publicResult.body.diagnostics,undefined);assert.equal(publicResult.body.unresolvedReferences,undefined);assert.equal(publicResult.body.shareStudyId,undefined);assert.equal(publicResult.body.answer.answer,draft.answer);assert.equal(publicResult.body.answer.verificationStatus,'unverified');assert.equal(publicResult.body.answer.citations.length,0);assert.equal(publicResult.body.answer.unresolvedReferences,undefined);assert.deepEqual(events,['reserve','model']);
publicResult=await run(questions[0],{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});assert.equal(publicResult.status,502);assert.equal(publicResult.body.diagnostics,undefined);assert.equal(publicResult.body.limitations.length,0);
console.log('PASS: public verified answers omit owner diagnostics; unresolved answers remain visibly unverified without private diagnostics and consume normal usage; incomplete output exposes no internal diagnostic codes.');
