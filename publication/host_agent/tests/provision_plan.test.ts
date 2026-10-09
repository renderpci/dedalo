/**
 * plan(): pure, ordered, writes only on drift, refuses what is not ours, refuses code a
 * non-root principal could replace, configtest before any web reload.
 */
import { describe, expect, test } from 'bun:test';
import { apply } from '../src/provision/apply';
import { stamp } from '../src/provision/hash';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { PUBHOST_GROUP, derive, markerContent } from '../src/provision/layout';
import type {
  Action,
  HostState,
  MkdirAction,
  PathFacts,
  RemoveAction,
  RendererInstallAction,
  SelinuxImportAction,
  SelinuxObserved,
  SelinuxRestoreconAction,
  WriteAction,
} from '../src/provision/plan';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MAP_GRAMMAR, MAP_RENDERER_FILES } from '../src/provision/host_map_renderer';
import { restoreconTargets, selinuxRules } from '../src/provision/selinux';
import {
  AGENT_DEV_DEPENDENCIES,
  PlanRefused,
  RENDERERS,
  TEST_SCRATCH_DIR,
  agentDevDependencyPaths,
  agentScratchPath,
  ancestorsBelow,
  assertPlanIsCoherent,
  assertRendererCensus,
  describe as describeAction,
  hostDirTemp,
  judgeAncestors,
  plan,
  planReport,
  selinuxPaths,
  renderAll,
  trustProblem,
} from '../src/provision/plan';
import type { Renderer } from '../src/provision/render/types';
import { artifact, PENDING_FACTS } from '../src/provision/render/types';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FakeHost, FakeInitHost } from './support/provision_fake_host';

function layout(): AgentLayout {
  return derive(unixDeclaration());
}

function converged(l: AgentLayout): FakeHost {
  const host = new FakeHost(l);
  const report = apply(plan(l, host.state()), host);
  if (!report.ok) throw new Error(`fixture apply failed: ${report.failure?.detail}`);
  return host;
}

function refusals(l: AgentLayout, host: FakeHost): readonly string[] {
  try {
    plan(l, host.state());
  } catch (error) {
    if (error instanceof PlanRefused) return error.reasons;
    throw error;
  }
  throw new Error('plan did not refuse');
}

function entry(host: FakeHost, path: string) {
  const found = host.entries.get(path);
  if (!found) throw new Error(`fixture: no entry at ${path}`);
  return found;
}

describe('trust helpers', () => {
  test('ancestorsBelow: strict ancestors below the trust root, shallowest first', () => {
    expect(ancestorsBelow('/srv/a/b', '/')).toEqual(['/srv', '/srv/a']);
    expect(ancestorsBelow('/srv', '/')).toEqual([]);
    expect(ancestorsBelow('/scratch/x/y', '/scratch')).toEqual(['/scratch/x']);
    expect(() => ancestorsBelow('/elsewhere/y', '/scratch')).toThrow(/not under the trust root/);
  });

  test('trustProblem: root or the declared root uid, never group/world-writable', () => {
    expect(trustProblem({ uid: 0, mode: 0o755 }, 0)).toBeNull();
    expect(trustProblem({ uid: 501, mode: 0o755 }, 501)).toBeNull();
    expect(trustProblem({ uid: 990, mode: 0o755 }, 0)).toBe('owned by uid 990, not root');
    expect(trustProblem({ uid: 0, mode: 0o775 }, 0)).toBe('group- or world-writable (mode 0775)');
  });
});

describe('renderer registry', () => {
  test('census: every ARTIFACT_KINDS entry has exactly one renderer', () => {
    expect(() => assertRendererCensus(RENDERERS)).not.toThrow();
    expect(() => assertRendererCensus([])).toThrow(/no renderer is registered for the artifact kind 'env'/);
    expect(() => assertRendererCensus([...RENDERERS, ...RENDERERS])).toThrow(/two renderers/);
  });

  test('renderAll: sorted, one path one artifact', () => {
    const l = layout();
    expect(renderAll(l).map(a => a.path)).toEqual([
      l.envFile,
      l.engineFragmentPath,
      l.polkitPath,
      l.sudoersPath,
      l.v2ScratchUnitPath,
      l.v2UnitPath,
      l.agentUnitPath,
    ]);
    const twin: Renderer = { kind: 'env', render: x => [artifact(x, { kind: 'env', path: x.envFile, mode: 'envFile', body: 'x\n' })] };
    expect(() => renderAll(l, PENDING_FACTS, [...RENDERERS, twin])).toThrow(/written twice/);
  });
});

describe('plan on a fresh host', () => {
  const l = layout();
  const actions = plan(l, new FakeHost(l).state());

  test('mkdir every declared directory, parents first, with its MODES row', () => {
    const mkdirs = actions.filter(a => a.op === 'mkdir');
    const own = new Set(l.directories.map(d => d.path));
    expect(mkdirs.filter(a => own.has(a.path)).map(a => a.path)).toEqual(l.directories.map(d => d.path));
    // …and the host-wide state (spec S11): its missing ancestors, HOST_BASE and its locks, each via a temporary name.
    expect(mkdirs.filter(a => !own.has(a.path)).map(a => [a.path, a.via, a.owner, a.group, a.mode])).toEqual([
      ['/var', '/.var.dedalo-provision.tmp', 'root', 'root', 0o755],
      ['/var/lib', '/var/.lib.dedalo-provision.tmp', 'root', 'root', 0o755],
      ['/var/lib/dedalo_publication_host', '/var/lib/.dedalo_publication_host.dedalo-provision.tmp', 'root', 'root', 0o755],
      ['/var/lib/dedalo_publication_host/_host', '/var/lib/dedalo_publication_host/._host.dedalo-provision.tmp', 'root', 'root', 0o755],
      ['/var/lib/dedalo_publication_host/_host/locks', '/var/lib/dedalo_publication_host/_host/.locks.dedalo-provision.tmp', 'root', 'dedalo_pubhost', 0o750],
    ]);
    expect(mkdirs.find(a => a.path === l.credentialsDir)).toMatchObject({ owner: 'root', group: 'root', mode: 0o700 });
    expect(mkdirs.find(a => a.path === l.state.root)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.publicationApi)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.audit)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.rules)).toMatchObject({ owner: 'dedalo-pubhost', uid: 990, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.apis.v2.staging)).toMatchObject({ owner: 'dedalo-pubhost', uid: 990, mode: 0o700 });
    expect(mkdirs.find(a => a.path === l.v1!.dirs.shared)).toMatchObject({ group: 'root', gid: 0, mode: 0o711 });
  });

  test('writes the marker, mints the token, creates the audit log, then every artifact — in that order', () => {
    const writes = actions.filter(a => a.op === 'write');
    expect(writes.map(a => [a.path, a.label, a.disposition])).toEqual([
      ['/var/lib/dedalo_publication_host/_host/locks/provision.lock', 'host_lock', 'create'],
      ['/var/lib/dedalo_publication_host/_host/locks/web.lock', 'host_lock', 'create'],
      [l.state.marker, 'marker', 'create'],
      [l.serviceTokenPath, 'credential', 'create'],
      [l.state.auditFile, 'audit_log', 'create'],
      [l.envFile, 'env', 'create'],
      [l.engineFragmentPath, 'engine_fragment', 'create'],
      [l.polkitPath, 'polkit', 'create'],
      [l.sudoersPath, 'sudoers', 'create'],
      [l.v2ScratchUnitPath, 'v2_scratch_unit', 'create'],
      [l.v2UnitPath, 'unit_v2', 'create'],
      [l.agentUnitPath, 'unit_agent', 'create'],
    ]);
    expect(writes.find(a => a.path === l.sudoersPath)).toMatchObject({ validate: 'sudoers', mode: 0o440 });
    expect(writes[0]).toMatchObject({ content: { source: 'literal', body: '' }, owner: 'root', group: 'root', mode: 0o600 });
    expect(writes[1]).toMatchObject({ content: { source: 'literal', body: '' }, owner: 'root', group: 'dedalo_pubhost', gid: 989, mode: 0o640 });
    expect(writes[2]).toMatchObject({ content: { source: 'literal', body: markerContent('test') } });
    expect(writes[3]).toMatchObject({ content: { source: 'random', bytes: 32 }, mode: 0o600 });
    expect(writes[4]).toMatchObject({ content: { source: 'literal', body: '' }, owner: 'dedalo-pubhost', uid: 990, mode: 0o600 });
  });

  test('the audit log is made append-only, as the LAST filesystem action (chown/chmod would then fail)', () => {
    const seals = actions.filter(a => a.op === 'append-only');
    expect(seals).toEqual([{ op: 'append-only', path: l.state.auditFile }]);
    expect(actions.filter(a => ['mkdir', 'write', 'chown', 'chmod', 'append-only'].includes(a.op)).at(-1)).toEqual({
      op: 'append-only',
      path: l.state.auditFile,
    });
  });

  test('the tail: daemon-reload, enable both units, start only the agent (v2 has no release yet)', () => {
    // (the provision record, LAST, is retire's: tests/provision_retire.test.ts)
    expect(actions.filter(a => !['mkdir', 'write', 'append-only', 'provision-record'].includes(a.op))).toEqual([
      { op: 'daemon-reload' },
      { op: 'enable', unit: 'dedalo-publication-api-v2' },
      { op: 'enable', unit: 'dedalo-publication-host-test' },
      { op: 'start', unit: 'dedalo-publication-host-test' },
    ]);
  });

  test('describe never prints the token', () => {
    const line = describeAction(actions.find(a => a.op === 'write' && a.label === 'credential') as Action);
    expect(line).toContain('32 random bytes, never shown');
  });
});

