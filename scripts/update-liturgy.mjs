import {readFile, writeFile} from 'node:fs/promises';
import {parseRomanLiturgy, calendarForDate, ceiUrl} from '../lib/liturgy.js';
import {FRANCISCAN, ROMAN_SNAPSHOTS} from '../lib/liturgy-catalog.js';
import {validDate} from '../lib/editorial.js';

const dates = process.argv.slice(2);
if (!dates.length || dates.some(date => !validDate(date))) throw Error('Indicare le date da aggiornare');
const romans = {...ROMAN_SNAPSHOTS};
let cursor = 0;
await Promise.all(Array.from({length: 3}, async () => {
  while (cursor < dates.length) {
    const date = dates[cursor++];
    const response = await fetch(ceiUrl(date), {signal: AbortSignal.timeout(15000)});
    const data = response.ok ? parseRomanLiturgy(await response.text(), date) : null;
    if (!data) throw Error('Calendario romano non verificabile: ' + date);
    romans[date] = data;
    console.log(date + ': ' + data.celebrations.length + ' celebrazioni');
  }
}));
await writeFile(new URL('../lib/liturgy-catalog.js', import.meta.url),
  '// Fonti ufficiali: CEI e calendario OFM Conv 2026.\nexport const FRANCISCAN = ' + JSON.stringify(FRANCISCAN) + ';\nexport const ROMAN_SNAPSHOTS = ' + JSON.stringify(romans) + ';\n');
const snapshots = Object.fromEntries(Object.entries(romans).map(([date, roman]) => [date, calendarForDate(date, roman)]));
await writeFile(new URL('../liturgical-data.js', import.meta.url), 'window.LITURGY_DATA = ' + JSON.stringify(snapshots) + ';\n');
// Refresh published editions as well as the browser-independent calendar payload.
for (const [date, liturgy] of Object.entries(snapshots)) {
  const path = new URL('../data/' + date + '.json', import.meta.url);
  try {
    const edition = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({...edition, roman: liturgy.roman, franciscan: liturgy.franciscan, liturgy}, null, 2) + '\n');
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
}
