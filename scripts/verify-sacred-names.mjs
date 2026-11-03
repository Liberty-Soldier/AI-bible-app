import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiFixture,elements,storage,text} from './lib/ui-fixture-runtime.mjs';
const fixture=createUiFixture();
const {renderSacredNames}=fixture.load('app/data/renderSacredNames.ts');
const {sacredNameVerseOverrides:overrides}=fixture.load('app/data/sacredNameVerseOverrides.ts');
assert.equal(Object.keys(overrides).length,14,'Keep the reviewed list deliberately bounded');
for(const entry of Object.values(overrides)){
 const book=entry.hebrewCanonicalReference.split(':')[0];
 const source=JSON.parse(fs.readFileSync(`app/data/bibleiq/canonical/hebrew/${book}.json`))[entry.hebrewCanonicalReference];
 assert(source?.sourceTokens.some(t=>t.strong==='H3068'&&t.surface.normalize('NFD').replace(/[\u0591-\u05bd\u05bf-\u05c7]/g,'').includes('יהוה')),entry.reference+' requires locked Hebrew divine-name evidence');
 assert(entry.sourceReference&&entry.reason.includes('H3068'));
}
const indexes={};let tested=0;
for(const translation of ['web','kjv','brenton']){
 const data=JSON.parse(fs.readFileSync(`public/scripture/search/${translation}.json`));
 indexes[translation]=new Map(data.records.map(row=>[`${row[0]} ${row[1]}:${row[2]}`,row[3]]));
 for(const [reference,original] of indexes[translation]){
  const result=renderSacredNames(original,reference);tested++;
  if(!original.includes('Master'))assert(!result.includes('Master'),`${translation} ${reference}: no inferred Master title`);
  if(!original.includes('Yahweh')&&result.includes('Yahweh'))assert(/\bLORD\b/.test(original)||overrides[reference],`${translation} ${reference}: no indiscriminate Yahweh mapping`);
 }
 if(translation!=='brenton')for(const reference of Object.keys(overrides)){
  const original=indexes[translation].get(reference);assert(original,reference);assert(/\bLord\b/.test(original),`${translation} ${reference} actually contains the quoted title`);
  const result=renderSacredNames(original,reference);assert(result.includes('Yahweh'));assert(!result.includes('The Yahweh'));assert(!result.includes('Master'));
 }
 console.log(`PASS ${translation}: ${data.records.length} verses checked for new unreviewed Yahweh/Master substitutions; available reviewed NT mappings render correctly.`);
}
for(const reference of ['Romans 10:13','Matthew 3:3','Mark 1:3','Luke 3:4','John 1:23','Hebrews 1:10','1 Peter 3:15']){
 assert.equal(overrides[reference],undefined);
 for(const translation of ['web','kjv']){
  const original=indexes[translation].get(reference);assert(original);const result=renderSacredNames(original,reference);
  assert(!result.includes('Yahweh'),`${translation} ${reference}: defer ambiguous referent, preserve Lord`);assert(!result.includes('Master'));
 }
}
for(const reference of ['John 13:13','John 20:28','Acts 2:36','Romans 10:9'])for(const translation of ['web','kjv']){
 const result=renderSacredNames(indexes[translation].get(reference),reference);assert(result.includes('Lord'));assert(!result.includes('Yahweh'));
}
for(const translation of ['web','kjv']) {
  const inscription=renderSacredNames(indexes[translation].get('Revelation 19:16'),'Revelation 19:16');
  assert(inscription.includes('LORD OF LORDS'));assert(!inscription.includes('Yahweh'));
  const unknown=renderSacredNames(indexes[translation].get('Acts 17:23'),'Acts 17:23');
  assert(unknown.includes('UNKNOWN GOD'));assert(!unknown.includes('Yahweh'));
}
const psalm=renderSacredNames(indexes.kjv.get('Psalms 110:1'),'Psalms 110:1');assert(psalm.startsWith('Yahweh'));assert(psalm.includes('my Lord'));assert(!psalm.includes('Master'));
assert.equal(renderSacredNames('The LORD God; the LORD God; The LORD; the LORD.'),'Yahweh Elohim; Yahweh Elohim; Yahweh; Yahweh.');
assert.equal(renderSacredNames('Lord, lord, Lords, landlord.'),'Lord, lord, Lords, landlord.');
assert(renderSacredNames(indexes.brenton.get('Psalms 110:1'),'Psalms 110:1').includes('Lord'));
// The real ScriptureText OFF path leaves the original names/titles in place.
for(const translation of ['web','kjv','brenton']){
 const source=indexes[translation].get('Genesis 1:1');
 const f=createUiFixture({modules:{'../data/useSacredNames':{useSacredNames:()=>({sacredNames:false})}}});
 const tree=f.render(f.load('app/components/ScriptureText.tsx').default,{text:source,reference:'Genesis 1:1'});
 assert.equal(text(tree),source);
}
const localStorage=storage(),listeners=new Map();
const window={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);}};
const globals={window,localStorage,Event};
const f=createUiFixture({globals});const Toggle=f.load('app/components/SacredNameToggle.tsx').default;
let tree=f.render(Toggle);let input=elements(tree,e=>e.type==='input')[0];assert.equal(input.props.role,'switch');assert.equal(input.props['aria-label'],'Sacred Names');assert.equal(input.props.checked,false);assert.match(text(tree),/OFF/);
input.props.onChange({target:{checked:true}});tree=f.render();assert.equal(localStorage.getItem('sacredNames'),'true');assert.match(text(tree),/ON/);assert.equal(elements(tree,e=>e.type==='input')[0].props['aria-checked'],true);assert.match(elements(tree,e=>e.props['aria-hidden']==='true')[0].props.className,/bg-\[var\(--brand\)\]/);
const remount=createUiFixture({globals});let reopened=remount.render(remount.load('app/components/SacredNameToggle.tsx').default);assert.equal(elements(reopened,e=>e.type==='input')[0].props.checked,true);
elements(tree,e=>e.type==='input')[0].props.onChange({target:{checked:false}});reopened=remount.render();assert.equal(elements(reopened,e=>e.type==='input')[0].props.checked,false);assert.equal(localStorage.getItem('sacredNames'),'false');
const reader=fs.readFileSync('app/read/[book]/[chapter]/page.tsx','utf8');assert(reader.indexOf('<SacredNameToggle />')<reader.indexOf('<ReaderAppearanceControls />'),'Sacred Names is first in existing Aa controls');
console.log(`PASS ${tested} corpus verses, 14 Hebrew-supported NT mappings, ambiguous/personal titles preserved, original OFF wording, shared preference persistence/event synchronization and named accessible ON/OFF switch. Corpus and alignments were read only; no AI calls.`);
// The existing gold token must retain readable dark text in light/dark themes.
const css=fs.readFileSync('app/globals.css','utf8');
const brandColors=[/--brand:\s*(#[a-f0-9]{6})/i.exec(css)[1],/:root\[data-theme="dark"\][\s\S]*?--brand:\s*(#[a-f0-9]{6})/i.exec(css)[1]];
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
for(const color of brandColors)assert((luminance(color)+.05)/(luminance('#111214')+.05)>=4.5,'Gold switch text meets normal-text contrast in either theme');
console.log('PASS gold ON-state contrast in existing light/dark themes.');
for(const reference of ['Matthew 22:44','Mark 12:36','Luke 20:42','Acts 2:34']){
 const result=renderSacredNames(indexes.kjv.get(reference),reference);assert(result.includes('Yahweh'));assert(result.includes('my Lord'));assert(!result.includes('The Yahweh'));
 assert.equal(overrides[reference],undefined,'Do not apply a whole-verse Lord replacement to a mixed-title quotation');
}
console.log('PASS mixed-title KJV quotations preserve my Lord separately; no blanket WEB mixed-title override.');
// Legacy verse views must pass the real loaded reference to the same renderer;
// otherwise explicit restorations and the inscription exception are bypassed.
const legacy=createUiFixture({modules:{'next/link':{default:'a'},'next/navigation':{notFound(){throw Error('Unexpected verse not found');}},'@/app/components/AppNav':{default:'nav'}},globals:{process:{env:{NEXT_PUBLIC_SITE_URL:'http://fixture.invalid'}},fetch:async url=>{const file='public'+new URL(url).pathname;return fs.existsSync(file)?{ok:true,json:async()=>JSON.parse(fs.readFileSync(file))}:{ok:false};}}});
const legacyTree=await legacy.load('app/verse/[id]/page.tsx').default({params:Promise.resolve({id:'Revelation 19:16'}),searchParams:Promise.resolve({})});
const displays=elements(legacyTree,e=>e.type?.name==='ScriptureText');assert.equal(displays.length,2);for(const display of displays)assert.equal(display.props.reference,'Revelation 19:16');
console.log('PASS legacy verse-view reference context; no source identity or alignment changes.');
