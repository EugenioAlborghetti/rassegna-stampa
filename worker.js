import { onRequestGet as editionGet } from './functions/api/edition.js';
import { onRequestPost as rebuildPost } from './functions/api/rebuild.js';
import { BUILD } from './lib/editorial.js';
import { onRequestGet as liturgyGet } from './functions/api/liturgy.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/liturgy') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', {status:405,headers:{Allow:'GET'}});
      return liturgyGet({request});
    }
    if (url.pathname === '/api/version') return Response.json({build:BUILD,historicalSearch:'Daily archives and date-filtered RSS',concurrency:3,timeoutMs:7000,timeZone:'Europe/Rome',serverArchive:!!env.ARCHIVE,serverTime:new Date().toISOString()},{headers:{'Cache-Control':'no-store, max-age=0'}});

    if (url.pathname === '/api/rebuild') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', {status:405});
      try { return await rebuildPost({request,env}); } catch(error) { console.error('rebuild error',error); return Response.json({error:'Ricostruzione temporaneamente non disponibile'},{status:503}); }
    }

    if (url.pathname === '/api/edition') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      try {
        return await editionGet({ request, env, params: {}, data: {}, waitUntil: ctx.waitUntil.bind(ctx), next: () => env.ASSETS.fetch(request) });
      } catch (error) {
        console.error('edition API error', error);
        return Response.json({ error: 'Errore interno del motore editoriale' }, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
