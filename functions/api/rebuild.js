import {BUILD, TIME_ZONE, sections, validDate, romeDate, shiftDate, dateLabel,
  parseFeed, parseDailyArchive, selectItems, json} from '../../lib/editorial.js';

const pending = new Map();
const directFeeds = [
  ['In primo piano', 'ANSA', 'https://www.ansa.it/sito/ansait_rss.xml'],
  ['In primo piano', 'RaiNews', 'https://www.rainews.it/rss/tutti'],
  ['Sport', 'RaiNews Sport', 'https://www.rainews.it/rss/sport']
];

async function buildEdition(date, env) {
  const now = new Date(), diagnostics = [];
  async function text(url, name) {
    try {
      const response = await fetch(url, {headers: {Accept: 'application/rss+xml, application/xml, text/html'},
        redirect: 'follow', signal: AbortSignal.timeout(7000)});
      if (!response.ok) { diagnostics.push({source: name, status: response.status}); return ''; }
      return await response.text();
    } catch { diagnostics.push({source: name, error: 'Fonte temporaneamente non disponibile'}); return ''; }
  }
  const archiveUrl = 'https://www.ecodibergamo.it/stories/archivio/data/' + encodeURIComponent(dateLabel(date)) + '/';
  const archive = text(archiveUrl, 'Archivio L’Eco di Bergamo').then(html => parseDailyArchive(html, date));
  // Rolling feeds help with recent dates. Historical requests use dated archives and searches.
  const direct = date >= shiftDate(romeDate(now), -2)
    ? Promise.all(directFeeds.map(async ([section, source, url]) =>
      parseFeed(await text(url, source), {date, source, section}))) : Promise.resolve([]);
  const indexed = [];
  let cursor = 0;
  // Bound provider concurrency and give every section an independent dated search.
  await Promise.all(Array.from({length: 3}, async () => {
    while (cursor < sections.length) {
      const index = cursor++, [section, query] = sections[index];
      const params = new URLSearchParams({
        q: query + ' after:' + shiftDate(date, -1) + ' before:' + shiftDate(date, 1),
        hl: 'it', gl: 'IT', ceid: 'IT:it'
      });
      const xml = await text('https://news.google.com/rss/search?' + params, 'Google News: ' + section);
      indexed[index] = parseFeed(xml, {date, source: 'Google News', section, indexed: true});
    }
  }));
  const [archiveItems, directItems] = await Promise.all([archive, direct]);
  // Direct article links take precedence over aggregator redirects for duplicate headlines.
  const items = selectItems([...directItems.flat(), ...archiveItems, ...indexed.flat()]);
  if (items.length < 3) return {error: 'Non ci sono ancora abbastanza notizie con data di pubblicazione corrispondente. Riprova più tardi o apri un’altra data.',
    date, found: items.length, diagnostics, status: 503};
  const present = new Set(items.map(x => x.section));
  const edition = {
    date, day: new Intl.DateTimeFormat('it-IT', {weekday: 'long', timeZone: TIME_ZONE}).format(new Date(date + 'T12:00:00Z')),
    dateLabel: dateLabel(date), generatedAt: now.toISOString(), revision: crypto.randomUUID(), build: BUILD,
    updated: 'ricostruita il ' + new Intl.DateTimeFormat('it-IT', {dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE}).format(now),
    roman: 'Memoria liturgica non verificata', franciscan: 'Memoria francescana non verificata',
    items, generated: true, engine: 'Archivi giornalieri, RSS e ricerche per data',
    scope: 'Titoli, eventuali estratti e collegamenti. Le sezioni senza fonti datate restano vuote.',
    coverage: {sections: present.size, totalSections: sections.length,
      missingSections: sections.filter(([name]) => !present.has(name)).map(([name]) => name)},
    diagnostics, persisted: false
  };
  if (env?.ARCHIVE) {
    try {
      await env.ARCHIVE.put('edition:' + date, JSON.stringify({...edition, persisted: true}));
      edition.persisted = true;
    } catch (error) { console.error('archive write failed', error); }
  }
  return edition;
}

export async function onRequestPost({request, env = {}}) {
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!validDate(date)) return json({error: 'Data non valida'}, 400);
  if (date > romeDate()) return json({error: 'Data futura'}, 400);
  // Coalesce duplicate clicks while a rebuild is running. A later click starts a new revision.
  if (!pending.has(date)) pending.set(date, buildEdition(date, env).finally(() => pending.delete(date)));
  const result = await pending.get(date);
  const {status = 200, ...body} = result;
  return json(body, status);
}
