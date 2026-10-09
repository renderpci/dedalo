/**
 * RETIRED ARTIFACTS (src/provision/retire.ts) on a FakeHost: a v1+v2 site converged, then
 * re-declared v2-only. `provision apply` removes what it provisioned for v1 and the declaration no
 * longer needs — the stamped FPM pool (FPM configtest + reload), the v1 log rotation, the v1 API
 * tree under the state root and the v1 pool's directory — shown first by check (describe), and only
 * what carries OUR stamp for THIS instance: a hand-edited, unstamped or foreign file is refused by
 * name, nothing written. The record is written LAST, so a run that failed earlier retires again;
 * a second plan is empty (idempotent). The SELinux v1 rows go by the registration lifecycle.
 */
import { describe, expect, test } from 'bun:test';
import { dirname } from 'node:path';
import { RETIRED_SUFFIX } from '../src/provision/exec_contract';
import { stamp } from '../src/provision/hash';
import { apply } from '../src/provision/apply';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import type { Action, HostState, SelinuxObserved } from '../src/provision/plan';
import { PlanRefused, describe as describeAction, plan, selinuxPaths } from '../src/provision/plan';
import {
  EMPTY_RECORD,
  encodeRecord,
  parseRecord,
  recordPath,
  retiredFileProblem,
  retiredOf,
} from '../src/provision/retire';
import { restoreconTargets } from '../src/provision/selinux';
import { v2OnlySiteDeclaration } from './fixtures/provision_declaration';
import { FakeInitHost } from './support/provision_fake_host';

/** The v1+v2 site of the same instance (provision_v2_only.test.ts's contrast). */
function v1Site(overrides: { fpmVersion?: string } = {}): HostDeclaration {
  const { os_family: _family, ...site } = v2OnlySiteDeclaration().site ?? { domain: 'example.org' };
  const version = overrides.fpmVersion ?? '8.4';
  return {
    ...v2OnlySiteDeclaration(),
    site: { ...site, fpm: { flavor: 'debian', version } },
    v1: { user: 'dedalo-api-v1' },
    php_bin: `/usr/bin/php${version}`,
  };
}

class Host extends FakeInitHost {
  sleepSync(ms: number): void {
    this.lockIo.sleepSync(ms);
  }
}

function seedFpm(host: Host, l: AgentLayout): void {
  if (l.site?.v1 == null) return;
  host.seedFile(l.site.v1.fpm.bin, '', 0o755);
  host.seedFile(l.v1?.phpBin ?? '/usr/bin/php', '', 0o755);
  host.seedDir(dirname(l.site.v1.fpm.poolFile));
  host.units.set(l.site.v1.fpm.unit, { enabled: true, active: true });
}

/** A converged v1+v2 site whose v1 trees hold what an agent and the v1 pool left in them. */
function convergedV1(decl: HostDeclaration = v1Site()): { v1: AgentLayout; host: Host } {
  const v1 = derive(decl);
  const host = new Host(v1, { os: 'debian', selinux: 'absent' });
  seedFpm(host, v1);
  host.seedDir('/var/lib');
  const report = apply(plan(v1, host.state()), host);
  if (!report.ok) throw new Error(`fixture apply failed: ${report.failure?.detail}`);
  const agent = host.users.get('dedalo-pubhost') ?? 990;
  const pool = host.users.get('dedalo-api-v1') ?? 992;
  const api = v1.v1?.dirs.root as string;
  host.seedFile(`${api}/releases/2026.10.01_abc1234/index.php`, '<?php', 0o644, agent, 0);
  host.seedFile(`${v1.v1?.dirs.shared}/server_config_api.php`, '<?php $db', 0o400, pool, 0);
  host.seedFile(`${v1.site?.v1?.var.log}/php_errors.log`, 'x', 0o600, pool, 0);
  return { v1, host };
}

const v2 = (): AgentLayout => derive(v2OnlySiteDeclaration());

function refusalsOf(l: AgentLayout, state: HostState): readonly string[] {
  try {
    plan(l, state);
  } catch (error) {
    if (error instanceof PlanRefused) return error.reasons;
    throw error;
  }
  throw new Error('plan did not refuse');
}

const under = (host: Host, root: string): string[] => [...host.entries.keys()].filter(path => path === root || path.startsWith(`${root}/`));

