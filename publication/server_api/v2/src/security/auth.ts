import { apiKeys } from '../config';
import { UnauthorizedError } from '../errors';
import { timingSafeEqual } from 'crypto';

export async function validateApiKey(req: Request, keys: string[] = apiKeys): Promise<void> {
  if (keys.length === 0) return;

  const key = req.headers.get('x-api-key');

  if (!key) {
    throw new UnauthorizedError('Missing API key. Provide X-API-Key header.');
  }

  const keyBuffer = Buffer.from(key);
  const isValid = keys.some(validKey => {
    const validBuffer = Buffer.from(validKey);
    if (keyBuffer.length !== validBuffer.length) return false;
    return timingSafeEqual(keyBuffer, validBuffer);
  });

  if (!isValid) {
    throw new UnauthorizedError('Invalid API key');
  }
}
