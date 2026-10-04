import { describe, expect, test } from 'bun:test';
import { config } from '../src/config';
import { UnauthorizedError, ValidationError } from '../src/errors';
import { ACTOR_HEADER, requireActor, requireBearer } from '../src/security/auth';

const req = (headers: Record<string, string>) => new Request('http://x/', { headers });

describe('requireBearer', () => {
  test('accepts the exact token', () => {
    expect(() => requireBearer(req({ authorization: `Bearer ${config.SERVICE_TOKEN}` }))).not.toThrow();
  });
  test.each([
    ['no header', {}],
    ['wrong scheme', { authorization: `Basic ${config.SERVICE_TOKEN}` }],
    ['empty token', { authorization: 'Bearer ' }],
    ['wrong token, same length', { authorization: `Bearer ${'x'.repeat(config.SERVICE_TOKEN.length)}` }],
    ['token prefix', { authorization: `Bearer ${config.SERVICE_TOKEN.slice(0, -1)}` }],
    ['token plus a byte', { authorization: `Bearer ${config.SERVICE_TOKEN}x` }],
  ])('refuses %s with 401', (_name, headers) => {
    expect(() => requireBearer(req(headers as Record<string, string>))).toThrow(UnauthorizedError);
  });
});

describe('requireActor', () => {
  test('returns the header value', () => {
    expect(requireActor(req({ [ACTOR_HEADER]: 'curator.ana' }))).toBe('curator.ana');
  });
  test.each([
    ['missing', {}],
    ['empty', { [ACTOR_HEADER]: '' }],
    ['too long', { [ACTOR_HEADER]: 'a'.repeat(201) }],
    ['control char', { [ACTOR_HEADER]: 'a\tb' }],
  ])('refuses %s with 400 actor_missing', (_name, headers) => {
    try {
      requireActor(req(headers as Record<string, string>));
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).extensions).toEqual({ reason: 'actor_missing' });
    }
  });
});