describe('the record (retire.ts)', () => {
  test('a v1+v2 site records its pool (with its FPM install), both log rotations and both v1 trees; a v2-only one only its web rotation', () => {
    const { v1, host } = convergedV1();
    const record = parseRecord(host.body(recordPath(v1)));
    expect(record?.artifacts.map(entry => entry.kind).sort()).toEqual(['fpm_pool', 'logrotate', 'logrotate_v1']);
    expect(record?.artifacts.find(entry => entry.kind === 'fpm_pool')?.fpm).toEqual({ unit: 'php8.4-fpm', bin: '/usr/sbin/php-fpm8.4' });
    expect(record?.trees).toEqual([
      { kind: 'v1_api', path: v1.v1?.dirs.root as string },
      { kind: 'v1_var', path: dirname(v1.site?.v1?.var.root as string) },
    ]);
    expect(host.entries.get(recordPath(v1))).toMatchObject({ uid: 0, gid: 0, mode: 0o644 });
  });

  test('parseRecord: absent = empty, anything else not of this grammar = null (refused by the plan)', () => {
    expect(parseRecord(undefined)).toEqual(EMPTY_RECORD);
    expect(parseRecord(encodeRecord(EMPTY_RECORD))).toEqual(EMPTY_RECORD);
    for (const bad of [null, '', '{', '{"v":2,"artifacts":[],"trees":[]}', '{"v":1,"artifacts":[{"kind":"web_include","path":"/x"}],"trees":[]}',
      '{"v":1,"artifacts":[{"kind":"logrotate","path":"relative"}],"trees":[]}', '{"v":1,"artifacts":[{"kind":"fpm_pool","path":"/p"}],"trees":[]}',
      '{"v":1,"artifacts":[],"trees":[{"kind":"home","path":"/h"}]}', '{"v":1,"artifacts":[],"trees":[{"kind":"v1_api","path":"/a/../b"}]}']) {
      expect(parseRecord(bad)).toBeNull();
    }
  });

  test('retiredOf: files by path (a moved pool is retired), trees by kind (a moved tree is the operator’s, not retired)', () => {
    const previous = {
      v: 1 as const,
      artifacts: [{ kind: 'logrotate_v1' as const, path: '/etc/logrotate.d/a' }],
      trees: [{ kind: 'v1_api' as const, path: '/old/publication_api/v1' }],
    };
    const moved = { v: 1 as const, artifacts: [{ kind: 'logrotate_v1' as const, path: '/etc/logrotate.d/b' }], trees: [{ kind: 'v1_api' as const, path: '/new/publication_api/v1' }] };
    expect(retiredOf(previous, moved)).toEqual({ v: 1, artifacts: previous.artifacts, trees: [] });
    expect(retiredOf(previous, EMPTY_RECORD)).toEqual(previous);
  });
});