describe('plan on a converged host', () => {
  test('is empty — writes only on drift', () => {
    const l = layout();
    expect(plan(l, converged(l).state())).toEqual([]);
  });

  test('metadata drift → chown/chmod only, no write; a directory is fixed before files', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.envFile).mode = 0o666;
    entry(host, l.state.rules).uid = 0;
    expect(plan(l, host.state())).toEqual([
      { op: 'chown', path: l.state.rules, owner: 'dedalo-pubhost', group: 'root', uid: 990, gid: 0 },
      { op: 'chmod', path: l.envFile, mode: 0o644 },
    ]);
  });

  test("a drifted parent's chown precedes the creation of its missing child", () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.v1!.dirs.root).uid = 0;
    host.entries.delete(l.v1!.dirs.staging);
    const ops = plan(l, host.state()).map(a => `${a.op} ${'path' in a ? a.path : ''}`);
    expect(ops.indexOf(`chown ${l.v1!.dirs.root}`)).toBeLessThan(ops.indexOf(`mkdir ${l.v1!.dirs.staging}`));
  });

  test('a renderer change (valid stamp, other bytes) → rewrite, and restart when the agent runs', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.envFile).body = stamp('env', 'test', 'OLD="1"\n');
    host.units.set(l.agentUnitName, { enabled: true, active: true });
    const actions = plan(l, host.state());
    expect(actions.map(a => a.op)).toEqual(['write', 'restart']);
    expect(actions[0]).toMatchObject({ path: l.envFile, disposition: 'rewrite' });
    expect(actions[1]).toEqual({ op: 'restart', unit: 'dedalo-publication-host-test' });
  });

  test('an audit log that lost its attribute gets it back (after its metadata is fixed)', () => {
    const l = layout();
    const host = converged(l);
    host.appendOnlyPaths.delete(l.state.auditFile);
    entry(host, l.state.auditFile).mode = 0o640;
    expect(plan(l, host.state())).toEqual([
      { op: 'chmod', path: l.state.auditFile, mode: 0o600 },
      { op: 'append-only', path: l.state.auditFile },
    ]);
  });

  test('the token and the audit log are never rewritten, whatever they hold', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.serviceTokenPath).body = 'something-else-entirely-but-ours-to-keep';
    entry(host, l.state.auditFile).body = '{"actor":"ana"}\n';
    expect(plan(l, host.state())).toEqual([]);
  });
});

