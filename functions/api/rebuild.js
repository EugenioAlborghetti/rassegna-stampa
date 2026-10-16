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
const field=(s,k)=>decode((s.match(new RegExp('<'+k+'(?:\s[^>]*)?>([\s\S]*?)</'+k+'>','i'))||[])[1]||'').trim();
const format=d=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}).format(d);
export async function onRequestPost({request}){
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))return Response.json({error:'Data non valida'},{status:400});
  const now=new Date(),target=new Date(date+'T12:00:00Z');
  if(target.getTime()>now.getTime()+12*3600000)return Response.json({error:'Data futura'},{status:400});
  const after=new Date(target);after.setUTCDate(after.getUTCDate()+1);
  const end=after.toISOString().slice(0,10);
  const diagnostics=[];
  const results=await Promise.all(sections.map(async ([section,query])=>{
    const q=query+' after:'+date+' before:'+end;
    const url='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=it&gl=IT&ceid=IT:it';
    try{
      const r=await fetch(url,{headers:{'Accept':'application/rss+xml, application/xml, text/xml'}});
      if(!r.ok){diagnostics.push(section+': HTTP '+r.status);return []}
      const xml=await r.text();
      const matches=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      if(!matches.length)diagnostics.push(section+': RSS senza articoli');
      return matches.slice(0,20).map(m=>{
        const raw=m[1],title=field(raw,'title'),link=field(raw,'link'),source=field(raw,'source')||'Google News',pub=field(raw,'pubDate');
        const stamp=Date.parse(pub);
        if(!title||!link||!Number.isFinite(stamp)||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp))!==date)return null;
        const clean=title.endsWith(' - '+source)?title.slice(0,-source.length-3):title;
        return {section,title:clean,summary:'Titolo pubblicato il '+format(target)+' da '+source+'. Apri la fonte per leggere i dettagli verificati: la ricostruzione automatica non dispone di una sintesi editoriale confermata.',source,url:link};
      }).filter(Boolean);
    }catch(e){diagnostics.push(section+': '+String(e).slice(0,100));return []}
  }));
  const seen=new Set(),items=results.flat().filter(x=>{const k=x.title.toLocaleLowerCase('it').replace(/[^a-zà-ÿ0-9]/g,'').slice(0,85);if(seen.has(k))return false;seen.add(k);return true});
  if(items.length<3)return Response.json({error:'Fonti insufficienti: '+items.length+' notizie valide. '+diagnostics.slice(0,3).join('; '),date,found:items.length},{status:503});
  const day=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'Europe/Rome'}).format(target);
  const edition={date,day,dateLabel:format(target),updated:'ricostruita il '+new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(now),roman:'Memoria liturgica non verificata',franciscan:'Memoria francescana non verificata',items,generated:true,engine:'Ricostruzione da titoli di fonti indicizzate',scope:'Titoli e link, non sintesi giornalistiche verificate'};
  return Response.json(edition,{headers:{'Cache-Control':'no-store'}});
}