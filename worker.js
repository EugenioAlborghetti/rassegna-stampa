import { onRequestGet as editionGet } from './functions/api/edition.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