describe('plan refusals', () => {
  test('metadata drift on an append-only audit log is refused (the kernel would refuse the fix)', () => {
    const l = layout();
    const host = converged(l);
    host.appendOnlyPaths.delete(l.state.auditFile);
    entry(host, l.state.auditFile).uid = 0;
    host.appendOnlyPaths.add(l.state.auditFile);
    expect(refusals(l, host).join('\n')).toContain('is append-only, so its owner/mode cannot be corrected in place');
  });

  test('a test scratch tree in agent_dir is refused (no .env.test fallback on a provisioned host)', () => {
    const l = layout();
    const host = converged(l);
    expect(TEST_SCRATCH_DIR).toBe('.test-tmp');
    host.entries.set(agentScratchPath(l), { type: 'dir', uid: 0, gid: 0, mode: 0o755, body: '' });
    expect(refusals(l, host)).toEqual([
      `agent_dir holds a test scratch tree '${l.agentDir}/.test-tmp' — the suite ran in this checkout; ` +
        'remove it (it is what lets a hand start fall back to the committed .env.test test mode)',
    ]);
  });

  test('a development dependency installed in agent_dir is refused (the deployment install is production-only)', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    // The list IS the package's devDependencies, and it is not empty (never a vacuous gate).
    expect(AGENT_DEV_DEPENDENCIES).toEqual(Object.keys(pkg.devDependencies).sort());
    expect(AGENT_DEV_DEPENDENCIES).toContain('typescript');
    const l = layout();
    expect(() => plan(l, converged(l).state())).not.toThrow();
    for (const path of agentDevDependencyPaths(l)) {
      expect(path.startsWith(`${l.agentDir}/node_modules/`)).toBe(true);
      const host = converged(l);
      host.entries.set(path, { type: 'dir', uid: 0, gid: 0, mode: 0o755, body: '' });
      expect(refusals(l, host)).toEqual([
        `agent_dir holds development dependencies ('${path}') — it was prepared with hostagent:install:dev ` +
          "or the suite ran in it; delete its node_modules/ (a production install over it keeps the development packages), run 'bun run hostagent:install' (frozen, production-only) and copy that tree",
      ]);
    }
    // A runtime dependency is expected there.
    const host = converged(l);
    host.entries.set(`${l.agentDir}/node_modules/zod`, { type: 'dir', uid: 0, gid: 0, mode: 0o755, body: '' });
    expect(() => plan(l, host.state())).not.toThrow();
  });

  test('a hand-edited artifact is refused, not overwritten', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.envFile).body = `${entry(host, l.envFile).body}EXTRA="1"\n`;
    expect(refusals(l, host).join('\n')).toContain('edited by hand');
  });

  test('a file that is not ours is refused', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.envFile).body = 'STATE_ROOT=/elsewhere\n';
    expect(refusals(l, host).join('\n')).toContain('not written by this provisioner');
  });

  test("another instance's marker is refused", () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.state.marker).body = markerContent('other');
    expect(refusals(l, host).join('\n')).toContain('belongs to another instance');
  });

  test('missing accounts, binaries and agent checkout are ALL named, with the field and the exact command', () => {
    const l = layout();
    const host = new FakeHost(l);
    host.users.delete('dedalo-pubhost');
    host.users.delete('dedalo-api-v1');
    host.users.delete('dedalo-api-v2');
    host.groups.delete('dedalo-api-v2');
    host.groups.delete('dedalo');
    host.entries.delete(l.v1!.phpBin);
    host.entries.delete(l.agentEntry);
    const reasons = refusals(l, host);
    // Accounts first, in the order the commands must run: the v2 group before the v2 user joining it.
    expect(reasons.slice(0, 5)).toEqual([
      "group 'dedalo-api-v2' (v2.group) does not exist — create it: groupadd --system dedalo-api-v2",
      "group 'dedalo' (engine_group) does not exist — it must be the group of the account that runs Dédalo on this machine (id -gn <that account>); correct the declaration rather than creating it",
      "user 'dedalo-pubhost' (agent_user) does not exist — create it: useradd --system --no-create-home --shell /usr/sbin/nologin --user-group dedalo-pubhost",
      "user 'dedalo-api-v1' (v1.user) does not exist — create it: useradd --system --no-create-home --shell /usr/sbin/nologin --user-group dedalo-api-v1; it runs only the dedicated v1 pool",
      "user 'dedalo-api-v2' (v2.user) does not exist — create it: useradd --system --no-create-home --shell /usr/sbin/nologin -g dedalo-api-v2 dedalo-api-v2",
    ]);
    expect(reasons).toHaveLength(7);
    expect(reasons.join('\n')).toContain("php_bin '/usr/bin/php'");
    expect(reasons.join('\n')).toContain('check out publication/host_agent');
  });

  test('a symlinked php_bin / bun_bin / agent_dir is refused, naming the resolved path to declare', () => {
    const l = layout();
    const host = new FakeHost(l);
    Object.assign(entry(host, l.v1!.phpBin), { type: 'symlink', mode: 0o777, target: '/usr/bin/php8.3' });
    Object.assign(entry(host, l.bunBin), { type: 'symlink', mode: 0o777 });
    Object.assign(entry(host, l.agentDir), { type: 'symlink', mode: 0o777, target: '/opt/real/host_agent' });
    expect(refusals(l, host)).toEqual([
      `php_bin '${l.v1!.phpBin}' is a symlink — declare the real path ('/usr/bin/php8.3') (a link can be repointed after this check)`,
      `bun_bin '${l.bunBin}' is a symlink — declare the real path (it does not resolve) (a link can be repointed after this check)`,
      `agent_dir '${l.agentDir}' is a symlink — declare the real path ('/opt/real/host_agent') (a link can be repointed after this check)`,
      // …and the entry beneath it is refused through its ancestry, independently.
      `'${l.agentDir}' (above agent entry '${l.agentEntry}') is a symlink, not a real directory — declare the canonical path`,
    ]);
  });

  test('a symlinked configtest binary never asks to "declare" it: it is not a declared field', () => {
    const l = layout();
    const host = new FakeHost(l);
    Object.assign(entry(host, l.web.configtestBin), { type: 'symlink', mode: 0o777, target: '/usr/sbin/elsewhere' });
    expect(refusals(l, host)).toEqual([
      `web.configtest_bin: none of /usr/sbin/apache2ctl, /usr/sbin/apachectl is a real executable file on this host ('/usr/sbin/apache2ctl' is a symlink) — install apache from the distribution's package`,
    ]);
  });

  test('no configtest candidate on the host: refused once, naming every candidate', () => {
    const l = layout();
    const host = new FakeHost(l);
    host.entries.delete(l.web.configtestBin);
    expect(refusals(l, host)).toEqual([
      'web.configtest_bin: none of /usr/sbin/apache2ctl, /usr/sbin/apachectl is a real executable file on this host — install apache first',
    ]);
  });

  test('an agent-owned agent_dir is refused', () => {
    const l = layout();
    const host = new FakeHost(l);
    entry(host, l.agentDir).uid = 990;
    expect(refusals(l, host).join('\n')).toContain(`agent_dir '${l.agentDir}' is owned by uid 990, not root`);
  });

  test('a writable ancestor of a pinned binary is refused', () => {
    const l = layout();
    const host = new FakeHost(l);
    entry(host, '/usr/local/bin').mode = 0o777;
    expect(refusals(l, host).join('\n')).toContain(
      "'/usr/local/bin' (above bun_bin '/usr/local/bin/bun') is group- or world-writable (mode 0777)",
    );
  });

  test('an untrusted ancestor of a managed tree is refused', () => {
    const l = layout();
    const host = new FakeHost(l);
    entry(host, '/srv').uid = 990;
    expect(refusals(l, host).join('\n')).toContain(
      `'/srv' (above the managed '${l.state.root}') is owned by uid 990, not root`,
    );
  });

  test('a managed path of the wrong type is refused', () => {
    const l = layout();
    const host = converged(l);
    host.entries.set(l.state.rules, { type: 'file', uid: 990, gid: 0, mode: 0o755, body: '' });
    expect(refusals(l, host).join('\n')).toContain(`'${l.state.rules}' must be a directory`);
  });

  test('a missing parent of a top-level directory is refused', () => {
    const l = derive({ ...unixDeclaration(), state_root: '/nowhere/deep/state' });
    expect(refusals(l, new FakeHost(derive(unixDeclaration()))).join('\n')).toContain(
      "parent directory '/nowhere/deep' of '/nowhere/deep/state' does not exist",
    );
  });
});

