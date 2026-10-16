import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate, romeDate, parseFeed, parseDailyArchive, selectItems} from '../lib/editorial.js';
import {onRequestPost} from '../functions/api/rebuild.js';
import {onRequestGet} from '../functions/api/edition.js';

const date = '2026-01-02';
const rss = (pub, extra = '', title = 'Notizia di prova') => `<rss><channel><item><title>${title}</title><link>https://example.org/articolo</link>${pub ? `<pubDate>${pub}</pubDate>` : ''}${extra}</item></channel></rss>`;
const options = {date, source: 'Fonte', section: 'In primo piano'};
const archive = `<h1>Archivio 02 Gennaio 2026</h1>` + ['Bergamo: cronaca', 'Scuola: nuove aule', 'Scienza e ricerca', 'Ambiente ed energia'].map((title, index) =>
  `<li><span class="archive-article-publish-date">10:0${index}</span> <span class="archive-article-title"><a href="/stories/homepage/articolo-${index}/">${title}</a></span></li>`).join('');
const request = value => new Request('https://example.org/api/rebuild?date=' + value, {method: 'POST'});

test('dates reject impossible days and respect Italian midnight and daylight saving', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(romeDate('2026-07-01T22:30:00Z'), '2026-07-02');
  assert.equal(romeDate('2026-01-01T23:30:00Z'), date);
});

test('feed filtering uses publication in Rome, including UTC day boundaries', () => {
  assert.equal(parseFeed(rss('Thu, 01 Jan 2026 23:30:00 GMT'), options).length, 1);
  assert.equal(parseFeed(rss('Fri, 02 Jan 2026 23:30:00 GMT'), options).length, 0);
  assert.equal(parseFeed(rss('', '<updated>2026-01-02T12:00:00Z</updated>'), options).length, 0);
  assert.equal(parseFeed(rss('invalid'), options).length, 0);
});

test('feed parsing cleans markup, rejects unsafe links, identifies indexed publishers', () => {
  const feed = rss('Fri, 02 Jan 2026 10:00:00 GMT', '<source url="https://example.org">Fonte</source>', 'Titolo &amp; novit&#xE0; - Fonte');
  const [item] = parseFeed(feed, {...options, indexed: true});
  assert.equal(item.title, 'Titolo & novità');
  assert.equal(item.source, 'Fonte');
  assert.equal(item.summary, '');
  assert.equal(parseFeed(feed.replace('https://example.org/articolo', 'javascript:alert(1)'), options).length, 0);
});

test('daily archive checks its heading, accepts zero-padded days, excludes promotional items', () => {
  assert.equal(parseDailyArchive(archive, date).length, 4);
  assert.equal(parseDailyArchive(archive, '2026-01-03').length, 0);
  assert.equal(parseDailyArchive(archive.replaceAll('/stories/homepage/', '/stories/ansa-business/'), date).length, 0);
  assert.equal(parseDailyArchive(archive, date)[0].publishedDate, date);
});

test('edition selection deduplicates headlines and links and limits section size', () => {
  const item = {title: 'Titolo', url: 'https://example.org/1', section: 'Sport'};
  const candidates = [item, {...item, title: 'Altro titolo'}, {...item, url: 'https://example.org/2'}];
  assert.equal(selectItems(candidates).length, 1);
  assert.equal(selectItems(Array.from({length: 12}, (_, i) => ({...item, title: 'Titolo ' + i, url: 'https://example.org/' + i}))).length, 8);
});

test('invalid and future requests never contact providers', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('Must not fetch'); });
  for (const value of ['2026-02-30', '2999-01-01', '']) {
    assert.equal((await onRequestPost({request: request(value)})).status, 400);
    assert.equal((await onRequestGet({request: request(value), env: {}})).status, 400);
  }
  assert.equal(calls, 0);
});

test('historical rebuild works from the daily archive when all search providers fail', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return String(url).includes('ecodibergamo.it') ? new Response(archive) : new Response('', {status: 429});
  });
  const response = await onRequestPost({request: request(date)});
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every(item => item.publishedDate === date));
  assert.equal(result.persisted, false);
  assert.ok(calls.every(url => !url.includes('gdeltproject') && !url.includes('reuters')));
  assert.equal(calls.length, 17);
});

test('repeated completed rebuilds create new revisions and persist the exact returned revision', async t => {
  t.mock.method(globalThis, 'fetch', async url => new Response(String(url).includes('ecodibergamo.it') ? archive : '<rss/>'));
  const saved = [];
  const env = {ARCHIVE: {put: async (key, value) => saved.push({key, value: JSON.parse(value)})}};
  const first = await (await onRequestPost({request: request(date), env})).json();
  const second = await (await onRequestPost({request: request(date), env})).json();
  assert.notEqual(first.revision, second.revision);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].value.revision, second.revision);
  assert.equal(saved[1].value.persisted, true);
  assert.equal(second.persisted, true);
});

test('simultaneous duplicate requests share one provider search', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    return new Response(String(url).includes('ecodibergamo.it') ? archive : '<rss/>');
  });
  const responses = await Promise.all([onRequestPost({request: request(date)}), onRequestPost({request: request(date)})]);
  const [a, b] = await Promise.all(responses.map(response => response.json()));
  assert.equal(a.revision, b.revision);
  assert.equal(calls, 17);
});

test('an unavailable source does not create a false successful edition or write to storage', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', {status: 503}));
  let writes = 0;
  const result = await onRequestPost({request: request(date), env: {ARCHIVE: {put: async () => writes++}}});
  assert.equal(result.status, 503);
  assert.equal((await result.json()).found, 0);
  assert.equal(writes, 0);
});

test('reading an edition preserves a saved rebuild before older published files', async t => {
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {networkCalls++; throw Error('Must not fetch');});
  const saved = {date, generated: true, revision: 'new', items: [{title: 'Nuova'}]};
  const response = await onRequestGet({request: request(date), env: {ARCHIVE: {get: async () => saved}}});
  const result = await response.json();
  assert.equal(result.revision, 'new');
  assert.equal(result.generated, true);
  assert.equal(result.persisted, true);
  assert.equal(networkCalls, 0);
});
