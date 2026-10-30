import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createUiFixture } from './lib/ui-fixture-runtime.mjs';
import { genesis6Conversation } from './fixtures/simple-emet-genesis6-conversation.mjs';

// Offline instruction/transport regressions, not evidence of live model behavior.
const requests=[];let output;
class FakeOpenAI {
 constructor(options){assert.equal(options.maxRetries,0);this.responses={create:async request=>{requests.push(request);return{status:'completed',output_text:JSON.stringify(output)};}};}
}
const fixture=createUiFixture({modules:{'server-only':{},openai:{default:FakeOpenAI}},globals:{process:{env:{OPENAI_API_KEY:'fixture-only',EMET_AI_FAST_ENGINE:'true',EMET_AI_SIMPLE_MODEL:'fixture-model'}}}});
const model=fixture.load('app/lib/emet/experimental/SimpleEmet.ts');
const prompt=model.SIMPLE_EMET_SYSTEM;
const foundation=prompt.slice(prompt.indexOf('Yahweh and Yahshua'),prompt.indexOf('Reasoning and communication'));
assert.equal(createHash('sha256').update(foundation).digest('hex'),'1adfe65dc55468bcc5a76b66731a4d7eb271d7622cb23dd9a8d01c796a95ef52');
for(const instruction of [
 'Answer the user\'s actual question first',
 'For a direct yes/no question, give a clear yes or no when Scripture supports one',
 'For what, who, or when questions, give the relevant definition, identification, or explanation',
 'For why or how questions, explain the reasoning and supporting passages',
 'Never force a binary answer onto an explanatory question',
 'speaker, audience, surrounding verses, purpose, and relationship to the rest of Scripture',
 'For comparisons, examine the relevant passages together',
 'do not sacrifice necessary context or Scriptural reasoning merely to be concise',
 'Give the governing passages before extensive supporting detail',
 'Do not qualify a supported conclusion merely because other religious traditions disagree',
 'Discuss them only when the user explicitly asks, raises a particular passage that appears to challenge the answer, or an actual ambiguity in the cited evidence materially affects the conclusion',
 'without dismissing it', 'Do not present an inference as an explicit quotation or conceal a genuine limitation',
 'reconsider the evidence and previous conclusion instead of reflexively defending the previous answer',
 'use an empty limitations list when there is no material limitation',
])assert.ok(prompt.includes(instruction),instruction);
assert.match(model.SIMPLE_EMET_SCHEMA.properties.answer.description,/actual question first/);
assert.match(model.SIMPLE_EMET_SCHEMA.properties.limitations.description,/empty list when none apply; never conceal a material limitation/);
const fixtures=[
 ['Does Genesis 1:1 identify God as creator?','Yes. Genesis 1:1 identifies God as the creator of the heavens and the earth.','explicit-statement',[]],
 ['What does Genesis 1:1 describe?','It describes God creating the heavens and the earth.','explicit-statement',[]],
 ['Who creates in Genesis 1:1?','God is the creator named in the verse.','explicit-statement',[]],
 ['When does Genesis 1:1 place creation?','In the beginning. The verse does not supply a calendar date.','explicit-statement',['The verse does not supply a calendar date.']],
 ['Why does Genesis begin with creation?','The opening establishes God as creator. Reading this as the narrative\'s foundation is an interpretation of its placement.','possible-interpretation',['The author does not state a separate explanation for this placement.']],
 ['Explain Genesis 1:1 in context.','The verse opens the creation account by identifying God as creator.\n\nThe surrounding verses develop the account of creation. Read this introduction with that narrative rather than as an isolated answer to every later question about origins.','theological-synthesis',[]],
 ['How do Genesis 1:1 and Exodus 20:11 relate?','Both identify God as creator. Exodus 20:11 relates creation to the Sabbath command, while Genesis 1:1 introduces the creation account.','theological-synthesis',[]],
 ['Your previous explanation overlooked the audience.','That distinction matters. We should examine the speaker, audience, and surrounding verses before extending the conclusion.','possible-interpretation',['The previous conclusion did not establish its application to every audience.']],
];
const history=[{question:'What does the passage establish?',answer:'An earlier explanation whose scope the reader is now challenging.'}];
for(const[question,answer,support,limitations]of fixtures){
 output={status:'complete',answer,support,references:[{reference:'Genesis 1:1',translation:'web'}],limitations};
 const before=requests.length;const result=await model.generateSimpleEmet(question,history,null);
 assert.equal(requests.length,before+1);assert.equal(result.draft.answer,answer);
 assert.deepEqual(Array.from(result.draft.limitations),limitations);
 const request=requests.at(-1);assert.equal(request.model,'fixture-model');assert.equal(request.max_output_tokens,2200);assert.equal(request.store,false);
 assert.equal(request.input[0].content,prompt);assert.equal(request.input[2].content,history[0].answer);
 assert.equal(JSON.parse(request.input.at(-1).content).question,question);
}
console.log('PASS: unchanged foundational principles; question-appropriate directness, contextual depth, narrowly triggered alternatives, confidence without false certainty, material limitations, exact fixture answer preservation, multi-turn context and one unchanged model request per turn. Offline only.');


