/**
 * The CLI: arguments, exit codes (OK 0, DRIFT 1, USAGE 2, REFUSED 3, FAILED 4) and the
 * secret guard. Every host effect is injected — nothing here touches a real host.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ProvisionDeps } from '../src/provision/cli';
import {
  EXIT,
  INIT_VERB,
  declarationTrustProblems,
  guarded,
  hostDeps,
  parseArgs,
  run,
  secretShapedAssignment,
  siblingProblems,
  usageLines,
} from '../src/provision/cli';
import type { LockHandle, LockHolder, LockMode } from '../src/provision/lock';
import { LockBusy, LockRefused } from '../src/provision/lock';
import type { HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import type { PathFacts } from '../src/provision/plan';
import { ENGINE_KEYS, TOKEN_PLACEHOLDER } from '../src/provision/render/engine_fragment';
import { TLS_VALIDITY } from '../src/provision/tls';
import { instanceFingerprint } from '../src/security/pairing';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FAKE_TOKEN, FakeHost } from './support/provision_fake_host';

const DEFAULT_SOURCE = '/etc/dedalo_publication_host/test.json';
/** Low-entropy and built at runtime: a fixture, never a credential-shaped literal (.gitleaks.toml). */
const HEX32 = '0123456789abcdef'.repeat(2);

const ROOT_FILE: PathFacts = { type: 'file', uid: 0, gid: 0, mode: 0o644 };
const ROOT_DIR: PathFacts = { type: 'dir', uid: 0, gid: 0, mode: 0o755 };

interface Harness {
  readonly deps: ProvisionDeps;
  readonly host: FakeHost;
  readonly out: string[];
  readonly err: string[];
  readonly reads: string[];
  /** Every lock taken and released, in order: `take <instance> <mode> <verb>` / `release <instance>`. */
  readonly locks: string[];
}

function fakeHandle(instance: string, mode: LockMode, log: string[]): LockHandle {
  return { path: `/scratch/init/${instance}/init.lock`, mode, instance, release: () => log.push(`release ${instance}`) };
}

