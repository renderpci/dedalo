import { executeBatch } from '../services/batch.service';
import { batchRequestSchema } from '../validators';
import { json } from '../utils/response';
import { HttpError, ValidationError } from '../errors';

export async function handleBatch(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed. Use POST.');
  }

  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new ValidationError('Content-Type must be application/json');
  }

  const body = await req.json();

  const parsed = batchRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ValidationError(message);
  }

  const result = await executeBatch(parsed.data);
  return json(result);
}
