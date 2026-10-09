/**
 * apply(): dumb, ordered, atomic writes, halts on the first failure, never reloads the web
 * server after a failed configtest, and a second run writes nothing.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProvisionExec } from '../src/provision/exec_contract';
import { MAP_RENDERER_FILES, rendererDigest } from '../src/provision/host_map_renderer';
import { BACKUP_SUFFIX, CREATED_SUFFIX, RELOAD_POLL, TEMP_SUFFIX, apply, hostIo, lockHostProvision, observeHost } from '../src/provision/apply';
import type { ProvisionIo } from '../src/provision/apply';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { PUBHOST_GROUP, derive } from '../src/provision/layout';
import type { Action, HostLockRef, RendererInstallAction, WriteAction } from '../src/provision/plan';
import { PlanRefused, RENDERERS, plan } from '../src/provision/plan';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FAKE_TOKEN, FakeHost, FakeInitHost } from './support/provision_fake_host';

const l = derive(unixDeclaration());

describe('apply on a fresh host', () => {
  test('converges: every action done, files in place with their metadata, token minted, audit log agent-owned', () => {
    const host = new FakeHost(l);
    const report = apply(plan(l, host.state()), host);
    expect(report.ok).toBe(true);
    expect(report.failure).toBeNull();
    expect(report.outcomes.every(o => o.status === 'done')).toBe(true);
    expect(report.written).toEqual([
      `${l.host.locksDir}/provision.lock`,
      `${l.host.locksDir}/web.lock`,
      l.state.marker,
      l.serviceTokenPath,
      l.state.auditFile,
      l.envFile,
      l.engineFragmentPath,
      l.polkitPath,
      l.sudoersPath,
      l.v2ScratchUnitPath,
      l.v2UnitPath,
      l.agentUnitPath,
    ]);
    expect(host.body(l.serviceTokenPath)).toBe(FAKE_TOKEN);
    expect(host.entries.get(l.serviceTokenPath)).toMatchObject({ uid: 0, gid: 0, mode: 0o600 });
    expect(host.entries.get(l.state.auditFile)).toMatchObject({ type: 'file', uid: 990, gid: 0, mode: 0o600, body: '' });
    expect([...host.appendOnlyPaths]).toEqual([l.state.auditFile]);
    expect(host.calls.filter(call => /^(mkdir|writeTemp|chown|chmod|rename|appendOnly) /.test(call)).at(-1)).toBe(
      `appendOnly ${l.state.auditFile}`,
    );
    expect(host.entries.get(l.state.root)).toMatchObject({ type: 'dir', uid: 0, mode: 0o755 });
    expect(host.entries.get(l.v1!.dirs.releases)).toMatchObject({ type: 'dir', uid: 990, mode: 0o755 });
    expect([...host.entries.keys()].some(path => path.endsWith(TEMP_SUFFIX))).toBe(false);
  });

  test('idempotent: the second plan is empty and a second apply makes zero mutations', () => {
    const host = new FakeHost(l);
    apply(plan(l, host.state()), host);
    const before = host.mutations;
    const second = plan(l, host.state());
    expect(second).toEqual([]);
    expect(apply(second, host).outcomes).toEqual([]);
    expect(host.mutations).toBe(before);
  });

  test('a write goes temp → chown → chmod → rename, never straight to the path', () => {
    const host = new FakeHost(l);
    apply(plan(l, host.state()), host);
    const envCalls = host.calls.filter(call => call.includes(l.envFile));
    expect(envCalls).toEqual([
      `writeTemp ${l.envFile}${TEMP_SUFFIX}`,
      `chown ${l.envFile}${TEMP_SUFFIX}`,
      `chmod ${l.envFile}${TEMP_SUFFIX}`,
      `rename ${l.envFile}`,
    ]);
  });
});

describe('apply halts on the first failure', () => {
  test('a failed configtest: the reload and everything after it are skipped, never run', () => {
    const host = new FakeHost(l);
    host.failOn = 'configtest apache';
    const actions: Action[] = [
      { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apache2ctl' },
      { op: 'web-reload', unit: 'apache2' },
      { op: 'restart', unit: 'dedalo-publication-host-test' },
    ];
    const report = apply(actions, host);
    expect(report.ok).toBe(false);
    expect(report.outcomes.map(o => o.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(report.failure?.detail).toContain('/usr/sbin/apache2ctl -t exited 1');
    expect(host.calls).toEqual(['configtest apache']);
  });

  test('a filesystem failure stops the run where it happened', () => {
    const host = new FakeHost(l);
    const actions = plan(l, host.state());
    host.entries.delete(l.configBase.slice(0, l.configBase.lastIndexOf('/')) || '/');
    const report = apply(actions, host);
    expect(report.ok).toBe(false);
    expect(report.outcomes[0]?.status).toBe('failed');
    expect(report.outcomes.slice(1).every(o => o.status === 'skipped')).toBe(true);
    expect(report.written).toEqual([]);
  });

  test('a sudoers file that visudo rejects is never renamed into place; its temp is removed', () => {
    const host = new FakeHost(l);
    const temp = `${l.sudoersPath}${TEMP_SUFFIX}`;
    host.failOn = `visudo ${temp}`;
    const write: WriteAction = {
      op: 'write',
      path: l.sudoersPath,
      label: 'env',
      content: { source: 'literal', body: 'broken\n' },
      disposition: 'create',
      owner: 'root',
      group: 'root',
      uid: 0,
      gid: 0,
      mode: 0o440,
      validate: 'sudoers',
    };
    const report = apply([write], host);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('visudo -cf exited 1');
    expect(host.entries.has(l.sudoersPath)).toBe(false);
    expect(host.entries.has(temp)).toBe(false);
    expect(host.calls.at(-1)).toBe(`removeTemp ${temp}`);
  });
});

describe('a failed rename leaves no temp behind', () => {
  test('the minted credential: rename fails → the temp holding the token is removed, nothing installed', () => {
    const host = new FakeHost(l);
    const temp = `${l.serviceTokenPath}${TEMP_SUFFIX}`;
    host.rename = (_from: string, to: string) => {
      host.calls.push(`rename ${to}`);
      throw new Error('EXDEV: simulated rename failure');
    };
    const write: WriteAction = {
      op: 'write',
      path: l.serviceTokenPath,
      label: 'credential',
      content: { source: 'random', bytes: 32 },
      disposition: 'create',
      owner: 'root',
      group: 'root',
      uid: 0,
      gid: 0,
      mode: 0o600,
      validate: null,
    };
    host.seedDir(l.credentialsDir);
    const report = apply([write], host);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('EXDEV');
    expect(host.entries.has(temp)).toBe(false);
    expect(host.entries.has(l.serviceTokenPath)).toBe(false);
    expect(host.calls.at(-1)).toBe(`removeTemp ${temp}`);
  });
});

describe('the append-only seal', () => {
  test('a failed chattr +a fails the run (the agent would refuse to boot on that trail)', () => {
    const host = new FakeHost(l);
    host.failOn = `appendOnly ${l.state.auditFile}`;
    const report = apply(plan(l, host.state()), host);
    expect(report.ok).toBe(false);
    expect(report.failure?.action).toEqual({ op: 'append-only', path: l.state.auditFile });
    expect(report.failure?.detail).toContain('chattr +a');
  });
});

describe('unit actions go through the closed exec', () => {
  test('daemon-reload, enable, start, restart, reload', () => {
    const host = new FakeHost(l);
    const report = apply(
      [
        { op: 'daemon-reload' },
        { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apache2ctl' },
        { op: 'web-reload', unit: 'apache2' },
        { op: 'enable', unit: 'u' },
        { op: 'start', unit: 'u' },
        { op: 'restart', unit: 'v' },
      ],
      host,
    );
    expect(report.ok).toBe(true);
    expect(host.calls).toEqual(['daemon-reload', 'configtest apache', 'reload apache2', 'enable u', 'start u', 'restart v']);
  });
});

describe('sudoers: visudo -cf on the temp file, then visudo -c on the whole policy', () => {
  const sudoersWrite = (disposition: 'create' | 'rewrite', body: string): WriteAction => ({
    op: 'write',
    path: l.sudoersPath,
    label: 'env',
    content: { source: 'literal', body },
    disposition,
    owner: 'root',
    group: 'root',
    uid: 0,
    gid: 0,
    mode: 0o440,
    validate: 'sudoers',
  });
  const strays = (host: FakeHost) => [...host.entries.keys()].filter(path => path.startsWith(`${l.sudoersPath}.`));

  test('valid alone and as a policy: in place, no temp, no backup left', () => {
    const host = new FakeHost(l);
    host.entries.set(l.sudoersPath, { type: 'file', uid: 0, gid: 0, mode: 0o440, body: 'OLD\n' });
    const report = apply([sudoersWrite('rewrite', 'NEW\n')], host);
    expect(report.ok).toBe(true);
    expect(host.body(l.sudoersPath)).toBe('NEW\n');
    expect(strays(host)).toEqual([]);
    expect(host.calls.filter(call => call.startsWith('visudo'))).toEqual([
      `visudo ${l.sudoersPath}${TEMP_SUFFIX}`,
      'visudo -c',
    ]);
  });

  test('the policy refuses it: the previous bytes come back by rename, the failure says so', () => {
    const host = new FakeHost(l);
    host.entries.set(l.sudoersPath, { type: 'file', uid: 0, gid: 0, mode: 0o440, body: 'OLD\n' });
    host.failOn = 'visudo -c';
    const report = apply([sudoersWrite('rewrite', 'NEW\n')], host);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('visudo -c exited 1');
    expect(report.failure?.detail).toContain('the previous state was restored');
    expect(host.body(l.sudoersPath)).toBe('OLD\n');
    expect(strays(host)).toEqual([]);
    expect(report.written).toEqual([]);
  });

  test('the policy refuses a first install: the new file is removed', () => {
    const host = new FakeHost(l);
    host.failOn = 'visudo -c';
    const report = apply([sudoersWrite('create', 'NEW\n')], host);
    expect(report.ok).toBe(false);
    expect(host.entries.has(l.sudoersPath)).toBe(false);
    expect(strays(host)).toEqual([]);
  });
});

/* ── provision init, step 1 (spec §5.9) ──────────────────────────────────────────────── */

