import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createUiFixture} from './lib/ui-fixture-runtime.mjs';
// Golden identities captured by executing the deployed serializers at
// f787351df8ff45929eb24587e354f27665c6d079 and db1c5d621176462af54cc5f34a3be850689244d5.
// No Git history, production connection or model call is needed to rerun this test.
const modules={'server-only':{},'../supabase/admin':{createSupabaseAdminClient:()=>null}};
const current=createUiFixture({modules}).load('app/lib/conversations/store.ts');
const response={status:'insufficient-evidence',diagnostics:{code:'PRIVATE'},usage:{},source:'simple-model',answer:{answer:'Please check the passages and limitations below before relying on this explanation.\n\nSubstantive answer.',status:'insufficient-evidence',verificationStatus:'unverified',unresolvedReferences:[{reference:'PRIVATE'}],limitations:['Owner diagnostic: PRIVATE','Owner experiment: prior notice','The model reported insufficient evidence. This explanation is unverified.','A material qualification.']}};
const turns=[{question:'Exact question?',response}];
const expected=['6784257935f9805814cd1c6e5cee31221d6aecd6570c98e3e2d4b191ab9d6cdc','54d02089d07d57ffb4cdba8e8aee6b3f4d358a7863d66bafd3a3e4079961aa0c'];
const original=JSON.stringify(turns);
for(const [version,payload] of current.legacyImportPayloads(turns).entries())assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'),expected[version]);
assert.equal(JSON.stringify(turns),original,'Legacy identity lookup never mutates recovered data');
assert(!JSON.stringify(current.privateResponse(response)).includes('PRIVATE'),'Legacy hash compatibility must not weaken response privacy');
console.log('PASS frozen import identities match both deployed serializers; raw input unchanged and public response privacy preserved.');
