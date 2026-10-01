/**
 * LEAD-1b G3 + G5 (commit C3) — WHAT ROOT RENDERS PER (SITE, DOOR), AND WHAT THE RULE ANSWERS.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * G3 — the socket, target and template per (k, door) say, for PID 1, what the transient argv
 *   used to say for the daemon: WHO (a root-owned `User=` per site), WHAT it may write (its
 *   workspace only), WHAT it may see of the agent state (its own door's HOME only), HOW MANY
 *   (one live run per socket, one per site across doors) and FOR HOW LONG.
 * G5 — the rule is EXECUTED: stop/kill on enumerated socket-activated instances, nothing else.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { readWritePaths } from '../src/provision/layout';
import { unitRenderer } from '../src/provision/render/unit';
import {
  caught,
  contractExport,
  contractModule,
  DOORS,
  type Door,
  type GateInstance,
  gateInstance,
  INSTANCE_SPELLINGS,
  NOT_INSTANCE_SPELLINGS,
  loadRule,
  renderAgentRule,
  renderAgentTmpfiles,
  renderAgentUnits,
  type RenderedFile,
  sweepScratch,
  unitDirectives,
  unitEnvironment,
  unitNamesFor,
  unitValues,
} from './support/lead1b_contract';
import { buildModel, type FsNode, type Principal, routes } from './support/unit_file_reach';

afterEach(sweepScratch);

const SITES = ['alpha', 'beta'] as const;
const museo = (): GateInstance => gateInstance('museo', SITES);

/** The identity name of site k — from the leaf (absent → the row is red, naming it). */
async function identityOf(instance: string, k: number): Promise<string> {
  const name = await contractExport<(i: string, k: number) => string>('drivers/agent_identity.ts', 'agentIdentityName');
  return name(instance, k);
}

async function socketPath(gate: GateInstance, k: number, door: Door): Promise<string> {
  const agentSocketPath = await contractExport<(dir: string, k: number, d: Door) => string>(
    'drivers/agent_identity.ts',
    'agentSocketPath',
  );
  return agentSocketPath(layoutField(gate, 'agentSocketDir'), k, door);
}

function layoutField(gate: GateInstance, field: 'agentSocketDir' | 'agentStateRoot'): string {
  const value = (gate.layout as unknown as Record<string, unknown>)[field];
  if (typeof value !== 'string') {
    throw new Error(`LEAD-1b contract: InstanceLayout has no '${field}' (spec §3 layout.ts). Got ${String(value)}.`);
  }
  return value;
}

function workspaceOf(gate: GateInstance, slug: string): string {
  return join(gate.layout.roots.workspaces, slug);
}

/** RuntimeMaxSec each door must carry: its ceiling + 15 s (spec §2.2). */
function runtimeMaxSec(gate: GateInstance, door: Door): number {
  const env = gate.layout.envVars;
  const ms =
    door === 'turn'
      ? Number(env.SESSION_TURN_TIMEOUT_MS)
      : door === 'build'
        ? Math.max(Number(env.INSTALL_TIMEOUT_MS), Number(env.BUILD_TIMEOUT_MS))
        : Number(env.GIT_TIMEOUT_MS ?? 30_000);
  return Math.ceil(ms / 1000) + 15;
}

function one(body: string, key: string, section: string): string {
  const values = unitValues(body, key, section);
  if (values.length !== 1) throw new Error(`expected exactly one ${key}= in [${section}], found ${values.length}: ${values.join(' | ')}`);
  return values[0] as string;
}

