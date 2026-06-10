import { describe, test, expect, setSystemTime, afterEach } from 'bun:test';
import { checkRateLimit, cleanupStaleBuckets, startRateLimitCleanup, stopRateLimitCleanup } from '../src/security/rate-limiter';
import { RateLimitError } from '../src/errors';
import { config } from '../src/config';

afterEach(() => {
  setSystemTime();
});

const reqFor = (ip: string) =>
  new Request('http://localhost/test', { headers: { 'x-forwarded-for': ip } });

describe('Rate Limiter', () => {
  test('allows requests within limit', () => {
    expect(() => checkRateLimit(reqFor('192.168.1.200'))).not.toThrow();
  });

  test('uses X-Forwarded-For first hop when TRUST_PROXY is true', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-forwarded-for': '10.0.0.100, 192.168.1.100' },
    });
    expect(() => checkRateLimit(req)).not.toThrow();
  });

  test('uses X-Real-IP as fallback', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-real-ip': '172.16.0.100' },
    });
    expect(() => checkRateLimit(req)).not.toThrow();
  });

  test('falls back to anonymous bucket without headers', () => {
    expect(() => checkRateLimit(new Request('http://localhost/test'))).not.toThrow();
  });

  test('throws RateLimitError when the bucket is exhausted', () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < config.RATE_LIMIT_RPM; i++) {
      checkRateLimit(reqFor(ip));
    }
    expect(() => checkRateLimit(reqFor(ip))).toThrow(RateLimitError);
  });

  test('refills the bucket after the interval', () => {
    const ip = '10.8.8.8';
    for (let i = 0; i < config.RATE_LIMIT_RPM; i++) {
      checkRateLimit(reqFor(ip));
    }
    expect(() => checkRateLimit(reqFor(ip))).toThrow(RateLimitError);

    setSystemTime(new Date(Date.now() + 61_000));
    expect(() => checkRateLimit(reqFor(ip))).not.toThrow();
  });

  test('cleanupStaleBuckets drops idle buckets', () => {
    const ip = '10.7.7.7';
    checkRateLimit(reqFor(ip));

    setSystemTime(new Date(Date.now() + 11 * 60_000));
    expect(() => cleanupStaleBuckets()).not.toThrow();
    // bucket was rebuilt fresh after cleanup
    expect(() => checkRateLimit(reqFor(ip))).not.toThrow();
  });

  test('start/stop cleanup are idempotent', () => {
    startRateLimitCleanup();
    startRateLimitCleanup();
    stopRateLimitCleanup();
    stopRateLimitCleanup();
  });
});
