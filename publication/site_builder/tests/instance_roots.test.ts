/**
 * THE BOOT PREFLIGHT'S GATE — and the ORDER it runs in, which is half of what it is worth.
 *
 * `src/instance/roots.ts` is the daemon's answer to a fact that has no software fix: every
 * root it writes into arrives as an ordinary string out of an ordinary file. The engine
 * answers this with a marker twice already — `dedalo_test_marker` in the suite database,
 * `.dedalo_test_media` in the suite media root — and the site builder's provisioner already
 * PLANTS the same marker in each state root as it creates it. Until this phase nothing read
 * them: a marker written by everyone and read by nobody is decoration.
 *
 * So this file asserts the four refusals and the ORDERING. The ordering is not a detail:
 * `src/index.ts` runs `await sweepOnBoot()` at module evaluation, and that call WRITES — it
 * commits recovered work and rewrites session metadata. A preflight that ran after it would
 * have let a daemon pointed at the wrong tree touch that tree already, so the gate is a
 * source-order assertion anchored on `sweepOnBoot` rather than on `Bun.serve`: the serve call
 * is not the first write, and anchoring there would pass while the defect stood.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRATCH_ROOT } from './fixtures/instance';
import { INSTANCE_MARKER, derive, markerContent } from '../src/provision/layout';
import { sitesRenderer } from '../src/provision/render/sites';
import {
  assertAgentBinaries,
  assertInstanceRoots,
  assertNoLegacyEnv,
  assertRootsWritable,
  assertRunningAs,
  assertSiteTable,
  markerPath,
  type InstanceRoot,
} from '../src/instance/roots';
import type { ConfigSourceReport } from '../src/config';

const GATE_DIR = join(SCRATCH_ROOT, 'roots_gate');
const INSTANCE = 'gate';

/** True when this run could not observe a permission refusal anyway. */
const RUNNING_AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

afterEach(() => {
  // A test may have made a directory unwritable; restore it before removing the tree.
  if (existsSync(GATE_DIR)) chmodSync(GATE_DIR, 0o755);
  for (const name of ['workspaces', 'agent_home', 'audit']) {
    const path = join(GATE_DIR, name);
    if (existsSync(path)) chmodSync(path, 0o755);
  }
  rmSync(GATE_DIR, { recursive: true, force: true });
});

/** A scratch instance: three roots, marked as `instance` unless told otherwise. */
function makeRoots(options: { instance?: string; mark?: boolean } = {}): InstanceRoot[] {
  const { instance = INSTANCE, mark = true } = options;
  const workspaces = join(GATE_DIR, 'workspaces');
  const agentHome = join(GATE_DIR, 'agent_home');
  const audit = join(GATE_DIR, 'audit');
  for (const path of [workspaces, agentHome, audit]) {
    mkdirSync(path, { recursive: true });
    if (mark) writeFileSync(markerPath(path), markerContent(instance), 'utf8');
  }
  // The provisioner creates and chowns the audit FILE, because the directory is root-owned
  // and the daemon could not create one there. The suite stands in for the provisioner.
  writeFileSync(join(audit, 'audit.jsonl'), '', 'utf8');
  return [
    { label: 'SITES_ROOT', path: workspaces, probe: 'create', ownedByService: true },
    { label: 'AGENT_HOME', path: agentHome, probe: 'create', ownedByService: true },
    {
      label: 'AUDIT_DIR',
      path: audit,
      probe: 'append',
      appendPath: join(audit, 'audit.jsonl'),
      ownedByService: false,
    },
  ];
}

