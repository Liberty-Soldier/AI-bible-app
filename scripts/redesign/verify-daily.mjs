import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import * as crypto from 'node:crypto';
import {createUiFixture} from '../lib/ui-fixture-runtime.mjs';
const fixture=createUiFixture({modules:{'next/link':{default:'a'},'server-only':{},'node:fs':{default:fs},'node:path':{default:path},'node:crypto':crypto},globals:{process:{cwd:()=>process.cwd()}}});
const {DAILY_SCHEDULE}=fixture.load('app/data/daily/annual.ts');const {dailyPassage}=fixture.load('app/lib/daily/passage.ts');
assert.equal(DAILY_SCHEDULE.length,366);assert.equal(new Set(DAILY_SCHEDULE.map(s=>s.date)).size,366);
for(const s of DAILY_SCHEDULE)for(const translation of ['web','kjv','brenton']) {const p=dailyPassage(`2028-${s.date}`,translation);assert.ok(p,`${s.date} ${s.reference} ${translation}`);assert.ok(p.verses.length);assert.ok(p.verses.every(v=>v.text&&v.translation===p.translation));assert.equal(p.translation!==translation,!!p.fallback);}
assert.equal(dailyPassage('2027-02-29','web'),null);assert.ok(dailyPassage('2028-02-29','web'));assert.equal(dailyPassage('2028-02-30','web'),null);
assert.equal(dailyPassage('2028-05-11','brenton').translation,'web');assert.match(dailyPassage('2028-05-11','brenton').fallback,/numbering/);
assert.equal(dailyPassage('2028-12-01','brenton').translation,'web');
const {localCalendarDate}=fixture.load('app/components/DailyPassage.tsx');
assert.equal(localCalendarDate(new Date(2028,1,29,0,1)),'2028-02-29');assert.equal(localCalendarDate(new Date(2028,1,29,23,59)),'2028-02-29');
console.log('PASS: all 366 editorial dates resolved against locked corpus for WEB/KJV/Brenton (1,098 resolutions), leap years, numbering fallback, unavailable translation disclosure and local calendar selection.');