describe('v1+v2 → v2-only: check shows, apply removes, the second plan is empty', () => {
  test('the plan: remove the pool (configtest, restore on failure), the v1 rotation; reload the FPM install; the trees after the restart; the record LAST', () => {
    const { v1, host } = convergedV1();
    const l = v2();
    const actions = plan(l, host.state());
    const lines = actions.map(describeAction);
    const pool = v1.site?.v1?.fpm.poolFile as string;
    expect(lines).toContain(`remove ${pool} (retired: the declaration no longer provisions this fpm_pool) — then /usr/sbin/php-fpm8.4 -t; restored if it fails`);
    expect(lines).toContain(`remove ${v1.v1?.logrotatePath} (retired: the declaration no longer provisions this logrotate_v1)`);
    const ops = actions.map(a => a.op);
    const tail = ops.slice(ops.indexOf('fpm-configtest'));
    expect(tail.slice(0, 2)).toEqual(['fpm-configtest', 'fpm-reload']);
    expect(tail.slice(-3)).toEqual(['remove-tree', 'remove-tree', 'provision-record']);
    expect(actions.filter(a => a.op === 'remove-tree').map(a => (a as { path: string }).path)).toEqual([v1.v1?.dirs.root as string, dirname(v1.site?.v1?.var.root as string)]);
    expect(actions.find(a => a.op === 'fpm-reload')).toEqual({ op: 'fpm-reload', unit: 'php8.4-fpm', bin: '/usr/sbin/php-fpm8.4', restore: [{ path: pool, disposition: 'retire' }] });
    // The agent restarts on its new env file (no PHP_BIN) BEFORE its old v1 tree goes.
    expect(ops.indexOf('restart')).toBeLessThan(ops.indexOf('remove-tree'));
  });

  test('apply converges: pool, rotation, both trees (contents too) gone; the record has no v1; reload ran; a second plan is empty', () => {
    const { v1, host } = convergedV1();
    const l = v2();
    const report = apply(plan(l, host.state()), host);
    expect(report.failure).toBeNull();
    const pool = v1.site?.v1?.fpm.poolFile as string;
    for (const gone of [pool, `${pool}.dedalo-provision.bak`, v1.v1?.logrotatePath as string]) expect(host.entries.has(gone)).toBe(false);
    expect(under(host, v1.v1?.dirs.root as string)).toEqual([]);
    expect(under(host, dirname(v1.site?.v1?.var.root as string))).toEqual([]);
    expect(under(host, `${v1.v1?.dirs.root}${RETIRED_SUFFIX}`)).toEqual([]);
    expect(host.entries.has(l.state.apis.v2.root)).toBe(true);
    expect(host.calls).toContain('fpm-configtest /usr/sbin/php-fpm8.4');
    expect(host.calls).toContain('reload php8.4-fpm');
    const record = parseRecord(host.body(recordPath(l)));
    expect(record?.artifacts.map(entry => entry.kind)).toEqual(['logrotate']);
    expect(record?.trees).toEqual([]);
    const before = host.mutations;
    expect(plan(l, host.state())).toEqual([]);
    expect(host.mutations).toBe(before);
  });

  test('the FPM install not running: no reload, the rollback dropped at once', () => {
    const { v1, host } = convergedV1();
    host.units.set('php8.4-fpm', { enabled: true, active: false });
    host.calls.length = 0;
    const l = v2();
    const actions = plan(l, host.state());
    expect(actions.map(a => a.op)).not.toContain('fpm-reload');
    expect(apply(actions, host).failure).toBeNull();
    expect(host.entries.has(`${v1.site?.v1?.fpm.poolFile}.dedalo-provision.bak`)).toBe(false);
    expect(host.calls).not.toContain('reload php8.4-fpm');
  });

  test('the FPM configtest fails without our pool (it was the only one): the pool is put back, apply stops, the record and trees stay', () => {
    const { v1, host } = convergedV1();
    const l = v2();
    const actions = plan(l, host.state());
    const recordBefore = host.body(recordPath(v1));
    host.failOn = 'fpm-configtest /usr/sbin/php-fpm8.4';
    const report = apply(actions, host);
    expect(report.failure?.action.op).toBe('remove');
    expect(report.failure?.detail).toContain('without the retired pool');
    const pool = v1.site?.v1?.fpm.poolFile as string;
    expect(host.entries.get(pool)?.body).toContain('dedalo-provision: test fpm_pool');
    expect(host.entries.has(`${pool}.dedalo-provision.bak`)).toBe(false);
    expect(host.body(recordPath(v1))).toBe(recordBefore);
    expect(host.entries.has(v1.v1?.dirs.root as string)).toBe(true);
  });

  test('the reload kills the FPM master: the pool is restored from its rollback', () => {
    const { v1, host } = convergedV1();
    host.reloadKills.add('php8.4-fpm');
    const report = apply(plan(v2(), host.state()), host);
    expect(report.failure?.action.op).toBe('fpm-reload');
    expect(host.entries.get(v1.site?.v1?.fpm.poolFile as string)?.body).toContain('fpm_pool');
  });

  test('an interrupted run resumes: a pool rollback awaiting its reload is reloaded and dropped; a `.retired` tree is finished', () => {
    const { v1, host } = convergedV1();
    const pool = v1.site?.v1?.fpm.poolFile as string;
    host.rename(pool, `${pool}.dedalo-provision.bak`);
    const api = v1.v1?.dirs.root as string;
    host.rename(api, `${api}${RETIRED_SUFFIX}`);
    host.calls.length = 0;
    const l = v2();
    const actions = plan(l, host.state());
    expect(actions.find(a => a.op === 'fpm-reload')).toMatchObject({ restore: [{ path: pool, disposition: 'retire' }] });
    expect(actions.map(describeAction)).toContain(`remove the rest of ${api}${RETIRED_SUFFIX}`);
    expect(apply(actions, host).failure).toBeNull();
    expect(host.entries.has(`${pool}.dedalo-provision.bak`)).toBe(false);
    expect(under(host, `${api}${RETIRED_SUFFIX}`)).toEqual([]);
    expect(plan(l, host.state())).toEqual([]);
  });

  test('a pool that MOVED (PHP 8.2 → 8.4, v1 kept): the old one retired through its own FPM install, the new one written; two configtest+reload pairs', () => {
    const { v1, host } = convergedV1(v1Site({ fpmVersion: '8.2' }));
    const l = derive(v1Site());
    seedFpm(host, l);
    const actions = plan(l, host.state());
    const ops = actions.map(a => a.op);
    const pairs = actions.filter(a => a.op === 'fpm-configtest' || a.op === 'fpm-reload').map(a => `${a.op} ${a.bin}`);
    expect(pairs).toEqual([
      'fpm-configtest /usr/sbin/php-fpm8.4',
      'fpm-reload /usr/sbin/php-fpm8.4',
      'fpm-configtest /usr/sbin/php-fpm8.2',
      'fpm-reload /usr/sbin/php-fpm8.2',
    ]);
    expect(ops).not.toContain('remove-tree');
    expect(apply(actions, host).failure).toBeNull();
    expect(host.entries.has(v1.site?.v1?.fpm.poolFile as string)).toBe(false);
    expect(host.entries.has(l.site?.v1?.fpm.poolFile as string)).toBe(true);
    expect(plan(l, host.state())).toEqual([]);
  });
});

