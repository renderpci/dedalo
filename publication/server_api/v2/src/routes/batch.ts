import { executeBatch } from '../services/batch.service';
import { batchRequestSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';
import { chargeRateLimit } from '../security/rate-limiter';

export async function handleBatch(req: Request): Promise<Response> {
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new ValidationError('Content-Type must be application/json');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
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
