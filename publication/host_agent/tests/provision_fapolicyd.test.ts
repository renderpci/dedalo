/**
 * FAPOLICYD IN THE PROVISIONER (owner decision 2026-10-09): ONLY where fapolicyd is installed
 * (derive()'s DeriveHost.fapolicyd) an instance gets the root oneshot
 * `dedalo-pubhost-trust-<instance>.service`, the ONE polkit pair that lets its agent start it, the
 * two env keys naming it, and its trust file — written by `provision apply` on drift (the bytes the
 * oneshot renders), with `fapolicyd-cli --update` and the wait in the tail BEFORE any unit starts.
 * fapolicyd uninstalled, the unit and the trust file are retired — only when they are ours.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../src/provision/apply';
import { renderTrustFile, trustLinesOf } from '../src/provision/fapolicyd_trust';
import { stamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import type { Action, HostState } from '../src/provision/plan';
import { PlanRefused, describe as describeAction, plan, planReport, renderAll } from '../src/provision/plan';
import { agentEnvVars } from '../src/provision/render/env';
import { TRUST_PROGRAM_ENTRY, trustExecStart } from '../src/provision/render/trust_unit';
import { v2OnlySiteDeclaration } from './fixtures/provision_declaration';
import { FakeInitHost } from './support/provision_fake_host';

const TRUST_DIR = '/etc/fapolicyd/trust.d';
const TRUST_FILE = `${TRUST_DIR}/dedalo_test`;
const UNIT = '/etc/systemd/system/dedalo-pubhost-trust-test.service';

const withFapolicyd = (): AgentLayout => derive(v2OnlySiteDeclaration(), { fapolicyd: true });
const without = (): AgentLayout => derive(v2OnlySiteDeclaration());

class Host extends FakeInitHost {}

function host(layout: AgentLayout, seedTrustDir = true): Host {
  const h = new Host(layout, { os: 'el', selinux: 'absent' });
  h.seedDir('/var/lib');
  if (seedTrustDir) h.seedDir(TRUST_DIR);
  h.seedFile(join(layout.agentDir, 'package.json'), '{"name":"agent"}');
  return h;
}

function refusals(layout: AgentLayout, state: HostState): readonly string[] {
  try {
    plan(layout, state);
  } catch (error) {
    if (error instanceof PlanRefused) return error.reasons;
    throw error;
  }
  throw new Error('the plan was not refused');
}

function converge(layout: AgentLayout, h: Host): Action[] {
  const actions = plan(layout, h.stateFor(layout));
  const report = apply(actions, h);
  if (!report.ok) throw new Error(`apply failed: ${report.failure?.detail}`);
  return actions;
}

describe('rendered only where fapolicyd is installed', () => {
  test('no fapolicyd: no trust unit, no grant, no env key — the bytes of every other artifact unchanged', () => {
    const plain = renderAll(without());
    expect(plain.some(art => art.kind === 'trust_unit')).toBe(false);
    expect(without().trust).toBeNull();
    expect(Object.keys(agentEnvVars(without()))).not.toContain('TRUST_UNIT');
    const polkit = plain.find(art => art.kind === 'polkit')?.body ?? '';
    expect(polkit).not.toContain('dedalo-pubhost-trust');
  });

  test('fapolicyd: the root oneshot — no argument from the agent, the instance and its declaration root-written in ExecStart', () => {
    const layout = withFapolicyd();
    const unit = renderAll(layout).find(art => art.kind === 'trust_unit');
    expect(unit?.path).toBe(UNIT);
    expect(unit?.owner).toBe('root');
    expect(unit?.mode).toBe(0o644);
    const body = unit?.body ?? '';
    expect(body).toContain('Type=oneshot\nUser=root\nGroup=root\n');
    expect(trustExecStart(layout)).toBe(
      `${layout.bunBin} --no-env-file --no-install ${layout.agentDir}/src/provision/fapolicyd_trust_main.ts test /etc/dedalo_publication_host/test.json`,
    );
    expect(body).toContain(`ExecStart=${trustExecStart(layout)}\n`);
    expect(body).toContain('Environment=\n');
    expect(body).toContain('ProtectSystem=full\nReadWritePaths=-/etc/fapolicyd/trust.d\nReadWritePaths=-/etc/dedalo_publication_host/test\n');
    expect(body).not.toContain('[Install]');
    // The entry it names is a file of this package.
    expect(existsSync(join(import.meta.dir, '..', TRUST_PROGRAM_ENTRY))).toBe(true);
  });

  test('the ONE extra polkit pair: start of exactly this instance’s trust unit', () => {
    const before = renderAll(without()).find(art => art.kind === 'polkit')?.body.split('\n').slice(1) ?? [];
    const after = renderAll(withFapolicyd()).find(art => art.kind === 'polkit')?.body.split('\n').slice(1) ?? [];
    const added = after.filter(line => !before.includes(line));
    expect(added).toEqual([
      expect.stringContaining('; start dedalo-pubhost-trust-test.service. Nothing else.'),
      '  if (unit === "dedalo-pubhost-trust-test.service" && verb === "start") {',
    ]);
    expect(before.filter(line => !after.includes(line))).toHaveLength(1); // the header line it replaced
  });

  test('the env names the unit and its record (the agent config accepts only its own unit name)', () => {
    expect(agentEnvVars(withFapolicyd())).toMatchObject({
      TRUST_UNIT: 'dedalo-pubhost-trust-test',
      TRUST_RESULT_FILE: '/etc/dedalo_publication_host/test/fapolicyd_trust.json',
    });
  });
});

describe('provision apply writes the trust file, then tells the daemon before anything starts', () => {
  test('a converge: the stamped file holds bun_bin and the agent tree; the update precedes every start/restart; a second plan is empty', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    const actions = converge(layout, h);
    const body = h.body(TRUST_FILE) ?? '';
    expect(trustLinesOf(body).map(line => line.split(' ')[0])).toEqual([layout.bunBin, join(layout.agentDir, 'package.json'), layout.agentEntry].sort());
    const derived = h.stateFor(layout).trust?.derivation;
    expect(derived?.kind === 'ok' && body === renderTrustFile('test', derived)).toBe(true);
    const ops = actions.map(action => action.op);
    const update = ops.indexOf('fapolicyd-update');
    expect(update).toBeGreaterThan(-1);
    for (const op of ['enable', 'start', 'restart'] as const) {
      const at = ops.indexOf(op);
      if (at !== -1) expect(at).toBeGreaterThan(update);
    }
    expect(h.calls).toContain('fapolicyd-cli --update');
    expect(describeAction(actions[update] as Action)).toContain('fapolicyd-cli --update (/etc/fapolicyd/trust.d/dedalo_test)');
    expect(plan(layout, h.stateFor(layout))).toEqual([]);
  });

  test('a changed agent file rewrites it (and waits for the line it added); an unchanged tree writes nothing', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    converge(layout, h);
    h.seedFile(join(layout.agentDir, 'src', 'zz.ts'), 'new');
    const actions = plan(layout, h.stateFor(layout));
    expect(actions.map(action => action.op)).toEqual(['write', 'fapolicyd-update']);
    const update = actions[1] as Extract<Action, { op: 'fapolicyd-update' }>;
    expect(update.pending?.startsWith(`${join(layout.agentDir, 'src', 'zz.ts')} 3 `)).toBe(true);
  });

  test('a release that cannot be verified is left out of the file and named as drift — provisioning goes on', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    h.seedDir(join(layout.state.apis.v2.releases, '0.0.0_drill00'));
    h.seedLink(layout.state.apis.v2.current, 'releases/0.0.0_drill00');
    const state = h.stateFor(layout);
    const report = planReport(layout, state);
    expect(report.drift).toEqual([`fapolicyd trust: v2: '${layout.state.apis.v2.current}' points at 'releases/0.0.0_drill00', not releases/<id> — no v2 release is trusted`]);
    expect(report.facts.some(line => line.startsWith('fapolicyd: 3 file(s) trusted in /etc/fapolicyd/trust.d/dedalo_test (no release yet)'))).toBe(true);
    converge(layout, h);
    expect(h.body(TRUST_FILE)).not.toContain('0.0.0_drill00');
  });

  test('the daemon not running: the file is written, no update (fapolicyd reads trust.d at its start)', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    h.fapolicydDaemon.active = false;
    const actions = converge(layout, h);
    expect(actions.some(action => action.op === 'fapolicyd-update')).toBe(false);
    expect(h.body(TRUST_FILE)).toBeDefined();
  });

  test('refused: a derivation that cannot be verified, an unobserved set, a foreign file, no trust.d', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    h.seedFile(join(layout.agentDir, 'src', 'a b.ts'), 'x');
    expect(refusals(layout, h.stateFor(layout)).join('\n')).toContain('fapolicyd trust: agent_dir:');
    h.entries.delete(join(layout.agentDir, 'src', 'a b.ts'));
    const plainState = h.state();
    expect(refusals(layout, plainState).join('\n')).toContain('the trust set of \'test\' was not observed');
    const clean = host(layout);
    clean.seedFile(TRUST_FILE, '/usr/bin/evil 1 aa\n');
    expect(refusals(layout, clean.stateFor(layout)).join('\n')).toContain('was not written by this provisioner (no stamp)');
    const bare = host(layout, false);
    bare.seedDir('/etc/fapolicyd');
    expect(refusals(layout, bare.stateFor(layout)).join('\n')).toContain("fapolicyd's trust directory '/etc/fapolicyd/trust.d' does not exist");
  });
});

describe('fapolicyd uninstalled: the unit and the trust file are retired — ours only', () => {
  test('both removed, the grant and the env keys go; a second plan is empty', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    converge(layout, h);
    expect(h.body(UNIT)).toBeDefined();
    const later = without();
    const actions = plan(later, h.stateFor(later));
    const removed = actions.filter(action => action.op === 'remove').map(action => (action as { path: string }).path).sort();
    expect(removed).toEqual([TRUST_FILE, UNIT].sort());
    const report = apply(actions, h);
    expect(report.ok).toBe(true);
    expect(h.body(TRUST_FILE)).toBeUndefined();
    expect(h.body(UNIT)).toBeUndefined();
    expect(h.body(later.polkitPath)).not.toContain('dedalo-pubhost-trust');
    expect(plan(later, h.stateFor(later))).toEqual([]);
  });

  test('a hand-edited or foreign trust file is refused, never removed', () => {
    const layout = withFapolicyd();
    const h = host(layout);
    converge(layout, h);
    h.seedFile(TRUST_FILE, `${h.body(TRUST_FILE)}/usr/bin/evil 1 ${'0'.repeat(64)}\n`);
    const later = without();
    expect(refusals(later, h.stateFor(later)).join('\n')).toContain('edited by hand');
    h.seedFile(TRUST_FILE, stamp('fapolicyd_trust', 'other', '/x 1 aa\n'));
    expect(refusals(later, h.stateFor(later)).join('\n')).toContain("stamped for 'other fapolicyd_trust'");
  });
});
