/**
 * THE SEAM IS A GATE, NOT A CONVENTION.
 *
 * Seven identical `wipeRoots()` helpers and a dozen direct `config.SITES_ROOT` reads did
 * not arrive on purpose — they accumulated, one reasonable copy at a time. Collapsing
 * them into tests/fixtures/instance.ts is worth nothing if the next test file can quietly
 * start the pile again, so this file asserts the property the fixture exists to provide:
 * exactly ONE file under tests/ knows where the roots are.
 *
 * The codebase's law (CLAUDE.md, DEC-12): invariants are tripwired or deleted.
 */

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTANCE } from './fixtures/instance';
import { INSTANCE_MARKER, markerContent } from '../src/provision/layout';

const TESTS_DIR = import.meta.dir;
const FIXTURE = 'fixtures/instance.ts';

/** Every *.test.ts under tests/, relative to tests/. */
function testFiles(): string[] {
  return readdirSync(TESTS_DIR).filter(name => name.endsWith('.test.ts'));
}

/**
 * The config keys that name a filesystem root. The per-instance work replaces these with
 * AGENT_HOME / AUDIT_DIR / WEBSPACE_BASE — add those here when they land, so the seam
 * keeps holding across the rename rather than quietly ceasing to mean anything.
 */
const ROOT_KEYS = ['SITES_ROOT', 'PREPROD_ROOT', 'PROD_ROOT', 'AGENT_HOME', 'AUDIT_DIR', 'WEBSPACE_BASE'];

describe('the test-instance seam', () => {
  test('no test file outside the fixture names a filesystem-root config key', () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const body = readFileSync(join(TESTS_DIR, file), 'utf8');
      for (const key of ROOT_KEYS) {
        // This file necessarily names them; it is the gate.
        if (file === 'seam_tripwire.test.ts') continue;
        if (body.includes(`config.${key}`)) offenders.push(`${file} → config.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no test file hardcodes the scratch directory', () => {
    const offenders = testFiles().filter(file =>
      file !== 'seam_tripwire.test.ts' &&
      readFileSync(join(TESTS_DIR, file), 'utf8').includes('.test-tmp'),
    );
    expect(offenders).toEqual([]);
  });

  test('no test file carries its own root-wiping helper', () => {
    // The shape that was duplicated seven times: an rm() straight at a root.
    const offenders: string[] = [];
    for (const file of testFiles()) {
      if (file === 'seam_tripwire.test.ts' || file === 'fixture_guard.test.ts') continue;
      const body = readFileSync(join(TESTS_DIR, file), 'utf8');
      if (/function\s+wipe/i.test(body)) offenders.push(`${file} → declares its own wipe helper`);
    }
    expect(offenders).toEqual([]);
  });

  test('the fixture is the only place under tests/ that imports the daemon config for a root', () => {
    const fixture = readFileSync(join(TESTS_DIR, FIXTURE), 'utf8');
    expect(fixture).toContain("from '../../src/config'");
    for (const key of ['SITES_ROOT', 'PREPROD_ROOT', 'PROD_ROOT']) {
      expect(fixture).toContain(`config.${key}`);
    }
  });

  test('.env.test and the fixture agree on the instance name', () => {
    // Once DEDALO_SITE_INSTANCE is required by the daemon, a disagreement here would mark
    // the roots for one instance and boot the daemon as another — a failure that would
    // otherwise only surface at boot, in production shape, on someone else's machine.
    const env = readFileSync(join(TESTS_DIR, '..', '.env.test'), 'utf8');
    const declared = env.match(/^DEDALO_SITE_INSTANCE=(.*)$/m);
    expect(declared).not.toBeNull();
    expect(declared![1].trim()).toBe(INSTANCE);
  });

  test('the fixture takes the instance marker from layout rather than restating it', () => {
    // The daemon's boot check and the suite must mean the same file. Two literals is two
    // spellings, and the guarantee becomes decoration the first time one of them moves.
    const fixture = readFileSync(join(TESTS_DIR, FIXTURE), 'utf8');
    expect(fixture).toContain("from '../../src/provision/layout'");
    expect(fixture).not.toContain("'.dedalo_site_instance'");
    expect(INSTANCE_MARKER).toBe('.dedalo_site_instance');
    expect(markerContent(INSTANCE)).toBe(`${INSTANCE}\n`);
  });
});
