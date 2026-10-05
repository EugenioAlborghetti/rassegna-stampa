const C=[['In primo piano','Italia'],['Bergamo città','Bergamo'],['Provincia di Bergamo','Bergamo'],['Lombardia','Lombardia'],['Italia - Politica e istituzioni','Italia governo'],['Italia - Cronaca e giustizia','Italia cronaca'],['Economia, lavoro, imprese, fisco e pensioni','Italia economia'],['Mondo e geopolitica','geopolitics'],['Europa e Unione europea','Europe'],['Scienza, medicina e salute pubblica','science health'],['Tecnologia, intelligenza artificiale, digitale e cybersecurity','artificial intelligence'],['Scuola, università, formazione e lavoro educativo','Italia scuola'],['Ambiente, clima, energia e trasporti','climate energy'],['Cultura, libri, spettacolo e società','Italia cultura'],['Sport','Italia calcio'],['Mercati e finanza','Italy finance']];
const valid=/^\d{4}-\d{2}-\d{2}$/;
const enc=encodeURIComponent;
function range(d){d=d.replaceAll('-','');return[d+'000000',d+'235959']}
function source(d=''){return d.replace(/^www\./,'').split('.')[0]||'Fonte web'}
function unique(a){let s=new Set;return a.filter(x=>{let k=(x.url||x.title||'').toLowerCase().replace(/[#?].*$/,'');if(!k||s.has(k))return false;s.add(k);return true})}
function normalizeQuery(q){const p=q.trim().split(/\s+OR\s+/i).filter(Boolean);return p.length>1?'('+p.join(' OR ')+')':q}
async function search(section,q,date){let[a,b]=range(date),query=normalizeQuery(q),u=`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc(query)}&mode=ArtList&maxrecords=10&format=json&startdatetime=${a}&enddatetime=${b}&sort=HybridRel`;
  try{
    let r=await fetch(u,{headers:{'User-Agent':'RassegnaStampa/2.8','Accept':'application/json'}});
    if(!r.ok)return {items:[],error:`GDELT HTTP ${r.status}`};
    let text=await r.text(),j;
    try{j=JSON.parse(text)}catch{return {items:[],error:'Risposta GDELT non JSON'}}
    return {items:(j.articles||[]).slice(0,5).map(x=>({section,title:x.title||'Notizia senza titolo',summary:`Notizia del ${date.split('-').reverse().join('/')} individuata nell'archivio storico. Il collegamento apre la fonte originale per dettagli e testo disponibile.`,source:source(x.domain),url:x.url||''})),error:null};
  }catch(e){return {items:[],error:'Connessione GDELT non riuscita'}}
}
export async function onRequestGet({request,env}){let u=new URL(request.url),date=u.searchParams.get('date')||'';
  if(!valid.test(date))return Response.json({error:'Data non valida'},{status:400});
  let today=new Date().toISOString().slice(0,10);if(date>today)return Response.json({error:'Data futura'},{status:400});
  let k='edition:'+date;if(env.ARCHIVE){let x=await env.ARCHIVE.get(k,'json');if(x)return Response.json(x)}
  let results=await Promise.all(C.map(([s,q])=>search(s,q,date))),items=unique(results.flatMap(x=>x.items)).slice(0,50),errors=[...new Set(results.map(x=>x.error).filter(Boolean))];
  if(!items.length)return Response.json({error:'Nessuna fonte reperita per la data richiesta',details:errors.length?errors:['GDELT non ha restituito articoli per le ricerche eseguite'],date},{status:404,headers:{'Cache-Control':'no-store'}});
  let d=new Date(date+'T12:00:00Z'),day=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'UTC'}).format(d),label=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d),edition={date,day:day[0].toUpperCase()+day.slice(1),dateLabel:label,updated:'ricostruita automaticamente da archivio web',roman:'Memoria liturgica non ricostruita automaticamente',franciscan:'Memoria liturgica francescana non ricostruita automaticamente',generated:true,items};
  if(env.ARCHIVE)await env.ARCHIVE.put(k,JSON.stringify(edition));return Response.json(edition,{headers:{'Cache-Control':'public,max-age=300'}})
}