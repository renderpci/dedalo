import type { BatchRequest, BatchResponse, BatchResult } from '../db/types';
import { search } from './search.service';
import { getSchema } from './schema.service';
import { getAvIndexationFragment } from './av-indexation.service';

export async function executeBatch(request: BatchRequest): Promise<BatchResponse> {
  const results = await Promise.allSettled(
    request.queries.map(async (query) => {
      try {
        const data = await executeSingleQuery(query.endpoint, query.params);
        return {
          id: query.id,
          status: 200,
          data,
        };
      } catch (error) {
        return {
          id: query.id,
          status: error instanceof Error && 'status' in error ? (error as any).status : 500,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  return {
    results: results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          id: 'unknown',
          status: 500,
          error: result.reason?.message || 'Unknown error',
        };
      }
    }),
  };
}

async function executeSingleQuery(endpoint: string, params: Record<string, any>): Promise<any> {
  switch (endpoint) {
    case '/schema':
      return getSchema(params.table);

    case '/search':
      return search({
        mode: params.mode || 'records',
        table: params.table,
        db_name: params.db_name,
        lang: params.lang,
        fields: params.fields,
        where: params.where,
        order: params.order,
        limit: params.limit,
        offset: params.offset,
        section_id: params.section_id,
        resolve_portals: params.resolve_portals,
        q: params.q,
        column: params.column,
        terms: params.terms,
        max_characters: params.max_characters,
        max_occurrences: params.max_occurrences,
      });

    case '/av-indexation-fragment':
      return getAvIndexationFragment({
        section_id: params.section_id,
        section_tipo: params.section_tipo,
        component_tipo: params.component_tipo,
        tag_id: params.tag_id,
        tc_in: params.tc_in,
        tc_out: params.tc_out,
      });

    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
}
