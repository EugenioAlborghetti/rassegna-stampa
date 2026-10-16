import {mkdir, writeFile} from 'node:fs/promises';
import {onRequestPost} from '../functions/api/rebuild.js';
import {validDate} from '../lib/editorial.js';

const dates = process.argv.slice(2);
if (!dates.length || dates.some(date => !validDate(date))) {
  throw Error('Uso: node scripts/rebuild.mjs AAAA-MM-GG [AAAA-MM-GG ...]');
}
for (const date of dates) {
  const response = await onRequestPost({request: new Request('https://archive.invalid/api/rebuild?date=' + date, {method: 'POST'})});
  const edition = await response.json();
  if (!response.ok) throw Error(date + ': ' + edition.error + ' ' + JSON.stringify(edition.diagnostics));
  if (edition.date !== date || edition.items.some(item => item.publishedDate !== date)) throw Error('Data delle fonti non corrispondente');
  await mkdir(new URL('../data/', import.meta.url), {recursive: true});
  await writeFile(new URL('../data/' + date + '.json', import.meta.url), JSON.stringify(edition, null, 2) + '\n');
  console.log(JSON.stringify({date, items: edition.items.length, coverage: edition.coverage, diagnostics: edition.diagnostics}));
}