function words(values: readonly string[]): string[] {
  return values.flatMap(value => value.split(/\s+/).filter(Boolean));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * G3 — the rendered units
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G3 — root renders one socket, target and template per (site, door)', () => {
  for (const version of [255, 257]) {
    describe(`at PID 1 = ${version}`, () => {
      test('exactly 3 files per (k, door), host config owned by root, beside the daemon unit', async () => {
        const gate = museo();
        const files = await renderAgentUnits(gate, version);
        const expected = new Set<string>();
        for (const [, k] of gate.identities) {
          for (const door of DOORS) {
            const names = await unitNamesFor(gate.layout.agentUnitPrefix, k, door);
            expected.add(names.socket).add(names.target).add(names.template);
          }
        }
        expect([...files.keys()].sort()).toEqual([...expected].sort());
        for (const file of files.values()) {
          expect({ name: file.name, owner: file.owner, group: file.group, mode: file.mode, dir: dirname(file.path) }).toEqual({
            name: file.name,
            owner: 'root',
            group: 'root',
            mode: 0o644,
            dir: dirname(gate.layout.unitPath),
          });
        }
      });

      test('the egress directories are ROOT’s: a tmpfiles.d line per declared site, root:<its private group> 0770 under root 0755', async () => {
        const gate = museo();
        const file = await renderAgentTmpfiles(gate, version);
        const lines = (file?.body ?? '').split('\n').filter(line => /^[a-zA-Z]/.test(line));
        const base = join(gate.layout.agentSocketDir, 'egress');
        const expected = [
          `d ${gate.layout.agentSocketDir} 0755 root root -`,
          `d ${base} 0755 root root -`,
          ...[...gate.identities.values()].sort((a, b) => a - b).map(k => `d ${join(base, `s${k}`)} 0770 root ${gate.layout.agentUnitPrefix.replace(/^dedalo-site-(.*)-agent-$/, 'dedalo-a-$1')}_${k} -`),
        ];
        expect({ path: file?.path, owner: file?.owner, group: file?.group, mode: file?.mode, lines }).toEqual({
          path: gate.layout.agentTmpfilesPath,
          owner: 'root',
          group: 'root',
          mode: 0o644,
          lines: expected,
        });
      });

      test('the socket: one connection, owned by the service user alone, outside the daemon runtime dir', async () => {
        const gate = museo();
        const files = await renderAgentUnits(gate, version);
        const socketDir = layoutField(gate, 'agentSocketDir');
        expect(socketDir.startsWith('/run/')).toBe(true);
        expect(socketDir === gate.layout.runtimeDir || socketDir.startsWith(`${gate.layout.runtimeDir}/`)).toBe(false);
        for (const [, k] of gate.identities) {
          for (const door of DOORS) {
            const names = await unitNamesFor(gate.layout.agentUnitPrefix, k, door);
            const body = (files.get(names.socket) as RenderedFile).body;
            expect({
              unit: names.socket,
              ListenStream: one(body, 'ListenStream', 'Socket'),
              Accept: one(body, 'Accept', 'Socket'),
              MaxConnections: one(body, 'MaxConnections', 'Socket'),
              SocketUser: one(body, 'SocketUser', 'Socket'),
              SocketGroup: one(body, 'SocketGroup', 'Socket'),
              SocketMode: one(body, 'SocketMode', 'Socket'),
              DirectoryMode: one(body, 'DirectoryMode', 'Socket'),
              TriggerLimitIntervalSec: one(body, 'TriggerLimitIntervalSec', 'Socket'),
              TriggerLimitBurst: one(body, 'TriggerLimitBurst', 'Socket'),
            }).toEqual({
              unit: names.socket,
              ListenStream: await socketPath(gate, k, door),
              Accept: 'yes',
              MaxConnections: '1',
              SocketUser: gate.layout.identity.user,
              SocketGroup: gate.layout.identity.group,
              SocketMode: '0600',
              DirectoryMode: '0755',
              TriggerLimitIntervalSec: '2s',
              TriggerLimitBurst: '20',
            });
            // STOPPED WITH THE DAEMON: `PartOf=` its unit puts a stop job on the socket in the
            // daemon's own stop transaction, and a socket with a stop pending accepts nothing —
            // no connect made during that stop activates a run whose BindsTo= would cancel it.
            expect({ unit: names.socket, PartOf: unitValues(body, 'PartOf', 'Unit') }).toEqual({ unit: names.socket, PartOf: [gate.layout.unitName] });
          }
        }
        // …and the daemon wants every one of them back, listening before it starts.
        const daemon = String(unitRenderer.render(gate.layout, gate.manifest, { agentIdentities: gate.identities, systemdVersion: version })[0]?.body);
        const sockets: string[] = [];
        for (const k of [...gate.identities.values()].sort((a, b) => a - b)) {
          for (const door of DOORS) sockets.push((await unitNamesFor(gate.layout.agentUnitPrefix, k, door)).socket);
        }
        expect({
          wants: words(unitValues(daemon, 'Wants', 'Unit')).sort(),
          after: words(unitValues(daemon, 'After', 'Unit')).filter(unit => unit.endsWith('.socket')).sort(),
        }).toEqual({ wants: [...sockets].sort(), after: [...sockets].sort() });
      });

      test('the targets: a site’s doors conflict with each other (and only with each other), ordered git < build < turn', async () => {
        const gate = museo();
        const files = await renderAgentUnits(gate, version);
        for (const [, k] of gate.identities) {
          const target = async (door: Door) => (await unitNamesFor(gate.layout.agentUnitPrefix, k, door)).target;
          for (const door of DOORS) {
            const body = (files.get(await target(door)) as RenderedFile).body;
            const others = await Promise.all(DOORS.filter(other => other !== door).map(target));
            expect({ door, conflicts: words(unitValues(body, 'Conflicts', 'Unit')).sort() }).toEqual({ door, conflicts: others.sort() });
            expect(unitValues(body, 'StopWhenUnneeded', 'Unit')).toEqual(['yes']);
            const after = words(unitValues(body, 'After', 'Unit'));
            const mustFollow = door === 'turn' ? ['build', 'git'] : door === 'build' ? ['git'] : [];
            for (const earlier of mustFollow) expect({ door, after }).toEqual({ door, after: expect.arrayContaining([await target(earlier as Door)]) });
          }
        }
      });

      test('the template: who, how, where — per site, per door', async () => {
        const gate = museo();
        const files = await renderAgentUnits(gate, version);
        const stateRoot = layoutField(gate, 'agentStateRoot');
        const users = new Set<string>();
        for (const [slug, k] of gate.identities) {
          for (const door of DOORS) {
            const names = await unitNamesFor(gate.layout.agentUnitPrefix, k, door);
            const body = (files.get(names.template) as RenderedFile).body;
            const user = one(body, 'User', 'Service');
            users.add(user);
            expect({ template: names.template, user }).toEqual({ template: names.template, user: await identityOf('museo', k) });
            expect(words(unitValues(body, 'BindsTo', 'Unit')).sort()).toEqual(expect.arrayContaining([names.target, gate.layout.unitName]));
            expect(words(unitValues(body, 'After', 'Unit'))).toEqual(expect.arrayContaining([names.target, gate.layout.unitName]));
            expect({
              CollectMode: one(body, 'CollectMode', 'Unit'),
              Type: one(body, 'Type', 'Service'),
              WorkingDirectory: one(body, 'WorkingDirectory', 'Service'),
              StandardInput: one(body, 'StandardInput', 'Service'),
              StandardOutput: one(body, 'StandardOutput', 'Service'),
              StandardError: one(body, 'StandardError', 'Service'),
              TimeoutStopSec: one(body, 'TimeoutStopSec', 'Service'),
              ExecStart: one(body, 'ExecStart', 'Service'),
              NoNewPrivileges: one(body, 'NoNewPrivileges', 'Service'),
              RestrictSUIDSGID: one(body, 'RestrictSUIDSGID', 'Service'),
              LockPersonality: one(body, 'LockPersonality', 'Service'),
              PrivateTmp: one(body, 'PrivateTmp', 'Service'),
              PrivateDevices: one(body, 'PrivateDevices', 'Service'),
              ProtectSystem: one(body, 'ProtectSystem', 'Service'),
              ProtectHome: one(body, 'ProtectHome', 'Service'),
              ProtectProc: one(body, 'ProtectProc', 'Service'),
              UMask: one(body, 'UMask', 'Service'),
              PrivateNetwork: one(body, 'PrivateNetwork', 'Service'),
              PrivateIPC: one(body, 'PrivateIPC', 'Service'),
              ReadWritePaths: words(unitValues(body, 'ReadWritePaths', 'Service')),
              RuntimeMaxSec: one(body, 'RuntimeMaxSec', 'Service'),
              PrivatePIDs: unitValues(body, 'PrivatePIDs', 'Service'),
            }).toEqual({
              CollectMode: 'inactive-or-failed',
              Type: 'exec',
              WorkingDirectory: '/',
              StandardInput: 'socket',
              StandardOutput: 'socket',
              StandardError: 'journal',
              TimeoutStopSec: '10',
              ExecStart: `${gate.layout.daemon.bun} ${join(gate.layout.daemon.workingDirectory, 'src', 'drivers', 'egress_shim.ts')}`,
              NoNewPrivileges: 'yes',
              RestrictSUIDSGID: 'yes',
              LockPersonality: 'yes',
              PrivateTmp: 'yes',
              PrivateDevices: 'yes',
              ProtectSystem: 'strict',
              ProtectHome: 'yes',
              ProtectProc: 'invisible',
              UMask: '0007',
              PrivateNetwork: 'yes',
              PrivateIPC: 'yes',
              ReadWritePaths: [workspaceOf(gate, slug)],
              RuntimeMaxSec: String(runtimeMaxSec(gate, door)),
              PrivatePIDs: version >= 257 ? ['yes'] : [],
            });
            for (const cap of ['MemoryMax', 'CPUQuota', 'TasksMax']) expect({ cap, set: unitValues(body, cap, 'Service').length }).toEqual({ cap, set: 1 });

            // THE AGENT STATE: the whole root masked, only this door's own HOME bound back —
            // EXACTLY, unfiltered: what conformance() expects of the loaded unit (BindPaths `[]`
            // on git, `[home]` on a proxy door; these three masks), so a bind the comparator
            // refuses cannot be rendered here and pass (M33: `BindPaths=/nonexistent` on git,
            // and any bind outside the state root, used to be filtered out of this row).
            const tmpfs = words(unitValues(body, 'TemporaryFileSystem', 'Service'));
            expect({ door, tmpfs: [...tmpfs].sort() }).toEqual({
              door,
              tmpfs: [`${stateRoot}:ro`, '/run:ro', '/dev/shm:mode=1777,nosuid,nodev'].sort(),
            });
            const binds = words(unitValues(body, 'BindPaths', 'Service'));
            // THE EGRESS GATE: root's directory under the agent socket dir (never the daemon's
            // runtime dir, which its uid could re-point), bound READ-ONLY, with no `-` prefix.
            const readOnly = words(unitValues(body, 'BindReadOnlyPaths', 'Service'));
            expect({ door, binds }).toEqual({
              door,
              binds: door === 'git' ? [] : [`${stateRoot}/s${k}/${door}`],
            });
            expect({ door, readOnly }).toEqual({
              door,
              readOnly: door === 'git' ? [] : [`${join(gate.layout.agentSocketDir, 'egress', `s${k}`)}:/run/dedalo-egress`],
            });

            // THE FIXED ENVIRONMENT, and nothing else: no secret rides a unit property.
            const env = unitEnvironment(body);
            const expectedEnv: Record<string, string> = {
              DEDALO_DOOR: door,
              DEDALO_UNIT_WORKDIR: workspaceOf(gate, slug),
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
              HOME: door === 'git' ? '/nonexistent' : `${stateRoot}/s${k}/${door}`,
              ...(door === 'git' ? { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } : {}),
            };
            expect({ template: names.template, env }).toEqual({ template: names.template, env: expectedEnv });
          }
        }
        expect(users.size).toBe(SITES.length);
      });
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G5 — the rule, executed
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G5 — the rule grants stop/kill on this museum’s enumerated instances, and nothing else', () => {
  test('control (positive half): declared k × door × socket-activated instance × {stop, kill} → YES', async () => {
    const gate = museo();
    const ask = await loadRule(await renderAgentRule(gate));
    const denied: string[] = [];
    for (const [, k] of gate.identities) {
      for (const door of DOORS) {
        for (const verb of ['stop', 'kill']) {
          // Every spelling PID 1 has given an instance (<= 257 and >= 258): a grant that matched
          // only one would leave the daemon unable to stop a run on the other.
          for (const spelling of INSTANCE_SPELLINGS) {
            const unit = `${gate.layout.agentUnitPrefix}s${k}-${door}@${spelling}.service`;
            const answer = ask({ user: gate.layout.identity.user, unit, verb });
            if (answer !== 'YES') denied.push(`${verb} ${unit} → ${answer}`);
          }
        }
      }
    }
    expect(denied).toEqual([]);
  });

  test('everything else is NOT_HANDLED', async () => {
    const gate = museo();
    const prefix = gate.layout.agentUnitPrefix;
    const svc = gate.layout.identity.user;
    const ask = await loadRule(await renderAgentRule(gate));
    const good = `${prefix}s1-turn@3-100-999.service`;
    const cases: Array<[string, Parameters<typeof ask>[0]]> = [
      ['start on a declared instance', { user: svc, unit: good, verb: 'start' }],
      ['restart', { user: svc, unit: good, verb: 'restart' }],
      ['reload-or-restart', { user: svc, unit: good, verb: 'reload-or-restart' }],
      ['set-property (no verb)', { user: svc, unit: good, verb: undefined }],
      ['start on a transient-style name', { user: svc, unit: `${prefix}zz.service`, verb: 'start' }],
      ['stop on a transient-style name', { user: svc, unit: `${prefix}zz.service`, verb: 'stop' }],
      ['undeclared k', { user: svc, unit: `${prefix}s3-turn@3-100-999.service`, verb: 'stop' }],
      ['unknown door', { user: svc, unit: `${prefix}s1-x@3-100-999.service`, verb: 'stop' }],
      ['template itself (no instance)', { user: svc, unit: `${prefix}s1-turn@.service`, verb: 'stop' }],
      ['non-numeric instance', { user: svc, unit: `${prefix}s1-turn@x.service`, verb: 'stop' }],
      ...NOT_INSTANCE_SPELLINGS.map(
        spelling => [`the near-miss instance '${spelling}'`, { user: svc, unit: `${prefix}s1-turn@${spelling}.service`, verb: 'stop' }] as [string, Parameters<typeof ask>[0]],
      ),
      ['the socket unit', { user: svc, unit: `${prefix}s1-turn.socket`, verb: 'stop' }],
      ['the target unit', { user: svc, unit: `${prefix}s1-turn.target`, verb: 'stop' }],
      ['a suffix after .service', { user: svc, unit: `${good}.wants`, verb: 'stop' }],
      ['the sibling instance ab-agent’s shape', { user: svc, unit: `${prefix}agent-s1-turn@3-100-999.service`, verb: 'stop' }],
      ['the daemon’s own unit', { user: svc, unit: gate.layout.unitName, verb: 'stop' }],
      ['undefined unit', { user: svc, unit: undefined, verb: 'stop' }],
      ['another subject', { user: 'www-data', unit: good, verb: 'stop' }],
      ['the legacy agent as subject', { user: gate.layout.identity.agentUser, unit: good, verb: 'stop' }],
      ['another action', { action: 'org.freedesktop.systemd1.reload-daemon', user: svc, unit: good, verb: 'stop' }],
    ];
    const wrong = cases.map(([what, question]) => [what, ask(question)] as const).filter(([, answer]) => answer !== 'NOT_HANDLED');
    expect(wrong).toEqual([]);
  });
});

