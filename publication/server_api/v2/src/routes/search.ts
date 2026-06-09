import { search } from '../services/search.service';
import type { SearchParams } from '../db/types';
import { HttpError } from '../middleware/error-handler';

export async function handleSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  const searchParams: SearchParams = {
    mode: (params.get('mode') || 'records') as SearchParams['mode'],
    table: params.get('table') || '',
    db_name: params.get('db_name') || undefined,
    lang: params.get('lang') || undefined,
    fields: params.get('fields') || undefined,
    where: params.get('where') || undefined,
    order: params.get('order') || undefined,
    limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
    offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : undefined,
    section_id: params.get('section_id') || undefined,
    resolve_portals: params.get('resolve_portals') === 'true',
    q: params.get('q') || undefined,
    column: params.get('column') || undefined,
    terms: params.get('terms') || undefined,
    max_characters: params.get('max_characters') ? parseInt(params.get('max_characters')!, 10) : undefined,
    max_occurrences: params.get('max_occurrences') ? parseInt(params.get('max_occurrences')!, 10) : undefined,
  };

  if (!searchParams.table) {
    throw new HttpError(400, 'Missing required parameter: table');
  }

  const result = await search(searchParams);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
