/**
 * ROOT'S TRUST ONESHOT (src/provision/fapolicyd_trust_main.ts runTrust) on scratch directories:
 * the agent passes nothing, the run derives everything from the declaration's layout, writes ONE
 * stamped file atomically, tells the daemon and waits; a second run is `unchanged`; a refusal
 * keeps the previous file; a foreign file is never touched; an uninstalled fapolicyd or a retired
 * instance removes OUR file only; the result record is what the agent reads.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExecResult, TrustExec } from '../src/provision/exec_contract';
import { parseTrustResult, realTrustIo, trustLinesOf } from '../src/provision/fapolicyd_trust';
import type { TrustRunDeps } from '../src/provision/fapolicyd_trust_main';
import { TrustRefused, exitCodeOf, parseTrustArgv, productionTrustDeps, runTrust, trustFileIo } from '../src/provision/fapolicyd_trust_main';
import { stamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { LockBusy } from '../src/provision/lock';
import { scratchPath } from './fixtures/instance';
import { unixDeclaration } from './fixtures/provision_declaration';

const R = scratchPath('fapolicyd_trust_main');
const TRUST_DIR = join(R, 'trust.d');
const CONFIG = join(R, 'etc');
const DECLARATION = join(CONFIG, 'test.json');
const TRUST_FILE = join(TRUST_DIR, 'dedalo_test');
const RESULT = join(CONFIG, 'test', 'fapolicyd_trust.json');
const UID = process.getuid?.() ?? 0;

afterAll(() => rmSync(R, { recursive: true, force: true }));

function file(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

/** The scratch layout: trust.file and trust.result repointed into R (production: /etc/…). */
function scratchLayout(): AgentLayout {
  const layout = derive(
    { ...unixDeclaration(), agent_dir: join(R, 'agent'), state_root: join(R, 'state'), bun_bin: join(R, 'bun'), paths: { config_base: CONFIG, host_base: join(R, 'host') } },
    { fapolicyd: true },
  );
  return { ...layout, trust: { ...(layout.trust as NonNullable<AgentLayout['trust']>), file: TRUST_FILE, result: RESULT } };
}

interface World {
  deps: TrustRunDeps;
  calls: string[];
  daemon: { active: boolean; loaded: string; update: number };
  installed: boolean;
  layout: AgentLayout | null | 'refused';
  busy: boolean;
}

function world(): World {
  const calls: string[] = [];
  const w: World = {
    calls,
    daemon: { active: true, loaded: '', update: 0 },
    installed: true,
    layout: scratchLayout(),
    busy: false,
    deps: undefined as unknown as TrustRunDeps,
  };
  const exec: TrustExec = {
    fapolicydActive: () => w.daemon.active,
    fapolicydUpdate: (): ExecResult => {
      calls.push('update');
      // The daemon loads what trust.d holds NOW (the real one, asynchronously: the wait covers it).
      w.daemon.loaded = existsSync(TRUST_FILE) ? trustLinesOf(readFileSync(TRUST_FILE, 'utf8')).map(line => `filedb ${line}`).join('\n') : '';
      return { code: w.daemon.update, stdout: '', stderr: w.daemon.update === 0 ? '' : 'Unable to open fifo' };
    },
    fapolicydDump: (): ExecResult => {
      calls.push('dump');
      return { code: 0, stdout: w.daemon.loaded, stderr: '' };
    },
    sleep: () => {},
  };
  w.deps = {
    instance: 'test',
    declarationPath: DECLARATION,
    trustDir: TRUST_DIR,
    fapolicydInstalled: () => w.installed,
    loadLayout: () => {
      if (w.layout === 'refused') throw new TrustRefused(["the declaration '/etc/x.json' is group- or world-writable"]);
      return w.layout;
    },
    lock: () => {
      calls.push('lock');
      if (w.busy) throw new LockBusy('/locks/provision.lock', null as never, 'the host provision lock is held by pid 1');
      return { release: () => calls.push('unlock') } as never;
    },
    trees: realTrustIo(),
    files: trustFileIo(UID),
    exec,
    now: () => new Date('2026-10-09T10:00:00Z'),
    log: () => {},
  };
  return w;
}

function seed(): void {
  rmSync(R, { recursive: true, force: true });
  mkdirSync(TRUST_DIR, { recursive: true, mode: 0o755 });
  mkdirSync(join(CONFIG, 'test'), { recursive: true, mode: 0o755 });
  file(DECLARATION, '{}');
  file(join(R, 'bun'), 'BUN');
  file(join(R, 'agent', 'src', 'index.ts'), 'export {};');
  file(join(R, 'state', 'publication_api', 'v2', 'releases', '2.0.1_1111111', 'src', 'index.ts'), '// r1');
  symlinkSync('releases/2.0.1_1111111', join(R, 'state', 'publication_api', 'v2', 'current'));
}