describe('assertPlanIsCoherent', () => {
  const l = layout();
  const host = new FakeHost(l).state();

  test('a web reload without an immediately preceding configtest is a bug', () => {
    expect(() => assertPlanIsCoherent([{ op: 'web-reload', unit: 'apache2' }], host)).toThrow(/web-configtest/);
    expect(() => assertPlanIsCoherent([{ op: 'fpm-reload', unit: 'php8.2-fpm', bin: '/usr/sbin/php-fpm8.2', restore: [] }], host)).toThrow(
      /fpm-configtest/,
    );
    expect(() =>
      assertPlanIsCoherent(
        [
          { op: 'fpm-configtest', bin: '/usr/sbin/php-fpm8.2' },
          { op: 'fpm-reload', unit: 'php8.2-fpm', bin: '/usr/sbin/php-fpm8.2', restore: [] },
        ],
        host,
      ),
    ).not.toThrow();
    expect(() =>
      assertPlanIsCoherent(
        [
          { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apache2ctl' },
          { op: 'web-reload', unit: 'apache2' },
        ],
        host,
      ),
    ).not.toThrow();
  });

  test('chown/chmod/write after the append-only seal is a bug', () => {
    expect(() =>
      assertPlanIsCoherent(
        [
          { op: 'append-only', path: l.envFile },
          { op: 'chmod', path: l.envFile, mode: 0o600 },
        ],
        { ...host, paths: new Map([...host.paths, [l.envFile, { type: 'file', uid: 0, gid: 0, mode: 0o644 }]]) },
      ),
    ).toThrow(/after the file was made append-only/);
    expect(() => assertPlanIsCoherent([{ op: 'append-only', path: '/nope' }], host)).toThrow(/names no file/);
  });

  test('a unit action before daemon-reload, or a filesystem action after a service action, is a bug', () => {
    expect(() => assertPlanIsCoherent([{ op: 'enable', unit: 'x' }, { op: 'daemon-reload' }], host)).toThrow(/daemon-reload/);
    expect(() =>
      assertPlanIsCoherent([{ op: 'daemon-reload' }, { op: 'chmod', path: l.envFile, mode: 0o644 }], host),
    ).toThrow(/after a service action/);
  });

  test('a write without a parent, a rewritten credential and a rewritten audit log are bugs', () => {
    const own = { owner: 'root', group: 'root', uid: 0, gid: 0, mode: 0o600, validate: null };
    expect(() =>
      assertPlanIsCoherent(
        [{ op: 'write', path: '/nope/x', label: 'env', content: { source: 'literal', body: '' }, disposition: 'create', ...own }],
        host,
      ),
    ).toThrow(/no parent/);
    expect(() =>
      assertPlanIsCoherent(
        [{ op: 'write', path: '/etc/x', label: 'credential', content: { source: 'literal', body: 'x' }, disposition: 'rewrite', ...own }],
        host,
      ),
    ).toThrow(/credential/);
    expect(() =>
      assertPlanIsCoherent(
        [{ op: 'write', path: '/etc/y', label: 'audit_log', content: { source: 'literal', body: 'x' }, disposition: 'create', ...own }],
        host,
      ),
    ).toThrow(/audit log/);
  });
});

describe('the tail, through a renderer with effects', () => {
  test('daemon-reload → configtest → reload → enable → start, for a service + web artifact', () => {
    const l = layout();
    const probe: Renderer = {
      kind: 'env',
      render: x => [
        artifact(x, {
          kind: 'env',
          path: x.envFile,
          mode: 'envFile',
          body: 'X="1"\n',
          effects: ['daemon_reload', 'reload_web', 'restart_agent'],
          service: { unit: x.agentUnitName, start: true },
        }),
      ],
    };
    const tail = plan(l, new FakeHost(l).state(), PENDING_FACTS, [probe]).filter(a => !['mkdir', 'write', 'append-only', 'provision-record'].includes(a.op));
    expect(tail).toEqual([
      { op: 'daemon-reload' },
      { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apache2ctl', lock: { dir: l.host.locksDir, uid: 0, gid: 989 } },
      { op: 'web-reload', unit: 'apache2', restore: [], server: 'apache', bin: '/usr/sbin/apache2ctl' },
      { op: 'enable', unit: 'dedalo-publication-host-test' },
      { op: 'start', unit: 'dedalo-publication-host-test' },
    ]);
  });
});

/* ── provision init, step 1 (spec S4-S11, §5.9) ───────────────────────────────────── */

const HOME = '/home/museum.example.org';

function siteDecl(extra: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...unixDeclaration(),
    agent_dir: `${HOME}/host_agent`,
    state_root: `${HOME}/dedalo`,
    bun_bin: `${HOME}/.bun/bin/bun`,
    site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.2' } },
    ...extra,
  };
}

/** A FakeInitHost with an instant reload poll: the web and FPM units running, the FPM install present. */
class SiteHost extends FakeInitHost {
  sleepSync(ms: number): void {
    this.lockIo.sleepSync(ms);
  }
}

function siteHost(decl: HostDeclaration, options: { os?: 'debian' | 'el'; selinux?: 'absent' | 'disabled' | 'permissive' | 'enforcing' } = {}) {
  const l = derive(decl);
  const host = new SiteHost(l, { os: options.os ?? 'debian', selinux: options.selinux ?? 'absent' });
  if (l.site?.v1 != null) {
    host.seedFile(l.site.v1!.fpm.bin, '', 0o755);
    host.seedDir(dirname(l.site.v1!.fpm.poolFile));
    host.units.set(l.site.v1!.fpm.unit, { enabled: true, active: true });
  }
  host.seedDir('/var/lib');
  return { l, host };
}

/** The SELinux facts observeHost would read from this FakeHost's store (its own restorecon -n computes pending). */
function selinuxOf(host: FakeInitHost, l: AgentLayout, state: string | null = null, storePresent = true): SelinuxObserved {
  const mode = host.selinuxMode;
  const portTypes = new Map<number, string>([...host.portTypes, ...host.localPorts]);
  const targets = restoreconTargets(l).filter(t => host.entries.has(t.path));
  const dry = targets.length === 0 ? '' : host.exec.restorecon(targets, true).stdout;
  return {
    mode,
    storePresent,
    localFcontext: host.fcontext.map(rule => ({ spec: rule.spec, type: rule.type })),
    localPorts: [...host.localPorts].map(([port, type]) => ({ type, proto: 'tcp', port })),
    portTypes,
    pending: dry.split('\n').filter(Boolean).map(line => {
      const [, path = '', from = '', to = ''] = /^Would relabel (\S+) from \S+?:\S+?:(\S+?):\S+ to \S+?:\S+?:(\S+?):\S+$/.exec(line) ?? [];
      return { path, from, to };
    }),
    state,
    booleans: Object.fromEntries(host.booleans),
    mediaLabelable: true,
  };
}

function stateOf(host: FakeInitHost, l: AgentLayout, extra: Partial<HostState> = {}): HostState {
  const base = host.state();
  const selinux = host.selinuxMode === 'absent' ? undefined : selinuxOf(host, l, host.body(selinuxPaths(l).stateFile) ?? null);
  return { ...base, ...(selinux === undefined ? {} : { selinux }), ...extra };
}

function refusalsOf(l: AgentLayout, state: HostState): readonly string[] {
  try {
    plan(l, state);
  } catch (error) {
    if (error instanceof PlanRefused) return error.reasons;
    throw error;
  }
  throw new Error('plan did not refuse');
}

describe('judgeAncestors (exported, spec §2.2)', () => {
  test('one line per untrusted ancestor, each judged once, missing ones skipped', () => {
    const facts = new Map<string, PathFacts>([
      ['/a', { type: 'dir', uid: 0, gid: 0, mode: 0o755 }],
      ['/a/b', { type: 'dir', uid: 990, gid: 0, mode: 0o755 }],
      ['/a/b/c', { type: 'symlink', uid: 0, gid: 0, mode: 0o777 }],
    ]);
    const judged = new Set<string>();
    expect(judgeAncestors('x', '/a/b/c/d/leaf', '/', p => facts.get(p), 0, judged)).toEqual([
      "'/a/b' (above x) is owned by uid 990, not root",
      "'/a/b/c' (above x) is a symlink, not a real directory — declare the canonical path",
    ]);
    expect(judgeAncestors('y', '/a/b/other', '/', p => facts.get(p), 0, judged)).toEqual([]);
    expect(judgeAncestors('z', '/a/w/leaf', '/', p => facts.get(p), 0, new Set())).toEqual([]);
    expect(judgeAncestors('g', '/a/x', '/', () => ({ type: 'dir', uid: 0, gid: 0, mode: 0o775 }), 0, new Set())).toEqual([
      "'/a' (above g) is group- or world-writable (mode 0775)",
    ]);
  });
});

describe('the pubhost group, systemd floor and host-wide anomalies', () => {
  test('a host without dedalo_pubhost is REFUSED with the exact groupadd (a hand-run apply, spec S11)', () => {
    const l = layout();
    const host = new FakeHost(l);
    host.groups.delete(PUBHOST_GROUP);
    expect(refusals(l, host)).toContain(
      "group 'dedalo_pubhost' (host-wide: every agent unit's SupplementaryGroups=) does not exist — create it: groupadd --system dedalo_pubhost",
    );
  });

  test('a host systemd below SYSTEMD_FLOOR (247) is refused; 247 and newer plan; the report names no profile', () => {
    const l = layout();
    const state = new FakeHost(l).state();
    expect(refusalsOf(l, { ...state, systemdVersion: 239 }).join('\n')).toContain(
      'systemd 239 is older than 247, the oldest systemd the units are rendered for — this host is not supported',
    );
    expect(refusalsOf(l, { ...state, systemdVersion: 246 }).join('\n')).toContain('systemd 246 is older than 247');
    const reasonsAt = (version: number): string => {
      try {
        plan(l, { ...state, systemdVersion: version });
        return '';
      } catch (error) {
        if (error instanceof PlanRefused) return error.reasons.join('\n');
        throw error;
      }
    };
    for (const version of [247, 252, 257]) expect(reasonsAt(version)).not.toContain('systemd');
    expect(planReport(l, { ...state, systemdVersion: 252 }).facts.join('\n')).not.toContain('profile');
  });

  test('a host-wide directory with other metadata is REFUSED, never chowned; a leftover temp too', () => {
    const l = layout();
    const host = converged(l);
    entry(host, l.host.locksDir).mode = 0o770;
    const reasons = refusals(l, host);
    expect(reasons.join('\n')).toContain(`'${l.host.locksDir}' (host-wide, shared by every instance on this host) is uid 0 gid 989 mode 0770`);
    entry(host, l.host.locksDir).mode = 0o750;
    host.seedDir(hostDirTemp(l.host.locksDir));
    expect(refusals(l, host).join('\n')).toContain('is left over from an interrupted apply');
  });

  test('a host lock file with other metadata is refused (never fixed in place)', () => {
    const l = layout();
    const host = converged(l);
    entry(host, `${l.host.locksDir}/web.lock`).mode = 0o666;
    expect(refusals(l, host).join('\n')).toContain('(the host web lock) is not a root:dedalo_pubhost 0640 regular file');
  });

  test('assertPlanIsCoherent: a host lock is only ever created empty', () => {
    const own = { owner: 'root', group: 'root', uid: 0, gid: 0, mode: 0o600, validate: null };
    expect(() =>
      assertPlanIsCoherent(
        [{ op: 'write', path: '/etc/z', label: 'host_lock', content: { source: 'literal', body: 'x' }, disposition: 'create', ...own }],
        new FakeHost(layout()).state(),
      ),
    ).toThrow(/host lock/);
  });
});

describe('a site (spec S4, S5): pool, web include, v1 directories, validators, the FPM and web tails', () => {
  const { l, host } = siteHost(siteDecl());
  const actions = plan(l, host.state());

  test('the v1 pool directories: <base>/<instance> root 0755, v1 root 0711, tmp/log v1 0700', () => {
    const mk = (path: string) => actions.find(a => a.op === 'mkdir' && a.path === path);
    expect(mk('/var/lib/dedalo_publication_host/test')).toMatchObject({ owner: 'root', mode: 0o755 });
    expect(mk('/var/lib/dedalo_publication_host/test/v1')).toMatchObject({ owner: 'root', mode: 0o711 });
    expect(mk('/var/lib/dedalo_publication_host/test/v1/tmp')).toMatchObject({ owner: 'dedalo-api-v1', group: 'root', mode: 0o700 });
    expect(mk('/var/lib/dedalo_publication_host/test/v1/log')).toMatchObject({ owner: 'dedalo-api-v1', mode: 0o700 });
  });

  test('the pool and the include are written with their validators, under the host web lock', () => {
    const write = (label: string) => actions.find(a => a.op === 'write' && a.label === label) as WriteAction;
    expect(write('fpm_pool')).toMatchObject({
      path: '/etc/php/8.2/fpm/pool.d/dedalo_test_v1.conf',
      validate: 'fpm',
      validator: { kind: 'fpm', bin: '/usr/sbin/php-fpm8.2', unit: 'php8.2-fpm' },
      lock: { dir: l.host.locksDir, uid: 0, gid: 989 },
    });
    expect(write('web_include')).toMatchObject({
      path: '/etc/dedalo_publication_host/test/web.apache.conf',
      validate: 'web',
      validator: { kind: 'web', server: 'apache', bin: '/usr/sbin/apache2ctl', unit: 'apache2' },
    });
  });

  test('the tail: daemon-reload → fpm-configtest → fpm-reload → web-configtest → web-reload → units, each reload restoring its files', () => {
    const tail = actions.filter(a => !['mkdir', 'write', 'chown', 'chmod', 'append-only', 'remove'].includes(a.op)).map(a => a.op);
    expect(tail).toEqual(['daemon-reload', 'fpm-configtest', 'fpm-reload', 'web-configtest', 'web-reload', 'enable', 'enable', 'start', 'provision-record']);
    expect(actions.find(a => a.op === 'fpm-reload')).toEqual({
      op: 'fpm-reload',
      unit: 'php8.2-fpm',
      bin: '/usr/sbin/php-fpm8.2',
      restore: [{ path: '/etc/php/8.2/fpm/pool.d/dedalo_test_v1.conf', disposition: 'create' }],
    });
    expect(actions.find(a => a.op === 'web-reload')).toMatchObject({ restore: [{ path: '/etc/dedalo_publication_host/test/web.apache.conf', disposition: 'create' }] });
  });

  test('the FPM master binary is pinned code (root runs `-t` on it)', () => {
    const { l: l2, host: h2 } = siteHost(siteDecl());
    entry(h2, l2.site!.v1!.fpm.bin).uid = 990;
    expect(refusalsOf(l2, h2.state()).join('\n')).toContain("site.fpm.bin '/usr/sbin/php-fpm8.2' is owned by uid 990, not root");
  });

  test('a missing pool directory names the FPM install', () => {
    const { l: l2, host: h2 } = siteHost(siteDecl());
    h2.entries.delete(dirname(l2.site!.v1!.fpm.poolFile));
    expect(refusalsOf(l2, h2.state()).join('\n')).toContain("is PHP-FPM 8.2 (debian) installed?");
  });

  test('a stopped web server or FPM unit is refused before anything moves (its reload would fail)', () => {
    const { l: l2, host: h2 } = siteHost(siteDecl());
    h2.units.set('php8.2-fpm', { enabled: true, active: false });
    expect(refusalsOf(l2, h2.state()).join('\n')).toContain("PHP-FPM unit 'php8.2-fpm' is not running");
  });

  test('converges, then a second plan is empty; a hand-edited pool is refused', () => {
    const { l: l2, host: h2 } = siteHost(siteDecl());
    const report = apply(plan(l2, h2.state()), h2);
    expect(report.failure).toBeNull();
    expect(plan(l2, h2.state())).toEqual([]);
    const pool = entry(h2, l2.site!.v1!.fpm.poolFile);
    pool.body = pool.body.replace('pm.max_children = 5', 'pm.max_children = 50');
    expect(refusalsOf(l2, h2.state()).join('\n')).toContain('(fpm_pool) was edited by hand');
  });

  test('a rollback left beside a validated file means "reload pending": the next plan reloads it', () => {
    const { l: l2, host: h2 } = siteHost(siteDecl());
    apply(plan(l2, h2.state()), h2);
    h2.seedFile(`${l2.site!.v1!.fpm.poolFile}.dedalo-provision.created`, '', 0o600);
    const again = plan(l2, h2.state());
    expect(again.map(a => a.op)).toEqual(['fpm-configtest', 'fpm-reload']);
    expect(again[1]).toMatchObject({ restore: [{ path: l2.site!.v1!.fpm.poolFile, disposition: 'create' }] });
  });

  test('assertPlanIsCoherent: a validated write outside the web lock is a bug', () => {
    const write = actions.find(a => a.op === 'write' && a.label === 'fpm_pool') as WriteAction;
    const { lock: _lock, ...unlocked } = write;
    expect(() => assertPlanIsCoherent([unlocked], host.state())).toThrow(/outside the host web lock/);
  });
});

describe('SELinux (spec S9, §5.9)', () => {
  test('enforcing: ONE import holding exactly the S9 rules + the port, then restorecon, both before every configtest', () => {
    const { l, host } = siteHost(siteDecl({ web: { server: 'apache', unit: 'httpd' } }), { os: 'el', selinux: 'enforcing' });
    const actions = plan(l, stateOf(host, l));
    const imp = actions.find(a => a.op === 'selinux-import') as SelinuxImportAction;
    const expected = [...selinuxRules(l).map(r => `fcontext -a -f ${r.fileType} -t ${r.type} '${r.spec}'`), 'port -a -t http_port_t -p tcp 3100'];
    expect(imp.lines).toEqual(expected);
    expect(imp.file).toBe('/etc/dedalo_publication_host/test/selinux.import');
    expect(imp.statePath).toBe('/etc/dedalo_publication_host/test/selinux.state');
    const ops = actions.map(a => a.op);
    expect(ops.indexOf('selinux-import')).toBeLessThan(ops.indexOf('selinux-restorecon'));
    expect(ops.indexOf('selinux-restorecon')).toBeLessThan(ops.indexOf('fpm-configtest'));
    const relabel = actions.find(a => a.op === 'selinux-restorecon') as SelinuxRestoreconAction;
    expect(relabel.targets.find(t => t.path === HOME)).toEqual({ path: HOME, recursive: false });
  });

  test('converges: after apply the store holds the rules, nothing is pending, a second plan is empty', () => {
    const { l, host } = siteHost(siteDecl({ web: { server: 'apache', unit: 'httpd' } }), { os: 'el', selinux: 'enforcing' });
    const report = apply(plan(l, stateOf(host, l)), host);
    expect(report.failure).toBeNull();
    expect(host.fcontext.map(r => r.spec)).toEqual(selinuxRules(l).map(r => r.spec));
    expect(host.localPorts.get(3100)).toBe('http_port_t');
    expect(plan(l, stateOf(host, l))).toEqual([]);
  });

  test("an operator rule on one of our specs with another type is REFUSED, never overridden", () => {
    const { l, host } = siteHost(siteDecl(), { os: 'el', selinux: 'enforcing' });
    const v1 = selinuxRules(l).find(r => r.row === 'S/publication_api/v1')!;
    host.fcontext.push({ spec: v1.spec, ftype: 'a', type: 'httpd_sys_rw_content_t' });
    expect(refusalsOf(l, stateOf(host, l)).join('\n')).toContain(`the local SELinux rule '${v1.spec}' types it 'httpd_sys_rw_content_t'`);
  });

  test('a v2 port the policy types otherwise is refused; an http_port_t one is not labelled again', () => {
    const { l, host } = siteHost(siteDecl({ v2: { ...unixDeclaration().v2, port: 3306, health_url: 'http://127.0.0.1:3306/health' } }), { os: 'el', selinux: 'enforcing' });
    expect(refusalsOf(l, stateOf(host, l)).join('\n')).toContain("v2.port 3306 is typed 'mysqld_port_t'");
    const { l: l2, host: h2 } = siteHost(siteDecl({ v2: { ...unixDeclaration().v2, port: 443, health_url: 'http://127.0.0.1:443/health' } }), { os: 'el', selinux: 'enforcing' });
    const imp = plan(l2, stateOf(h2, l2)).find(a => a.op === 'selinux-import') as SelinuxImportAction;
    expect(imp.lines.some(line => line.startsWith('port '))).toBe(false);
  });

  test('a port change deletes our previous label; a relocation deletes the old specs — unless a sibling still needs them', () => {
    const { l, host } = siteHost(siteDecl(), { os: 'el', selinux: 'enforcing' });
    apply(plan(l, stateOf(host, l)), host);
    const moved = derive(siteDecl({ v2: { ...unixDeclaration().v2, port: 3200, health_url: 'http://127.0.0.1:3200/health' } }));
    const imp = plan(moved, stateOf(host, moved)).find(a => a.op === 'selinux-import') as SelinuxImportAction;
    expect(imp.lines).toEqual(['port -d -t http_port_t -p tcp 3100', 'port -a -t http_port_t -p tcp 3200']);
    // relocation to the system layout: the home rules go
    const system = derive({ ...siteDecl(), agent_dir: '/opt/dedalo_publication_host/host_agent', bun_bin: '/opt/dedalo_publication_host/bun/bin/bun', state_root: '/srv/dedalo_publication_host/test' });
    host.seedDir('/srv/dedalo_publication_host');
    host.seedDir('/opt/dedalo_publication_host/host_agent/src');
    host.seedFile('/opt/dedalo_publication_host/host_agent/src/index.ts', '');
    host.seedFile('/opt/dedalo_publication_host/bun/bin/bun', '', 0o755);
    const reloc = plan(system, stateOf(host, system)).find(a => a.op === 'selinux-import') as SelinuxImportAction;
    expect(reloc.lines).toContain(`fcontext -d -f d -t home_root_t '/home/museum\\.example\\.org'`);
    expect(reloc.lines).toContain(`fcontext -d -f a -t usr_t '/home/museum\\.example\\.org/host_agent(/.*)?'`);
    // a sibling that still needs a spec keeps it
    const sibling = { layout: derive({ ...siteDecl(), instance: 'other', v1: { user: 'other_v1' }, v2: { ...unixDeclaration().v2, port: 3300, unit: 'v2-other', user: 'other_v2', group: 'other_v2', health_url: 'http://127.0.0.1:3300/health' }, agent_user: 'other_agent', site: { domain: 'other.example.org', fpm: { flavor: 'debian', version: '8.2' } } }), agentUid: 2001 };
    const kept = plan(system, stateOf(host, system, { siblings: [sibling] })).find(a => a.op === 'selinux-import') as SelinuxImportAction;
    expect(kept.lines).not.toContain(`fcontext -d -f a -t usr_t '/home/museum\\.example\\.org/host_agent(/.*)?'`);
  });

  test('disabled with the policy store: the rules are registered, nothing is relabelled; without the store nothing', () => {
    const { l, host } = siteHost(siteDecl(), { os: 'el', selinux: 'disabled' });
    const ops = plan(l, stateOf(host, l)).map(a => a.op);
    expect(ops).toContain('selinux-import');
    expect(ops).not.toContain('selinux-restorecon');
    expect(planReport(l, stateOf(host, l)).facts).toContain('SELinux disabled: rules registered for a later enable; nothing relabelled');
    const bare = plan(l, { ...host.state(), selinux: { ...selinuxOf(host, l), storePresent: false } }).map(a => a.op);
    expect(bare.some(op => op.startsWith('selinux-'))).toBe(false);
  });

  test('assertPlanIsCoherent: restorecon before the import, or an SELinux op after a configtest, is a bug', () => {
    const state = new FakeHost(layout()).state();
    const imp: SelinuxImportAction = { op: 'selinux-import', file: '/etc/x', lines: [], statePath: '/etc/y', stateBody: '', uid: 0, gid: 0 };
    const rel: SelinuxRestoreconAction = { op: 'selinux-restorecon', targets: [{ path: '/srv', recursive: false }] };
    expect(() => assertPlanIsCoherent([rel, imp], state)).toThrow(/restorecon precedes/);
    expect(() => assertPlanIsCoherent([{ op: 'fpm-configtest', bin: '/usr/sbin/php-fpm' }, imp], state)).toThrow(/after a configtest/);
  });
});

describe('nginx conf_d (spec §13.5, §13.6): identities, the sweep, the renderer copy, the host-wide include', () => {
  const nginxDecl = (extra: Partial<HostDeclaration> = {}) =>
    siteDecl({ web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' }, ...extra });

  function nginxHost(extra: Partial<HostDeclaration> = {}) {
    const result = siteHost(nginxDecl(extra));
    result.host.seedFile('/usr/sbin/nginx', '', 0o755);
    result.host.seedDir(result.l.host.nginxConfD);
    return result;
  }

  test('the include is a host-wide artifact stamped _host; an instance-stamped one is refused', () => {
    const { l, host } = nginxHost();
    const write = plan(l, host.state()).find(a => a.op === 'write' && a.label === 'nginx_map_include') as WriteAction;
    expect(write.path).toBe('/etc/nginx/conf.d/dedalo_media_map.conf');
    expect(write.content.source === 'literal' && write.content.body.startsWith('# dedalo-provision: _host nginx_map_include ')).toBe(true);
    host.seedFile(write.path, stamp('nginx_map_include', '_host', 'x\n').replace('_host', 'test'));
    expect(refusalsOf(l, host.state()).join('\n')).toContain('not written by this provisioner');
  });

  test('identities.json: this instance and every nginx conf_d sibling; not planned while siblings are unobserved', () => {
    const { l, host } = nginxHost();
    expect(plan(l, host.state()).some(a => a.op === 'write' && a.label === 'host_identities')).toBe(false);
    expect(planReport(l, host.state()).facts.join('\n')).toContain('the sibling declarations were not observed');
    const sibling = derive(nginxDecl({ instance: 'other', agent_user: 'other_agent', v1: { user: 'other_v1' } }));
    const apache = derive(siteDecl({ instance: 'third' }));
    const actions = plan(l, { ...host.state(), siblings: [{ layout: sibling, agentUid: 2001 }, { layout: apache, agentUid: 2002 }], contributions: [] });
    const write = actions.find(a => a.op === 'write' && a.label === 'host_identities') as WriteAction;
    expect(write.path).toBe('/var/lib/dedalo_publication_host/_host/map_renderer/identities.json');
    expect(write.content).toEqual({ source: 'literal', body: '{\n  "other": 2001,\n  "test": 990\n}\n' });
    expect(write.mode).toBe(0o644);
  });

  test('the sweep: an undeclared instance, a foreign owner, a non-file → removed; the root _seed and own file kept; the renderer started', () => {
    const { l, host } = nginxHost();
    const contributions = [
      { name: 'test.json', type: 'file' as const, uid: 990 },
      { name: '_seed.json', type: 'file' as const, uid: 0 },
      { name: 'gone.json', type: 'file' as const, uid: 990 },
      { name: 'other.json', type: 'file' as const, uid: 990 },
      { name: 'odd.json', type: 'symlink' as const, uid: 2001 },
      { name: '.test.json.tmp', type: 'file' as const, uid: 990 },
    ];
    const sibling = derive(nginxDecl({ instance: 'other', agent_user: 'other_agent', v1: { user: 'other_v1' } }));
    const actions = plan(l, { ...host.state(), siblings: [{ layout: sibling, agentUid: 2001 }], contributions });
    const removed = actions.filter(a => a.op === 'remove') as RemoveAction[];
    expect(removed.map(a => [a.path.split('/').at(-1), a.why])).toEqual([
      ['gone.json', "no nginx conf_d declaration names instance 'gone'"],
      ['other.json', "owned by uid 990, not instance 'other''s agent (uid 2001)"],
      ['odd.json', 'a symlink, not a contribution file'],
    ]);
    expect(actions.filter(a => a.op === 'start').map(a => (a as { unit: string }).unit)).toContain('dedalo-pubhost-map');
  });

  test('the renderer copy: installed when absent, never downgraded, refused when agent_dir cannot be read whole', () => {
    const { l, host } = nginxHost();
    const digest = 'a'.repeat(64);
    const install = plan(l, { ...host.state(), renderer: { installed: null, ownDigest: digest } }).find(a => a.op === 'renderer-install') as RendererInstallAction;
    expect(install).toMatchObject({ dir: l.host.mapRendererDir, sourceDir: l.agentDir, bun: l.bunBin, why: 'absent' });
    expect(install.files).toEqual([...MAP_RENDERER_FILES]);
    expect(install.subdirs).toEqual(['src', 'src/instance', 'src/provision', 'src/rules']);
    expect(JSON.parse(install.versionBody)).toEqual({ digest, from: 'test', grammar: MAP_GRAMMAR });
    const newer = JSON.stringify({ digest: 'b'.repeat(64), from: 'other', grammar: MAP_GRAMMAR + 1 });
    expect(plan(l, { ...host.state(), renderer: { installed: newer, ownDigest: digest } }).some(a => a.op === 'renderer-install')).toBe(false);
    expect(refusalsOf(l, { ...host.state(), renderer: { installed: null, ownDigest: null } }).join('\n')).toContain('could not be read whole');
  });

  test('the host-wide map and renderer directories: created via temp names, with their modes', () => {
    const { l, host } = nginxHost();
    const mk = plan(l, host.state())
      .filter((a): a is MkdirAction => a.op === 'mkdir' && a.via !== undefined)
      .map(a => [a.path, a.mode, a.group]);
    expect(mk).toEqual(
      expect.arrayContaining([
        [l.host.nginxMapDir, 0o755, 'root'],
        [l.host.nginxContribDir, 0o3770, 'dedalo_pubhost'],
        [l.host.mapRendererDir, 0o755, 'root'],
      ]),
    );
  });
});

describe('planReport (spec §5.9 check facts)', () => {
  test('nginx conf_d: the live map, the last render, the renderer copy; a newer-grammar refusal is drift', () => {
    const l = derive(siteDecl({ web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } }));
    const state = new FakeHost(l).state();
    const result = JSON.stringify({
      v: 1, seq: 3, at: '2026-10-08T00:00:00Z', outcome: 'map_contribution_newer', host_hash: null, contributions: [], invalid: 1,
      refused: [{ instance: 'other', reason: 'map_contribution_newer' }, { instance: 'third', reason: 'map_envelope_rebind' }],
    });
    const installed = JSON.stringify({ digest: 'd'.repeat(64), from: 'test', grammar: 1 });
    const report = planReport(l, { ...state, hostMap: { live: true, result }, renderer: { installed, ownDigest: 'd'.repeat(64) } });
    expect(report.facts).toContain('host map: the live map exists; last render map_contribution_newer, 0 contribution(s), 1 invalid');
    expect(report.facts).toContain(`host map renderer: grammar 1, digest ${'d'.repeat(12)}, installed by 'test'`);
    expect(report.facts).toContain("the host map renderer refused 'third': map_envelope_rebind");
    expect(report.drift.join('\n')).toContain("the host map renderer refused 'other': map_contribution_newer — run 'provision apply' for that newer instance");
    expect(planReport(l, { ...state, hostMap: { live: false, result: null } }).facts).toContain(
      'host map: no live map yet (nothing pushed: the variables are undefined); the renderer has not run',
    );
  });

  test('the web reference: missing = drift; unknown = a fact', () => {
    const { l, host } = siteHost(siteDecl());
    expect(planReport(l, { ...host.state(), webReference: false }).drift.join('\n')).toContain('the vhost reference was removed');
    expect(planReport(l, host.state()).facts.join('\n')).toContain('the vhost reference to the web include was not checked');
    expect(planReport(l, { ...host.state(), webReference: true }).drift).toEqual([]);
  });

  test('host-wide ProtectHome and scratch overrides are printed as facts; SELinux pending and booleans as drift', () => {
    const l = derive({ ...unixDeclaration(), paths: { host_base: '/scratch/host' } });
    const facts = planReport(l, new FakeHost(l).state()).facts.join('\n');
    expect(facts).toContain('ProtectHome=yes on the agent unit');
    expect(facts).toContain('scratch override set: paths.host_base = /scratch/host');
    const { l: el, host } = siteHost(siteDecl(), { os: 'el', selinux: 'enforcing' });
    host.booleans.set('httpd_graceful_shutdown', false);
    const report = planReport(el, { ...host.state(), selinux: { ...selinuxOf(host, el), pending: [{ path: '/x', from: 'a', to: 'b' }] } });
    expect(report.drift.join('\n')).toContain('carry another label than their rule');
    expect(report.drift.join('\n')).toContain('httpd cannot connect to the v2 port');
  });
});

describe("the site's web logs, outside the home (owner decision 1(c))", () => {
  test('home layout: /var/log/<server>/<domain> created root 0755 and rotated by a stamped logrotate file; the system layout has neither', () => {
    const { l, host } = siteHost(siteDecl());
    const actions = plan(l, stateOf(host, l));
    expect(actions).toContainEqual(expect.objectContaining({ op: 'mkdir', path: '/var/log/apache2/museum.example.org', mode: 0o755, uid: 0, gid: 0 }));
    const rotate = actions.find(a => a.op === 'write' && a.path === '/etc/logrotate.d/dedalo_test_web') as WriteAction | undefined;
    expect(rotate).toMatchObject({ mode: 0o644, uid: 0, gid: 0, validate: null });
    expect(JSON.stringify(rotate?.content)).toContain('/var/log/apache2/museum.example.org/*.log {');
    const system = siteHost(siteDecl({ agent_dir: '/opt/dedalo_publication_host/host_agent', state_root: '/srv/dedalo_publication_host/test', bun_bin: '/opt/dedalo_publication_host/bun/bin/bun' }));
    const none = plan(system.l, stateOf(system.host, system.l));
    expect(none.some(a => 'path' in a && (a.path.startsWith('/var/log/') || a.path === '/etc/logrotate.d/dedalo_test_web'))).toBe(false);
  });

  test("B5: the v1 pool's own log is rotated in EITHER layout, as the v1 user (su), the new file the pool user's", () => {
    for (const decl of [siteDecl(), siteDecl({ agent_dir: '/opt/dedalo_publication_host/host_agent', state_root: '/srv/dedalo_publication_host/test', bun_bin: '/opt/dedalo_publication_host/bun/bin/bun' })]) {
      const { l, host } = siteHost(decl);
      const rotate = plan(l, stateOf(host, l)).find(a => a.op === 'write' && a.path === '/etc/logrotate.d/dedalo_test_v1') as WriteAction | undefined;
      expect(rotate).toMatchObject({ mode: 0o644, uid: 0, gid: 0, validate: null });
      const body = JSON.stringify(rotate?.content);
      expect(body).toContain(`${l.site?.v1?.var.log}/*.log {`);
      expect(body).toContain(`\\tsu ${l.v1!.user} root`);
      expect(body).toContain(`\\tcreate 0600 ${l.v1!.user} root`);
    }
    // No site, no pool: nothing to rotate.
    const bare = derive(unixDeclaration());
    expect(RENDERERS.find(r => r.kind === 'logrotate_v1')?.appliesTo?.(bare)).toBe(false);
  });

  test("Ubuntu's rsyslog /var/log (root:syslog 0775) above a root parent is no refusal — the parent is pinned; with an untrusted parent it is", () => {
    const { l, host } = siteHost(siteDecl());
    (host.entries.get('/var/log') as { mode: number; gid: number }).mode = 0o775;
    (host.entries.get('/var/log') as { mode: number; gid: number }).gid = 104;
    expect(plan(l, stateOf(host, l))).toContainEqual(expect.objectContaining({ op: 'mkdir', path: '/var/log/apache2/museum.example.org' }));
    (host.entries.get('/var/log/apache2') as { mode: number }).mode = 0o775;
    expect(refusals(l, host).join('\n')).toContain("'/var/log' (above the managed '/var/log/apache2/museum.example.org') is group- or world-writable");
  });

  test('S3-1: the pinned parent rides the actions as OBSERVED (owner, group, mode, dev, ino); a mount over it is refused', () => {
    const { l, host } = siteHost(siteDecl());
    const varLog = host.entries.get('/var/log') as { mode: number; gid: number; dev?: number; ino?: number };
    varLog.mode = 0o775;
    varLog.gid = 104;
    varLog.dev = 7;
    const apache = host.entries.get('/var/log/apache2') as { uid: number; gid: number; mode: number; dev?: number; ino?: number };
    apache.dev = 7;
    apache.ino = 4242;
    const actions = plan(l, stateOf(host, l));
    expect(actions).toContainEqual(
      expect.objectContaining({
        op: 'mkdir',
        path: '/var/log/apache2/museum.example.org',
        pin: { parent: '/var/log/apache2', uid: apache.uid, gid: apache.gid, mode: apache.mode, dev: 7, ino: 4242 },
      }),
    );
    // Rule 1 holds (trusted /var/log): nothing is pinned, nothing carries an expectation.
    varLog.mode = 0o755;
    expect(plan(l, stateOf(host, l)).some(a => 'pin' in a)).toBe(false);
    // A drifted site log directory is fixed through the same pin.
    varLog.mode = 0o775;
    host.seedDir('/var/log/apache2/museum.example.org');
    (host.entries.get('/var/log/apache2/museum.example.org') as { mode: number }).mode = 0o700;
    expect(plan(l, stateOf(host, l))).toContainEqual(expect.objectContaining({ op: 'chmod', path: '/var/log/apache2/museum.example.org', pin: expect.objectContaining({ ino: 4242 }) }));
    // Another device than its untrusted parent: something is mounted over the name.
    apache.dev = 8;
    expect(refusals(l, host).join('\n')).toContain("'/var/log/apache2' is a mount point (device 8, its parent '/var/log' on 7)");
  });
});

describe('restorecon targets come from what exists or is created', () => {
  test('the site logs are no relabel target: an existing <home>/logs is not ours, /var/log/httpd/<domain> is typed by the policy', () => {
    const { l, host } = siteHost(siteDecl({ web: { server: 'apache', unit: 'httpd' } }), { os: 'el', selinux: 'enforcing' });
    host.seedDir(`${HOME}/logs`);
    const relabel = plan(l, stateOf(host, l)).find(a => a.op === 'selinux-restorecon') as SelinuxRestoreconAction;
    expect(relabel.targets.some(t => t.path === `${HOME}/logs`)).toBe(false);
    expect(relabel.targets.some(t => t.path.startsWith('/var/log/'))).toBe(false);
  });
});