describe('the guard: only OUR stamp for THIS instance — anything else refused by name, nothing written', () => {
  const refusedWith = (edit: (host: Host, v1: AgentLayout) => string, pattern: RegExp) => {
    const { v1, host } = convergedV1();
    const path = edit(host, v1);
    const before = host.mutations;
    const reasons = refusalsOf(v2(), host.state());
    expect(reasons.join('\n')).toMatch(pattern);
    expect(reasons.join('\n')).toContain(path);
    expect(host.mutations).toBe(before);
    expect(host.entries.has(path)).toBe(true);
  };

  test('a hand-edited pool', () =>
    refusedWith((host, v1) => {
      const pool = v1.site?.v1?.fpm.poolFile as string;
      const entry = host.entries.get(pool);
      if (entry) entry.body += '; an operator line\n';
      return pool;
    }, /edited by hand since provision apply wrote it — it is not removed/));

  test('an unstamped file at the retired path', () =>
    refusedWith((host, v1) => {
      host.seedFile(v1.v1?.logrotatePath as string, '/var/log/x { daily }\n');
      return v1.v1?.logrotatePath as string;
    }, /was not written by this provisioner \(no stamp\)/));

  test("another instance's stamp", () =>
    refusedWith((host, v1) => {
      host.seedFile(v1.v1?.logrotatePath as string, stamp('logrotate_v1', 'other', 'x\n'));
      return v1.v1?.logrotatePath as string;
    }, /is stamped for 'other logrotate_v1', not 'test logrotate_v1' — it is not removed/));

  test('our instance, another kind', () =>
    refusedWith((host, v1) => {
      host.seedFile(v1.v1?.logrotatePath as string, stamp('logrotate', 'test', 'x\n'));
      return v1.v1?.logrotatePath as string;
    }, /is stamped for 'test logrotate', not 'test logrotate_v1'/));

  test('a directory where the pool was', () =>
    refusedWith((host, v1) => {
      const pool = v1.site?.v1?.fpm.poolFile as string;
      host.entries.delete(pool);
      host.seedDir(pool);
      return pool;
    }, /is a dir, not the file provision apply wrote/));

  test('a v1 tree whose root is not as provision apply left it (mode, owner, a symlink)', () => {
    refusedWith((host, v1) => {
      const api = v1.v1?.dirs.root as string;
      const entry = host.entries.get(api);
      if (entry) entry.mode = 0o777;
      return api;
    }, /mode 0777, not 990:0 0755 as provision apply left it — it is not removed/);
    refusedWith((host, v1) => {
      const root = dirname(v1.site?.v1?.var.root as string);
      const entry = host.entries.get(root);
      if (entry) entry.uid = 1000;
      return root;
    }, /uid 1000 gid 0 mode 0755, not 0:0 0755/);
    refusedWith((host, v1) => {
      const root = dirname(v1.site?.v1?.var.root as string);
      for (const key of under(host, root)) host.entries.delete(key);
      host.entries.set(root, { type: 'symlink', uid: 0, gid: 0, mode: 0o777, body: '', target: '/etc' });
      return root;
    }, /is a symlink, not a directory/);
  });

  test('a tree under an untrusted parent is not removed', () =>
    refusedWith((host, v1) => {
      const parent = host.entries.get(dirname(v1.v1?.dirs.root as string));
      if (parent) parent.mode = 0o777;
      return v1.v1?.dirs.root as string;
    }, /its parent .* is not a root directory closed to others/));

  test('a recorded tree that is not where THIS instance keeps it is not removed (the record is judged, never trusted)', () => {
    const { v1, host } = convergedV1();
    const elsewhere = '/srv/elsewhere/publication_api/v1';
    host.seedDir(elsewhere);
    const entry = host.entries.get(elsewhere);
    if (entry) entry.uid = host.users.get('dedalo-pubhost') ?? 990;
    const record = parseRecord(host.body(recordPath(v1)));
    host.seedFile(recordPath(v1), encodeRecord({ v: 1, artifacts: record?.artifacts ?? [], trees: [{ kind: 'v1_api', path: elsewhere }] }));
    const reasons = refusalsOf(v2(), host.state()).join('\n');
    expect(reasons).toContain(`'${elsewhere}' (the retired Publication API v1 tree) is not where this instance keeps it — it is not removed`);
    expect(host.entries.has(elsewhere)).toBe(true);
  });

  test('a provision record that is not ours refuses the whole plan (never guessed)', () => {
    const { v1, host } = convergedV1();
    host.seedFile(recordPath(v1), '{"v":1,"artifacts":"x"}');
    expect(refusalsOf(v2(), host.state()).join('\n')).toContain('(the provision record) is not one provision apply wrote');
  });

  test('retiredFileProblem pins the three guards separately (mutation targets: instance, kind, drift)', () => {
    const entry = { kind: 'logrotate_v1' as const, path: '/etc/logrotate.d/dedalo_test_v1' };
    const file = { type: 'file', uid: 0, gid: 0, mode: 0o644 };
    expect(retiredFileProblem('test', entry, file, stamp('logrotate_v1', 'test', 'x\n'))).toBeNull();
    expect(retiredFileProblem('test', entry, file, stamp('logrotate_v1', 'other', 'x\n'))).toContain("stamped for 'other logrotate_v1'");
    expect(retiredFileProblem('test', entry, file, stamp('logrotate', 'test', 'x\n'))).toContain("stamped for 'test logrotate'");
    expect(retiredFileProblem('test', entry, file, `${stamp('logrotate_v1', 'test', 'x\n')}y\n`)).toContain('edited by hand');
    expect(retiredFileProblem('test', entry, file, 'x\n')).toContain('no stamp');
    expect(retiredFileProblem('test', entry, file, null)).toContain('could not be read');
  });
});

