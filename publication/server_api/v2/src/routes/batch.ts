import { executeBatch } from '../services/batch.service';
import { batchRequestSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

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

  const result = await executeBatch(parsed);
  return json(result);
}
