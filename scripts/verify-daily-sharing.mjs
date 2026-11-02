import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiFixture,elements,text} from './lib/ui-fixture-runtime.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const {buildReaderHref}=createUiFixture().load('app/lib/translationPreference.ts');
for(const [translation,book] of [['web','1 Samuel'],['kjv','Song of Solomon'],['brenton','Bel and the Dragon']]){
 const runtime=JSON.parse(fs.readFileSync(`public/scripture/runtime/${translation}/${book.replace(/ /g,'_')}/1.json`));
 const rows=(Array.isArray(runtime)?runtime:runtime.verses).slice(0,4);
 const passage={reference:`${book} 1:${rows[0].verseLabel||rows[0].verse}-${rows.at(-1).verseLabel||rows.at(-1).verse}`,translation,verses:rows.map(row=>({reference:row.reference,text:row.text,translation})),fallback:null};
 const copied=[],shared=[],requests=[];
 const navigator={clipboard:{writeText:async value=>copied.push(value)},share:async value=>shared.push(value)};
 const fixture=createUiFixture({modules:{
  'next/link':{default:'a'},'../data/scripture/ReaderVerseAdapter':{normalizeReaderChapter:x=>({verses:Array.isArray(x)?x:x.verses})},
  '../data/useSacredNames':{useSacredNames:()=>({sacredNames:true})},'../data/renderSacredNames':{renderSacredNames:value=>'Display only: '+value},
  '../lib/translationPreference':{getPreferredTranslation:()=>translation,buildReaderHref},'../lib/readerMemory':{areAllBookmarked:()=>false,toggleBookmarks(){}},
 },globals:{navigator,DOMException,AbortController,setTimeout:()=>0,clearTimeout(){},clearInterval(){},window:{setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,addEventListener(){},removeEventListener(){}},fetch:async url=>{requests.push(url);return{ok:true,json:async()=>url.startsWith('/api/daily-passage')?passage:runtime};}}});
 let tree=fixture.render(fixture.load('app/components/DailyPassage.tsx').default);await tick();tree=fixture.render();
 const button=label=>elements(tree,e=>e.type==='button'&&(e.props['aria-label']===label||text(e)===label))[0];
 await button('Copy full passage').props.onClick();
 const exact=`${passage.reference} (${translation==='brenton'?'Brenton':translation.toUpperCase()})\n\n${rows.map(row=>row.text).join('\n')}`;
 assert.equal(copied.at(-1),exact);
 await button('Share full passage').props.onClick();
 const native=shared.at(-1);
 const link=new URL(buildReaderHref({book,chapter:1,verse:String(rows[0].verseLabel||rows[0].verse),translation}),'https://www.emetsees.com').toString();
 assert.equal(native.text,`${exact}\n\nExplore Scripture with EMETSEES\n${link}`);
 assert.equal(new URL(link).searchParams.get('translation'),translation);
 assert.equal(decodeURIComponent(new URL(link).pathname),`/read/${book}/1`);
 assert.equal(native.url,undefined,'URL stays in shared text for Android/iOS receivers');
 navigator.share=undefined;
 await button('Share full passage').props.onClick();
 assert.equal(copied.at(-1),native.text,'clipboard sharing fallback retains exact passage and link');
 await button('Copy full passage').props.onClick();assert.equal(copied.at(-1),exact,'ordinary Copy remains exact text without attribution');
 assert(requests.every(url=>url.startsWith('/api/daily-passage?')||url.startsWith('/scripture/runtime/')),'Sharing cannot publish content');
 console.log(`PASS ${translation}: exact full passage, native share and clipboard fallback carry encoded translated reader link; ordinary Copy unchanged; no publication.`);
}
