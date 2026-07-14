/**
 * `POST /batch` — up to 20 GET data queries in one round trip.
 *
 * The only POST on a read-only API: the verb is dictated by the request BODY,
 * not by any write. Each sub-query is re-entered through the internal router
 * (`dispatch`), so a batched query and its standalone GET run the exact same
 * handler and produce the exact same envelope — the batch adds no second
 * implementation of anything.
 *
 * The contract that makes it usable is PER-QUERY ISOLATION: every result
 * carries its own HTTP status, and a sub-query that fails becomes an inline
 * RFC 9457 `problem` next to its siblings' `data` instead of failing the batch.
 * The batch response itself is a 200. A client correlates results by the `id`
 * it supplied (unique within the batch, enforced by the schema).
 *
 * Only GET DATA routes are batchable — meta and streaming endpoints (/batch
 * itself, /mcp, /docs, /openapi.yaml, /health) are refused in batch.service.
 *
 * See docs/diffusion/publication_api/v2/batch.md for the full request shape.
 */

import { executeBatch } from '../services/batch.service';
import { batchRequestSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';
import { chargeRateLimit } from '../security/rate-limiter';

export async function handleBatch(req: Request): Promise<Response> {
  // Rejecting anything but JSON up front: this is the one route that reads a
  // body, and the body is the request.
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new ValidationError('Content-Type must be application/json');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // A parse failure is the CLIENT's malformed body — a 400, never a 500.
    throw new ValidationError('Request body must be valid JSON');
  }

  const parsed = batchRequestSchema.parse(body);

  // The batch itself already spent one token in routeRequest; its sub-queries run
  // through dispatch(), which bypasses the HTTP-level limiter. Charge the remainder
  // up front so N batched reads cost the same as N direct reads — otherwise /batch
  // is a 20× amplifier on the published database.
  chargeRateLimit(req, parsed.queries.length - 1);

  const result = await executeBatch(parsed);
  return json(result);
}
