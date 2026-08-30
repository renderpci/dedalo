import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  /**
   * THE COMPARE IS CONSTANT-TIME — and this is the one assertion in the suite that has to
   * be a SOURCE assertion, stated as such rather than dressed up as behaviour.
   *
   * A byte-at-a-time `!==` and a `timingSafeEqual` are indistinguishable from outside: both
   * accept the right token and refuse every wrong one. A timing measurement inside a test
   * runner on a shared machine is noise, and a gate that flakes is a gate that gets
   * deleted. So what is held is that the comparison this module performs on the credential
   * IS the crypto primitive — the length check being the honest, documented exception,
   * because `timingSafeEqual` throws on unequal lengths and a token's LENGTH is not the
   * secret.
   *
   * The refusal itself is behavioural, in the test below; this only holds HOW.
   */
  test('the bearer is compared with node:crypto timingSafeEqual, not with ===', () => {
    const source = readFileSync(join(import.meta.dir, '..', 'src', 'security', 'auth.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toContain("from 'node:crypto'");
    expect(code).toContain('timingSafeEqual(presentedBytes, tokenBytes)');
    // And the token is never compared as a STRING anywhere in the module — the shape a
    // "simplification" would take.
    expect(code).not.toMatch(/presented\s*[!=]==\s*config\.SERVICE_TOKEN/);
    expect(code).not.toMatch(/config\.SERVICE_TOKEN\s*[!=]==\s*presented/);
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
