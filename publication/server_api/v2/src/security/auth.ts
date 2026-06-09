import { apiKeys, isAuthRequired } from '../config';
import { HttpError } from '../middleware/error-handler';
import { timingSafeEqual } from 'crypto';

export async function validateApiKey(req: Request): Promise<void> {
  if (!isAuthRequired) {
    return;
  }

  const key = req.headers.get('x-api-key');

  if (!key) {
    throw new HttpError(401, 'Missing API key. Provide X-API-Key header.');
  }

  const keyBuffer = Buffer.from(key);
  const isValid = apiKeys.some(validKey => {
    const validBuffer = Buffer.from(validKey);
    if (keyBuffer.length !== validBuffer.length) {
      return false;
    }
    return timingSafeEqual(keyBuffer, validBuffer);
  });

  if (!isValid) {
    throw new HttpError(401, 'Invalid API key');
  }
}
