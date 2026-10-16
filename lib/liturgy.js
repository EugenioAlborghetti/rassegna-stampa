import {plain, dateLabel, validDate} from './editorial.js';
import {FRANCISCAN, ROMAN_SNAPSHOTS} from './liturgy-catalog.js';

export const LITURGY_VERSION = 1;
export const ceiUrl = date => 'https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia=' + date.replaceAll('-', '');
const loaded = new Map(), pending = new Map();

export function parseRomanLiturgy(html, date) {
  const shownDate = plain(html.match(/<span\b[^>]*class=["'][^"']*cci-data-estesa-liturgia[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  // The site's header shows today's saint even when the main page is historical.
  if (!shownDate.toLocaleLowerCase('it').replace(/\b0(\d)\b/g, '$1').endsWith(dateLabel(date))) return null;
  const titles = new Set();
  const headings = [...html.matchAll(/<h[23]\b[^>]*class=["'][^"']*cci_content_single_title[^"']*["'][^>]*>([\s\S]*?)<\/h[23]>/gi)].filter(heading => {
    const title = plain(heading[1]);
    if (titles.has(title)) return false;
    titles.add(title); return true;
  });
  if (!headings.length) return null;
  const celebrations = headings.map((heading, index) => {
    const segment = html.slice(heading.index, headings[index + 1]?.index || html.length);
    const color = plain(segment.match(/<div\b[^>]*class=["'][^"']*cci-colore-liturgico[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).replace(/^Colore\s+Liturgico\s*/i, '');
    return {title: plain(heading[1]), color};
  });
  const main = html.slice(headings[0].index, headings[1]?.index || html.length);
  const readings = [];
  for (const label of ['Prima Lettura', 'Salmo Responsoriale', 'Seconda Lettura', 'Vangelo']) {
    const section = main.match(new RegExp('<h2\\b[^>]*>\\s*' + label + '\\s*</h2>([\\s\\S]*?)(?=<h2\\b|$)', 'i'))?.[1] || '';
    const reference = plain(section.match(/<a\b[^>]*href=["']https:\/\/www\.bibbiaedu\.it[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    const psalm = label === 'Salmo Responsoriale' ? plain(section).match(/(?:Dal\s+)?Sal\s+[\d(),\s-]+/i)?.[0]?.trim() : '';
    if (reference || psalm) readings.push({label, reference: reference || psalm});
  }
  return {date, summary: celebrations.map(item => item.title).join('. '), celebrations,
    color: celebrations[0].color, readings, source: 'Conferenza Episcopale Italiana', sourceUrl: ceiUrl(date)};
}

export function calendarForDate(date, roman = loaded.get(date) || ROMAN_SNAPSHOTS[date]) {
  const own = FRANCISCAN.entries[date];
  const franciscan = own ? {...own, source: FRANCISCAN.source, sourceUrl: FRANCISCAN.sourceUrl,
    calendar: FRANCISCAN.document} : null;
  return {version: LITURGY_VERSION, date, complete: !!roman && !!franciscan,
    roman: roman?.summary || 'Consulta la liturgia della data alla fonte ufficiale.',
    franciscan: franciscan?.summary || 'Il calendario francescano consultato non copre questa data.',
    romanDetails: roman || {source: 'Conferenza Episcopale Italiana', sourceUrl: ceiUrl(date)},
    franciscanDetails: franciscan || {source: FRANCISCAN.source, sourceUrl: FRANCISCAN.sourceUrl}};
}

export async function getLiturgy(date) {
  if (!validDate(date)) throw Error('Data non valida');
  if (loaded.has(date) || ROMAN_SNAPSHOTS[date]) return calendarForDate(date);
  if (!pending.has(date)) pending.set(date, (async () => {
    try {
      const response = await fetch(ceiUrl(date), {headers: {Accept: 'text/html'}, signal: AbortSignal.timeout(6000)});
      const roman = response.ok ? parseRomanLiturgy(await response.text(), date) : null;
      if (roman) {
        if (loaded.size >= 400) loaded.delete(loaded.keys().next().value);
        loaded.set(date, roman);
      }
      return calendarForDate(date, roman);
    } catch { return calendarForDate(date, null); }
  })().finally(() => pending.delete(date)));
  return pending.get(date);
}

export function decorateEdition(edition) {
  const liturgy = calendarForDate(edition.date);
  return {...edition, roman: liturgy.roman, franciscan: liturgy.franciscan, liturgy};
}
