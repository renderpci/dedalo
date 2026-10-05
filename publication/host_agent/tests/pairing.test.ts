/**
 * The agent's pairing recipe, pinned from INSIDE the package (the root tripwire
 * test/unit/publication_host_pairing_tripwire.test.ts proves engine/agent equality; this
 * file keeps the package's own suite — and its coverage threshold — honest on its own).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { instanceFingerprint, PAIRING_FINGERPRINT_PREFIX } from '../src/security/pairing';

const TOKEN = 'publication-host-gate-token-0000000000';
/** sha256('dedalo-publication-host:test\n' + TOKEN) — the same golden vector the root gate pins. */
const GOLDEN = 'ae18e7caf38e4ad763e5f26f0710219492dbf2517c346e481730c9400532b894';
/** sha256('dedalo-site-instance:test\n' + TOKEN) — the site builder's answer to the same inputs. */
const SITE_BUILDER_ANSWER = '0c84f76c66120d6469837b7fd7b5a07aceb1c093c2eef25dc4da4d013c2eca77';

describe('instanceFingerprint', () => {
  test('the domain-separated prefix', () => {
    expect(PAIRING_FINGERPRINT_PREFIX).toBe('dedalo-publication-host:');
  });

  test('the golden vector', () => {
    expect(instanceFingerprint('test', TOKEN)).toBe(GOLDEN);
  });

  test('never the site-builder fingerprint for the same inputs', () => {
    expect(instanceFingerprint('test', TOKEN)).not.toBe(SITE_BUILDER_ANSWER);
  });

  test('either half changing changes the hex', () => {
    const base = instanceFingerprint('test', TOKEN);
    expect(instanceFingerprint('other', TOKEN)).not.toBe(base);
    expect(instanceFingerprint('test', `${TOKEN}x`)).not.toBe(base);
    expect(instanceFingerprint('ab', 'cde')).not.toBe(instanceFingerprint('abc', 'de'));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the module imports nothing (the root gate depends on it)', () => {
    const source = readFileSync(join(import.meta.dir, '..', 'src', 'security', 'pairing.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/\bimport\b|\brequire\s*\(/);
  });
});
