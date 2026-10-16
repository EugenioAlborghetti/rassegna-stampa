const sections=[
['In primo piano','notizie Italia mondo'],
['Bergamo città','Bergamo città cronaca'],
['Provincia di Bergamo','provincia di Bergamo notizie'],
['Lombardia','Lombardia cronaca'],
['Italia - Politica e istituzioni','politica italiana governo parlamento'],
['Economia, lavoro, imprese, fisco e pensioni','economia lavoro Italia'],
['Mondo e geopolitica','notizie mondo geopolitica'],
['Scienza, medicina e salute pubblica','scienza salute ricerca'],
['Tecnologia, intelligenza artificiale, digitale e cybersecurity','tecnologia intelligenza artificiale'],
['Scuola, università, formazione e lavoro educativo','scuola università Italia'],
['Ambiente, clima, energia e trasporti','ambiente energia trasporti'],
['Cultura, libri, spettacolo e società','cultura spettacolo Italia'],
['Sport','sport calcio Italia']
];
const decode=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const field=(s,k)=>{const start=s.indexOf('<'+k);if(start<0)return '';const a=s.indexOf('>',start);if(a<0)return '';const b=s.indexOf('</'+k+'>',a+1);return b<0?'':decode(s.slice(a+1,b)).trim()};
const format=d=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}).format(d);
export async function onRequestPost({request}){
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))return Response.json({error:'Data non valida'},{status:400});
  const now=new Date(),target=new Date(date+'T12:00:00Z');
  if(target.getTime()>now.getTime()+12*3600000)return Response.json({error:'Data futura'},{status:400});
  const after=new Date(target);after.setUTCDate(after.getUTCDate()+1);
  const end=after.toISOString().slice(0,10);
  const diagnostics=[];
  const feeds=[
    ['In primo piano','ANSA','https://www.ansa.it/sito/ansait_rss.xml'],
    ['In primo piano','RaiNews','https://www.rainews.it/rss/tutti'],
    ['In primo piano','BBC Italia','https://feeds.bbci.co.uk/news/world/rss.xml'],
    ['Mondo e geopolitica','Reuters','https://feeds.reuters.com/reuters/worldNews'],
    ['Sport','RaiNews Sport','https://www.rainews.it/rss/sport']
  ];
  const dayRome=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
  async function parseFeed(section,name,url){
    try{
      const r=await fetch(url,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml'},redirect:'follow',signal:AbortSignal.timeout(9000)});
      if(!r.ok){diagnostics.push(name+': HTTP '+r.status);return []}
      const xml=await r.text();
      const blocks=[...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0,120);
      if(!blocks.length)diagnostics.push(name+': nessun elemento RSS');
      return blocks.map(m=>{
        const raw=m[1],title=field(raw,'title');
        const pub=field(raw,'pubDate')||field(raw,'published')||field(raw,'updated');
        let link=field(raw,'link');
        if(!link){const tag=raw.match(/<link[^>]*href=["']([^"']+)["']/i);if(tag)link=tag[1]}
        const stamp=Date.parse(pub);
        if(!title||!link||!Number.isFinite(stamp)||dayRome(stamp)!==date)return null;
        const summary=field(raw,'description')||field(raw,'summary');
        return {section,title,summary:summary&&summary.length>35?summary.slice(0,420):'Notizia pubblicata da '+name+' il '+format(target)+'. Apri la fonte per leggere il testo completo.',source:name,url:link};
      }).filter(Boolean);
    }catch(e){diagnostics.push(name+': '+String(e).slice(0,100));return []}
  }
  const results=await Promise.all(feeds.map(x=>parseFeed(...x)));
  // GDELT DOC 2.0 supports date-scoped historical searches when live RSS has rolled over.
  if(results.flat().length<3){
    const searches=[
      ['In primo piano','Italia'],
      ['Bergamo città','Bergamo'],
      ['Economia, lavoro, imprese, fisco e pensioni','economia']
    ];
    const start=date.replace(/-/g,'')+'000000';
    const end=date.replace(/-/g,'')+'235959';
    for(const [section,query] of searches){
      try{
        const params=new URLSearchParams({query:query+' sourcelang:italian',mode:'artlist',format:'json',maxrecords:'20',startdatetime:start,enddatetime:end});
        const r=await fetch('https://api.gdeltproject.org/api/v2/doc/doc?'+params,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
        if(!r.ok){diagnostics.push('GDELT '+query+': HTTP '+r.status);continue}
        const data=await r.json();
        const found=(data.articles||[]).filter(a=>a.url&&a.title&&a.seendate&&a.seendate.slice(0,8)===date.replace(/-/g,'')).map(a=>({
          section,title:a.title,summary:'Articolo indicizzato il '+format(target)+'. Consultare la fonte originale per i dettagli.',
          source:a.domain||'Archivio GDELT',url:a.url
        }));
        results.push(found);
        if(results.flat().length>=3)break;
      }catch(e){diagnostics.push('GDELT '+query+': '+String(e).slice(0,90))}
    }
  }
  const seen=new Set(),items=results.flat().filter(x=>{const k=x.title.toLocaleLowerCase('it').replace(/[^a-zà-ÿ0-9]/g,'').slice(0,85);if(seen.has(k))return false;seen.add(k);return true});
  if(items.length<3)return Response.json({error:'Fonti insufficienti: '+items.length+' notizie valide. '+diagnostics.filter(x=>x.startsWith('GDELT')).concat(diagnostics.filter(x=>!x.startsWith('GDELT'))).slice(0,5).join('; '),date,found:items.length},{status:503});
  const day=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'Europe/Rome'}).format(target);
  const edition={date,day,dateLabel:format(target),updated:'ricostruita il '+new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(now),roman:'Memoria liturgica non verificata',franciscan:'Memoria francescana non verificata',items,generated:true,engine:'Ricostruzione da titoli di fonti indicizzate',scope:'Titoli e link, non sintesi giornalistiche verificate'};
  return Response.json(edition,{headers:{'Cache-Control':'no-store'}});
}