describe('SELinux: the v1 rows leave with v1 (the registration lifecycle)', () => {
  function selinuxOf(host: Host, l: AgentLayout, state: string | null): SelinuxObserved {
    const targets = restoreconTargets(l).filter(t => host.entries.has(t.path));
    const dry = targets.length === 0 ? '' : host.exec.restorecon(targets, true).stdout;
    return {
      mode: host.selinuxMode,
      storePresent: true,
      localFcontext: host.fcontext.map(rule => ({ spec: rule.spec, type: rule.type })),
      localPorts: [...host.localPorts].map(([port, type]) => ({ type, proto: 'tcp', port })),
      portTypes: new Map<number, string>([...host.portTypes, ...host.localPorts]),
      pending: dry.split('\n').filter(Boolean).map(line => {
        const [, path = '', from = '', to = ''] = /^Would relabel (\S+) from \S+?:\S+?:(\S+?):\S+ to \S+?:\S+?:(\S+?):\S+$/.exec(line) ?? [];
        return { path, from, to };
      }),
      state,
      booleans: Object.fromEntries(host.booleans),
      mediaLabelable: true,
      module: host.moduleObserved(),
    };
  }
  const stateOf = (host: Host, l: AgentLayout): HostState => ({ ...host.state(), selinux: selinuxOf(host, l, host.body(selinuxPaths(l).stateFile) ?? null) });

  test('an enforcing host: the v1 specs are deleted in the same import, then the v1 trees removed', () => {
    const v1 = derive(v1Site());
    const host = new Host(v1, { os: 'debian', selinux: 'enforcing' });
    seedFpm(host, v1);
    host.seedDir('/var/lib');
    const first = apply(plan(v1, stateOf(host, v1)), host);
    expect(first.failure).toBeNull();
    const v1Specs = host.fcontext.filter(rule => rule.spec.includes('publication_api/v1') || rule.spec.includes('/v1/')).map(rule => rule.spec);
    expect(v1Specs.length).toBeGreaterThan(0);
    const l = v2();
    const actions: Action[] = plan(l, stateOf(host, l));
    const selinuxImport = actions.find(a => a.op === 'selinux-import') as { lines: readonly string[] } | undefined;
    for (const spec of v1Specs) expect(selinuxImport?.lines.some(line => line.startsWith('fcontext -d ') && line.endsWith(`'${spec}'`))).toBe(true);
    expect(apply(actions, host).failure).toBeNull();
    expect(host.fcontext.some(rule => v1Specs.includes(rule.spec))).toBe(false);
    expect(host.entries.has(v1.v1?.dirs.root as string)).toBe(false);
  });
});
