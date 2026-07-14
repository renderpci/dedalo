/**
 * `POST /batch` — run up to 20 read-only GETs in one round trip (the v2 replacement for
 * v1's `combi`).
 *
 * Each sub-query goes through `router.dispatch()`, the SAME route table the public HTTP
 * surface uses, but in-process: no socket, no second trip through auth or rate limiting
 * (the batch request itself already paid for those). That reuse is the whole design — a
 * batched route cannot drift from its standalone self, because it IS its standalone self.
 *
 * ISOLATION is the contract: one bad query must never cost its 19 siblings their results.
 * So the response is always 200 with one entry per query, each carrying the status the
 * equivalent standalone GET would have produced and either `data` or an RFC 9457
 * `problem`. `dispatch` already converts route errors into problem responses; the only
 * thing this file must catch is the pre-dispatch validation it does itself.
 */

import { dispatch } from '../router';
import { ValidationError } from '../errors';
import type { BatchResponse, BatchResult } from '../db/types';
import type { BatchRequest, BatchQuery } from '../validators';

// Batch executes GET data routes only; meta/streaming endpoints are excluded.
//
// Each for its own reason, and the reasons are worth knowing:
//   /batch        — would RECURSE. A batch containing batches nests without bound, and 20
//                   queries of 20 queries is 400 for the price of one request.
//   /mcp          — is a STREAMING transport (POST, text/event-stream), not a JSON data
//                   route. Its body is a live stream; `res.json()` below has nothing to read.
//   /docs, /openapi.yaml, /health, /favicon.ico
//                 — are META, not data: HTML, YAML, a liveness probe, an icon. Nothing in
//                   them is a resource a client would want to correlate with a record set,
//                   and none of them return the `{data}` envelope a batch result implies.
//
// Prefix-matched (and case-insensitively) so that `/docs/swagger` is covered by `/docs`.
const FORBIDDEN_PREFIXES = ['/batch', '/mcp', '/docs', '/openapi.yaml', '/health', '/favicon.ico'];

function validateBatchPath(path: string): void {
  // `path` is the bare route; everything else belongs in `params`. Enforced rather than
  // merged because a query string in the path plus a `params` object gives two sources of
  // truth for the same parameter, with no defined winner.
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

// Array values become REPEATED keys, not a comma-joined string — that is what lets the
// bracketed filter DSL survive the trip through JSON: {"filter[lang][in]": ["lg-eng",
// "lg-spa"]} has to arrive at the route exactly as the URL form would have delivered it.
// URLSearchParams also does the percent-encoding, so a filter's brackets are handled.
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

/**
 * Queries run CONCURRENTLY (they are independent reads), while `Promise.all` still hands
 * results back in request order — so a client may correlate by index or by the echoed
 * `id`, and both are correct. Note the concurrency is per batch and unbounded: 20 queries
 * means up to 20 simultaneous connections from a single request.
 */
export async function executeBatch(request: BatchRequest): Promise<BatchResponse> {
  const results: BatchResult[] = await Promise.all(
    request.queries.map(async (query: BatchQuery): Promise<BatchResult> => {
      try {
        validateBatchPath(query.path);

        const res = await dispatch('GET', query.path + buildQueryString(query.params));
        const body = await res.json().catch(() => undefined);

        // The status is the inner route's, verbatim: a 404 for one unknown table sits next
        // to its siblings' 200s. `data` holds the route's COMPLETE envelope, so a record
        // list appears nested as `data.data` with its own `pagination`.
        if (res.ok) {
          return { id: query.id, status: res.status, data: body };
        }
        return { id: query.id, status: res.status, problem: body };
      } catch (error) {
        // validateBatchPath failures: surface as an inline problem.
        // Hand-built here because these never reached `dispatch`, which is what normally
        // renders an error as problem+json. Anything else is a genuine server fault and is
        // re-thrown to fail the whole batch — isolating a bug would only hide it.
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
