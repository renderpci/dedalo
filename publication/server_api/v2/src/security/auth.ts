import { apiKeys } from '../config';
import { UnauthorizedError } from '../errors';
import { timingSafeEqual } from 'crypto';

/**
 * Optional `X-API-Key` gate.
 *
 * AN EMPTY `API_KEYS` MEANS OPEN ACCESS, and that is a supported configuration, not an
 * oversight: this API's whole purpose is serving *published* data to public websites, which
 * cannot present a secret. The real security boundary lies elsewhere and always holds — a
 * read-only database user, the `DB_NAMES` allowlist scoping which published databases are
 * reachable at all, and the fact that no route writes. Keys are for deployments that want a
 * further restriction (a private integration, a metered partner), layered on top of that.
 */
export async function validateApiKey(req: Request, keys: string[] = apiKeys): Promise<void> {
  if (keys.length === 0) return;

  const key = req.headers.get('x-api-key');

  if (!key) {
    throw new UnauthorizedError('Missing API key. Provide X-API-Key header.');
  }

  // Constant-time comparison: a byte-by-byte `===` leaks, through its timing, how long a
  // prefix of a guess was correct, which lets an attacker recover a key character by
  // character instead of brute-forcing it whole. The length check first is required —
  // timingSafeEqual throws on unequal lengths — and leaks only the key's length, which is
  // not secret.
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
