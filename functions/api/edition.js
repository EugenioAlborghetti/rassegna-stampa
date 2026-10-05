const valid=/^\d{4}-\d{2}-\d{2}$/;

async function archivedEdition(request,env,date){
  if(!env.ASSETS) return null;
  try{
    const origin=new URL(request.url).origin;
    const r=await env.ASSETS.fetch(new Request(`${origin}/data/${date}.json`));
    if(!r.ok) return null;
    const data=await r.json();
    if(data && data.date===date && Array.isArray(data.items) && data.items.length){
      return data;
    }
  }catch(e){}
  return null;
}

export async function onRequestGet({request,env}){
  const u=new URL(request.url),date=u.searchParams.get('date')||'';
  if(!valid.test(date)) return Response.json({error:'Data non valida'},{status:400});
  const today=new Date().toISOString().slice(0,10);
  if(date>today) return Response.json({error:'Data futura'},{status:400});

  const k='edition:'+date;
  if(env.ARCHIVE){
    const x=await env.ARCHIVE.get(k,'json');
    if(x) return Response.json(x,{headers:{'Cache-Control':'public,max-age=3600'}});
  }

  const edition=await archivedEdition(request,env,date);
  if(edition){
    if(env.ARCHIVE) await env.ARCHIVE.put(k,JSON.stringify(edition));
    return Response.json({...edition,generated:false,engine:'Archivio editoriale'},
      {headers:{'Cache-Control':'public,max-age=3600'}});
  }

  return Response.json({
    error:'Edizione non ancora pubblicata',
    date,
    details:['La PWA utilizza ora esclusivamente edizioni editoriali preparate e archiviate. Nessuna interrogazione automatica a GDELT o Google News viene eseguita.']
  },{status:404,headers:{'Cache-Control':'public,max-age=300'}});
}