function refusalFrom(run: () => void): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. A root that does not declare itself
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a root must say whose it is', () => {
  test('a marked instance passes', () => {
    expect(() => assertInstanceRoots(INSTANCE, makeRoots())).not.toThrow();
  });

  test('a root with no marker is refused, naming the door, the root and what was expected', () => {
    const message = refusalFrom(() => assertInstanceRoots(INSTANCE, makeRoots({ mark: false })));
    expect(message).toContain('assertInstanceRoots');
    expect(message).toContain('SITES_ROOT');
    expect(message).toContain(join(GATE_DIR, 'workspaces'));
    expect(message).toContain(INSTANCE_MARKER);
    expect(message).toContain('Nothing was written.');
  });

  test("a root marked for ANOTHER instance is refused, and says whose it is", () => {
    // The failure this prevents: a typo in one declaration putting one museum's agent turns
    // inside another museum's tree, with both daemons believing they own it.
    const message = refusalFrom(() =>
      assertInstanceRoots(INSTANCE, makeRoots({ instance: 'museum-b' })),
    );
    expect(message).toContain('assertInstanceRoots');
    expect(message).toContain('museum-b');
    expect(message).toContain(INSTANCE);
    expect(message).toContain('Nothing was written.');
  });

  test('a root that is not there at all is refused, and points at the provisioner', () => {
    const roots = makeRoots();
    rmSync(join(GATE_DIR, 'agent_home'), { recursive: true, force: true });
    const message = refusalFrom(() => assertInstanceRoots(INSTANCE, roots));
    expect(message).toContain('AGENT_HOME');
    expect(message).toContain('provision apply');
    expect(message).toContain('Nothing was written.');
  });

  test('the check never plants the marker it is looking for', () => {
    // A check that created what was missing would assert only that this process can write.
    const roots = makeRoots({ mark: false });
    expect(() => assertInstanceRoots(INSTANCE, roots)).toThrow();
    expect(existsSync(markerPath(roots[0]!.path))).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The identity behind the process
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the process is the identity its roots were provisioned for', () => {
  test('roots this uid owns pass', () => {
    expect(() => assertRunningAs(INSTANCE, makeRoots())).not.toThrow();
  });

  test('a root that cannot be inspected is refused rather than assumed', () => {
    const roots = makeRoots();
    rmSync(join(GATE_DIR, 'workspaces'), { recursive: true, force: true });
    const message = refusalFrom(() => assertRunningAs(INSTANCE, roots));
    expect(message).toContain('assertRunningAs');
    expect(message).toContain('SITES_ROOT');
    expect(message).toContain('Nothing was written.');
  });

  /**
   * THE TWO REFUSALS THIS FUNCTION IS FOR — neither of which had ever been executed.
   *
   * The block used to hold the positive path and one `statSync` failure, so `uid === 0` and
   * `owner !== uid` were dead weight: disarming either left the suite green. They are the
   * whole of the identity check, and per-instance uid/gid is where this subsystem's
   * isolation is stated to rest.
   *
   * Both are reachable now because the running uid is a PARAMETER of `assertRunningAs`,
   * defaulting to the real one — a suite does not run as root and cannot create a
   * foreign-owned directory, so injecting the answer is the only honest way to execute the
   * branch. The ROOTS are real: the ownership case works by telling the function it is
   * somebody else, which is exactly the state a daemon pointed at another instance's tree is
   * in.
   */
  test('ROOT is refused outright — an agent turn as uid 0 would own the host', () => {
    const message = refusalFrom(() => assertRunningAs(INSTANCE, makeRoots(), 0));
    expect(message).toContain('assertRunningAs');
    expect(message).toContain('running as root (uid 0)');
    expect(message).toContain('User=');
    expect(message).toContain('Nothing was written.');
  });

  test('a service-owned root this uid does not own is refused, naming both uids', () => {
    // The real roots, really owned by the uid running the suite; the process is told it is
    // a different one. That is a daemon started as the wrong user, or pointed at another
    // instance's provisioned tree — indistinguishable from here, and both refusable.
    const mine = process.getuid?.() ?? 0;
    const notMine = mine + 1;
    const message = refusalFrom(() => assertRunningAs(INSTANCE, makeRoots(), notMine));
    expect(message).toContain('assertRunningAs');
    expect(message).toContain(`is owned by uid ${mine}`);
    expect(message).toContain(`this process is uid ${notMine}`);
    expect(message).toContain('Nothing was written.');
  });

  test('a root the provisioner does NOT chown to the service user is exempt from that check', () => {
    // AUDIT_DIR is root-owned by design (`ownedByService: false`) — that is the whole
    // append-only story. If the ownership loop stopped honouring the flag, every daemon on
    // a correctly provisioned host would refuse to boot.
    const auditOnly = makeRoots().filter(root => root.label === 'AUDIT_DIR');
    expect(auditOnly).toHaveLength(1);
    const mine = process.getuid?.() ?? 0;
    expect(() => assertRunningAs(INSTANCE, auditOnly, mine + 1)).not.toThrow();
  });

  test('a platform with no POSIX uids proves nothing rather than refusing everything', () => {
    expect(() => assertRunningAs(INSTANCE, makeRoots(), null)).not.toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. No secret through a door that must not carry one
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a secret in the environment file is the arrangement this replaced', () => {
  const report = (patch: Partial<ConfigSourceReport>): ConfigSourceReport => ({
    envFilePath: '/etc/dedalo_sites/instances/gate/env',
    envFileExists: true,
    envFileKeys: ['SITES_ROOT'],
    credentialsDir: null,
    credentialKeys: [],
    origin: {},
    ...patch,
  });

  test('a credential-shaped key in the env file is refused where credentials exist', () => {
    const message = refusalFrom(() =>
      assertNoLegacyEnv(
        report({ envFileKeys: ['SITES_ROOT', 'SERVICE_TOKEN'], credentialsDir: '/run/credentials/x' }),
        { nodeEnv: 'production' },
      ),
    );
    expect(message).toContain('assertNoLegacyEnv');
    expect(message).toContain('SERVICE_TOKEN');
    expect(message).toContain('instance.json');
    expect(message).toContain('Nothing was written.');
  });

  test('a PATH ending in _FILE is not a secret and passes', () => {
    // The suffix-anchored pattern is the whole distinction: PUBLICATION_API_KEY_FILE names a
    // file, PUBLICATION_API_KEY would be a value in every agent child's environment.
    expect(() =>
      assertNoLegacyEnv(
        report({ envFileKeys: ['PUBLICATION_API_KEY_FILE'], credentialsDir: '/run/credentials/x' }),
        { nodeEnv: 'production' },
      ),
    ).not.toThrow();
  });

  test('a laptop and the suite are not refused for the only door they have', () => {
    // There is no systemd and no credential store here, so a SERVICE_TOKEN line in a local
    // env file is the only way to run at all. A refusal there would buy nothing and would be
    // worked around within a day.
    expect(() =>
      assertNoLegacyEnv(report({ envFileKeys: ['SERVICE_TOKEN'] }), { nodeEnv: 'test' }),
    ).not.toThrow();
  });

  test('a leftover .env inside the checkout is refused on a provisioned host', () => {
    mkdirSync(GATE_DIR, { recursive: true });
    writeFileSync(join(GATE_DIR, '.env'), 'SERVICE_TOKEN=leftover\n', 'utf8');
    const message = refusalFrom(() =>
      assertNoLegacyEnv(report({ credentialsDir: '/run/credentials/x' }), {
        nodeEnv: 'production',
        packageDir: GATE_DIR,
      }),
    );
    expect(message).toContain('.env');
    expect(message).toContain('pre-instance arrangement');
  });

  test('the file the daemon actually reads is not "a leftover"', () => {
    mkdirSync(GATE_DIR, { recursive: true });
    const local = join(GATE_DIR, '.env');
    writeFileSync(local, 'SITES_ROOT=/x\n', 'utf8');
    expect(() =>
      assertNoLegacyEnv(report({ envFilePath: local, credentialsDir: '/run/credentials/x' }), {
        nodeEnv: 'production',
        packageDir: GATE_DIR,
      }),
    ).not.toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. The write probe
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a root the daemon cannot write is a refusal at boot, not EROFS at midnight', () => {
  test('writable roots pass, and the probe leaves nothing behind', () => {
    const roots = makeRoots();
    expect(() => assertRootsWritable(INSTANCE, roots)).not.toThrow();
    // The probe writes; what it must never do is leave anything behind. A root that keeps
    // accumulating a file per boot would be this check paying for itself in litter.
    for (const root of roots) {
      const left = readdirSync(root.path).filter(name => name.startsWith('.dedalo_site_write_probe'));
      expect({ root: root.label, left }).toEqual({ root: root.label, left: [] });
    }
  });

  test.if(!RUNNING_AS_ROOT)('a read-only root is refused, naming it and ProtectSystem', () => {
    // This is the defect the whole function exists for: under ProtectSystem=strict a root the
    // unit's ReadWritePaths= omits is mounted read-only, and nothing notices until the first
    // publish fails as EROFS on a live site.
    const roots = makeRoots();
    chmodSync(join(GATE_DIR, 'workspaces'), 0o500);
    const message = refusalFrom(() => assertRootsWritable(INSTANCE, roots));
    expect(message).toContain('assertRootsWritable');
    expect(message).toContain('SITES_ROOT');
    expect(message).toContain('ReadWritePaths');
    expect(message).toContain('Nothing was written.');
  });

  test('an audit trail that cannot be appended to is refused, and says why it is root-owned', () => {
    // The audit directory is root-owned BY DESIGN — unlink and rename are permissions on the
    // directory — so the probe there is an append to the file the provisioner created, never
    // a create in the directory.
    const roots = makeRoots();
    rmSync(join(GATE_DIR, 'audit'), { recursive: true, force: true });
    const message = refusalFrom(() => assertRootsWritable(INSTANCE, roots));
    expect(message).toContain('AUDIT_DIR');
    expect(message).toContain('append-only');
    expect(message).toContain('Nothing was written.');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. The pinned agent binaries
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a driver binary is a path, not a name on PATH', () => {
  function binary(mode: number): string {
    mkdirSync(GATE_DIR, { recursive: true });
    const path = join(GATE_DIR, 'claude');
    writeFileSync(path, '#!/bin/sh\n', 'utf8');
    chmodSync(path, mode);
    return path;
  }

  test('a bare name is refused — PATH is what an agent turn can influence', () => {
    const message = refusalFrom(() =>
      assertAgentBinaries([{ label: 'CLAUDE_CODE_BIN', path: 'claude' }], { requireRootOwned: false }),
    );
    expect(message).toContain('CLAUDE_CODE_BIN');
    expect(message).toContain('substitution vector');
  });

  test('a group- or world-writable binary is refused', () => {
    const path = binary(0o777);
    const message = refusalFrom(() =>
      assertAgentBinaries([{ label: 'CLAUDE_CODE_BIN', path }], { requireRootOwned: false }),
    );
    expect(message).toContain('writable');
    expect(message).toContain('replace the agent');
  });

  test.if(!RUNNING_AS_ROOT)('a non-root-owned binary is refused on a production run', () => {
    const path = binary(0o755);
    const message = refusalFrom(() =>
      assertAgentBinaries([{ label: 'CLAUDE_CODE_BIN', path }], { requireRootOwned: true }),
    );
    expect(message).toContain('not by root');
  });

  test.if(!RUNNING_AS_ROOT)('and is reported, not refused, off production', () => {
    const path = binary(0o755);
    const warnings: string[] = [];
    expect(() =>
      assertAgentBinaries([{ label: 'CLAUDE_CODE_BIN', path }], {
        requireRootOwned: false,
        warn: line => warnings.push(line),
      }),
    ).not.toThrow();
    expect(warnings.join('\n')).toContain('CLAUDE_CODE_BIN');
  });

  test('a binary that is not there is refused before the first agent turn', () => {
    const message = refusalFrom(() =>
      assertAgentBinaries([{ label: 'PI_BIN', path: join(GATE_DIR, 'absent') }], {
        requireRootOwned: false,
      }),
    );
    expect(message).toContain('PI_BIN');
    expect(message).toContain('cannot be inspected');
  });

  test('an unset binary is not a binary — the suite runs with all three empty', () => {
    expect(() => assertAgentBinaries([], { requireRootOwned: true })).not.toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. THE ORDER — the assertion that makes the rest of this file worth anything
 * ──────────────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. The site table
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a daemon that cannot read its site table does not start', () => {
  /** A table for `instance`, rendered the way the provisioner renders one. */
  function writeTable(instance: string, sites: { slug: string; domain: string }[] = []): string {
    const layout = derive({
      instance,
      engine: {
        group: 'dedalo-engine',
        private_dir: join(GATE_DIR, 'engine_private'),
        checkout_dir: join(GATE_DIR, 'checkout'),
        bun_bin: join(GATE_DIR, 'bun', 'bin', 'bun'),
      },
      web: { group: 'www-data' },
      publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
      agent: { driver: 'claude_code' },
      serving: { preprod: { enabled: true, auth: { mode: 'none' } }, prod: { tls: { mode: 'none' } } },
      paths: { config_base: join(GATE_DIR, 'config'), state_base: join(GATE_DIR, 'state') },
      webspace_base: join(GATE_DIR, 'webspaces'),
      sites,
    } as never);
    const [artifact] = sitesRenderer.render(layout, {} as never);
    mkdirSync(join(GATE_DIR, 'config', instance), { recursive: true });
    writeFileSync(artifact!.path, artifact!.body, 'utf8');
    return artifact!.path;
  }

  test('an EMPTY table is legitimate — a museum is provisioned before its first site', () => {
    const path = writeTable(INSTANCE);
    expect(() => assertSiteTable(INSTANCE, path)).not.toThrow();
  });

  test('a table that is not there refuses the boot, naming the provisioner', () => {
    const message = refusalFrom(() => assertSiteTable(INSTANCE, join(GATE_DIR, 'nothing', 'sites.json')));
    expect(message).toContain('assertSiteTable');
    expect(message).toContain('has no site table');
    expect(message).toContain('provision apply');
    expect(message).toContain('Nothing was written');
  });

  test('a table stamped for ANOTHER museum refuses the boot, and says whose it is', () => {
    // The same law as the root markers, on the file that says where this daemon may
    // publish: one museum's placements in another museum's configuration directory would
    // publish this instance's work into that one's webspaces.
    const path = writeTable(INSTANCE);
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(`provision: ${INSTANCE} sites`, 'provision: museum-b sites'),
      'utf8',
    );
    const message = refusalFrom(() => assertSiteTable(INSTANCE, path));
    expect(message).toContain('museum-b');
    expect(message).toContain('assertSiteTable');
  });

  test('a HAND-EDITED table refuses the boot — its stamp is a hash of its body', () => {
    const path = writeTable(INSTANCE, [{ slug: 'one', domain: 'one.example.org' }]);
    writeFileSync(path, readFileSync(path, 'utf8').replace('one.example.org', 'one.example.net'), 'utf8');
    expect(refusalFrom(() => assertSiteTable(INSTANCE, path))).toContain('edited in place');
  });
});

describe('the preflight runs before the first write', () => {
  const INDEX = readFileSync(join(import.meta.dir, '..', 'src', 'index.ts'), 'utf8');

  /**
   * Comments are stripped before the scan, on purpose: the prose in that file EXPLAINS the
   * ordering ("above the top-level `await sweepOnBoot()`"), so a naive text search finds the
   * explanation before the code and passes while the code does the opposite.
   */
  const CODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('bootPreflight() is called, and before sweepOnBoot()', () => {
    const preflight = CODE.indexOf('bootPreflight()');
    const sweep = CODE.indexOf('sweepOnBoot(');
    expect(preflight).toBeGreaterThan(-1);
    expect(sweep).toBeGreaterThan(preflight);
  });

  test('nothing is awaited before it', () => {
    // sweepOnBoot is the write that exists TODAY. The property is stronger and outlives it:
    // no asynchronous work of any kind may precede the preflight.
    const preflight = CODE.indexOf('bootPreflight()');
    const firstAwait = CODE.indexOf('await ');
    expect(firstAwait).toBeGreaterThan(preflight);
  });

  test('and the listener is opened after it', () => {
    expect(CODE.indexOf('Bun.serve(')).toBeGreaterThan(CODE.indexOf('bootPreflight()'));
  });

  test('the preflight runs every one of the checks this file gates', () => {
    // A preflight that quietly stopped calling one of them would leave this whole file
    // green while the daemon checked nothing.
    const ROOTS = readFileSync(join(import.meta.dir, '..', 'src', 'instance', 'roots.ts'), 'utf8');
    const body = ROOTS.slice(ROOTS.indexOf('export function bootPreflight()'));
    for (const check of [
      'assertNoLegacyEnv(',
      'assertInstanceRoots(',
      'assertRunningAs(',
      'assertRootsWritable(',
      'assertAgentBinaries(',
      'assertSiteTable(',
    ]) {
      expect(body).toContain(check);
    }
  });
});
