import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createUiFixture, elements, text, storage} from './lib/ui-fixture-runtime.mjs';
const translations=['web','kjv','brenton'];
const fixture=createUiFixture();
const {bookCatalog,getBookChapters,getBookTranslation}=fixture.load('app/data/scripture/bookCatalog.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
assert.equal(new Set(bookCatalog.map(b=>b.book)).size,bookCatalog.length);
const inventory={};let chapterTotal=0;
for(const translation of translations){
 const books=inventory[translation]={};
 const root=`public/scripture/runtime/${translation}`;
 for(const directory of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory())){
  const chapters=fs.readdirSync(path.join(root,directory.name)).filter(f=>/^\d+\.json$/.test(f)).map(f=>Number(f.slice(0,-5))).sort((a,b)=>a-b);
  if(!chapters.length)continue;
  let name;
  for(const chapter of chapters){
   const payload=JSON.parse(fs.readFileSync(path.join(root,directory.name,`${chapter}.json`)));
   const verses=Array.isArray(payload)?payload:payload.verses;
   assert(verses?.length,`Empty runtime ${translation}/${directory.name}/${chapter}`);
   name??=verses[0].book;
   for(const row of verses){assert.equal(row.book,name);assert.equal(Number(row.chapter),chapter);}
   chapterTotal++;
  }
  assert.equal(directory.name,name.replace(/[^1-3A-Za-z ]/g,'').trim().replace(/\s+/g,'_'));
  books[name]=chapters;
 }
 const selected=bookCatalog.filter(b=>b.translations.includes(translation));
 assert.deepEqual(plain(selected.map(b=>b.book).sort()),Object.keys(books).sort(),`${translation} selectable/runtime book parity`);
 for(const book of selected)assert.deepEqual(plain(getBookChapters(book.book,translation)),books[book.book],`${translation} ${book.book} chapter links must exist exactly`);
 console.log(`PASS ${translation}: ${selected.length} books, every selectable chapter has nonempty runtime data and matching source coordinates.`);
}
const sealed=JSON.parse(fs.readFileSync('app/data/scripture/generatedBrenton.integrity.json'));
assert.deepEqual(Object.keys(inventory.brenton).sort(),sealed.productionCounts.productionReaderBookNames.slice().sort());
const additions={'1 Esdras':9,'Susanna':1,'Bel and the Dragon':1,'Daniel Greek':12,'Esther Greek':10,'Letter of Jeremiah':1,'Prayer of Manasseh':1};
for(const [book,count] of Object.entries(additions)){
 assert.equal(getBookChapters(book,'brenton').length,count);
 for(const tr of ['web','kjv']){assert.equal(getBookChapters(book,tr).length,0);assert.equal(getBookTranslation(book,tr),'brenton');}
}
for(const book of ['Daniel','Esther'])assert.deepEqual(plain(bookCatalog.find(b=>b.book===book).translations),['web','kjv']);
assert.equal(getBookChapters('Daniel','web').at(-1),12);
assert.equal(getBookChapters('Daniel Greek','brenton').at(-1),12);
assert.equal(getBookChapters('Psalms','brenton').at(-1),151);
assert.equal(getBookChapters('Joel','brenton').at(-1),4);
assert(!getBookChapters('Proverbs','brenton').includes(30));
assert.equal(getBookChapters('Proverbs','brenton').at(-1),31);
for(const translation of translations){
 const localStorage=storage({preferredTranslation:translation});
 const globals={localStorage,window:{localStorage,addEventListener(){},removeEventListener(){}}};
 const modules={'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push(){}})},'@/app/components/MobileBottomNav':{default:'nav'}};
 const page=createUiFixture({modules,globals});
 const tree=page.render(page.load('app/read/page.tsx').default);
 const sections=elements(tree,e=>e.type==='details');
 const actual=[];
 for(const section of sections){
  const label=text(elements(section,e=>e.type==='summary')[0]);
  for(const link of elements(section,e=>e.type==='a')){
   const url=new URL(link.props.href,'https://fixture.invalid');
   const book=decodeURIComponent(url.pathname.split('/')[2]);actual.push(book);
   assert.equal(url.searchParams.get('translation'),translation);
   assert(inventory[translation][book],`${book} must load`);
   if(book==='Daniel')assert.match(label,/Prophets/);
   if(book==='Esther')assert.match(label,/History/);
   if(book in additions)assert.match(label,/Septuagint/);
   if(['Song of Solomon','Song of Songs'].includes(book))assert.match(label,/Wisdom/);
  }
 }
 assert.deepEqual(actual.sort(),Object.keys(inventory[translation]).sort());
 for(const [book,chapters] of Object.entries(inventory[translation])){
  const grid=createUiFixture({modules:{'next/link':{default:'a'}},globals});
  const rendered=grid.render(grid.load('app/components/BookPassageSelector.tsx').default,{book,chapterCount:bookCatalog.find(b=>b.book===book).chapters,translation});
  const links=elements(rendered,e=>e.type==='a');
  assert.deepEqual(links.map(e=>Number(new URL(e.props.href,'https://fixture.invalid').pathname.split('/').at(-1))),chapters);
  for(const link of links){const url=new URL(link.props.href,'https://fixture.invalid');assert.equal(url.searchParams.get('translation'),translation);assert.equal(decodeURIComponent(url.pathname.split('/')[2]),book);}
 }
}
const selector=createUiFixture({modules:{'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push(){}})}},globals:{window:{localStorage:storage()}}});
const Selector=selector.load('app/components/ReaderSelector.tsx').default;
for(const [book,chapter,enabled] of [['Daniel Greek',1,['brenton']],['Esther',1,['web','kjv']],['Psalms',151,['brenton']],['Proverbs',30,['web','kjv']]]){
 const tree=selector.render(Selector,{mode:'translation',books:bookCatalog.map(b=>b.book),currentBook:book,currentChapter:chapter,currentTranslation:enabled[0],maxChapter:chapter});
 const buttons=elements(tree,e=>e.type==='button');
 assert.deepEqual(buttons.filter(b=>!b.props.disabled).map(b=>text(b).includes('Brenton')?'brenton':text(b).includes('King James')?'kjv':'web'),enabled);
}
console.log(`PASS full catalog/categorization, ${chapterTotal} chapters, all chapter-grid hrefs, seven Brenton works, separate editions, numbered books, sparse chapter numbering and translation availability. No source data changed.`);
// Execute the actual server page and loading path against the existing runtime,
// replacing HTTP transport only. This is not a live HTTP/browser acceptance test.
const modules={'next/link':{default:'a'},'next/headers':{headers:async()=>new Map([['host','localhost:3000']])},'next/navigation':{notFound(){throw Error('Unexpected reader 404');}},'@/app/data/scripture/CanonicalVerseStore':{getCanonicalChapterTokenAvailability:async()=>({})}};
for(const name of ['SacredNameToggle','ReaderAppearanceControls','ReaderSelector','SaveReadingPosition','ReaderVerseScroller','ChapterSwipe','MobileBottomNav','CollapsibleReaderHeader','SaveBibleIQContext','VerseActionController','ReaderStickyHeader','ReaderFirstUseTip','RestoredWordStudyNavigation'])modules[`@/app/components/${name}`]={default:name};
const server=createUiFixture({modules,globals:{fetch:async href=>{const file=path.join('public',new URL(href).pathname);return fs.existsSync(file)?{ok:true,json:async()=>JSON.parse(fs.readFileSync(file))}:{ok:false};}}});
const ReadChapter=server.load('app/read/[book]/[chapter]/page.tsx').default;
for(const translation of translations)for(const [book,chapters] of Object.entries(inventory[translation]))for(const [index,chapter] of chapters.entries()){
 const tree=await ReadChapter({params:Promise.resolve({book:encodeURIComponent(book),chapter:String(chapter)}),searchParams:Promise.resolve({translation})});
 assert.equal(text(elements(tree,e=>e.type==='h1')[0]),`${book} ${chapter}`);
 const content=elements(tree,e=>e.type==='VerseActionController')[0];assert(content?.props.verses.length);assert.equal(content.props.activeTranslation,translation);
 const swipe=elements(tree,e=>e.type==='ChapterSwipe')[0];
 const expected=number=>number?`/read/${encodeURIComponent(book)}/${number}?translation=${translation}`:null;
 assert.equal(swipe.props.previousChapterHref,expected(chapters[index-1]));
 assert.equal(swipe.props.nextChapterHref,expected(chapters[index+1]));
}
console.log(`PASS actual reader server-page loading, requested translation, verse payload and previous/next links for all ${chapterTotal} selectable chapters; transport uses local runtime fixtures only.`);
