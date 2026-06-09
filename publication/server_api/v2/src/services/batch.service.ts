import { search } from './search.service';
import { getSchema } from './schema.service';
import { getAvIndexationFragment } from './av-indexation.service';
import { ValidationError } from '../errors';
import type { BatchResponse, BatchResult } from '../db/types';
import type { BatchRequest, BatchQuery } from '../validators';

export async function executeBatch(request: BatchRequest): Promise<BatchResponse> {
  const results = await Promise.allSettled(
    request.queries.map(async (query: BatchQuery) => {
      try {
        const data = await executeSingleQuery(query);
        return { id: query.id, status: 200, data };
      } catch (error) {
        const status = error instanceof Error && 'statusCode' in error
          ? (error as any).statusCode
          : 500;
        return {
          id: query.id,
          status,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
  );

  return {
    results: results.map((result: PromiseSettledResult<BatchResult>) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        id: 'unknown',
        status: 500,
        error: result.reason?.message || 'Unknown error',
      };
    }),
  };
}

async function executeSingleQuery(query: BatchQuery): Promise<unknown> {
  const params = query.params as Record<string, unknown>;

  switch (query.endpoint) {
    case '/schema':
      return getSchema(params.table as string | undefined);

    case '/search': {
      const mode = (params.mode as string) || 'records';
      return search({
        mode: mode as any,
        table: params.table as string,
        fields: params.fields as string | undefined,
        filter: params.filter as string | undefined,
        order: params.order as string | undefined,
        limit: params.limit as number | undefined,
        offset: params.offset as number | undefined,
        section_id: params.section_id as string | undefined,
        lang: params.lang as string | undefined,
        q: params.q as string | undefined,
        column: params.column as string | undefined,
        terms: params.terms as string | undefined,
        max_characters: params.max_characters as number | undefined,
        max_occurrences: params.max_occurrences as number | undefined,
      } as any);
    }

    case '/av-indexation-fragment':
      return getAvIndexationFragment({
        section_id: params.section_id as number,
        section_tipo: params.section_tipo as string | undefined,
        component_tipo: params.component_tipo as string | undefined,
        tag_id: params.tag_id as number | undefined,
        tc_in: params.tc_in as number | undefined,
        tc_out: params.tc_out as number | undefined,
      });

    default:
      throw new ValidationError(`Unknown endpoint: ${query.endpoint}`);
  }
}
