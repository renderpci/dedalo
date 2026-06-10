import { dispatch } from '../router';
import { ValidationError } from '../errors';
import type { BatchResponse, BatchResult } from '../db/types';
import type { BatchRequest, BatchQuery } from '../validators';

// Batch executes GET data routes only; meta/streaming endpoints are excluded.
const FORBIDDEN_PREFIXES = ['/batch', '/mcp', '/docs', '/openapi.yaml', '/health', '/favicon.ico'];

function validateBatchPath(path: string): void {
  if (path.includes('?')) {
    throw new ValidationError(`Batch path must not contain a query string; use "params" instead: ${path}`);
  }
  const normalized = path.toLowerCase();
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      throw new ValidationError(`Endpoint not allowed in batch: ${path}`);
    }
  }
}

function buildQueryString(params: BatchQuery['params']): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, String(item));
    } else {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function executeBatch(request: BatchRequest): Promise<BatchResponse> {
  const results: BatchResult[] = await Promise.all(
    request.queries.map(async (query: BatchQuery): Promise<BatchResult> => {
      try {
        validateBatchPath(query.path);

        const res = await dispatch('GET', query.path + buildQueryString(query.params));
        const body = await res.json().catch(() => undefined);

        if (res.ok) {
          return { id: query.id, status: res.status, data: body };
        }
        return { id: query.id, status: res.status, problem: body };
      } catch (error) {
        // validateBatchPath failures: surface as an inline problem
        if (error instanceof ValidationError) {
          return {
            id: query.id,
            status: error.status,
            problem: { type: error.type, title: error.title, status: error.status, detail: error.detail },
          };
        }
        throw error;
      }
    }),
  );

  return { results };
}
