import { config } from '../config';
import { HttpError } from '../middleware/error-handler';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

const REFILL_INTERVAL = 60000;
const MAX_TOKENS = config.RATE_LIMIT_RPM;

function getClientIp(req: Request): string {
  if (config.TRUST_PROXY) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
      return realIp;
    }
  }
  return 'unknown';
}

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;

  if (elapsed >= REFILL_INTERVAL) {
    const refills = Math.floor(elapsed / REFILL_INTERVAL);
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refills * MAX_TOKENS);
    bucket.lastRefill = now;
  }
}

export function checkRateLimit(req: Request): void {
  const ip = getClientIp(req);
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = {
      tokens: MAX_TOKENS,
      lastRefill: Date.now(),
    };
    buckets.set(ip, bucket);
  }

  refillBucket(bucket);

  if (bucket.tokens <= 0) {
    throw new HttpError(429, 'Rate limit exceeded. Try again later.');
  }

  bucket.tokens--;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > REFILL_INTERVAL * 10) {
      buckets.delete(ip);
    }
  }
}, 60000);
