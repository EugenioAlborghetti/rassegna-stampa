const valid=/^\d{4}-\d{2}-\d{2}$/;
const repo='https://raw.githubusercontent.com/EugenioAlborghetti/rassegna-stampa/main/data/';
const headers={'Cache-Control':'no-store'};
function usable(x,date){return x&&x.date===date&&Array.isArray(x.items)&&x.items.length>0}
async function fromGitHub(date){
  try{
    const response=await fetch(repo+date+'.json',{headers:{'Accept':'application/json'},cf:{cacheTtl:0}});
    if(!response.ok)return null;
    const edition=await response.json();
    return usable(edition,date)?edition:null;
  }catch{return null}
}
async function fromAssets(request,env,date){
  if(!env.ASSETS)return null;
  try{
    const origin=new URL(request.url).origin;
    const response=await env.ASSETS.fetch(new Request(origin+'/data/'+date+'.json'));
    if(!response.ok)return null;
    const edition=await response.json();
    return usable(edition,date)?edition:null;
  }catch{return null}
}
export async function onRequestGet({request,env}){
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!valid.test(date))return Response.json({error:'Data non valida'},{status:400,headers});
  const today=new Date().toISOString().slice(0,10);
  if(date>today)return Response.json({error:'Data futura'},{status:400,headers});
  // GitHub is authoritative: newly published or updated editions are visible without redeploy.
  let edition=await fromGitHub(date);
  let engine='GitHub';
  if(!edition){edition=await fromAssets(request,env,date);engine='Archivio distribuito'}
  if(!edition&&env.ARCHIVE){try{edition=await env.ARCHIVE.get('edition:'+date,'json');engine='Archivio locale'}catch{}}
  if(usable(edition,date))return Response.json({...edition,generated:false,engine},{headers});
  return Response.json({error:'Edizione non ancora pubblicata',date},{status:404,headers});
}