const record = () => parseTrustResult(readFileSync(RESULT, 'utf8'));

beforeEach(seed);

describe('one run', () => {
  test('applied: the stamped file holds the derived set, the daemon was told and waited for, the record says so', () => {
    const w = world();
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('applied');
    expect(exitCodeOf(result)).toBe(0);
    const lines = trustLinesOf(readFileSync(TRUST_FILE, 'utf8'));
    expect(lines.map(line => line.split(' ')[0])).toEqual([
      join(R, 'agent', 'src', 'index.ts'),
      join(R, 'bun'),
      join(R, 'state', 'publication_api', 'v2', 'releases', '2.0.1_1111111', 'src', 'index.ts'),
      // the instance's polkit rule, by its rendered bytes (fapolicyd_trust.ts: polkitd reads it as a language file)
      '/etc/polkit-1/rules.d/60-dedalo-publication-host-test.rules',
      // The file is in byte order of the path: where the checkout lives decides where /etc sorts.
    ].sort());
    expect(w.calls).toEqual(['lock', 'update', 'dump', 'unlock']);
    expect(record()).toMatchObject({ outcome: 'applied', entries: 4, releases: ['v2:2.0.1_1111111'], reasons: [] });
    // Atomic: no temp is left beside it.
    expect(existsSync(join(TRUST_DIR, '.dedalo_test.tmp'))).toBe(false);
  });

  test('a second run is unchanged: no write, no update', () => {
    const w = world();
    runTrust(w.deps);
    w.calls.length = 0;
    expect(runTrust(w.deps).outcome).toBe('unchanged');
    expect(w.calls).toEqual(['lock', 'unlock']);
  });

  test('a new release is added and waited for; the daemon not running reads it at its start', () => {
    const w = world();
    runTrust(w.deps);
    file(join(R, 'state', 'publication_api', 'v2', 'releases', '2.0.2_2222222', 'src', 'index.ts'), '// r2');
    w.daemon.active = false;
    w.calls.length = 0;
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('inactive');
    expect(exitCodeOf(result)).toBe(0);
    expect(w.calls).toEqual(['lock', 'unlock']);
    expect(readFileSync(TRUST_FILE, 'utf8')).toContain('2.0.2_2222222');
  });

  test('a failed update fails the run (exit 1) and names it — the file is written', () => {
    const w = world();
    w.daemon.update = 6;
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('failed');
    expect(exitCodeOf(result)).toBe(1);
    expect(result.reasons[0]).toContain('fapolicyd-cli --update exited 6');
  });

  test('a refused derivation keeps the previous file whole', () => {
    const w = world();
    runTrust(w.deps);
    const before = readFileSync(TRUST_FILE, 'utf8');
    rmSync(join(R, 'bun'));
    symlinkSync('/bin/sh', join(R, 'bun'));
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('refused');
    expect(result.reasons.join()).toContain('is a symlink, not a regular file');
    expect(readFileSync(TRUST_FILE, 'utf8')).toBe(before);
    expect(record()?.outcome).toBe('refused');
  });

  test('a release that cannot be verified is left out and named; the rest is applied (exit 0)', () => {
    const w = world();
    rmSync(join(R, 'state', 'publication_api', 'v2', 'current'));
    symlinkSync('releases/0.0.0_drill00', join(R, 'state', 'publication_api', 'v2', 'current'));
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('applied');
    expect(exitCodeOf(result)).toBe(0);
    expect(result.releases).toEqual([]);
    expect(result.reasons.join()).toContain("points at 'releases/0.0.0_drill00', not releases/<id> — no v2 release is trusted");
    expect(readFileSync(TRUST_FILE, 'utf8')).not.toContain('2.0.1_1111111');
    expect(record()?.reasons).toEqual(result.reasons);
    // unchanged next time, still naming it
    expect(runTrust(w.deps)).toMatchObject({ outcome: 'unchanged', reasons: result.reasons });
  });

  test('a file that is not ours is never rewritten', () => {
    const w = world();
    writeFileSync(TRUST_FILE, '/usr/bin/evil 1 aa\n');
    expect(runTrust(w.deps).reasons.join()).toContain('no stamp');
    expect(readFileSync(TRUST_FILE, 'utf8')).toBe('/usr/bin/evil 1 aa\n');
    writeFileSync(TRUST_FILE, stamp('fapolicyd_trust', 'other', '/x 1 aa\n'));
    expect(runTrust(w.deps).reasons.join()).toContain("stamped for 'other fapolicyd_trust'");
  });

  test('a trust directory open to others, or a link in place of the file, refuses', () => {
    const w = world();
    rmSync(TRUST_DIR, { recursive: true, force: true });
    symlinkSync(R, TRUST_DIR);
    expect(runTrust(w.deps).reasons.join()).toContain('is not a real directory');
    rmSync(TRUST_DIR);
    mkdirSync(TRUST_DIR, { mode: 0o755 });
    symlinkSync('/etc/passwd', TRUST_FILE);
    expect(runTrust(w.deps).reasons.join()).toContain('is a symlink, not our trust file');
  });

  test('busy: the host provision lock is held past its wait', () => {
    const w = world();
    w.busy = true;
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('busy');
    expect(existsSync(TRUST_FILE)).toBe(false);
  });

  test('a declaration that may not be read, or names another instance, refuses before anything', () => {
    const w = world();
    w.layout = 'refused';
    expect(runTrust(w.deps).reasons).toEqual(["the declaration '/etc/x.json' is group- or world-writable"]);
    w.layout = { ...scratchLayout(), instance: 'other' };
    expect(runTrust(w.deps).reasons[0]).toContain("declares instance 'other'");
    expect(w.calls).not.toContain('lock');
  });
});

