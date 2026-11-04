import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import * as crypto from 'node:crypto';
import {createUiFixture} from '../lib/ui-fixture-runtime.mjs';
const fixture=createUiFixture({modules:{'next/link':{default:'a'},'server-only':{},'node:fs':{default:fs},'node:path':{default:path},'node:crypto':crypto},globals:{process:{cwd:()=>process.cwd()},Response}});
const {DAILY_SCHEDULE}=fixture.load('app/data/daily/annual.ts');const {dailyPassage}=fixture.load('app/lib/daily/passage.ts');
const expected={torah:55,history:40,psalms:55,wisdom:50,prophets:60,'new-testament':70,septuagint:36};
assert.equal(DAILY_SCHEDULE.length,366);assert.equal(new Set(DAILY_SCHEDULE.map(s=>s.date)).size,366);assert.equal(new Set(DAILY_SCHEDULE.map(s=>s.reference)).size,366);
const book=s=>s.reference.replace(/ \d+:.*$/,'').replace(/ Greek$/,'');
const counts={};for(const s of DAILY_SCHEDULE)counts[s.category]=(counts[s.category]||0)+1;assert.deepEqual(counts,expected);
for(let i=0;i<366;i++){
 const s=DAILY_SCHEDULE[i],expectedDate=new Date(Date.UTC(2028,0,i+1)).toISOString().slice(5,10);assert.equal(s.date,expectedDate);
 const next=DAILY_SCHEDULE[(i+1)%366];assert.notEqual(book(s),book(next),'No adjacent books, including Dec 31 / Jan 1');assert.notEqual(s.category,next.category,'Sections alternate');
}
assert.notEqual(book(DAILY_SCHEDULE[58]),book(DAILY_SCHEDULE[60]),'Non-leap Feb 28 / Mar 1 also differ');
for(let m=1;m<=12;m++)for(const category of Object.keys(expected))assert(DAILY_SCHEDULE.filter(s=>s.date.startsWith(String(m).padStart(2,'0'))&&s.category===category).length>=2,`monthly variety ${m} ${category}`);
const baseRows=new Set(),lengths={};const resolvedByTranslation={};
for(const requested of ['web','kjv','brenton']){
 const seen=new Set();let fallback=0;
 for(const s of DAILY_SCHEDULE){
  const date=`2028-${s.date}`,p=dailyPassage(date,requested);assert.ok(p,`${s.date} ${s.reference} ${requested}`);assert(p.verses.length>=1&&p.verses.length<=3);assert(p.verses.every(v=>v.text&&v.translation===p.translation));assert.equal(JSON.stringify(p),JSON.stringify(dailyPassage(date,requested)),'Repeated visits are stable');
  assert.equal(JSON.stringify({...p,date:'same'}),JSON.stringify({...dailyPassage(`2032-${s.date}`,requested),date:'same'}),'Same calendar date across years');
  if(p.translation!==requested){assert(p.fallback);assert(p.fallback.includes(p.translation==='brenton'?'Brenton':'WEB'));fallback++;}
  if(s.sourceTranslation==='brenton')assert.equal(p.translation,'brenton','Exclusive works never become unrelated WEB text');
  else if(requested!=='brenton')assert.equal(p.translation,requested);
  for(const v of p.verses){
   const key=`${v.translation}:${v.reference}`;assert(!seen.has(key),`Overlapping daily selection ${key}`);seen.add(key);
   const [,bookName,chapter,label]=/^(.+) (\d+):(.+)$/.exec(v.reference);const raw=JSON.parse(fs.readFileSync(`public/scripture/runtime/${p.translation}/${bookName.replaceAll(' ','_')}/${chapter}.json`));const rows=Array.isArray(raw)?raw:raw.verses;const row=rows.find(r=>r.reference===v.reference);assert(row,`Reader destination missing: ${key}`);assert.equal(row.text||row.sources?.[0]?.text,v.text,'Displayed Scripture equals actual reader corpus');assert.equal(String(row.verseLabel||row.verse),label);
   if(p.translation==='brenton')assert(row.sourceIdentity?.reference,'Brenton original source identity remains present');
  }
  if(requested==='web'){lengths[p.verses.length]=(lengths[p.verses.length]||0)+1;for(const v of p.verses)baseRows.add(`${v.translation}:${v.reference}`);}
 }
 resolvedByTranslation[requested]={fallbacks:fallback,uniqueVerseIdentities:seen.size};
}
const byRef=ref=>DAILY_SCHEDULE.find(s=>s.reference===ref).date;
for(const [from,to,needle] of [['Jeremiah 32:17','Jeremiah 39:17','heaven and the earth'],['Lamentations 3:22-23','Lamentations 3:21a,21b','new every morning'],['Song of Solomon 8:7','Song of Songs 8:7','quench love']]){
 const p=dailyPassage(`2028-${byRef(from)}`,'brenton');assert.equal(p.reference,to);assert.equal(p.translation,'brenton');assert(p.fallback.includes(from));assert(p.verses.map(v=>v.text).join(' ').toLowerCase().includes(needle));
}
for(const ref of ['Proverbs 16:3','Proverbs 16:9','Proverbs 22:6']){const p=dailyPassage(`2028-${byRef(ref)}`,'brenton');assert.equal(p.translation,'web');assert.match(p.fallback,/verified Brenton reader equivalent/);}
const ps=dailyPassage(`2028-${byRef('Psalms 23:1')}`,'brenton');assert.equal(ps.translation,'brenton');assert.match(ps.verses[0].text,/shepherd/);
for(const ref of ['Tobit 4:7h','Esther Greek 4:17l'])for(const requested of ['web','kjv','brenton']){const p=dailyPassage(`2028-${byRef(ref)}`,requested);assert.equal(p.reference,ref);assert.equal(p.translation,'brenton');}
assert.equal(dailyPassage('2027-02-29','web'),null);assert.ok(dailyPassage('2028-02-29','web'));assert.equal(dailyPassage('2028-02-30','web'),null);assert.equal(dailyPassage('2028-13-01','web'),null);
const {localCalendarDate}=fixture.load('app/components/DailyPassage.tsx');assert.equal(localCalendarDate(new Date(2028,1,29,0,1)),'2028-02-29');assert.equal(localCalendarDate(new Date(2028,1,29,23,59)),'2028-02-29');
const api=fixture.load('app/api/daily-passage/route.ts');assert.equal((await api.GET(new Request('http://localhost/api/daily-passage?date=2028-02-29&translation=web'))).status,200);assert.equal((await api.GET(new Request('http://localhost/api/daily-passage?date=2027-02-29&translation=web'))).status,400);assert.equal((await api.GET(new Request('http://localhost/api/daily-passage?date=2028-02-29&translation=unknown'))).status,400);
console.log('PASS: 366 valid unique fixed dates/references, no overlapping verse identities or adjacent books (including year and non-leap boundaries), all seven sections every month, 1–3 verses, 1,098 locked-corpus/reader resolutions, translation preferences and explicit Brenton-only/suffix/numbering handling, repeat visits/year stability, local-date/leap rules and actual API validation.');console.log(JSON.stringify({categories:counts,selectionLengths:lengths,translations:resolvedByTranslation}));
