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
 * The config keys that name a filesystem root — the CURRENT set, kept in step with
 * src/config.ts as roots arrive and leave. `PREPROD_ROOT` / `PROD_ROOT` were here until the
 * surfaces became per-site webspace pairs and the two keys were deleted from the daemon
 * altogether; a forbidden-list entry for a key that no longer exists is a gate slowly
 * turning into decoration.
 */
const ROOT_KEYS = ['SITES_ROOT', 'AGENT_HOME', 'AUDIT_DIR', 'WEBSPACE_BASE', 'SITE_TABLE_FILE'];

/**
 * The files that NAME a root key as text rather than READING one — and the narrower rule
 * they are held to instead.
 *
 * `agent_boundary.test.ts` asserts what three modules CONSTRUCT (`HOME: config.AGENT_HOME`,
 * and never `config.SITES_ROOT`), so the identifiers are its subject matter: it reads the
 * daemon's SOURCE, not the daemon's configuration. An exemption that stopped there would be
 * a hole — the file could then read a root off the singleton like the seven helpers this
 * fixture replaced — so the property the seam actually wants is asserted directly below: an
 * exempt file may not import the config at all.
 */
const SOURCE_QUOTING_FILES = new Set(['agent_boundary.test.ts']);

/**
 * Path SEGMENTS a test must not build a path out of, now that a served surface is a PAIR
 * inside a site's webspace rather than `<root>/<slug>`. `.releases` is `layout.ts`'s name to
 * own; a test that assembled `join(root, '.releases', slug)` — which is exactly what the
 * promote gate used to do — would keep passing on the day the daemon started writing
 * somewhere else, and "somewhere else than the vhost serves" is the precise failure this
 * phase exists to close.
 *
 * The token is matched WITH its quotes, so this catches a path being CONSTRUCTED and not a
 * `releases` property being read (`history.releases`) or a provisioner gate asserting a
 * rendered artifact's text (`'/srv/one/.releases/web'`) — the latter is a test OF the
 * renderer, where spelling the output is the whole assertion.
 */
const LAYOUT_LITERALS = ["'.releases'", '".releases"'];

describe('the test-instance seam', () => {
  test('no test file outside the fixture names a filesystem-root config key', () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const body = readFileSync(join(TESTS_DIR, file), 'utf8');
      for (const key of ROOT_KEYS) {
        // This file necessarily names them; it is the gate.
        if (file === 'seam_tripwire.test.ts') continue;
        if (SOURCE_QUOTING_FILES.has(file)) continue; // see below — held to a stricter rule
        if (body.includes(`config.${key}`)) offenders.push(`${file} → config.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('a file that QUOTES a root key may not READ one', () => {
    // The exemption above costs nothing only while this holds: a test that never imports
    // the daemon's config cannot read a root off it, whatever strings it happens to contain.
    for (const file of SOURCE_QUOTING_FILES) {
      const body = readFileSync(join(TESTS_DIR, file), 'utf8');
      expect({ file, importsConfig: body.includes("from '../src/config'") }).toEqual({
        file,
        importsConfig: false,
      });
    }
  });

  test('no test file spells a webspace layout path for itself', () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      if (file === 'seam_tripwire.test.ts') continue;
      const body = readFileSync(join(TESTS_DIR, file), 'utf8');
      for (const literal of LAYOUT_LITERALS) {
        if (body.includes(literal)) offenders.push(`${file} → ${literal}`);
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
    for (const key of ROOT_KEYS) {
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

  test('the fixture derives the webspace paths from layout rather than restating them', () => {
    // The suite plays the provisioner (it creates and marks each site's webspace), so it is
    // the one place that could quietly disagree with the daemon about where a site lives.
    // It may not: it calls the same two functions the daemon and the provisioner call.
    const fixture = readFileSync(join(TESTS_DIR, FIXTURE), 'utf8');
    expect(fixture).toContain('webspaceFor(');
    expect(fixture).toContain('surfacePaths(');
    for (const literal of LAYOUT_LITERALS) expect(fixture).not.toContain(literal);
  });

  test('the fixture RENDERS the site table with the provisioner\'s own renderer', () => {
    // The suite plays the provisioner twice over: it creates each site's webspace AND it
    // publishes the site table the daemon reads every placement out of. The second half must
    // go through `derive()` and the real renderer — a fixture that hand-wrote that JSON would
    // be a second writer of the format, green on the day the renderer changed shape and the
    // daemon could no longer read what a real `provision apply` writes. That is the exact
    // class of two-sided coincidence the table was introduced to end.
    const fixture = readFileSync(join(TESTS_DIR, FIXTURE), 'utf8');
    expect(fixture).toContain("from '../../src/provision/render/sites'");
    expect(fixture).toContain('sitesRenderer.render(');
    expect(fixture).toContain('derive(');
    // And it writes it where the daemon looks, which the fixture asserts for itself at
    // runtime; here we only refuse the shape that would make that assertion unreachable.
    expect(fixture).not.toContain('"sites": [');
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
