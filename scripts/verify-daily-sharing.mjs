import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiFixture,elements,text} from './lib/ui-fixture-runtime.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const {buildReaderHref}=createUiFixture().load('app/lib/translationPreference.ts');
for(const [translation,book] of [['web','Matthew'],['kjv','Matthew'],['brenton','Bel and the Dragon']]){
 const chapter=book==='Matthew'?3:1;
 const runtime=JSON.parse(fs.readFileSync(`public/scripture/runtime/${translation}/${book.replace(/ /g,'_')}/${chapter}.json`));
 for(const count of [12,1,3]){
 const rows=(Array.isArray(runtime)?runtime:runtime.verses).slice(0,count);
 const passage={reference:`${book} ${chapter}:${rows[0].verseLabel||rows[0].verse}${count===1?'':'-'+(rows.at(-1).verseLabel||rows.at(-1).verse)}`,translation,verses:rows.map(row=>({reference:row.reference,text:row.text,translation})),fallback:null};
 const copied=[],shared=[],requests=[];
 const navigator={clipboard:{writeText:async value=>copied.push(value)},share:async value=>shared.push(value)};
 const fixture=createUiFixture({modules:{
  'next/link':{default:'a'},'../data/scripture/ReaderVerseAdapter':{normalizeReaderChapter:x=>({verses:Array.isArray(x)?x:x.verses})},
  '../data/useSacredNames':{useSacredNames:()=>({sacredNames:true})},'../data/renderSacredNames':{renderSacredNames:value=>'Display only: '+value},
  '../lib/translationPreference':{getPreferredTranslation:()=>translation,buildReaderHref},'../lib/readerMemory':{areAllBookmarked:()=>false,toggleBookmarks(){}},
 },globals:{navigator,DOMException,AbortController,setTimeout:()=>0,clearTimeout(){},clearInterval(){},window:{setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,addEventListener(){},removeEventListener(){}},fetch:async url=>{requests.push(url);return{ok:true,json:async()=>url.startsWith('/api/daily-passage')?passage:runtime};}}});
 let tree=fixture.render(fixture.load('app/components/DailyPassage.tsx').default);await tick();tree=fixture.render();
 const button=label=>elements(tree,e=>e.type==='button'&&(e.props['aria-label']===label||text(e)===label))[0];
 await button('Copy displayed passage').props.onClick();
 const displayed=rows.slice(0,count>3?2:count);
 const reference=count>3?`${book} ${chapter}:1–2`:passage.reference;
 const exact=`${reference} · ${translation==='brenton'?'Brenton':translation.toUpperCase()}\n\n${displayed.map(row=>row.text).join('\n')}`;
 const link=new URL(buildReaderHref({book,chapter,verse:String(rows[0].verseLabel||rows[0].verse),translation}),'https://www.emetsees.com').toString();
 const expected=`${exact}\n\nRead ${passage.reference} on EMETSEES:\n${link}`;
 assert.equal(copied.at(-1),expected);
 assert.equal(elements(tree,e=>e.type==='blockquote')[0].props.children.length,displayed.length);
 for(const omitted of rows.slice(displayed.length))assert(!copied.at(-1).includes(omitted.text));
 await button('Share displayed passage').props.onClick();
 const native=shared.at(-1);
 assert.equal(native.text,expected);
 assert.equal(native.title,reference);
 assert.equal(new URL(link).searchParams.get('translation'),translation);
 assert.equal(decodeURIComponent(new URL(link).pathname),`/read/${book}/${chapter}`);
 assert.equal(native.url,undefined,'URL stays in shared text for Android/iOS receivers');
 navigator.share=undefined;
 await button('Share displayed passage').props.onClick();
 assert.equal(copied.at(-1),native.text,'clipboard sharing fallback retains exact passage and link');
 await button('Copy displayed passage').props.onClick();assert.equal(copied.at(-1),expected,'Copy includes the same excerpt and full-passage link');
 assert(requests.every(url=>url.startsWith('/api/daily-passage?')||url.startsWith('/scripture/runtime/')),'Sharing cannot publish content');
 console.log(`PASS ${translation} ${count}-verse schedule: only ${displayed.length} displayed verses copied/shared, accurate reference/translation and full-passage link, native payload and clipboard fallback; no publication.`);
 }
}