/** A FakeInitHost (flock door, reload outcomes) whose reload poll does not sleep for real. */
class SiteHost extends FakeInitHost {
  readonly installs: string[] = [];
  sleepSync(ms: number): void {
    this.lockIo.sleepSync(ms);
  }
  installFile(src: string, dst: string, mode: number, uid: number, gid: number): void {
    this.calls.push(`installFile ${dst}`);
    this.installs.push(dst);
    const from = this.entries.get(src);
    if (from?.type !== 'file') throw new Error(`ENOENT: ${src}`);
    this.entries.set(dst, { ...from, mode, uid, gid });
  }
}

const SITE: HostDeclaration = {
  ...unixDeclaration(),
  site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.2' } },
};
const S = derive(SITE);
const LOCK: HostLockRef = { dir: S.host.locksDir, uid: 0, gid: 989 };
const POOL = S.site!.v1!.fpm.poolFile;
const INCLUDE = `${S.instanceDir}/web.apache.conf`;

function siteHost(layout: AgentLayout = S): SiteHost {
  const host = new SiteHost(layout);
  host.seedFile(layout.site!.v1!.fpm.bin, '', 0o755);
  host.seedDir(POOL.slice(0, POOL.lastIndexOf('/')));
  host.seedDir(layout.instanceDir);
  host.units.set('php8.2-fpm', { enabled: true, active: true });
  return host;
}

