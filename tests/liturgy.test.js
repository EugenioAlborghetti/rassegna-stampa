import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRomanLiturgy, calendarForDate, decorateEdition, getLiturgy} from '../lib/liturgy.js';
import {onRequestGet} from '../functions/api/liturgy.js';

const title = 'SANTA TERESA DI GESÙ – MEMORIA';
const html = `<h3 class="day">16 Ottobre 2026</h3>
<span class="cci-data-estesa-liturgia">giovedì 15 Ottobre 2026</span>
<h3 class="cci_content_single_title">${title}</h3>
<div class="cci-colore-liturgico">Colore Liturgico <span>bianco</span></div>
<h3 class="cci_content_single_title">${title}</h3>
<h2 class="cci-liturgia-giorno-section-title">Prima Lettura</h2>
<a href="https://www.bibbiaedu.it/CEI2008/nt/Ef/1/">Ef 1,1-10</a>
<h2 class="cci-liturgia-giorno-section-title">Vangelo</h2>
<a href="https://www.bibbiaedu.it/CEI2008/nt/Lc/11/">Lc 11,47-54</a>`;

test('the selected liturgical date comes from the main content, not the current-date header', () => {
  assert.equal(parseRomanLiturgy(html, '2026-10-16'), null);
  assert.equal(parseRomanLiturgy(html, '2026-10-15').date, '2026-10-15');
  assert.equal(parseRomanLiturgy('<h3>'+title+'</h3>', '2026-10-15'), null);
});

test('duplicate responsive headings are removed without losing the readings', () => {
  const value = parseRomanLiturgy(html, '2026-10-15');
  assert.equal(value.celebrations.length, 1);
  assert.equal(value.color, 'bianco');
  assert.equal(value.readings.find(item => item.label === 'Vangelo').reference, 'Lc 11,47-54');
});

test('the sixteenth distinguishes the feria from two optional memorials and their colors', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw Error('Snapshot must work offline');});
  const value = await getLiturgy('2026-10-16');
  assert.equal(value.complete, true);
  assert.equal(value.romanDetails.celebrations.length, 3);
  assert.equal(value.romanDetails.color, 'verde');
  assert.ok(value.romanDetails.celebrations.slice(1).every(item => item.title.includes('FACOLTATIVA') && item.color === 'bianco'));
  assert.match(value.franciscan, /Edvige/);
  assert.match(value.franciscan, /Margherita Maria Alacoque/);
  assert.equal(value.franciscanDetails.sourcePage, 133);
});

test('Roman and Franciscan observances remain distinct on the fourth of October', () => {
  const value = calendarForDate('2026-10-04');
  assert.match(value.roman, /DOMENICA/);
  assert.match(value.franciscan, /FRANCESCO/);
  assert.match(value.franciscan, /Solennità/);
});

test('Franciscan calendar coverage is explicit and does not recycle another year', () => {
  assert.equal(calendarForDate('2026-11-28').franciscanDetails.sourcePage > 0, true);
  assert.match(calendarForDate('2026-11-29').franciscan, /non copre questa data/);
  assert.match(calendarForDate('2025-10-16').franciscan, /non copre questa data/);
});

test('published editions gain liturgy without replacing their news or revision', () => {
  const items = [{title:'Notizia esistente'}];
  const result = decorateEdition({date:'2026-10-16',items,revision:'unchanged',roman:'Memoria non verificata'});
  assert.equal(result.items, items);
  assert.equal(result.revision, 'unchanged');
  assert.match(result.roman, /EDVIGE/);
  assert.equal(result.liturgy.complete, true);
});

test('the calendar endpoint rejects impossible dates before calling a provider', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {calls++; throw Error('Must not fetch');});
  const response = await onRequestGet({request:new Request('https://example.org/api/liturgy?date=2026-02-30')});
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