function harness(
  options: {
    root?: boolean;
    text?: string | null;
    declaration?: HostDeclaration;
    clock?: { now: Date };
    realFiles?: readonly string[];
    /** Other declarations in the config base: path → text. */
    siblings?: Readonly<Record<string, string>>;
    /** Paths in the config base that are symlinks. */
    symlinks?: readonly string[];
    /** lstat overrides (null: absent). Otherwise a `.json` is a root 0644 file, anything else a root 0755 directory. */
    facts?: Readonly<Record<string, PathFacts | null>>;
    /** The instance lock is held by someone else past its wait (LockBusy), or its directory is untrusted (LockRefused). */
    lock?: { busy: LockHolder } | { refused: string };
  } = {},
): Harness {
  const locks: string[] = [];
  const clock = options.clock ?? { now: new Date('2026-10-03T12:00:00Z') };
  const declaration = options.declaration ?? unixDeclaration();
  const host = new FakeHost(derive(declaration));
  const reads: string[] = [];
  const text = options.text === undefined ? JSON.stringify(declaration) : options.text;
  return {
    host,
    out: [],
    err: [],
    reads,
    locks,
    deps: {
      lock: (instance, mode, verb) => {
        const scripted = options.lock;
        if (scripted !== undefined && 'busy' in scripted) {
          throw new LockBusy(`/scratch/init/${instance}/init.lock`, scripted.busy, 'held');
        }
        if (scripted !== undefined && 'refused' in scripted) throw new LockRefused(scripted.refused);
        locks.push(`take ${instance} ${mode} ${verb}`);
        return fakeHandle(instance, mode, locks);
      },
      readDeclaration: path => {
        reads.push(path);
        return options.siblings?.[path] ?? text;
      },
      listDeclarations: dir =>
        Object.keys(options.siblings ?? {})
          .filter(path => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'))
          .sort(),
      canonical: path => path.replace(/\/+/g, '/'),
      lstat: path => {
        if (options.facts && path in options.facts) return options.facts[path] ?? null;
        if ((options.symlinks ?? []).includes(path)) return { type: 'symlink', uid: 0, gid: 0, mode: 0o777 };
        return path.endsWith('.json') ? ROOT_FILE : ROOT_DIR;
      },
      isRealFile: path => (options.realFiles ?? []).includes(path),
      isRoot: () => options.root ?? true,
      observeHost: () => host.state(),
      io: () => host,
      readRootFile: path => host.body(path) ?? null,
      now: () => clock.now,
    },
  };
}

function exec(h: Harness, argv: string[]): number {
  return run(argv, { deps: h.deps, out: line => h.out.push(line), err: line => h.err.push(line) });
}

describe('arguments → USAGE (2)', () => {
  for (const argv of [[], ['render'], ['deploy', 'test'], ['check', 'Test'], ['check', 'test', 'extra'], ['check', 'test', '--force'], ['check', 'test', '--declaration']]) {
    test(JSON.stringify(argv), () => {
      const h = harness();
      expect(exec(h, argv)).toBe(EXIT.USAGE);
      expect(h.err.at(-1)).toContain('exit: 0 ok');
      expect(h.reads).toEqual([]);
    });
  }

  test('parseArgs: default and explicit declaration', () => {
    expect(parseArgs(['check', 'test'])).toEqual({ verb: 'check', instance: 'test', declaration: null, exitCode: false });
    expect(parseArgs(['apply', 'test', '--declaration', '/tmp/d.json'])).toEqual({
      verb: 'apply',
      instance: 'test',
      declaration: '/tmp/d.json',
      exitCode: false,
    });
    expect(parseArgs(['check', 'test', '--exit-code'])).toEqual({
      verb: 'check',
      instance: 'test',
      declaration: null,
      exitCode: true,
    });
    expect(parseArgs(['apply', 'test', '--exit-code'])).toEqual({ error: '--exit-code applies to check only' });
    expect(parseArgs(['check', 'test', '--exit-code', '--exit-code'])).toEqual({ error: '--exit-code given twice' });
  });
});

describe('the instance lock (spec S12, Q2)', () => {
  const HOLDER: LockHolder = { pids: [4321], verb: 'init', pid: 4321, since: '2026-10-08T10:00:00.000Z' };

  test('check takes it SHARED, apply EXCLUSIVE, render none; each is released at the end', () => {
    const check = harness();
    expect(exec(check, ['check', 'test'])).toBe(EXIT.OK);
    expect(check.locks).toEqual(['take test sh check', 'release test']);
    const apply = harness();
    exec(apply, ['apply', 'test']);
    expect(apply.locks).toEqual(['take test ex apply', 'release test']);
    const render = harness();
    expect(exec(render, ['render', 'test'])).toBe(EXIT.OK);
    expect(render.locks).toEqual([]);
  });

  test('check during init or apply: EXIT.BUSY (5) with the holder named, nothing read or checked', () => {
    const h = harness({ lock: { busy: HOLDER } });
    expect(exec(h, ['check', 'test'])).toBe(EXIT.BUSY);
    expect(EXIT.BUSY).toBe(5);
    expect(h.out).toEqual([
      "provision: instance 'test' is being changed by init pid 4321 since 2026-10-08T10:00:00.000Z; not checked",
    ]);
    expect(h.reads).toEqual([]);
  });

  test('apply during init: REFUSED (3), nothing read or written', () => {
    const h = harness({ lock: { busy: HOLDER } });
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(h.err).toEqual([
      "provision: instance 'test' is locked by init pid 4321 since 2026-10-08T10:00:00.000Z; wait or check that process",
    ]);
    expect(h.reads).toEqual([]);
    expect(h.host.mutations).toBe(0);
  });

  test("untrusted lock directories are REFUSED; a non-root caller is refused before any lock", () => {
    const refused = harness({ lock: { refused: "lock: '/var/lib/dedalo_publication_host_init' is a symlink" } });
    expect(exec(refused, ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(refused.err.join('\n')).toContain('is a symlink');
    expect(refused.reads).toEqual([]);
    const user = harness({ root: false });
    expect(exec(user, ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(user.locks).toEqual([]);
  });

  test("lockHeld (init's in-process apply): no second acquisition; another instance's handle throws", () => {
    const h = harness();
    const log: string[] = [];
    const held = fakeHandle('test', 'ex', log);
    run(['apply', 'test'], { deps: h.deps, out: line => h.out.push(line), err: line => h.err.push(line), lockHeld: held });
    expect(h.locks).toEqual([]);
    expect(log).toEqual([]); // the caller's handle is the caller's to release
    expect(() => run(['apply', 'test'], { deps: h.deps, lockHeld: fakeHandle('other', 'ex', log) })).toThrow(/instance 'other'/);
    expect(() => run(['apply', 'test'], { deps: h.deps, lockHeld: fakeHandle('test', 'sh', log) })).toThrow(/shared lock/);
  });

  test('the lock is released when apply fails too', () => {
    const h = harness();
    const failing: ProvisionDeps = {
      ...h.deps,
      observeHost: () => {
        throw new Error('observe exploded');
      },
    };
    expect(run(['apply', 'test'], { deps: failing, out: () => {}, err: () => {} })).toBe(EXIT.FAILED);
    expect(h.locks).toEqual(['take test ex apply', 'release test']);
  });

  test('the production lock is lock.ts acquireInstanceLockSync on INIT_BASE (a non-root caller cannot take it)', () => {
    expect(typeof hostDeps().lock).toBe('function');
  });
});

describe('init dispatch (spec §2.3)', () => {
  test("parseArgs(['init', …]) stays USAGE, naming runInit", () => {
    expect(INIT_VERB).toBe('init');
    expect(parseArgs(['init', 'test'])).toEqual({
      error: "'init' has its own command line: init/run.ts runInit (start it with deploy/install.sh)",
    });
    const lines = usageLines();
    expect(lines.findIndex(line => line.includes('init <instance>'))).toBeLessThan(lines.findIndex(line => line.includes('exit: 0 ok')));
    expect(lines.at(-1)).toContain('5 busy');
  });

  test('the entry dispatches `init` to runInit, whose footgun guards refuse a hand start before anything is read', () => {
    const proc = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, '..', 'src', 'provision', 'cli.ts'), 'init', 'test', '--dry-run'],
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    // A hand start (not env -i, no --no-env-file/--no-install/--config, a non-root cwd): REFUSED by
    // the guards, which run before the lock, the journal or any input is touched.
    expect(proc.exitCode).toBe(EXIT.REFUSED);
    const stderr = proc.stderr.toString();
    expect(stderr).toContain('provision init: ');
    expect(stderr).toContain('— start init through deploy/install.sh');
    expect(stderr).not.toContain('FAILED');
    const bad = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, '..', 'src', 'provision', 'cli.ts'), 'init', 'test', '--declaration', '/x'],
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(bad.exitCode).toBe(EXIT.USAGE);
    expect(bad.stderr.toString()).toContain('init writes the declaration; give the draft with --draft');
  });

  test('guarded and siblingProblems are exported for init (spec §2.2)', () => {
    const lines: string[] = [];
    guarded(line => lines.push(line))('plain');
    expect(lines).toEqual(['plain']);
    expect(() => guarded(() => {})(`DB_PASSWORD=${HEX32}`)).toThrow(/refusing to print/);
    const h = harness();
    expect(siblingProblems(derive(unixDeclaration()), DEFAULT_SOURCE, h.deps, new Set())).toEqual([]);
  });
});

describe('declaration → REFUSED (3)', () => {
  test('reads the default path', () => {
    const h = harness();
    exec(h, ['render', 'test']);
    expect(h.reads).toEqual([DEFAULT_SOURCE]);
  });

  test('absent, not JSON, malformed, or naming another instance', () => {
    expect(exec(harness({ text: null }), ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ text: '{' }), ['check', 'test'])).toBe(EXIT.REFUSED);
    const malformed = harness({ text: JSON.stringify({ ...unixDeclaration(), extra: true }) });
    expect(exec(malformed, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(malformed.err.join('\n')).toContain('refused');
    const other = harness({ text: JSON.stringify({ ...unixDeclaration(), instance: 'other' }) });
    expect(exec(other, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(other.err.join('\n')).toContain("declares instance 'other'");
  });

  test('several instances: a sibling sharing a principal, the v2 unit or port, or a state root is REFUSED, named', () => {
    const own = unixDeclaration();
    const sibling = (patch: Partial<HostDeclaration>) =>
      harness({ siblings: { '/etc/dedalo_publication_host/other.json': JSON.stringify({ ...own, instance: 'other', ...patch }) } });
    // Everything shared (a copy of the declaration under another name): every clash is named, nothing observed.
    const h = sibling({});
    expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
    const said = h.err.join('\n');
    for (const clash of [
      "agent_user 'dedalo-pubhost' is that instance's agent_user",
      "v2.user 'dedalo-api-v2' is that instance's v2.user",
      "v1.user 'dedalo-api-v1' is that instance's v1.user",
      "v2.group 'dedalo-api-v2'",
      "v2.unit 'dedalo-publication-api-v2'",
      'v2.port 3100',
      "state_root '/srv/dedalo_publication' overlaps that instance's state_root",
    ]) {
      expect(said).toContain(`${clash}`);
    }
    expect(said).toContain("also used by instance 'other' (/etc/dedalo_publication_host/other.json)");
    // A fully separated sibling passes the check (drift on a fresh host, not a refusal).
    const separated = sibling({
      agent_user: 'dedalo-pubhost-other',
      state_root: '/srv/dedalo_publication_other',
      v1: { user: 'dedalo-api-v1-other' },
      v2: { unit: 'dedalo-publication-api-v2-other', user: 'dedalo-api-v2-other', group: 'dedalo-api-v2-other', port: 3101, health_url: 'http://127.0.0.1:3101/health' },
    });
    expect(exec(separated, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
    expect(separated.err).toEqual([]);
  });

  test('several instances: an unparsable sibling or a second declaration of this instance is REFUSED', () => {
    const broken = harness({ siblings: { '/etc/dedalo_publication_host/other.json': '{' } });
    expect(exec(broken, ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(broken.err.join('\n')).toContain("cannot check isolation against '/etc/dedalo_publication_host/other.json' (not JSON)");
    const twice = harness({ siblings: { '/etc/dedalo_publication_host/copy.json': JSON.stringify(unixDeclaration()) } });
    expect(exec(twice, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(twice.err.join('\n')).toContain("/etc/dedalo_publication_host/copy.json declares instance 'test' too");
    // The instance's own declaration in the config base is never its own sibling — also when
    // named another way (compared canonically).
    const self = harness({ siblings: { [DEFAULT_SOURCE]: JSON.stringify(unixDeclaration()) } });
    expect(exec(self, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
    const spelled = harness({ siblings: { [DEFAULT_SOURCE]: JSON.stringify(unixDeclaration()) } });
    expect(exec(spelled, ['check', 'test', '--declaration', '/etc/dedalo_publication_host//test.json', '--exit-code'])).toBe(EXIT.DRIFT);
    expect(spelled.err).toEqual([]);
    // A symlinked sibling is never followed and never skipped: refused, named.
    const linked = harness({
      siblings: { '/etc/dedalo_publication_host/other.json': '{}' },
      symlinks: ['/etc/dedalo_publication_host/other.json'],
    });
    expect(exec(linked, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(linked.err.join('\n')).toContain(
      "cannot check isolation against '/etc/dedalo_publication_host/other.json': sibling declaration '/etc/dedalo_publication_host/other.json' is a symlink",
    );
  });

  describe('the declaration trust law (check/apply): root acts on it, so only root may be able to edit it', () => {
    const DIR = '/etc/dedalo_publication_host';
    const cases: ReadonlyArray<readonly [string, Record<string, PathFacts | null>, string]> = [
      ['group-writable', { [DEFAULT_SOURCE]: { ...ROOT_FILE, mode: 0o664 } }, `the declaration '${DEFAULT_SOURCE}' is group- or world-writable (mode 0664)`],
      ['world-writable', { [DEFAULT_SOURCE]: { ...ROOT_FILE, mode: 0o646 } }, `the declaration '${DEFAULT_SOURCE}' is group- or world-writable (mode 0646)`],
      ['not root-owned', { [DEFAULT_SOURCE]: { ...ROOT_FILE, uid: 1000 } }, `the declaration '${DEFAULT_SOURCE}' is owned by uid 1000, not root`],
      ['a symlink', { [DEFAULT_SOURCE]: { type: 'symlink', uid: 0, gid: 0, mode: 0o777 } }, `the declaration '${DEFAULT_SOURCE}' is a symlink — a link can be repointed after this check`],
      ['a directory', { [DEFAULT_SOURCE]: ROOT_DIR }, `the declaration '${DEFAULT_SOURCE}' is a dir, not a regular file`],
      ['absent', { [DEFAULT_SOURCE]: null }, `the declaration '${DEFAULT_SOURCE}' does not exist or cannot be inspected`],
      ['parent not root-owned', { [DIR]: { ...ROOT_DIR, uid: 1000 } }, `'${DIR}' (above the declaration '${DEFAULT_SOURCE}') is owned by uid 1000, not root`],
      ['parent group-writable', { [DIR]: { ...ROOT_DIR, mode: 0o775 } }, `'${DIR}' (above the declaration '${DEFAULT_SOURCE}') is group- or world-writable (mode 0775)`],
      ['/etc world-writable', { '/etc': { ...ROOT_DIR, mode: 0o777 } }, `'/etc' (above the declaration '${DEFAULT_SOURCE}') is group- or world-writable`],
      ["'/' itself", { '/': { ...ROOT_DIR, uid: 501 } }, `'/' (above the declaration '${DEFAULT_SOURCE}') is owned by uid 501`],
      ['parent a symlink', { [DIR]: { type: 'symlink', uid: 0, gid: 0, mode: 0o777 } }, `'${DIR}' (above the declaration '${DEFAULT_SOURCE}') is a symlink, not a real directory`],
    ];
    for (const [label, facts, said] of cases) {
      for (const verb of ['check', 'apply']) {
        test(`${verb}: ${label} → REFUSED, named, never read, nothing written`, () => {
          const h = harness({ facts });
          expect(exec(h, [verb, 'test'])).toBe(EXIT.REFUSED);
          const printed = h.err.join('\n');
          expect(printed).toContain(said);
          expect(h.reads).toEqual([]);
          expect(h.host.mutations).toBe(0);
        });
      }
    }

    test('the refusal names the fix', () => {
      const h = harness({ facts: { [DEFAULT_SOURCE]: { ...ROOT_FILE, mode: 0o666, uid: 1000 } } });
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.REFUSED);
      expect(h.err.join('\n')).toContain(`chown root:root '${DEFAULT_SOURCE}' && chmod go-w '${DEFAULT_SOURCE}'`);
      expect(h.err.join('\n')).toContain(`keep declarations in ${DIR}/`);
    });

    test('accepted when the file and every directory up to / are root-owned and not group/world-writable', () => {
      const h = harness({ facts: { [DEFAULT_SOURCE]: { ...ROOT_FILE, mode: 0o600 }, [DIR]: { ...ROOT_DIR, mode: 0o700 } } });
      expect(exec(h, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
      expect(h.err).toEqual([]);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    });

    test('--declaration elsewhere: judged by its own chain (relative paths resolved), and the config base still is', () => {
      const elsewhere = '/root/drafts/test.json';
      const bad = harness({ facts: { '/root/drafts': { ...ROOT_DIR, uid: 1000 } } });
      expect(exec(bad, ['check', 'test', '--declaration', elsewhere])).toBe(EXIT.REFUSED);
      expect(bad.err.join('\n')).toContain(`'/root/drafts' (above the declaration '${elsewhere}') is owned by uid 1000`);
      // The config base is judged even with no sibling in it: write access there could REMOVE a sibling.
      const base = harness({ facts: { [DIR]: { ...ROOT_DIR, mode: 0o777 } } });
      expect(exec(base, ['check', 'test', '--declaration', elsewhere])).toBe(EXIT.REFUSED);
      expect(base.err.join('\n')).toContain(`'${DIR}' (above the config base '${DIR}') is group- or world-writable`);
    });

    test('--declaration relative: resolved against the cwd BEFORE its chain is judged (never a fixed-point walk on ".")', () => {
      const drafts = join(process.cwd(), 'zz_relative_drafts');
      const resolved = join(drafts, 'test.json');
      const bad = harness({ facts: { [drafts]: { ...ROOT_DIR, uid: 1000 } } });
      expect(exec(bad, ['check', 'test', '--declaration', 'zz_relative_drafts/test.json'])).toBe(EXIT.REFUSED);
      expect(bad.err.join('\n')).toContain(`'${drafts}' (above the declaration '${resolved}') is owned by uid 1000`);
      expect(bad.reads).toEqual([]);
      // A trusted relative chain is accepted (the walk ends at '/', not at '.').
      const good = harness();
      expect(exec(good, ['check', 'test', '--declaration', './zz_relative_drafts/test.json', '--exit-code'])).toBe(EXIT.DRIFT);
      expect(good.err).toEqual([]);
    });

    test('render is exempt: it needs no root, writes nothing, grants nothing', () => {
      const h = harness({ root: false, facts: { [DEFAULT_SOURCE]: { ...ROOT_FILE, uid: 1000, mode: 0o666 } } });
      expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
    });

    test('a sibling a non-root principal can edit is refused, named (it steers the isolation check)', () => {
      const other = `${DIR}/other.json`;
      const h = harness({
        siblings: { [other]: JSON.stringify({ ...unixDeclaration(), instance: 'other' }) },
        facts: { [other]: { ...ROOT_FILE, uid: 1000 } },
      });
      expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
      expect(h.err.join('\n')).toContain(
        `cannot check isolation against '${other}': sibling declaration '${other}' is owned by uid 1000, not root`,
      );
      expect(h.reads).not.toContain(other); // judged before it is read
    });

    test('a bad directory is named once across the declaration and its siblings', () => {
      const lines = declarationTrustProblems(DEFAULT_SOURCE, 'the declaration', path =>
        path === '/etc' ? { ...ROOT_DIR, mode: 0o777 } : path.endsWith('.json') ? ROOT_FILE : ROOT_DIR,
      );
      expect(lines).toHaveLength(1);
    });
  });

  test('check and apply refuse without root; render does not need it', () => {
    expect(exec(harness({ root: false }), ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ root: false }), ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ root: false }), ['render', 'test'])).toBe(EXIT.OK);
  });

  test('a plan refusal (hand-edited artifact) is REFUSED and names it', () => {
    const h = harness();
    exec(h, ['apply', 'test']);
    const l = derive(unixDeclaration());
    const env = h.host.entries.get(l.envFile);
    if (!env) throw new Error('fixture');
    env.body += 'EXTRA="1"\n';
    expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(h.err.join('\n')).toContain('edited by hand');
  });
});

describe('render / check / apply', () => {
  test("the host probe reaches derive(): a RHEL host (real apachectl only) renders apachectl, Ubuntu's apache2ctl", () => {
    for (const bin of ['/usr/sbin/apachectl', '/usr/sbin/apache2ctl']) {
      const h = harness({ realFiles: [bin] });
      expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
      expect(h.out).toContain(`WEB_CONFIGTEST_BIN="${bin}"`);
      expect(h.out.some(line => line.endsWith(`= ${bin} -t`))).toBe(true);
    }
  });

  test('render prints every artifact with its stamp and passes the secret guard', () => {
    const h = harness();
    expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
    expect(h.out[0]).toBe('=== /etc/dedalo_publication_host/test/agent.env (env, root:root 0644)');
    expect(h.out[1]).toMatch(/^# dedalo-provision: test env [0-9a-f]{64}$/);
    expect(h.out).toContain('STATE_ROOT="/srv/dedalo_publication"');
    expect(h.out).toContain('INSTANCE="test"');
  });

  test('check on a fresh host → DRIFT (1), writes nothing', () => {
    const h = harness();
    expect(exec(h, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
    expect(h.out.at(-1)).toMatch(/action\(s\) would change instance 'test'/);
    expect(h.host.mutations).toBe(0);
  });

  test('a plain check that lists changes exits 0 (bun run prints "error: … exited" for any non-zero), writes nothing', () => {
    const h = harness();
    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    expect(h.out.some(line => line.startsWith('would: '))).toBe(true);
    expect(h.out.at(-1)).toBe("provision: " + h.out.filter(line => line.startsWith('would: ')).length + " action(s) would change instance 'test' — run 'apply' to make them");
    expect(h.err).toEqual([]);
    expect(h.host.mutations).toBe(0);
  });

  test('apply → OK (0); then check → OK (0) and a second apply writes nothing', () => {
    const h = harness();
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    // 11 artifacts and state files, plus the two host lock files (created empty once, spec S12).
    expect(h.out.at(-1)).toBe("provision: instance 'test' converged (13 file(s) written)");
    const after = h.host.mutations;
    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.host.mutations).toBe(after);
  });

  test('apply that fails → FAILED (4) and names the action', () => {
    const h = harness();
    exec(h, ['apply', 'test']);
    const l = derive(unixDeclaration());
    const env = h.host.entries.get(l.envFile);
    if (!env) throw new Error('fixture');
    env.mode = 0o600;
    h.host.chmod = () => {
      throw new Error('EPERM: operation not permitted');
    };
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.FAILED);
    expect(h.err.join('\n')).toContain(`[failed] chmod 0644 ${l.envFile}: EPERM`);
  });
});

describe('the secret guard', () => {
  test('render prints the engine fragment, token placeholder included: the guard knows it is not a value', () => {
    const h = harness();
    expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
    expect(h.out).toContain(`${ENGINE_KEYS.token}="${TOKEN_PLACEHOLDER}"`);
    expect(secretShapedAssignment(`${ENGINE_KEYS.token}="${TOKEN_PLACEHOLDER}"`)).toBeNull();
  });

  test('secretShapedAssignment', () => {
    expect(secretShapedAssignment(`SERVICE_TOKEN="${HEX32}"`)).toBe('SERVICE_TOKEN');
    expect(secretShapedAssignment('would: x API_KEY=abcdefghijk')).toBe('API_KEY');
    expect(secretShapedAssignment('TLS_KEY_FILE="/etc/dedalo_publication_host/test/tls/server.key"')).toBeNull();
    expect(secretShapedAssignment('SERVICE_TOKEN=short')).toBeNull();
    expect(secretShapedAssignment('STATE_ROOT="/srv/x"')).toBeNull();
  });

  test('an error carrying a credential-shaped assignment is refused, the value never printed', () => {
    const h = harness();
    h.deps.observeHost = () => {
      throw new Error(`boom SERVICE_TOKEN=${HEX32}`);
    };
    expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
    const printed = [...h.out, ...h.err].join('\n');
    expect(printed).toContain("assigns 'SERVICE_TOKEN' a value");
    expect(printed).not.toContain(HEX32);
  });
});

describe('hostDeps (the real world, read-only parts)', () => {
  test('reads a declaration file, answers null for a missing one, and is not root in the suite', () => {
    const deps = hostDeps();
    expect(deps.readDeclaration(join(import.meta.dir, 'fixtures', 'provision_declaration.ts'))).toContain('unixDeclaration');
    expect(deps.readDeclaration('/nonexistent/dedalo_publication_host/test.json')).toBeNull();
    expect(deps.isRoot()).toBe(false);
    // lstat never follows: the facts of what is there, or null.
    expect(deps.lstat(import.meta.dir)?.type).toBe('dir');
    expect(deps.lstat(join(import.meta.dir, 'provision_cli.test.ts'))?.type).toBe('file');
    expect(deps.lstat('/nonexistent/dedalo_publication_host/test.json')).toBeNull();
    expect(typeof deps.io().mkdir).toBe('function');
  });

  test('with no sinks given, a usage error goes to the console and still exits USAGE', () => {
    expect(run(['render'])).toBe(EXIT.USAGE);
  });
});

describe('apply converges in one run', () => {
  test('the token minted by this apply reaches the engine fragment in the same run; check is then clean', () => {
    const h = harness();
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    const l = derive(unixDeclaration());
    expect(h.host.body(l.engineFragmentPath)).toContain(
      `${ENGINE_KEYS.fingerprint}="${instanceFingerprint('test', FAKE_TOKEN)}"`,
    );
    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
  });

  test('tls: check names what it would issue; apply issues before any unit starts; a second apply writes nothing', () => {
    const h = harness({ declaration: tlsDeclaration() });
    const l = derive(tlsDeclaration());
    expect(exec(h, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
    expect(h.out).toContain('would: issue the ca certificate (tls)');
    expect(h.host.mutations).toBe(0);

    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.out.some(line => line.startsWith('tls: issued [ca, server, client]'))).toBe(true);
    for (const path of [l.tls!.caCert, l.tls!.serverCert, l.tls!.serverKey, l.engineBundlePath]) {
      expect(h.host.body(path)).toContain('-----BEGIN');
    }
    expect(h.host.entries.get(l.tls!.serverKey)).toMatchObject({ uid: 990, gid: 0, mode: 0o400 });
    const caWritten = h.host.calls.indexOf(`rename ${l.tls!.caKey}`);
    expect(caWritten).toBeGreaterThan(-1);
    expect(caWritten).toBeLessThan(h.host.calls.indexOf('start dedalo-publication-host-test'));

    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    const before = h.host.mutations;
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.host.mutations).toBe(before);
  });

  describe('reissued tls restarts the RUNNING agent (boot.ts loads TLS once)', () => {
    const AGENT = 'dedalo-publication-host-test';
    const DAY = 86_400_000;
    const restarts = (h: Harness) => h.host.calls.filter(call => call === `restart ${AGENT}`).length;

    function converged(): { h: Harness; clock: { now: Date }; l: ReturnType<typeof derive> } {
      const clock = { now: new Date('2026-10-03T12:00:00Z') };
      const h = harness({ declaration: tlsDeclaration(), clock });
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(h.host.units.get(AGENT)?.active).toBe(true);
      expect(restarts(h)).toBe(0); // a first run STARTS the unit after issuance: no restart
      return { h, clock, l: derive(tlsDeclaration()) };
    }

    test('a leaf renewal inside its window: check names the restart, apply restarts exactly once, then clean', () => {
      const { h, clock } = converged();
      clock.now = new Date(clock.now.getTime() + (TLS_VALIDITY.leafDays - TLS_VALIDITY.leafRenewDays + 1) * DAY);
      h.out.length = 0;
      expect(exec(h, ['check', 'test', '--exit-code'])).toBe(EXIT.DRIFT);
      expect(h.out).toContain(`would: systemctl restart ${AGENT} (the reissued tls material)`);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(1);
      expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    });

    test('a CA rotation (operator deleted tls/ca.*) restarts the agent; the restart comes after the writes', () => {
      const { h, l } = converged();
      h.host.entries.delete(l.tls!.caCert);
      h.host.entries.delete(l.tls!.caKey);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(1);
      expect(h.out.some(line => line.includes('STAYS VALID'))).toBe(false); // a CA rotation does revoke
      expect(h.host.calls.lastIndexOf(`rename ${l.tls!.serverKey}`)).toBeLessThan(h.host.calls.indexOf(`restart ${AGENT}`));
    });

    test('a client-only reissue does not restart (the agent trusts the CA, not the leaf)', () => {
      const { h, l } = converged();
      h.host.entries.delete(l.engineBundlePath);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(0);
      // …so the reissue revokes nothing, and the operator is told how to revoke.
      expect(h.out.some(line => line.includes('OLD client certificate STAYS VALID') && line.includes(l.tls!.caKey))).toBe(true);
    });

    test('an inactive agent is left to its start, not restarted', () => {
      const { h, l } = converged();
      h.host.units.set(AGENT, { enabled: true, active: false });
      h.host.entries.delete(l.tls!.serverCert);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(0);
      expect(h.host.calls.filter(call => call === `start ${AGENT}`).length).toBe(2);
    });
  });
});