// Behavioral replay protects the prerequisites for good reasoning. The SDK is
// mocked, so these assertions DO NOT demonstrate spontaneous model correction,
// sound exegesis, non-defensiveness, or a naturally brief live acknowledgment.
// Those properties require live outputs assessed with liveReviewCriteria.
const { boundedSimpleHistory } = fixture.load('app/components/emet/chatPresentation.ts');
const scenario = genesis6Conversation;
const initialHistory = boundedSimpleHistory([{ question: scenario.question, answer: scenario.initialAnswerSummary }]);
assert.ok(model.parseSimpleHistory(initialHistory));
output = {
  status: 'complete', answer: scenario.observedImprovedAnswer,
  support: 'possible-interpretation',
  references: [{ reference: 'Genesis 6:4', translation: 'web' }, { reference: 'Numbers 13:33', translation: 'web' }],
  limitations: ['The temporal scope of afterward and the mechanism of origin are not explicitly resolved by these passages.'],
};
let beforeReplay = requests.length;
const correctionResult = await model.generateSimpleEmet(scenario.correction, initialHistory, null);
assert.equal(requests.length, beforeReplay + 1);
const correctionRequest = requests.at(-1);
assert.deepEqual(Array.from(correctionRequest.input, item => item.role), ['system', 'user', 'assistant', 'user']);
assert.equal(correctionRequest.input[0].content, prompt);
assert.equal(correctionRequest.input[1].content, scenario.question);
assert.equal(correctionRequest.input[2].content, scenario.initialAnswerSummary);
assert.equal(JSON.parse(correctionRequest.input[3].content).question, scenario.correction);
assert.equal(JSON.parse(correctionRequest.input[3].content).readerContext, null);
assert.equal(correctionResult.draft.answer, scenario.observedImprovedAnswer);
assert.deepEqual(Array.from(correctionResult.draft.limitations), output.limitations);
assert.equal(correctionResult.draft.support, 'possible-interpretation');
assert.deepEqual(Array.from(correctionResult.draft.references, item => item.reference), ['Genesis 6:4', 'Numbers 13:33']);
// All topic-specific content belongs in user/history messages, not instructions.
assert.doesNotMatch(correctionRequest.input[0].content, /Nephilim|Genesis 6|Numbers 13/);

// Verify that the challenge and contextual response both survive the actual
// client's history bounds and server parser when the next turn is a compliment.
const feedbackHistory = boundedSimpleHistory([
  ...initialHistory,
  { question: scenario.correction, answer: correctionResult.draft.answer },
]);
assert.equal(feedbackHistory.length, 2);
assert.ok(model.parseSimpleHistory(feedbackHistory));
output = { status: 'complete', answer: scenario.acknowledgmentFixture, support: 'does-not-establish', references: [], limitations: [] };
beforeReplay = requests.length;
const feedbackResult = await model.generateSimpleEmet(scenario.feedback, feedbackHistory, null);
assert.equal(requests.length, beforeReplay + 1);
const feedbackRequest = requests.at(-1);
assert.deepEqual(Array.from(feedbackRequest.input, item => item.role), ['system', 'user', 'assistant', 'user', 'assistant', 'user']);
assert.equal(feedbackRequest.input[3].content, scenario.correction);
assert.equal(feedbackRequest.input[4].content, scenario.observedImprovedAnswer);
assert.equal(JSON.parse(feedbackRequest.input[5].content).question, scenario.feedback);
assert.equal(feedbackResult.draft.answer, scenario.acknowledgmentFixture);
assert.equal(feedbackRequest.model, 'fixture-model');
assert.equal(feedbackRequest.max_output_tokens, 2200);
assert.equal(feedbackRequest.store, false);
console.log('PASS: Genesis 6 owner-conversation replay retains the initial context, exact challenge, observed contextual correction, material ambiguity and compliment; mocked replies remain unchanged, one call per turn, no topic-specific system instructions.');
console.log('LIMITATION: replay verifies context/transport and instruction prerequisites only. Actual reasoning quality, alternative valid interpretations and spontaneous acknowledgment behavior require live-model human review; no live calls were made.');
