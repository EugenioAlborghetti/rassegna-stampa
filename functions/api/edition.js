const valid=/^\d{4}-\d{2}-\d{2}$/;
const enc=encodeURIComponent;

const SECTIONS=[
  ['Bergamo città',/\bbergamo\b/i],
  ['Provincia di Bergamo',/\b(seriate|treviglio|dalmine|romano di lombardia|clusone|lover[e]?|val seriana|val brembana|bergamasca)\b/i],
  ['Lombardia',/\b(lombardia|milano|brescia|monza|como|lecco|varese|pavia|cremona|mantova|sondrio)\b/i],
  ['Italia - Politica e istituzioni',/\b(governo|parlamento|senato|camera|ministero|ministro|premier|presidente|politic|elezion)\w*/i],
  ['Italia - Cronaca e giustizia',/\b(cronaca|tribunale|procura|arrest|inchiesta|indagine|giustizia|carabinieri|polizia)\w*/i],
  ['Economia, lavoro, imprese, fisco e pensioni',/\b(econom|lavor|impres|fisco|pension|occupaz|stipend|inflaz|industr)\w*/i],
  ['Europa e Unione europea',/\b(europa|ue|unione europea|bruxelles|commissione europea|parlamento europeo)\b/i],
  ['Scienza, medicina e salute pubblica',/\b(scienz|medic|salute|sanit|ospedal|ricerca|farmac|virus|vaccin)\w*/i],
  ['Tecnologia, intelligenza artificiale, digitale e cybersecurity',/\b(tecnolog|intelligenza artificiale|\bai\b|digitale|cyber|software|internet|robot)\w*/i],
  ['Scuola, università, formazione e lavoro educativo',/\b(scuol|universit|student|docent|istruz|formaz)\w*/i],
  ['Ambiente, clima, energia e trasporti',/\b(ambient|clima|energia|trasport|treno|ferrovi|aeroport|mobilit|meteo)\w*/i],
  ['Cultura, libri, spettacolo e società',/\b(cultur|libro|cinema|teatro|musica|spettacol|festival|mostra)\w*/i],
  ['Sport',/\b(sport|calcio|atalanta|serie a|champions|tennis|ciclismo|formula 1)\b/i],
  ['Mercati e finanza',/\b(mercat|borsa|finanza|spread|azioni|obbligaz|bce|tassi)\w*/i],
  ['Mondo e geopolitica',/\b(ucraina|russia|usa|stati uniti|cina|israele|gaza|medio oriente|nato|guerra|geopolit)\w*/i]
];

function range(d){d=d.replaceAll('-','');return[d+'000000',d+'235959']}
function source(d=''){return d.replace(/^www\./,'').split('.')[0]||'Fonte web'}
function unique(a){let s=new Set;return a.filter(x=>{let k=(x.url||x.title||'').toLowerCase().replace(/[#?].*$/,'');if(!k||s.has(k))return false;s.add(k);return true})}
function classify(title=''){
  for(const [section,re] of SECTIONS) if(re.test(title)) return section;
  return 'In primo piano';
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function gdelt(date){
  const [a,b]=range(date);
  // Una sola interrogazione ampia: evita le 16 richieste parallele che causavano HTTP 429.
  // GDELT DOC consente fino a 250 risultati in ArticleList; 75 bastano per una rassegna giornaliera.
  const query='sourcecountry:italy';
  const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc(query)}&mode=ArtList&maxrecords=75&format=json&startdatetime=${a}&enddatetime=${b}&sort=DateDesc`;
  let lastError='';
  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'RassegnaStampa/2.9','Accept':'application/json'}});
      if(r.status===429){
        lastError='GDELT HTTP 429: limite temporaneo di richieste';
        if(attempt===0){await sleep(1800);continue}
        return {items:[],error:lastError,status:503};
      }
      if(!r.ok)return {items:[],error:`GDELT HTTP ${r.status}`,status:502};
      const text=await r.text(); let j;
      try{j=JSON.parse(text)}catch{return {items:[],error:'Risposta GDELT non JSON',status:502}}
      const items=unique((j.articles||[]).map(x=>{
        const title=x.title||'Notizia senza titolo';
        return {section:classify(title),title,summary:`Notizia del ${date.split('-').reverse().join('/')} individuata nell'archivio GDELT. Apri la fonte originale per i dettagli e il testo disponibile.`,source:source(x.domain),url:x.url||''};
      })).slice(0,50);
      return {items,error:null,status:200};
    }catch(e){lastError='Connessione GDELT non riuscita'}
  }
  return {items:[],error:lastError||'GDELT non disponibile',status:503};
}

export async function onRequestGet({request,env}){
  const u=new URL(request.url),date=u.searchParams.get('date')||'';
  if(!valid.test(date))return Response.json({error:'Data non valida'},{status:400});
  const today=new Date().toISOString().slice(0,10);
  if(date>today)return Response.json({error:'Data futura'},{status:400});

  const k='edition:'+date;
  if(env.ARCHIVE){const x=await env.ARCHIVE.get(k,'json');if(x)return Response.json(x,{headers:{'Cache-Control':'public,max-age=3600'}})}

  const result=await gdelt(date);
  if(!result.items.length){
    return Response.json({error:'Nessuna fonte reperita per la data richiesta',details:[result.error||'GDELT non ha restituito articoli'],date},{status:result.status||404,headers:{'Cache-Control':'public,max-age=120'}});
  }

  const d=new Date(date+'T12:00:00Z');
  const day=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'UTC'}).format(d);
  const label=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d);
  const edition={date,day:day[0].toUpperCase()+day.slice(1),dateLabel:label,updated:'ricostruita automaticamente da archivio web',roman:'Memoria liturgica non ricostruita automaticamente',franciscan:'Memoria liturgica francescana non ricostruita automaticamente',generated:true,items:result.items};
  if(env.ARCHIVE)await env.ARCHIVE.put(k,JSON.stringify(edition));
  return Response.json(edition,{headers:{'Cache-Control':'public,max-age=3600'}});
}
