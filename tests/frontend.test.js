import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {romeDate} from '../lib/editorial.js';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const sample = date => ({date, dateLabel: date, items: [{section: 'Sport', title: 'Notizia ' + date, source: 'Fonte', url: 'https://example.org/' + date}]});
async function app(fetch) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML: '', textContent: '', value: '', disabled: false,
      setAttribute() {}, classList: {toggle() {}}, style: {setProperty() {}}});
    return nodes.get(id);
  };
  const storage = {};
  Object.defineProperties(storage, {
    getItem: {value: key => storage[key] || null}, setItem: {value: (key, value) => storage[key] = value}
  });
  storage['rassegna:' + romeDate()] = JSON.stringify(sample(romeDate()));
  const context = vm.createContext({Intl, Date, URL, AbortController, setTimeout, clearTimeout, fetch,
    localStorage: storage, navigator: {}, location: {href: 'https://example.org/', protocol: 'https:'},
    document: {getElementById: node, querySelectorAll: () => [], body: node('body'), documentElement: node('html')},
    history: {replaceState() {}}, ttsText: value => value});
  context.window = context;
  vm.runInContext(source, context);
  return {context, node, storage, run: code => vm.runInContext(code, context)};
}

test('calendar navigation clamps month ends and leap years', async () => {
  const ui = await app(async () => {throw Error('No fetch');});
  assert.equal(ui.run("add('2026-03-31', -1, 'Month')"), '2026-02-28');
  assert.equal(ui.run("add('2024-02-29', -1, 'FullYear')"), '2023-02-28');
  assert.equal(ui.run("add('2026-01-01', -1)"), '2025-12-31');
});

test('late responses from another selected day cannot replace the visible edition', async () => {
  const waiting = new Map();
  const ui = await app(url => new Promise(resolve => waiting.set(new URL(url, 'https://example.org').searchParams.get('date'), resolve)));
  const first = ui.run("load('2026-10-12')");
  const second = ui.run("load('2026-10-11')");
  waiting.get('2026-10-11')(Response.json(sample('2026-10-11')));
  await second;
  waiting.get('2026-10-12')(Response.json(sample('2026-10-12')));
  await first;
  assert.equal(ui.node('date').value, '2026-10-11');
  assert.match(ui.node('news').innerHTML, /2026-10-11/);
  assert.doesNotMatch(ui.node('news').innerHTML, /2026-10-12/);
});

test('failed dates remain selected and previous-day navigation uses that date', async () => {
  const dates = [];
  const ui = await app(async url => {dates.push(new URL(url, 'https://example.org').searchParams.get('date')); return Response.json({error: 'Assente'}, {status: 404});});
  await ui.run("load('2026-10-12')");
  assert.equal(ui.node('date').value, '2026-10-12');
  await ui.node('prev').onclick();
  assert.deepEqual(dates, ['2026-10-12', '2026-10-11']);
});

test('rebuild always sends POST and replaces the registered browser revision', async () => {
  let count = 0;
  const ui = await app(async (url, options) => {
    assert.equal(options.method, 'POST'); count++;
    return Response.json({...sample(romeDate()), generated: true, revision: String(count)});
  });
  await ui.node('rebuild').onclick();
  await ui.node('rebuild').onclick();
  assert.equal(count, 2);
  assert.equal(JSON.parse(ui.storage['rassegna:' + romeDate()]).revision, '2');
  assert.equal(ui.node('rebuild').disabled, false);
});

test('a failed rebuild preserves the previous edition and its stored contents', async () => {
  const ui = await app(async () => Response.json({error: 'Fonte assente'}, {status: 503}));
  const previous = ui.node('news').innerHTML, stored = ui.storage['rassegna:' + romeDate()];
  await ui.node('rebuild').onclick();
  assert.equal(ui.node('news').innerHTML, previous);
  assert.equal(ui.storage['rassegna:' + romeDate()], stored);
  assert.match(ui.node('status').textContent, /precedente è ancora disponibile/);
});

test('external headlines and links cannot inject markup into the page', async () => {
  const ui = await app(async () => {throw Error('No fetch');});
  ui.context.fixture = {...sample(romeDate()), items: [{title: '<img src=x onerror=alert(1)>', source: 'Fonte', url: 'javascript:alert(1)', summary: '<script>alert(1)</script>'}]};
  ui.run('ed = fixture; render();');
  const markup = ui.node('news').innerHTML;
  assert.doesNotMatch(markup, /<img|<script|href="javascript:/);
  assert.match(markup, /&lt;img/);
});

test('missing current edition is reconstructed automatically on opening', async () => {
  const calls = [];
  const ui = await app(async (url, options) => {
    calls.push(options.method || 'GET');
    return options.method === 'POST' ? Response.json({...sample(romeDate()), generated: true})
      : Response.json({error: 'Assente'}, {status: 404});
  });
  await ui.run(`load('${romeDate()}', true)`);
  assert.deepEqual(calls, ['GET', 'POST']);
  assert.match(ui.node('news').innerHTML, /Notizia/);
});

test('legacy reconstructions are refreshed instead of hiding the newly published edition', async () => {
  let calls = 0;
  const replacement = {...sample(romeDate()), generated: true};
  replacement.items[0].title = 'Edizione aggiornata';
  replacement.items[0].publishedDate = romeDate();
  const ui = await app(async () => {calls++; return Response.json(replacement);});
  ui.storage['rassegna:' + romeDate()] = JSON.stringify({...sample(romeDate()), generated: true});
  await ui.run('load(today())');
  assert.equal(calls, 1);
  assert.match(ui.node('news').innerHTML, /Edizione aggiornata/);
  assert.equal(JSON.parse(ui.storage['rassegna:' + romeDate()]).items[0].publishedDate, romeDate());
});
