/**
 * plan(): pure, ordered, writes only on drift, refuses what is not ours, refuses code a
 * non-root principal could replace, configtest before any web reload.
 */
import { describe, expect, test } from 'bun:test';
import { apply } from '../src/provision/apply';
import { stamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { derive, markerContent } from '../src/provision/layout';
import type { Action } from '../src/provision/plan';
import {
  PlanRefused,
  RENDERERS,
  TEST_SCRATCH_DIR,
  agentScratchPath,
  ancestorsBelow,
  assertPlanIsCoherent,
  assertRendererCensus,
  describe as describeAction,
  plan,
  renderAll,
  trustProblem,
} from '../src/provision/plan';
import type { Renderer } from '../src/provision/render/types';
import { artifact } from '../src/provision/render/types';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FakeHost } from './support/provision_fake_host';

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
    expect(renderAll(l).map(a => a.path)).toEqual([l.envFile]);
    const twin: Renderer = { kind: 'env', render: x => [artifact(x, { kind: 'env', path: x.envFile, mode: 'envFile', body: 'x\n' })] };
    expect(() => renderAll(l, [...RENDERERS, twin])).toThrow(/written twice/);
  });
});

describe('plan on a fresh host', () => {
  const l = layout();
  const actions = plan(l, new FakeHost(l).state());

  test('mkdir every declared directory, parents first, with its MODES row', () => {
    const mkdirs = actions.filter(a => a.op === 'mkdir');
    expect(mkdirs.map(a => a.path)).toEqual(l.directories.map(d => d.path));
    expect(mkdirs.find(a => a.path === l.credentialsDir)).toMatchObject({ owner: 'root', group: 'root', mode: 0o700 });
    expect(mkdirs.find(a => a.path === l.state.root)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.publicationApi)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.audit)).toMatchObject({ owner: 'root', uid: 0, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.rules)).toMatchObject({ owner: 'dedalo-pubhost', uid: 990, mode: 0o755 });
    expect(mkdirs.find(a => a.path === l.state.apis.v2.staging)).toMatchObject({ owner: 'dedalo-pubhost', uid: 990, mode: 0o700 });
    expect(mkdirs.find(a => a.path === l.state.apis.v1.shared)).toMatchObject({ group: 'www-data', gid: 33, mode: 0o750 });
  });

  test('writes the marker, mints the token, creates the audit log, creates the env file — in that order', () => {
    const writes = actions.filter(a => a.op === 'write');
    expect(writes.map(a => [a.path, a.label, a.disposition])).toEqual([
      [l.state.marker, 'marker', 'create'],
      [l.serviceTokenPath, 'credential', 'create'],
      [l.state.auditFile, 'audit_log', 'create'],
      [l.envFile, 'env', 'create'],
    ]);
    expect(writes[0]).toMatchObject({ content: { source: 'literal', body: markerContent('test') } });
    expect(writes[1]).toMatchObject({ content: { source: 'random', bytes: 32 }, mode: 0o600 });
    expect(writes[2]).toMatchObject({ content: { source: 'literal', body: '' }, owner: 'dedalo-pubhost', uid: 990, mode: 0o600 });
  });

  test('the audit log is made append-only, as the LAST filesystem action (chown/chmod would then fail)', () => {
    const seals = actions.filter(a => a.op === 'append-only');
    expect(seals).toEqual([{ op: 'append-only', path: l.state.auditFile }]);
    expect(actions.at(-1)).toEqual({ op: 'append-only', path: l.state.auditFile });
  });

  test('no unit action: no service artifact is rendered, and the agent is not running', () => {
    expect(actions.filter(a => !['mkdir', 'write', 'append-only'].includes(a.op))).toEqual([]);
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
    entry(host, l.state.apis.v1.root).uid = 0;
    host.entries.delete(l.state.apis.v1.staging);
    const ops = plan(l, host.state()).map(a => `${a.op} ${'path' in a ? a.path : ''}`);
    expect(ops.indexOf(`chown ${l.state.apis.v1.root}`)).toBeLessThan(ops.indexOf(`mkdir ${l.state.apis.v1.staging}`));
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

  test('missing accounts, binaries and agent checkout are ALL named, with the fix', () => {
    const l = layout();
    const host = new FakeHost(l);
    host.users.delete('dedalo-pubhost');
    host.groups.delete('www-data');
    host.entries.delete(l.phpBin);
    host.entries.delete(l.agentEntry);
    const reasons = refusals(l, host);
    expect(reasons).toHaveLength(4);
    expect(reasons.join('\n')).toContain('useradd --system --no-create-home --shell /usr/sbin/nologin dedalo-pubhost');
    expect(reasons.join('\n')).toContain('groupadd --system www-data');
    expect(reasons.join('\n')).toContain("php_bin '/usr/bin/php'");
    expect(reasons.join('\n')).toContain('check out publication/host_agent');
  });

  test('a group-writable configtest binary (the NOPASSWD sudo target) is refused', () => {
    const l = layout();
    const host = new FakeHost(l);
    entry(host, l.web.configtestBin).mode = 0o775;
    expect(refusals(l, host)).toEqual([
      `web.configtest_bin '/usr/sbin/apachectl' is group- or world-writable (mode 0775) — a non-root principal could replace what it runs; make it root-owned and not group- or world-writable`,
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
    expect(() =>
      assertPlanIsCoherent(
        [
          { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apachectl' },
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
    const tail = plan(l, new FakeHost(l).state(), [probe]).filter(a => !['mkdir', 'write', 'append-only'].includes(a.op));
    expect(tail).toEqual([
      { op: 'daemon-reload' },
      { op: 'web-configtest', server: 'apache', bin: '/usr/sbin/apachectl' },
      { op: 'web-reload', unit: 'apache2' },
      { op: 'enable', unit: 'dedalo-publication-host-test' },
      { op: 'start', unit: 'dedalo-publication-host-test' },
    ]);
  });
});
