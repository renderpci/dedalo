import { config } from '../config';
import { RateLimitError } from '../errors';

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

  const ip = (req as any).remoteAddress ?? (req as any).socket?.remoteAddress;
  return ip || 'anonymous';
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
    bucket = { tokens: MAX_TOKENS, lastRefill: Date.now() };
    buckets.set(ip, bucket);
  }

  refillBucket(bucket);

  if (bucket.tokens <= 0) {
    throw new RateLimitError('Rate limit exceeded. Try again later.');
  }

  bucket.tokens--;
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function cleanupStaleBuckets(): void {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > REFILL_INTERVAL * 10) {
      buckets.delete(ip);
    }
  }
}

export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupStaleBuckets, 60000);
  cleanupInterval.unref?.();
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
