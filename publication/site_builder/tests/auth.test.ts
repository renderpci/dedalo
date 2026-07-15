import { describe, test, expect } from 'bun:test';
import { requireBearer, requireActor } from '../src/security/auth';
import { config } from '../src/config';
import { UnauthorizedError, ValidationError } from '../src/errors';

function reqWith(auth?: string): Request {
  const headers = new Headers();
  if (auth !== undefined) headers.set('authorization', auth);
  return new Request('http://x/v1/sites', { headers });
}

describe('requireBearer', () => {
  test('accepts the exact configured token', () => {
    expect(() => requireBearer(reqWith(`Bearer ${config.SERVICE_TOKEN}`))).not.toThrow();
  });

  test('rejects a missing, malformed or wrong token', () => {
    expect(() => requireBearer(reqWith(undefined))).toThrow(UnauthorizedError);
    expect(() => requireBearer(reqWith('Bearer'))).toThrow(UnauthorizedError);
    expect(() => requireBearer(reqWith('Basic abc'))).toThrow(UnauthorizedError);
    expect(() => requireBearer(reqWith('Bearer wrong-token'))).toThrow(UnauthorizedError);
    // A prefix of the real token must not pass (length check + constant-time compare).
    expect(() => requireBearer(reqWith(`Bearer ${config.SERVICE_TOKEN.slice(0, -1)}`))).toThrow(
      UnauthorizedError,
    );
  });
});

describe('requireActor', () => {
  test('extracts a valid actor', () => {
    const actor = requireActor({ actor: { user_id: 7, username: 'paco' } });
    expect(actor).toEqual({ user_id: 7, username: 'paco' });
  });

  test('rejects a missing or malformed actor', () => {
    expect(() => requireActor({})).toThrow(ValidationError);
    expect(() => requireActor(null)).toThrow(ValidationError);
    expect(() => requireActor({ actor: { username: 'paco' } })).toThrow(ValidationError);
    expect(() => requireActor({ actor: { user_id: 1.5, username: 'x' } })).toThrow(ValidationError);
    expect(() => requireActor({ actor: { user_id: 1, username: '' } })).toThrow(ValidationError);
  });
});
