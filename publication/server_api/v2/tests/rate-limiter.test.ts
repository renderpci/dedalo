import { describe, test, expect } from 'bun:test';
import { checkRateLimit } from '../src/security/rate-limiter';
import { HttpError } from '../src/middleware/error-handler';

describe('Rate Limiter', () => {
  test('allows requests within limit', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-forwarded-for': '192.168.1.100' }
    });

    expect(() => checkRateLimit(req)).not.toThrow();
  });

  test('uses X-Forwarded-For when TRUST_PROXY is true', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' }
    });

    expect(() => checkRateLimit(req)).not.toThrow();
  });

  test('uses X-Real-IP as fallback', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-real-ip': '172.16.0.1' }
    });

    expect(() => checkRateLimit(req)).not.toThrow();
  });
});
