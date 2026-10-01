/**
 * THE RENDERER AND THE COMPARATOR IN ONE ROOM — what ROOT renders for every (site, door), as
 * PID 1 would load it, is what the DAEMON accepts (LEAD-1b §2.2 × §2.8).
 *
 * WHY. Two halves describe one unit: `render/agent_units.ts` writes it; `conformance()` refuses
 * to run anything PID 1 loaded that differs from what it expects. Each half had its own gate
 * (G3 reads the files, G9 refuses drift off a hand-written `conformingShow`), and nothing put
 * the two together: M33 — `BindPaths=/nonexistent` rendered on the git door — stayed green in
 * the package and in the repo tripwire, while on a real host every git run (every turn's
 * commit, every createSite) would have been refused `unit_nonconformant`.
 *
 * HOW. The policy is built the way `policyFromConfig()` builds the daemon's, from what root
 * RENDERED for it: the env file (instance, identities, prefix, socket dir, state root, door
 * ceilings, caps — with the daemon's own defaults where the env states none), the daemon unit
 * (User=/Group= are the daemon's own names; ExecStart's binary is its runtime, WorkingDirectory
 * its checkout and so its shim) and the workspaces root (`SITES_ROOT`). Every rendered socket,
 * target and template is turned into `systemctl show` spelling by `support/unit_show.ts` — a
 * model of systemd's load/show derived from the unit-file semantics, not from the comparator —
 * and `conformance()` must answer `{ warnings: [] }` for every (k, door), at 255 and at 257.
 *
 * HONEST LIMIT: `unit_show.ts` is a model (residual 9 — the P7 capture closes it). It is the
 * model's INDEPENDENCE from `conformance()` that makes a disagreement between the two halves red.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { AGENT_RUN_CAPS, DOOR_TIMEOUT_DEFAULTS_MS } from '../src/provision/layout';
import { renderAll } from '../src/provision/render/index';
import { SHIM_RELATIVE } from '../src/provision/render/agent_units';
import { parseEnvFile } from '../src/env_file';
import { caught, DOORS, type Door, gateInstance, gateManifestDoc, hasConfinementCode, unitNamesFor, unitValues } from './support/lead1b_contract';
import { showOfRendered, type UnitKind } from './support/unit_show';
import { roots } from './fixtures/instance';

type Conformance = (k: number, door: Door, policy: unknown) => Promise<{ warnings: string[] }>;

const SITES = ['alpha', 'beta', 'gamma'] as const;

/** One instance as root renders it at PID 1 `version`: the unit files by name, and the daemon's policy. */
function rendered(version: number, edit?: (name: string, body: string) => string) {
  // The workspaces root DECLARED as this suite's daemon reads it (`roots.sitesRoot`): the
  // rendered env's SITES_ROOT then follows from the declaration, as on a host.
  const gate = gateInstance('test', SITES, { ...gateManifestDoc('test', SITES), roots: { workspaces: roots.sitesRoot } });
  const layout = gate.layout;
  const artifacts = renderAll(layout, gate.manifest, { agentIdentities: gate.identities, systemdVersion: version, identityEpoch: 1 });
  const byPath = new Map(artifacts.map(artifact => [artifact.path as string, artifact.body as string]));
  const env = parseEnvFile(byPath.get(layout.envFile) as string, layout.envFile);
  const daemon = byPath.get(layout.unitPath) as string;
  const one = (key: string) => {
    const values = unitValues(daemon, key, 'Service');
    if (values.length !== 1) throw new Error(`the daemon unit states ${key}= ${values.length} times`);
    return values[0] as string;
  };
  const files = new Map<string, string>();
  for (const artifact of artifacts) {
    const name = String(artifact.path).split('/').pop() as string;
    if (artifact.kind !== 'agent_units' || !/\.(socket|target|service)$/.test(name)) continue;
    files.set(name, edit ? edit(name, artifact.body) : artifact.body);
  }
  const shows = new Map<string, string>();
  for (const [name, body] of files) {
    const kind: UnitKind = name.endsWith('.socket') ? 'socket' : name.endsWith('.target') ? 'target' : 'service';
    // PID 1 is asked about the template as an instance (`<…>@probe.service`).
    shows.set(name.endsWith('@.service') ? name.replace('@.service', '@probe.service') : name, showOfRendered(body, kind));
  }
  const number = (key: string, fallback: number) => (env[key] !== undefined ? Number(env[key]) : fallback);
  const policy = {
    mode: 'systemd_scope',
    instance: env.DEDALO_SITE_INSTANCE,
    identities: new Map(Object.entries(JSON.parse(env.AGENT_IDENTITIES as string) as Record<string, number>)),
    unitPrefix: env.AGENT_UNIT_PREFIX,
    agentSocketDir: env.AGENT_SOCKET_DIR,
    agentStateRoot: env.AGENT_STATE_ROOT,
    serviceUser: one('User'),
    instanceGroup: one('Group'),
    unitExec: { runtime: one('ExecStart').split(/\s+/)[0], shim: join(one('WorkingDirectory'), SHIM_RELATIVE), maskedPrefixes: [] },
    doorTimeoutsMs: {
      turn: number('SESSION_TURN_TIMEOUT_MS', DOOR_TIMEOUT_DEFAULTS_MS.session_turn_timeout_ms),
      build: Math.max(
        number('INSTALL_TIMEOUT_MS', DOOR_TIMEOUT_DEFAULTS_MS.install_timeout_ms),
        number('BUILD_TIMEOUT_MS', DOOR_TIMEOUT_DEFAULTS_MS.build_timeout_ms),
      ),
      git: number('GIT_TIMEOUT_MS', DOOR_TIMEOUT_DEFAULTS_MS.git_timeout_ms),
    },
    memoryMax: env.AGENT_TURN_MEMORY_MAX ?? AGENT_RUN_CAPS.memoryMax,
    cpuQuota: env.AGENT_TURN_CPU_QUOTA ?? AGENT_RUN_CAPS.cpuQuota,
    tasksMax: number('AGENT_TURN_TASKS_MAX', AGENT_RUN_CAPS.tasksMax),
    host: {
      pid1Version: () => version,
      systemctl: async (args: readonly string[]) => {
        const unit = args[args.length - 1] as string;
        const text = shows.get(unit);
        return text === undefined ? { code: 1, stdout: '', stderr: `Unit ${unit} not loaded.` } : { code: 0, stdout: text, stderr: '' };
      },
    },
  };
  return { gate, layout, env, policy, files, shows };
}

