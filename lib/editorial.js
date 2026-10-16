export const TIME_ZONE = 'Europe/Rome';
export const BUILD = '2026-10-16-daily-archives-v3.1';
const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const labelFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE
});
export const sections = [
  ['In primo piano', 'Italia notizie'],
  ['Bergamo città', 'Bergamo città'],
  ['Provincia di Bergamo', 'provincia Bergamo'],
  ['Lombardia', 'Lombardia notizie'],
  ['Italia - Politica e istituzioni', 'governo parlamento politica italiana'],
  ['Italia - Cronaca e giustizia', 'Italia cronaca giustizia'],
  ['Economia, lavoro, imprese, fisco e pensioni', 'Italia economia lavoro pensioni'],
  ['Mondo e geopolitica', 'mondo esteri geopolitica'],
  ['Europa e Unione europea', 'Unione europea Bruxelles'],
  ['Scienza, medicina e salute pubblica', 'scienza medicina salute ricerca'],
  ['Tecnologia, intelligenza artificiale, digitale e cybersecurity', 'tecnologia intelligenza artificiale'],
  ['Scuola, università, formazione e lavoro educativo', 'scuola università educazione'],
  ['Ambiente, clima, energia e trasporti', 'ambiente clima energia trasporti'],
  ['Cultura, libri, spettacolo e società', 'cultura libri spettacolo'],
  ['Sport', 'sport calcio'],
  ['Mercati e finanza', 'borsa mercati finanza']
];

export function romeDate(value = new Date()) {
  return dayFormatter.format(new Date(value));
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

export function shiftDate(date, amount) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function dateLabel(date) {
  return labelFormatter.format(new Date(date + 'T12:00:00Z'));
}

export function decode(value = '') {
  const named = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '};
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
      if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
      const code = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

export function plain(value = '') {
  return decode(decode(value)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function field(xml, tag) {
  const match = xml.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));
  return match ? plain(match[1]) : '';
}

export function httpUrl(value, base) {
  try {
    const url = new URL(decode(value), base);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function parseFeed(xml, {date, source, section, indexed = false}) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.slice(0, 120).flatMap((match) => {
    const raw = match[1];
    let title = field(raw, 'title');
    const publication = field(raw, 'pubDate') || field(raw, 'published');
    const stamp = Date.parse(publication);
    // An update or an indexing timestamp cannot establish the publication day.
    if (!Number.isFinite(stamp) || romeDate(stamp) !== date) return [];
    const url = httpUrl(field(raw, 'link') || raw.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]);
    if (!title || !url) return [];
    const publisher = indexed ? field(raw, 'source') || source : source;
    if (indexed && title.endsWith(' - ' + publisher)) title = title.slice(0, -(publisher.length + 3));
    const excerpt = indexed ? '' : field(raw, 'description') || field(raw, 'summary');
    return [{section, title, summary: excerpt && excerpt !== title ? excerpt.slice(0, 240) : '',
      source: publisher, url, publishedAt: new Date(stamp).toISOString(), publishedDate: date,
      dateEvidence: 'publication', via: indexed ? 'Google News' : 'RSS'}];
  });
}

export function classify(title, url, fallback = 'In primo piano') {
  const text = (title + ' ' + url).toLocaleLowerCase('it');
  const rules = [
    [/\b(atalanta|calcio|sport|champions|conference|serie a|tennis|ciclismo|pafos)\b/, 'Sport'],
    [/\b(borsa|wall street|nasdaq|spread|mercati finanziari)\b/, 'Mercati e finanza'],
    [/\b(pensioni|fisco|lavoro|imprese|economia|istat|sindacati|pil|inflazione)\b/, 'Economia, lavoro, imprese, fisco e pensioni'],
    [/\b(scuola|scuole|universit[aà]|educativ|studenti|docenti|aule)\b/, 'Scuola, università, formazione e lavoro educativo'],
    [/\b(ricerca|scienza|medicina|salute|cellule|neuroni|microplastiche|stelle|tumor\w*)\b/, 'Scienza, medicina e salute pubblica'],
    [/\b(intelligenza artificiale|tecnologia|cyber\w*|digitale|informatica)\b/, 'Tecnologia, intelligenza artificiale, digitale e cybersecurity'],
    [/\b(clima\w*|energia|trasporti|treni|ambiente|microalghe|ossigeno)\b/, 'Ambiente, clima, energia e trasporti'],
    [/\b(libri|cultura|spettacolo|cinema|teatro|musica|mostra)\b/, 'Cultura, libri, spettacolo e società'],
    [/\b(unione europea|bruxelles|bilancio ue|europarlamento)\b/, 'Europa e Unione europea'],
    [/\b(gaza|ucraina|russia|israele|trump|esteri|geopolitica|guerra)\b/, 'Mondo e geopolitica'],
    [/\b(governo|parlamento|mattarella|meloni|senato|camera dei deputati)\b/, 'Italia - Politica e istituzioni']
  ];
  for (const [pattern, section] of rules) if (pattern.test(text)) return section;
  if (/\b(bergamo|sentierone|via longo)\b/.test(text)) return 'Bergamo città';
  return fallback;
}

export function parseDailyArchive(html, date) {
  const heading = plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]).toLocaleLowerCase('it').replace(/\b0(\d)\b/g, '$1');
  const label = dateLabel(date);
  if (!heading.includes('archivio ' + label)) return [];
  const entries = [...html.matchAll(/<li\b[^>]*>\s*<span\b[^>]*class=["']archive-article-publish-date["'][^>]*>([\s\S]*?)<\/span>\s*<span\b[^>]*class=["']archive-article-title["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi)];
  return entries.flatMap((match) => {
    const url = httpUrl(match[2], 'https://www.ecodibergamo.it');
    const title = plain(match[3]), time = plain(match[1]);
    if (!url || !title || !/^\d{2}:\d{2}$/.test(time) || !url.includes('/stories/') || url.includes('/ansa-business/')) return [];
    return [{section: classify(title, url, url.includes('/ansa/') ? 'In primo piano' : 'Provincia di Bergamo'),
      title, summary: '', source: url.includes('/ansa/') ? 'ANSA, tramite L’Eco di Bergamo' : 'L’Eco di Bergamo',
      url, publishedDate: date, publishedTime: time, dateEvidence: 'daily-archive',
      archiveUrl: 'https://www.ecodibergamo.it/stories/archivio/data/' + encodeURIComponent(label) + '/'}];
  });
}

export function selectItems(candidates) {
  const titles = new Set(), urls = new Set(), counts = new Map();
  return candidates.filter((item) => {
    const title = item.title.toLocaleLowerCase('it').replace(/[^a-zà-ÿ0-9]/g, '');
    const url = item.url.split('?')[0];
    const count = counts.get(item.section) || 0;
    if (titles.has(title) || urls.has(url) || count >= 8) return false;
    titles.add(title); urls.add(url); counts.set(item.section, count + 1);
    return true;
  }).sort((a, b) => sections.findIndex(([name]) => name === a.section) - sections.findIndex(([name]) => name === b.section));
}

export const json = (value, status = 200) => Response.json(value, {
  status, headers: {'Cache-Control': 'no-store, max-age=0'}
});