function validated(kind: 'web' | 'fpm', path: string, disposition: 'create' | 'rewrite', body: string): WriteAction {
  return {
    op: 'write',
    path,
    label: kind === 'web' ? 'web_include' : 'fpm_pool',
    content: { source: 'literal', body },
    disposition,
    owner: 'root',
    group: 'root',
    uid: 0,
    gid: 0,
    mode: 0o644,
    validate: kind,
    validator: kind === 'web' ? { kind: 'web', server: 'apache', bin: '/usr/sbin/apache2ctl', unit: 'apache2' } : { kind: 'fpm', bin: S.site!.v1!.fpm.bin, unit: 'php8.2-fpm' },
    lock: LOCK,
  };
}

describe('the post-rename validated install (web/fpm, spec §5.9)', () => {
  test('create: renamed in place, configtest run under the web lock, a created-marker kept until the reload', () => {
    const host = siteHost();
    const report = apply([validated('fpm', POOL, 'create', 'POOL\n')], host);
    expect(report.failure).toBeNull();
    expect(host.body(POOL)).toBe('POOL\n');
    expect(host.entries.has(`${POOL}${CREATED_SUFFIX}`)).toBe(true);
    expect(host.calls).toContain(`fpm-configtest ${S.site!.v1!.fpm.bin}`);
    expect(host.lockIo.calls).toContain(`open ${S.host.locksDir}/web.lock`);
    expect(host.lockIo.heldBySelf(`${S.host.locksDir}/web.lock`)).toBeNull();
  });

  test('rewrite + failing configtest: the previous bytes come back, configtest runs again, both exits named', () => {
    const host = siteHost();
    host.seedFile(INCLUDE, 'OLD\n');
    host.configtestBreakers.push('BROKEN');
    const report = apply([validated('web', INCLUDE, 'rewrite', 'BROKEN\n')], host);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toMatch(/-t exited 1 with the new web_include in place .*restored and \/usr\/sbin\/apache2ctl -t then exited 0/);
    expect(host.body(INCLUDE)).toBe('OLD\n');
    expect(host.entries.has(`${INCLUDE}${BACKUP_SUFFIX}`)).toBe(false);
    expect(host.calls.filter(call => call === 'configtest apache')).toHaveLength(2);
    expect(host.lockIo.heldBySelf(`${S.host.locksDir}/web.lock`)).toBeNull();
  });

  test('create + failing configtest: the new file and its marker are removed', () => {
    const host = siteHost();
    host.configtestBreakers.push('BROKEN');
    const report = apply([validated('fpm', POOL, 'create', 'BROKEN\n')], host);
    expect(report.ok).toBe(false);
    expect(host.entries.has(POOL)).toBe(false);
    expect(host.entries.has(`${POOL}${CREATED_SUFFIX}`)).toBe(false);
  });

  test('without a lock door nothing is configtested: the write fails and its temp goes', () => {
    const host = new FakeHost(S);
    // The shared fake carries a flock door; this case is an io WITHOUT one.
    Object.defineProperty(host, 'lockIo', { value: undefined });
    host.seedDir(S.instanceDir);
    const report = apply([validated('web', INCLUDE, 'create', 'X\n')], host);
    expect(report.failure?.detail).toContain('no lock door');
    expect(host.entries.has(INCLUDE)).toBe(false);
    expect(host.entries.has(`${INCLUDE}${TEMP_SUFFIX}`)).toBe(false);
  });
});