describe('render → load → conformance: every rendered (site, door) is accepted, strictly', () => {
  for (const version of [255, 257]) {
    test(`at PID 1 = ${version}: every socket, target and template of 3 sites × 3 doors conforms, with no warning`, async () => {
      const { conformance } = (await import('../src/drivers/confinement')) as unknown as { conformance: Conformance };
      const { gate, env, policy, files } = rendered(version);
      // The facts the policy was read from are the layout's (no silent re-pointing here).
      expect({ sitesRoot: env.SITES_ROOT, units: files.size }).toEqual({ sitesRoot: roots.sitesRoot, units: SITES.length * DOORS.length * 3 });
      const refused: string[] = [];
      for (const [slug, k] of gate.identities) {
        for (const door of DOORS) {
          try {
            const result = await conformance(k, door, policy);
            if (result.warnings.length > 0) refused.push(`${slug} s${k} ${door}: warned ${result.warnings.join(' | ')}`);
          } catch (error) {
            refused.push(`${slug} s${k} ${door}: ${(error as Error).message}`);
          }
        }
      }
      expect(refused).toEqual([]);
    });
  }

  /**
   * NOT VACUOUS: the same round trip turns red when the RENDERED file says one thing more —
   * each edit made to the file, never to the show text, and each refused naming the property.
   */
  test('control: a rendered file that differs from what the daemon expects is refused through the same round trip', async () => {
    const { conformance } = (await import('../src/drivers/confinement')) as unknown as { conformance: Conformance };
    const cases: Array<[string, Door, (body: string) => string, string]> = [
      ['M33: a bind on the git door', 'git', body => body.replace('UMask=0007', 'UMask=0007\nBindPaths=/nonexistent'), 'BindPaths'],
      ['a bind outside the state root on a proxy door', 'turn', body => body.replace('UMask=0007', 'UMask=0007\nBindPaths=/srv'), 'BindPaths'],
      ['a stop that skips SIGKILL', 'build', body => body.replace('SendSIGKILL=yes', 'SendSIGKILL=no'), 'SendSIGKILL'],
      ['a catchable final kill', 'turn', body => body.replace('FinalKillSignal=SIGKILL', 'FinalKillSignal=SIGHUP'), 'FinalKillSignal'],
      ['a root-opened file handed to the run', 'git', body => body.replace('UMask=0007', 'UMask=0007\nOpenFile=/etc/shadow'), 'OpenFile'],
      ['a privileged ExecStart', 'git', body => body.replace(/^ExecStart=/m, 'ExecStart=+'), 'ExecStartEx flags'],
      ['one tmpfs mask fewer', 'build', body => body.replace(/^TemporaryFileSystem=\/run:ro$/m, ''), 'TemporaryFileSystem'],
    ];
    const survived: string[] = [];
    for (const [label, door, edit, property] of cases) {
      const target = (await unitNamesFor('dedalo-site-test-agent-', 2, door)).template;
      const { policy, files } = rendered(255, (name, body) => (name === target ? edit(body) : body));
      if (files.get(target) === rendered(255).files.get(target)) {
        survived.push(`${label}: the edit did not apply`);
        continue;
      }
      const refused = await caught(() => conformance(2, door, policy));
      if (!hasConfinementCode(refused, 'unit_nonconformant') || !String((refused as Error).message).includes(`${property} —`)) {
        survived.push(`${label}: ${refused instanceof Error ? refused.message : 'accepted'}`);
      }
    }
    expect(survived).toEqual([]);
  });
});
