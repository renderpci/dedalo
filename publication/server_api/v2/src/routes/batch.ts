import { executeBatch } from '../services/batch.service';
import type { BatchRequest } from '../db/types';
import { HttpError } from '../middleware/error-handler';
import { config } from '../config';

export async function handleBatch(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed. Use POST.');
  }

  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new HttpError(400, 'Content-Type must be application/json');
  }

  const body = await req.json() as BatchRequest;

  if (!body.queries || !Array.isArray(body.queries)) {
    throw new HttpError(400, 'Missing or invalid "queries" array');
  }

  if (body.queries.length > 20) {
    throw new HttpError(400, 'Maximum 20 queries per batch request');
  }

  const result = await executeBatch(body);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