describe('reload + the active poll (spec §5.9; the EL AVC case)', () => {
  const webLock = `${S.host.locksDir}/web.lock`;
  const pair = (kind: 'web' | 'fpm', restore: { path: string; disposition: 'create' | 'rewrite' }[]): Action[] =>
    kind === 'web'
      ? [
          { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apache2ctl', lock: LOCK },
          { op: 'web-reload', unit: 'apache2', restore, server: 'apache', bin: '/usr/sbin/apache2ctl' },
        ]
      : [
          { op: 'fpm-configtest', bin: S.site!.v1!.fpm.bin, lock: LOCK },
          { op: 'fpm-reload', unit: 'php8.2-fpm', bin: S.site!.v1!.fpm.bin, restore },
        ];

  test('active through the poll: done, the rollback dropped, the lock held from configtest to reload then released', () => {
    const host = siteHost();
    apply([validated('web', INCLUDE, 'create', 'NEW\n')], host);
    const before = host.lockIo.calls.length;
    // the lock is HELD while the reload runs (released only after it)
    const heldAtReload: (string | null)[] = [];
    const reload = host.exec.reloadUnit;
    Object.assign(host.exec, { reloadUnit: (unit: string) => (heldAtReload.push(host.lockIo.heldBySelf(webLock)), reload(unit)) });
    const report = apply(pair('web', [{ path: INCLUDE, disposition: 'create' }]), host);
    expect(heldAtReload).toEqual(['ex']);
    expect(report.failure).toBeNull();
    expect(host.entries.has(`${INCLUDE}${CREATED_SUFFIX}`)).toBe(false);
    expect(host.body(INCLUDE)).toBe('NEW\n');
    expect(host.lockIo.calls.slice(before).filter(call => call.startsWith('open'))).toHaveLength(1);
    expect(host.lockIo.heldBySelf(`${S.host.locksDir}/web.lock`)).toBeNull();
    expect(host.calls.filter(call => call === 'reload apache2')).toHaveLength(1);
    expect(RELOAD_POLL.intervalMs * RELOAD_POLL.count).toBe(5000);
  });

  for (const kind of ['web', 'fpm'] as const) {
    test(`${kind}: the master dies at the reload → restore, configtest, restart, rolled_back{reload}`, () => {
      const host = siteHost();
      const path = kind === 'web' ? INCLUDE : POOL;
      const unit = kind === 'web' ? 'apache2' : 'php8.2-fpm';
      host.seedFile(path, 'OLD\n');
      apply([validated(kind, path, 'rewrite', 'NEW\n')], host);
      expect(host.body(`${path}${BACKUP_SUFFIX}`)).toBe('OLD\n');
      host.reloadKills.add(unit);
      const report = apply(pair(kind, [{ path, disposition: 'rewrite' }]), host);
      expect(report.ok).toBe(false);
      expect(report.failure?.detail).toContain(`rolled_back{reload}: ${unit} was not active after the reload`);
      expect(report.failure?.detail).toContain('active again');
      expect(host.body(path)).toBe('OLD\n');
      expect(host.calls).toContain(`restart ${unit}`);
      expect(host.calls.filter(call => call === (kind === 'web' ? 'configtest apache' : `fpm-configtest ${S.site!.v1!.fpm.bin}`)).length).toBeGreaterThanOrEqual(3);
      expect(host.lockIo.heldBySelf(`${S.host.locksDir}/web.lock`)).toBeNull();
    });
  }

  test('a restart that does not bring it back says so', () => {
    const host = siteHost();
    host.reloadKills.add('apache2');
    host.restartFails.add('apache2');
    const report = apply(pair('web', []), host);
    expect(report.failure?.detail).toContain('STILL NOT ACTIVE');
  });

  test('the host web lock held elsewhere past its wait: configtest never runs, the reload is skipped', () => {
    const host = siteHost();
    host.lockIo.holders.push({ path: `${S.host.locksDir}/web.lock`, mode: 'ex', pid: 77, untilMs: Number.POSITIVE_INFINITY });
    host.lockIo.files.set(`${S.host.locksDir}/web.lock`, { type: 'file', uid: 0, gid: 989, mode: 0o640 });
    const report = apply(pair('web', []), host);
    expect(report.outcomes.map(o => o.status)).toEqual(['failed', 'skipped']);
    expect(host.calls).not.toContain('configtest apache');
  });
});

describe('SELinux ops (spec §5.9)', () => {
  test('import: a root 0600 provisioner temp at the one admitted name, semanage import, the temp removed, then the state', () => {
    const host = siteHost();
    host.selinuxMode = 'enforcing';
    const file = `${S.instanceDir}/selinux.import`;
    const report = apply(
      [{ op: 'selinux-import', file, lines: ["fcontext -a -f a -t usr_t '/opt/x(/.*)?'"], statePath: `${S.instanceDir}/selinux.state`, stateBody: 'STATE\n', uid: 0, gid: 0 }],
      host,
    );
    expect(report.failure).toBeNull();
    expect(host.calls).toContain(`semanage import ${file}${TEMP_SUFFIX}`);
    expect(host.calls).toContain(`removeTemp ${file}${TEMP_SUFFIX}`);
    expect(host.entries.has(`${file}${TEMP_SUFFIX}`)).toBe(false);
    expect(host.fcontext).toEqual([{ spec: '/opt/x(/.*)?', ftype: 'a', type: 'usr_t' }]);
    expect(host.entries.get(`${S.instanceDir}/selinux.state`)).toMatchObject({ body: 'STATE\n', mode: 0o644 });
  });

  test('a failed import leaves no temp and writes no state', () => {
    const host = siteHost();
    host.failOn = `semanage import ${S.instanceDir}/selinux.import${TEMP_SUFFIX}`;
    const report = apply(
      [{ op: 'selinux-import', file: `${S.instanceDir}/selinux.import`, lines: ['port -a -t http_port_t -p tcp 3100'], statePath: `${S.instanceDir}/selinux.state`, stateBody: 'S\n', uid: 0, gid: 0 }],
      host,
    );
    expect(report.ok).toBe(false);
    expect(host.entries.has(`${S.instanceDir}/selinux.state`)).toBe(false);
    expect([...host.entries.keys()].some(path => path.endsWith(TEMP_SUFFIX))).toBe(false);
  });

  test('restorecon then a dry run that must find nothing: a path still pending FAILS naming it', () => {
    const host = siteHost();
    host.seedDir('/srv/x');
    host.labels.set('/srv/x', 'var_t');
    host.fcontext.push({ spec: '/srv/x(/.*)?', ftype: 'a', type: 'httpd_sys_content_t' });
    expect(apply([{ op: 'selinux-restorecon', targets: [{ path: '/srv/x', recursive: true }] }], host).failure).toBeNull();
    expect(host.labels.get('/srv/x')).toBe('httpd_sys_content_t');
    const stuck = siteHost();
    stuck.seedDir('/srv/y');
    stuck.labels.set('/srv/y', 'var_t');
    stuck.fcontext.push({ spec: '/srv/y(/.*)?', ftype: 'a', type: 'usr_t' });
    const realRestorecon = stuck.exec.restorecon;
    Object.assign(stuck.exec, { restorecon: (t: readonly { path: string; recursive: boolean }[], dry: boolean) => (dry ? realRestorecon(t, true) : { code: 0, stdout: '', stderr: '' }) });
    const report = apply([{ op: 'selinux-restorecon', targets: [{ path: '/srv/y', recursive: true }] }], stuck);
    expect(report.failure?.detail).toContain('restorecon left 1 path(s) unrelabelled: /srv/y (var_t → usr_t)');
  });
});

describe('host-wide filesystem ops', () => {
  test('a host-wide mkdir: temp → chown → chmod → rename', () => {
    const host = siteHost();
    host.seedDir('/var/lib/dedalo_publication_host');
    const report = apply(
      [{ op: 'mkdir', path: '/var/lib/dedalo_publication_host/_host', via: '/var/lib/dedalo_publication_host/._host.dedalo-provision.tmp', mode: 0o755, owner: 'root', group: 'root', uid: 0, gid: 0 }],
      host,
    );
    expect(report.failure).toBeNull();
    expect(host.calls.slice(-4)).toEqual([
      'mkdir /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'chown /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'chmod /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'rename /var/lib/dedalo_publication_host/_host',
    ]);
  });

  test('the sweep removes through the provisioner temp name only', () => {
    const host = siteHost();
    host.seedFile('/var/lib/c/gone.json', '{}');
    const report = apply([{ op: 'remove', path: '/var/lib/c/gone.json', why: 'x' }], host);
    expect(report.failure).toBeNull();
    expect(host.entries.has('/var/lib/c/gone.json')).toBe(false);
    expect(host.calls.slice(-2)).toEqual(['rename /var/lib/c/gone.json.dedalo-provision.tmp', 'removeTemp /var/lib/c/gone.json.dedalo-provision.tmp']);
  });

  test('the renderer copy: subdirectories, every file, bun, the bunfig, and VERSION LAST', () => {
    const host = siteHost();
    host.seedDir('/r');
    for (const file of ['src/a.ts', 'src/b/c.ts']) host.seedFile(`/agent/${file}`, file);
    host.seedFile('/bun', 'BUN', 0o755);
    const action: RendererInstallAction = {
      op: 'renderer-install',
      dir: '/r',
      sourceDir: '/agent',
      files: ['src/a.ts', 'src/b/c.ts'],
      subdirs: ['src', 'src/b'],
      bun: '/bun',
      versionBody: 'V\n',
      why: 'absent',
      uid: 0,
      gid: 0,
    };
    const report = apply([action], host);
    expect(report.failure).toBeNull();
    expect(host.installs).toEqual(['/r/src/a.ts', '/r/src/b/c.ts', '/r/bun']);
    expect(host.entries.get('/r/bun')).toMatchObject({ mode: 0o755, body: 'BUN' });
    expect(host.body('/r/empty.bunfig.toml')).toBe('');
    const writes = host.calls.filter(call => call.startsWith('rename /r/'));
    expect(writes.at(-1)).toBe('rename /r/VERSION');
    expect(report.written).toEqual(['/r/VERSION']);
    const bare = new FakeHost(S);
    bare.seedDir('/r');
    expect(apply([action], bare).failure?.detail).toContain('cannot copy files');
  });
});

describe('lockHostProvision (spec S12 2)', () => {
  test('creates HOST_BASE and its locks via temp names with exact metadata, then holds provision.lock', () => {
    const host = siteHost();
    host.seedDir('/var/lib/dedalo_publication_host');
    const lock = lockHostProvision(S, host as unknown as ProvisionIo, { rootUid: 0, rootGid: 0, pubhostGid: 989 });
    expect(host.calls.filter(call => call.includes('.dedalo-provision.tmp') || call.startsWith('rename')).slice(0, 8)).toEqual([
      'mkdir /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'chown /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'chmod /var/lib/dedalo_publication_host/._host.dedalo-provision.tmp',
      'rename /var/lib/dedalo_publication_host/_host',
      'mkdir /var/lib/dedalo_publication_host/_host/.locks.dedalo-provision.tmp',
      'chown /var/lib/dedalo_publication_host/_host/.locks.dedalo-provision.tmp',
      'chmod /var/lib/dedalo_publication_host/_host/.locks.dedalo-provision.tmp',
      'rename /var/lib/dedalo_publication_host/_host/locks',
    ]);
    expect(host.lockIo.heldBySelf(`${S.host.locksDir}/provision.lock`)).toBe('ex');
    lock.release();
    expect(host.lockIo.heldBySelf(`${S.host.locksDir}/provision.lock`)).toBeNull();
  });

  test('no dedalo_pubhost: PlanRefused with the groupadd line; a foreign locks dir: refused, never chowned', () => {
    const host = siteHost();
    expect(() => lockHostProvision(S, host as unknown as ProvisionIo, { rootUid: 0, rootGid: 0, pubhostGid: null })).toThrow(PlanRefused);
    host.lockIo.files.set(S.host.base, { type: 'dir', uid: 0, gid: 0, mode: 0o755 });
    host.lockIo.files.set(S.host.locksDir, { type: 'dir', uid: 990, gid: 989, mode: 0o750 });
    expect(() => lockHostProvision(S, host as unknown as ProvisionIo, { rootUid: 0, rootGid: 0, pubhostGid: 989 })).toThrow(/host-wide anomaly/);
  });
});

describe('a site converges through plan → apply, and the rollbacks are gone after the reloads', () => {
  test('two reload pairs, both active, no backup or marker left; the second plan is empty', () => {
    const host = siteHost();
    host.seedDir('/var/lib');
    const report = apply(plan(S, host.state()), host);
    expect(report.failure).toBeNull();
    expect([...host.entries.keys()].filter(path => path.endsWith(BACKUP_SUFFIX) || path.endsWith(CREATED_SUFFIX))).toEqual([]);
    expect(plan(S, host.state())).toEqual([]);
  });
});

/* ── the real doors: observeHost's new facts and hostIo's new doors (scratch tree) ───── */

describe('observeHost + hostIo on a real scratch tree (spec S9-S11, §5.9 facts)', () => {
  // SEAMS: every path is a scratch override (paths.*, state_root, agent_dir, bun_bin); the
  // configtest binary is pointed into the scratch tree; commands are a stub; the SELinux config and
  // /proc/self/mountinfo come through options.readText. Runs as the developer's uid.
  const dir = join(import.meta.dir, '..', '.test-tmp', 'provision_apply_fs');
  let root = '';
  let layout: AgentLayout;
  const calls: string[] = [];
  const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
  const uid = process.getuid?.() ?? 0;

  function stub(include: string): ProvisionExec {
    const record = (name: string, stdout = '') => {
      calls.push(name);
      return ok(stdout);
    };
    return {
      userId: name => (name === 'other_agent' ? 2001 : uid),
      groupId: () => process.getgid?.() ?? 0,
      userGroups: () => ({ primary: 0x7ffffffe, all: [0x7ffffffe] }),
      unitState: () => ({ enabled: true, active: true }),
      daemonReload: () => ok(),
      enableUnit: () => ok(),
      startUnit: () => ok(),
      restartUnit: () => ok(),
      reloadUnit: () => ok(),
      webConfigtest: () => ok(),
      visudoCheck: () => ok(),
      visudoCheckPolicy: () => ok(),
      appendOnly: () => ok(),
      fpmConfigtest: () => ok(),
      apacheIncludes: () => ok(),
      nginxDump: () => record('nginx -T', `# configuration file ${include}:\nlocation / {}\n`),
      selinuxMode: () => record('getenforce', 'Enforcing\n'),
      semanageLocal: kind =>
        record(
          `semanage ${kind}`,
          kind === 'fcontext' ? `${root}/state(/.*)?    all files    system_u:object_r:usr_t:s0\n` : 'http_port_t    tcp    3100\n',
        ),
      semanageImport: () => ok(),
      restorecon: (targets, dry) =>
        record(`restorecon${dry ? ' -n' : ''} ${targets.length}`, dry ? `Would relabel ${root}/state from system_u:object_r:var_t:s0 to system_u:object_r:usr_t:s0\n` : ''),
      getsebool: name => record(`getsebool ${name}`, `${name} --> ${name === 'httpd_can_network_relay' ? 'on' : 'off'}\n`),
      systemdVersion: () => record('systemctl --version', 'systemd 252 (252.33-1~deb12u1)\n+PAM +AUDIT\n'),
      semanagePortList: () => record('semanage port -l', 'http_port_t    tcp    80, 443, 3100\nmysqld_port_t    tcp    1186, 3306, 63132-63164\n'),
      selinuxLabel: () => ok(),
    };
  }

  beforeAll(() => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    root = realpathSync(dir);
    for (const sub of ['bin', 'agent/src/rules', 'agent/src/provision', 'agent/src/instance', 'conf.d', 'host/nginx_map/contrib', 'host/map_renderer', 'srv/media', 'etc/test']) {
      mkdirSync(join(root, sub), { recursive: true });
    }
    for (const file of MAP_RENDERER_FILES) writeFileSync(join(root, 'agent', file), `// ${file}\n`);
    writeFileSync(join(root, 'bin/bun'), 'BUN-BYTES');
    chmodSync(join(root, 'bin/bun'), 0o755);
    writeFileSync(join(root, 'host/nginx_map/contrib/test.json'), '{}');
    writeFileSync(join(root, 'host/nginx_map/contrib/gone.json'), '{}');
    const derived = derive({
      ...unixDeclaration(),
      web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' },
      site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.2' } },
      agent_dir: join(root, 'agent'),
      state_root: join(root, 'state'),
      media: { mode: 'copy', root: join(root, 'srv/media') },
      php_bin: join(root, 'bin/php'),
      bun_bin: join(root, 'bin/bun'),
      paths: {
        config_base: join(root, 'etc'),
        unit_dir: join(root, 'units'),
        sudoers_dir: join(root, 'sudoers.d'),
        polkit_rules_dir: join(root, 'polkit'),
        host_base: join(root, 'host'),
        nginx_conf_d: join(root, 'conf.d'),
        v1_var_base: join(root, 'var'),
        fpm_pool_dir: join(root, 'pool.d'),
        logrotate_dir: join(root, 'logrotate.d'),
      },
    });
    // The configtest and FPM binaries are derived host paths: the two facts a scratch tree cannot own.
    const site = derived.site!;
    layout = {
      ...derived,
      web: { ...derived.web, configtestBin: join(root, 'bin/nginx') },
      site: { ...site, v1: { ...site.v1!, fpm: { ...site.v1!.fpm, bin: join(root, 'bin/php-fpm8.2') } } },
    };
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const renderers = RENDERERS.filter(r => r.kind !== 'sudoers');
  const mountinfo = (path: string) =>
    `36 35 98:0 / / rw,relatime - apfs /dev/disk1 rw\n37 36 0:44 / ${path} rw,noatime - nfs4 server:/export rw,vers=4.2\n`;

  test('SELinux, systemd, the web reference, the contributions, the renderer digest and the siblings are observed', () => {
    const include = `${layout.instanceDir}/web.nginx.conf`;
    const sibling = derive({ ...unixDeclaration(), instance: 'other', agent_user: 'other_agent', web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });
    const state = observeHost(layout, stub(include), {
      trustRoot: root,
      renderers,
      appendOnlyProbe: () => 'writable',
      siblings: [{ layout: sibling }],
      readText: path => (path === '/proc/self/mountinfo' ? mountinfo(join(root, 'srv/media')) : path === '/etc/selinux/config' ? 'SELINUX=enforcing\nSELINUXTYPE=targeted\n' : null),
    });
    expect(state.systemdVersion).toBe(252);
    expect(state.webReference).toBe(true);
    expect(state.selinux?.mode).toBe('enforcing');
    expect(state.selinux?.localFcontext).toEqual([{ spec: `${root}/state(/.*)?`, type: 'usr_t' }]);
    expect(state.selinux?.localPorts).toEqual([{ type: 'http_port_t', proto: 'tcp', port: 3100 }]);
    expect(state.selinux?.portTypes.get(3306)).toBe('mysqld_port_t');
    expect(state.selinux?.portTypes.has(63140)).toBe(false);
    expect(state.selinux?.booleans.httpd_can_network_relay).toBe(true);
    expect(state.selinux?.mediaLabelable).toBe(false);
    expect(state.selinux?.pending.length).toBeGreaterThan(0);
    expect(state.contributions?.map(c => c.name)).toEqual(['gone.json', 'test.json']);
    expect(state.siblings).toEqual([{ layout: sibling, agentUid: 2001 }]);
    const own = rendererDigest(MAP_RENDERER_FILES.map(file => ({ path: file, bytes: new TextEncoder().encode(`// ${file}\n`) })));
    expect(state.renderer).toEqual({ installed: null, ownDigest: own });
    expect(state.hostMap).toEqual({ live: false, result: null });
    // the relabel targets the plan does not create are observed: the home's logs, the media root
    expect(state.paths.has(join(root, 'srv/media'))).toBe(true);
    expect(state.groups.has(PUBHOST_GROUP)).toBe(true);
  });

  test('no SELinux userland: absent, nothing else asked; an agent_dir missing a renderer file: no digest', () => {
    calls.length = 0;
    const exec = { ...stub('/x'), selinuxMode: () => ({ code: 127, stdout: '', stderr: '' }) };
    rmSync(join(root, 'agent', MAP_RENDERER_FILES[0]!));
    const state = observeHost(layout, exec, { trustRoot: root, renderers, appendOnlyProbe: () => 'writable', readText: () => null });
    expect(state.selinux?.mode).toBe('absent');
    expect(calls.some(call => call.startsWith('semanage'))).toBe(false);
    expect(state.renderer?.ownDigest).toBeNull();
    expect(state.siblings).toBeUndefined();
    writeFileSync(join(root, 'agent', MAP_RENDERER_FILES[0]!), `// ${MAP_RENDERER_FILES[0]}\n`);
  });

  test('hostIo.installFile copies the bytes atomically with the mode; never through a link; the flock door is there', () => {
    const io = hostIo(stub('/x'), { trustRoot: root });
    io.installFile?.(join(root, 'bin/bun'), join(root, 'host/map_renderer/bun'), 0o755, uid, process.getgid?.() ?? 0);
    expect(readFileSync(join(root, 'host/map_renderer/bun'), 'utf8')).toBe('BUN-BYTES');
    expect(statSync(join(root, 'host/map_renderer/bun')).mode & 0o777).toBe(0o755);
    expect(existsSync(join(root, `host/map_renderer/bun${TEMP_SUFFIX}`))).toBe(false);
    symlinkSync(join(root, 'bin/bun'), join(root, 'bin/bun-link'));
    expect(() => io.installFile?.(join(root, 'bin/bun-link'), join(root, 'host/map_renderer/x'), 0o644, uid, 0)).toThrow(/symbolic link/);
    expect(io.lockIo).toBeDefined();
    expect(() => io.sleepSync?.(1)).not.toThrow();
  });
});
