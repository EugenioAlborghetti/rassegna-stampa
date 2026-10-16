const S = ['Tutte', 'In primo piano', 'Bergamo città', 'Provincia di Bergamo', 'Lombardia',
  'Italia - Politica e istituzioni', 'Italia - Cronaca e giustizia',
  'Economia, lavoro, imprese, fisco e pensioni', 'Mondo e geopolitica', 'Europa e Unione europea',
  'Scienza, medicina e salute pubblica', 'Tecnologia, intelligenza artificiale, digitale e cybersecurity',
  'Scuola, università, formazione e lavoro educativo', 'Ambiente, clima, energia e trasporti',
  'Cultura, libri, spettacolo e società', 'Sport', 'Mercati e finanza'];
const $ = x => document.getElementById(x);
const key = d => 'rassegna:' + d;
let ed = null, sec = 'Tutte', q = '', queue = [], qi = 0, paused = false;
let selectedDate = today(), requestId = 0, controller = null, busy = false, localSaved = false, speechRun = 0;

function today() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
function validDate(d) {
  const stamp = Date.parse(d + 'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === d;
}
function add(d, n, unit = 'Date') {
  const value = new Date(d + 'T12:00:00Z'), day = value.getUTCDate();
  if (unit === 'Date') value.setUTCDate(day + n);
  else {
    value.setUTCDate(1);
    value['setUTC' + unit](value['getUTC' + unit]() + n);
    const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
    value.setUTCDate(Math.min(day, last));
  }
  return value.toISOString().slice(0, 10);
}
function localGet(d) {
  try { const value = JSON.parse(localStorage.getItem(key(d))); return value?.date === d && value.items?.length ? value : null; }
  catch { return null; }
}
function localPut(value) {
  try { localStorage.setItem(key(value.date), JSON.stringify(value)); return true; }
  catch { return false; }
}
function localCount() {
  try { return Object.keys(localStorage).filter(x => x.startsWith('rassegna:')).length; }
  catch { return 0; }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
function safeUrl(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function renderSections() {
  $('sections').innerHTML = S.map(x => `<button data-s="${escapeHtml(x)}" class="${x === sec ? 'active' : ''}">${escapeHtml(x)}</button>`).join('');
  $('sectionSelect').innerHTML = S.map(x => `<option ${x === sec ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('');
  document.querySelectorAll('[data-s]').forEach(button => button.onclick = () => {sec = button.dataset.s; renderSections(); render();});
}
function savedNotice() {
  if (!ed) return '';
  const saved = ed.persisted ? 'Registrata anche nell’archivio del sito.'
    : localSaved ? 'Registrata in questo browser.' : 'Salvataggio nel browser non disponibile.';
  const coverage = ed.coverage ? ` Sezioni con notizie: ${ed.coverage.sections} su ${ed.coverage.totalSections}.` : '';
  return ed.generated ? `${ed.updated || 'Edizione ricostruita'}. ${saved}${coverage} Titoli, eventuali estratti e fonti originali.` : '';
}
function render() {
  if (!ed) return;
  $('edition').textContent = `Edizione del ${ed.dateLabel || ed.date}`;
  $('date').value = ed.date;
  $('liturgical').innerHTML = `<div><b>Calendario romano:</b> ${escapeHtml(ed.roman || 'non disponibile')}</div><div><b>Calendario francescano:</b> ${escapeHtml(ed.franciscan || 'non disponibile')}</div>`;
  const items = (ed.items || []).filter(x => (sec === 'Tutte' || x.section === sec)
    && (!q || (x.title + ' ' + (x.summary || '')).toLocaleLowerCase('it').includes(q)));
  $('news').innerHTML = items.length ? items.map(x => {
    const url = safeUrl(x.url);
    return `<article class="card"><div class="meta">${escapeHtml(x.section || '')}</div><h2>${escapeHtml(x.title || '')}</h2>${x.summary ? `<p>${escapeHtml(x.summary)}</p>` : ''}<div class="meta">Fonte: ${escapeHtml(x.source || 'web')}${x.publishedDate ? ' · ' + escapeHtml(x.publishedDate) : ''}${url ? ` — <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Apri fonte</a>` : ''}</div></article>`;
  }).join('') : '<div class="error">Nessuna notizia datata disponibile per questo filtro.</div>';
  if (!busy) $('status').textContent = savedNotice();
  $('archiveInfo').textContent = `Archivio in questo browser: ${localCount()} edizioni registrate`;
}
function setBusy(value) {
  busy = value;
  $('rebuild').disabled = value || selectedDate > today();
  $('rebuild').textContent = value ? 'Ricostruzione in corso…' : 'Ricostruisci e registra';
  const retry = $('retry');
  if (retry) retry.disabled = value;
  $('status').setAttribute('aria-busy', String(value));
}
function begin(d) {
  controller?.abort();
  controller = new AbortController();
  const id = ++requestId;
  selectedDate = d;
  stop();
  $('date').value = d;
  $('date').max = today();
  $('next').disabled = d >= today();
  $('edition').textContent = `Edizione ${d}`;
  const url = new URL(location.href);
  url.searchParams.set('date', d);
  history.replaceState(null, '', url);
  setBusy(false);
  return id;
}
function missing(message) {
  $('liturgical').innerHTML = '';
  $('news').innerHTML = '<div class="error"><h2>Edizione non disponibile</h2><p>Seleziona una data e premi Ricostruisci e registra per cercare i titoli pubblicati quel giorno.</p><button id="retry">Ricostruisci e registra</button></div>';
  $('retry').onclick = () => rebuild(selectedDate);
  $('retry').disabled = selectedDate > today();
  $('status').textContent = message;
}
async function load(d, force = false) {
  if (!validDate(d)) { $('status').textContent = 'Scegli una data valida.'; return; }
  const id = begin(d);
  ed = null;
  $('liturgical').innerHTML = '';
  $('news').innerHTML = '';
  $('status').textContent = 'Caricamento dell’edizione…';
  let value = !force && localGet(d);
  if (!value && !force) value = window.ARCHIVE_DATA?.[d] || (window.INITIAL_DATA?.date === d ? window.INITIAL_DATA : null);
  // Refresh reconstructions created by the older engine, which lacked publication-day evidence.
  const outdated = value?.generated && value.items.some(item => item.publishedDate !== d) ? value : null;
  if (outdated) value = null;
  if (value) { ed = value; localSaved = localPut(value); render(); return; }
  try {
    const response = await fetch('/api/edition?date=' + encodeURIComponent(d), {cache: 'no-store', signal: controller.signal});
    value = await response.json();
    if (id !== requestId) return;
    if (!response.ok) {
      if (response.status === 404 && d === today()) {
        if (outdated) {ed = outdated; localSaved = true; render();}
        return rebuild(d);
      }
      throw Error(value.error || 'Servizio temporaneamente non disponibile.');
    }
    if (value.date !== d || !value.items?.length) throw Error('L’edizione ricevuta non corrisponde alla data scelta.');
    ed = value; localSaved = localPut(value); render();
  } catch (error) {
    if (id !== requestId) return;
    if (outdated) {
      ed = outdated; localSaved = true; render();
      $('status').textContent = 'Edizione precedente conservata. Per aggiornarla premi Ricostruisci e registra.';
      return;
    }
    missing(error instanceof Error ? error.message : String(error));
  }
}
async function rebuild(d = selectedDate) {
  if (!validDate(d) || d > today()) { $('status').textContent = 'Scegli una data valida, non futura.'; return; }
  const previous = ed?.date === d ? ed : null;
  const id = begin(d), currentController = controller;
  ed = previous;
  if (!ed) { $('news').innerHTML = ''; $('liturgical').innerHTML = ''; }
  setBusy(true);
  $('status').textContent = 'Ricerca delle fonti e controllo della data di pubblicazione…';
  const timeout = setTimeout(() => currentController.abort(), 65000);
  try {
    const response = await fetch('/api/rebuild?date=' + encodeURIComponent(d), {method: 'POST', cache: 'no-store', signal: currentController.signal});
    const value = await response.json();
    if (id !== requestId) return;
    if (!response.ok) throw Error(value.error || 'Ricostruzione temporaneamente non disponibile.');
    if (value.date !== d || !value.items?.length) throw Error('Nessuna notizia datata disponibile.');
    localSaved = localPut(value);
    ed = value;
    setBusy(false);
    render();
  } catch (error) {
    if (id !== requestId) return;
    setBusy(false);
    const message = error?.name === 'AbortError' ? 'La ricerca ha superato il tempo disponibile. Riprova più tardi.'
      : error instanceof Error ? error.message : String(error);
    if (previous) { ed = previous; render(); $('status').textContent = 'Ricostruzione non riuscita. L’edizione precedente è ancora disponibile. ' + message; }
    else missing('Ricostruzione non riuscita. ' + message);
  } finally {
    clearTimeout(timeout);
    if (id === requestId) setBusy(false);
  }
}
function voices() {
  if (!('speechSynthesis' in window)) return;
  const available = speechSynthesis.getVoices().filter(v => /^it[-_]/i.test(v.lang));
  available.sort((a, b) => score(b) - score(a));
  $('voice').innerHTML = available.map(v => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)}</option>`).join('');
  try { const saved = localStorage.getItem('voice'); if (saved) $('voice').value = saved; } catch {}
}
function score(voice) {
  return (/natural|neural|online/i.test(voice.name) ? 10 : 0) + (/microsoft|google/i.test(voice.name) ? 4 : 0) + (voice.lang === 'it-IT' ? 3 : 0);
}
function speechItems() {
  return (ed?.items || []).filter(x => (sec === 'Tutte' || x.section === sec)
    && (!q || (x.title + ' ' + (x.summary || '')).toLocaleLowerCase('it').includes(q)))
    .map(x => ttsText([x.title, x.summary, $('sources').checked ? 'Fonte ' + x.source : ''].filter(Boolean).join('. ') + '.')).filter(Boolean);
}
function speakNext(run = speechRun) {
  if (run !== speechRun) return;
  if (qi >= queue.length) { $('speechStatus').textContent = 'Lettura terminata'; return; }
  const utterance = new SpeechSynthesisUtterance(queue[qi++]);
  utterance.lang = 'it-IT'; utterance.rate = +$('rate').value;
  const voice = speechSynthesis.getVoices().find(x => x.voiceURI === $('voice').value);
  if (voice) utterance.voice = voice;
  utterance.onend = () => { if (run === speechRun) setTimeout(() => speakNext(run), 40); };
  utterance.onerror = () => { if (run === speechRun && !paused) speakNext(run); };
  speechSynthesis.speak(utterance);
  $('speechStatus').textContent = `Lettura ${qi}/${queue.length}`;
}
function read() {
  if (!('speechSynthesis' in window)) { $('speechStatus').textContent = 'Lettura vocale non disponibile in questo browser.'; return; }
  stop(); queue = speechItems(); speakNext();
}
function stop() {
  speechRun++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  queue = []; qi = 0; paused = false;
  $('pause').textContent = 'Ⅱ Pausa'; $('speechStatus').textContent = 'Lettura ferma';
}
$('read').onclick = read;
$('stop').onclick = stop;
$('pause').onclick = () => {
  if (!('speechSynthesis' in window) || !speechSynthesis.speaking) return;
  if (paused) { speechSynthesis.resume(); paused = false; $('pause').textContent = 'Ⅱ Pausa'; }
  else { speechSynthesis.pause(); paused = true; $('pause').textContent = '▶ Riprendi'; }
};
$('rate').oninput = event => {
  $('rateValue').textContent = (+event.target.value).toFixed(2).replace('.', ',') + '×';
  try { localStorage.setItem('rate', event.target.value); } catch {}
};
$('voice').onchange = event => { try { localStorage.setItem('voice', event.target.value); } catch {} };
$('search').oninput = event => { q = event.target.value.toLocaleLowerCase('it'); render(); };
$('sectionSelect').onchange = event => { sec = event.target.value; renderSections(); render(); };
$('menu').onclick = () => $('sidebar').classList.toggle('open');
$('theme').onclick = () => document.body.classList.toggle('dark');
$('larger').onclick = () => document.documentElement.style.setProperty('--fs', '19px');
$('smaller').onclick = () => document.documentElement.style.setProperty('--fs', '16px');
$('openDate').onclick = () => load($('date').value);
$('rebuild').onclick = () => rebuild($('date').value);
$('today').onclick = () => load(today());
$('prev').onclick = () => load(add(selectedDate, -1));
$('next').onclick = () => load(add(selectedDate, 1));
$('prevMonth').onclick = () => load(add(selectedDate, -1, 'Month'));
$('prevYear').onclick = () => load(add(selectedDate, -1, 'FullYear'));
renderSections();
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = voices;
voices();
try {
  const rate = localStorage.getItem('rate');
  if (rate) { $('rate').value = rate; $('rateValue').textContent = (+rate).toFixed(2).replace('.', ',') + '×'; }
} catch {}
const requestedDate = new URL(location.href).searchParams.get('date');
load(validDate(requestedDate || '') ? requestedDate : today());
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
