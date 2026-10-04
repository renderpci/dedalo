/**
 * apply(): dumb, ordered, atomic writes, halts on the first failure, never reloads the web
 * server after a failed configtest, and a second run writes nothing.
 */
import { describe, expect, test } from 'bun:test';
import { TEMP_SUFFIX, apply } from '../src/provision/apply';
import { derive } from '../src/provision/layout';
import type { Action, WriteAction } from '../src/provision/plan';
import { plan } from '../src/provision/plan';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FAKE_TOKEN, FakeHost } from './support/provision_fake_host';

const l = derive(unixDeclaration());

describe('apply on a fresh host', () => {
  test('converges: every action done, files in place with their metadata, token minted, audit log agent-owned', () => {
    const host = new FakeHost(l);
    const report = apply(plan(l, host.state()), host);
    expect(report.ok).toBe(true);
    expect(report.failure).toBeNull();
    expect(report.outcomes.every(o => o.status === 'done')).toBe(true);
    expect(report.written).toEqual([
      l.state.marker,
      l.serviceTokenPath,
      l.state.auditFile,
      l.envFile,
      l.engineFragmentPath,
      l.polkitPath,
      l.sudoersPath,
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
    expect(host.entries.get(l.state.apis.v1.releases)).toMatchObject({ type: 'dir', uid: 990, mode: 0o755 });
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
      { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apachectl' },
      { op: 'web-reload', unit: 'apache2' },
      { op: 'restart', unit: 'dedalo-publication-host-test' },
    ];
    const report = apply(actions, host);
    expect(report.ok).toBe(false);
    expect(report.outcomes.map(o => o.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(report.failure?.detail).toContain('/usr/sbin/apachectl -t exited 1');
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
        { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apachectl' },
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