describe('removal: only OUR file, only when fapolicyd or the instance is gone', () => {
  test('fapolicyd uninstalled: our file goes (no daemon to tell)', () => {
    const w = world();
    runTrust(w.deps);
    w.installed = false;
    w.calls.length = 0;
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('not_installed');
    expect(existsSync(TRUST_FILE)).toBe(false);
    expect(w.calls).toEqual([]);
  });

  test('the instance retired (no declaration): our file goes and the daemon is told', () => {
    const w = world();
    runTrust(w.deps);
    w.layout = null;
    w.calls.length = 0;
    expect(runTrust(w.deps).outcome).toBe('retired');
    expect(existsSync(TRUST_FILE)).toBe(false);
    expect(w.calls).toEqual(['update']);
  });

  test('nothing to remove: not_installed / retired with no file', () => {
    const w = world();
    w.installed = false;
    expect(runTrust(w.deps).outcome).toBe('not_installed');
    w.installed = true;
    w.layout = null;
    expect(runTrust(w.deps).outcome).toBe('retired');
  });

  test('a foreign file is left in place, loudly', () => {
    const w = world();
    writeFileSync(TRUST_FILE, '/usr/bin/evil 1 aa\n');
    w.layout = null;
    const result = runTrust(w.deps);
    expect(result.outcome).toBe('refused');
    expect(result.reasons[0]).toContain('it is left in place');
    expect(existsSync(TRUST_FILE)).toBe(true);
  });
});

describe('the unit argv and the production wiring', () => {
  test('argv: exactly <instance> <config_base>/<instance>.json', () => {
    expect(parseTrustArgv(['test', '/etc/dedalo_publication_host/test.json'])).toEqual({ instance: 'test', declarationPath: '/etc/dedalo_publication_host/test.json' });
    expect(parseTrustArgv([])).toHaveProperty('error');
    expect(parseTrustArgv(['Test', '/etc/x/Test.json'])).toHaveProperty('error');
    expect(parseTrustArgv(['test', '/etc/x/other.json'])).toHaveProperty('error');
    expect(parseTrustArgv(['test', '/etc/../x/test.json'])).toHaveProperty('error');
    expect(parseTrustArgv(['test', 'etc/test.json'])).toHaveProperty('error');
    expect(parseTrustArgv(['test', '/etc/x/test.json', 'extra'])).toHaveProperty('error');
  });

  test('production: the declaration is judged by the provisioner trust law before it is read', async () => {
    const deps = await productionTrustDeps('test', DECLARATION);
    expect(deps.trustDir).toBe('/etc/fapolicyd/trust.d');
    // A scratch declaration is owned by this user, not root: refused unread (as root, too).
    expect(() => deps.loadLayout()).toThrow(TrustRefused);
    rmSync(DECLARATION);
    expect(deps.loadLayout()).toBeNull();
    expect(typeof deps.fapolicydInstalled()).toBe('boolean');
    expect(deps.now()).toBeInstanceOf(Date);
    deps.log('a line');
    expect(() => deps.lock(scratchLayout())).toThrow();
  });
});
