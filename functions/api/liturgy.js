import {validDate, json} from '../../lib/editorial.js';
import {getLiturgy} from '../../lib/liturgy.js';

export async function onRequestGet({request}) {
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!validDate(date)) return json({error: 'Data non valida'}, 400);
  return json(await getLiturgy(date));
}
