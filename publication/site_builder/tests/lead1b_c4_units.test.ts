/**
 * LEAD-1b G4 + G6 + G8 census (commit C4) — THE FLOOR SPLIT, UID-AWARE REACH, NO FILE FOR PID 1.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * G4 — the floor is decided by what a unit REQUIRES (248, PrivateIPC), not by the EXTRA layer
 *   (PrivatePIDs, 257), so Ubuntu 24.04 / Debian 12 (255) are supported hosts.
 * G6 — every concurrent pair across two sites at 255 (no PID namespace), read off the RENDERED
 *   files through a uid-aware model (`support/unit_file_reach.ts`): nothing of the other run
 *   is reachable, and a site's own doors never run together.
 * G8 — no rendered unit hands PID 1 a file the service user can write (EnvironmentFile=,
 *   StandardOutput=file:, LoadCredential=) — the ENVFILE root-read primitive, gone by census.
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
  loadRule,
  renderAgentRule,
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
 * G8 — the census: nothing PID 1 reads as root is writable by the service user
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G8 — no rendered unit names a file the service user can write', () => {
  test('agent units carry no EnvironmentFile=, no file:/append: output, no LoadCredential=', async () => {
    const offenders: string[] = [];
    for (const version of [255, 257]) {
      for (const file of (await renderAgentUnits(museo(), version)).values()) {
        for (const entry of unitDirectives(file.body)) {
          if (
            entry.key === 'EnvironmentFile' ||
            entry.key === 'LoadCredential' ||
            entry.key === 'LoadCredentialEncrypted' ||
            (/^Standard(Output|Error|Input)$/.test(entry.key) && /^(file|append|truncate):/.test(entry.value))
          ) {
            offenders.push(`${file.name}: ${entry.key}=${entry.value}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every rendered unit (the daemon’s included): no such directive points into a service-user-writable tree', async () => {
    const gate = museo();
    const writable = [...readWritePaths(gate.layout), gate.layout.runtimeDir];
    const bodies = [
      ...unitRenderer.render(gate.layout, gate.manifest).map(artifact => ({ name: artifact.path, body: artifact.body })),
      ...[...(await renderAgentUnits(gate, 255)).values()].map(file => ({ name: file.name, body: file.body })),
    ];
    const offenders: string[] = [];
    for (const { name, body } of bodies) {
      for (const entry of unitDirectives(body)) {
        const isFileKey = ['EnvironmentFile', 'LoadCredential', 'LoadCredentialEncrypted', 'StandardOutput', 'StandardError', 'StandardInput'].includes(entry.key);
        if (!isFileKey) continue;
        const path = entry.value.replace(/^-/, '').replace(/^(file|append|truncate):/, '').replace(/^[A-Z_]+:/, '');
        if (writable.some(root => path === root || path.startsWith(`${root}/`))) offenders.push(`${name}: ${entry.key}=${entry.value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the per-run environment FILE machinery is gone from the confinement (renderEnvironmentFile / turns/)', async () => {
    const confinement = await contractModule('drivers/confinement.ts');
    expect({
      renderEnvironmentFile: 'renderEnvironmentFile' in confinement,
      writeTurnEnvironmentFile: 'writeTurnEnvironmentFile' in confinement,
    }).toEqual({ renderEnvironmentFile: false, writeTurnEnvironmentFile: false });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G4 — the floor split
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G4 — the floor is what a unit REQUIRES (248); PrivatePIDs is an EXTRA layer (257)', () => {
  const LEAF = 'drivers/unit_properties.ts';

  test('the leaf: FLOOR = 248, EXTRA = {PrivatePIDs: 257}, and 247 lacks exactly PrivateIPC', async () => {
    const floor = await contractExport<number>(LEAF, 'SYSTEMD_FLOOR');
    const extra = await contractExport<Record<string, number>>(LEAF, 'EXTRA');
    const required = await contractExport<Record<string, number>>(LEAF, 'REQUIRED');
    const newer = await contractExport<(v: number) => string[]>(LEAF, 'propertiesNewerThan');
    expect({ floor, extra, max: Math.max(...Object.values(required)), pidsRequired: 'PrivatePIDs' in required }).toEqual({
      floor: 248,
      extra: { PrivatePIDs: 257 },
      max: 248,
      pidsRequired: false,
    });
    expect(newer(247)).toEqual(['PrivateIPC= (248)']);
    expect(newer(248)).toEqual([]);
    expect(newer(256)).toEqual([]);
  });

  test('∪ rendered keys at 255 = REQUIRED, and at 257 = REQUIRED ∪ EXTRA — every key has a stated release', async () => {
    const required = await contractExport<Record<string, number>>(LEAF, 'REQUIRED');
    const extra = await contractExport<Record<string, number>>(LEAF, 'EXTRA');
    for (const [version, expected] of [
      [255, Object.keys(required)],
      [257, [...Object.keys(required), ...Object.keys(extra)]],
    ] as const) {
      const keys = new Set<string>();
      for (const file of (await renderAgentUnits(museo(), version)).values()) {
        for (const entry of unitDirectives(file.body)) keys.add(entry.key);
      }
      expect({ version, keys: [...keys].sort() }).toEqual({ version, keys: [...new Set(expected)].sort() });
    }
  });

  test('the renderer refuses PID 1 = 247, naming PrivateIPC; 248 renders', async () => {
    const refused = await caught(() => renderAgentUnits(museo(), 247));
    expect(String((refused as Error).message)).toContain('PrivateIPC');
    expect((await renderAgentUnits(museo(), 248)).size).toBeGreaterThan(0);
  });

  test('confinementProblems: 247 names PrivateIPC; 255 carries NO floor refusal', async () => {
    const { lead1bPolicy } = await import('./support/lead1b_host');
    const { confinementProblems } = await import('../src/drivers/confinement');
    const floorProblems = (problems: string[]) => problems.filter(problem => /\bsystemd\b.*\b(older|newer|needs|release)\b/i.test(problem));
    const at = async (version: number) => {
      const host = await lead1bPolicy({ identities: new Map([['alpha', 1]]), version });
      try {
        return floorProblems((await confinementProblems(host.policy, 'git')));
      } finally {
        await host.standIn.close();
      }
    };
    const low = await at(247);
    expect(low.length).toBeGreaterThan(0);
    expect(low.join(' ')).toContain('PrivateIPC');
    expect(await at(255)).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G6 — what a run reaches of another, from the rendered files, uid-aware
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G6 — at 255 (no PID namespace), no run reaches another site’s run, and a site’s doors never overlap', () => {
  async function situation(version = 255) {
    const gate = museo();
    const files = await renderAgentUnits(gate, version);
    const stateRoot = layoutField(gate, 'agentStateRoot');
    const socketDir = layoutField(gate, 'agentSocketDir');
    const svcUid = 4_100_000_000;
    const instanceGid = 4_100_000_100;
    const passwd = new Map<string, Principal>();
    const identityPrincipal = new Map<number, Principal>();
    for (const [, k] of gate.identities) {
      const name = await identityOf('museo', k);
      const principal = { name, uid: 4_100_001_000 + k, gids: [instanceGid, 4_100_002_000 + k] };
      passwd.set(name, principal);
      identityPrincipal.set(k, principal);
    }
    const nodes = new Map<string, FsNode>();
    const runtime = gate.layout.runtimeDir;
    const egress = join(socketDir, 'egress');
    nodes.set(runtime, { uid: svcUid, gid: instanceGid, mode: 0o750 });
    nodes.set(join(runtime, 'daemon.sock'), { uid: svcUid, gid: 4_100_000_200, mode: 0o660 });
    nodes.set(socketDir, { uid: 0, gid: 0, mode: 0o755 });
    // THE EGRESS DIRECTORIES: root's (tmpfiles.d), each root:<site's private group> 0770.
    nodes.set(egress, { uid: 0, gid: 0, mode: 0o755 });
    nodes.set(stateRoot, { uid: 0, gid: 0, mode: 0o755 });
    for (const [, k] of gate.identities) {
      const priv = 4_100_002_000 + k;
      nodes.set(join(egress, `s${k}`), { uid: 0, gid: priv, mode: 0o770 });
      for (const sock of ['proxy.sock', 'mcp.sock']) nodes.set(join(egress, `s${k}`, sock), { uid: svcUid, gid: priv, mode: 0o660 });
      nodes.set(join(stateRoot, `s${k}`), { uid: 0, gid: 0, mode: 0o755 });
      for (const door of ['turn', 'build']) {
        nodes.set(join(stateRoot, `s${k}`, door), { uid: (identityPrincipal.get(k) as Principal).uid, gid: instanceGid, mode: 0o700 });
      }
      for (const door of DOORS) nodes.set(await socketPath(gate, k, door), { uid: svcUid, gid: instanceGid, mode: 0o600 });
    }
    const bodies = new Map([...files].map(([name, file]) => [name, file.body]));
    const model = buildModel(
      { files: bodies, prefix: gate.layout.agentUnitPrefix, ordinals: [...gate.identities.values()], doors: DOORS, passwd },
      nodes,
    );
    return { gate, model, stateRoot, socketDir, runtime, egress };
  }

  test('a site’s runs are never co-scheduled — two doors, or one door twice', async () => {
    const { model } = await situation();
    const { coScheduled } = await import('./support/unit_file_reach');
    const overlapping: string[] = [];
    for (const u of model.units) {
      for (const v of model.units) {
        if (u.k === v.k && coScheduled(model, u, v)) overlapping.push(`${u.id} ∥ ${v.id}`);
      }
    }
    expect(overlapping).toEqual([]);
  });

  test('every run reaches its OWN egress door and its OWN state (the model is not blind)', async () => {
    const { model, egress, stateRoot } = await situation();
    const missing: string[] = [];
    for (const u of model.units) {
      if (u.door !== 'git') {
        const own = join(egress, `s${u.k}`, 'proxy.sock');
        if (routes(model, u, { kind: 'connect', path: own }).length === 0) missing.push(`${u.id} cannot reach ${own}`);
        const home = join(stateRoot, `s${u.k}`, u.door);
        if (routes(model, u, { kind: 'write', path: home }).length === 0) missing.push(`${u.id} cannot write ${home}`);
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * THE GATE'S DIRECTORY IS BOUND READ-ONLY: its identity is a member of the directory's group
   * (it must connect to the daemon's sockets there), so DAC alone would let a run plant a file
   * or a socket beside them — the mount refuses it. Control: the same model with the bind made
   * writable DOES reach it, so the row is not blind.
   */
  test('no run can plant in ANY egress directory, its own included — the bind is read-only', async () => {
    const { model, egress } = await situation();
    const planted: string[] = [];
    for (const u of model.units) {
      for (const [, k] of [...new Set(model.units.map(unit => unit.k))].entries()) {
        const dir = join(egress, `s${k}`);
        if (routes(model, u, { kind: 'write', path: dir }).length > 0) planted.push(`${u.id} → ${dir}`);
      }
    }
    expect(planted).toEqual([]);
    const writable = { ...model, units: model.units.map(unit => ({ ...unit, props: unit.props.map(prop => prop.replace(/^BindReadOnlyPaths=/, 'BindPaths=')) })) };
    const own = writable.units.find(unit => unit.door === 'turn') as (typeof model.units)[number];
    expect(routes(writable, own, { kind: 'write', path: join(egress, `s${own.k}`) }).length).toBeGreaterThan(0);
  });

  test('the forbidden set is empty for every run, against every co-scheduled run of every site', async () => {
    const { model, runtime, egress, stateRoot, gate } = await situation();
    const leaks: string[] = [];
    const ask = (u: (typeof model.units)[number], label: string, question: Parameters<typeof routes>[2]) => {
      const found = routes(model, u, question);
      if (found.length > 0) leaks.push(`${u.id} → ${label} via ${found.join(', ')}`);
    };
    for (const u of model.units) {
      // Every agent control socket: a run that could connect to one could launch a run.
      for (const [, k] of gate.identities) for (const door of DOORS) ask(u, `socket s${k}-${door}`, { kind: 'connect', path: await socketPath(gate, k, door) });
      ask(u, 'the daemon socket', { kind: 'connect', path: join(runtime, 'daemon.sock') });
      for (const v of model.units) {
        if (v === u) continue;
        if (v.k !== u.k) {
          for (const sock of ['proxy.sock', 'mcp.sock']) ask(u, `${v.id}'s ${sock}`, { kind: 'connect', path: join(egress, `s${v.k}`, sock) });
          if (v.door !== 'git') ask(u, `${v.id}'s state`, { kind: 'read', path: join(stateRoot, `s${v.k}`, v.door) });
          ask(u, `${v.id}'s environ`, { kind: 'environ', of: v.id });
        } else if (v.door !== 'git' && v.door !== u.door) {
          ask(u, `its own site's ${v.door} state`, { kind: 'read', path: join(stateRoot, `s${v.k}`, v.door) });
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  test('defence in depth — by DAC alone (mounts ignored), one site’s identity opens nothing of another’s', async () => {
    const { model, egress, stateRoot } = await situation();
    const { dacAllows } = await import('./support/unit_file_reach');
    const leaks: string[] = [];
    for (const u of model.units) {
      for (const v of model.units) {
        if (v.k === u.k) continue;
        for (const sock of ['proxy.sock', 'mcp.sock']) {
          const path = join(egress, `s${v.k}`, sock);
          if (dacAllows(model, u.principal, path, 0o2)) leaks.push(`${u.id} → ${path}`);
        }
        if (v.door !== 'git') {
          const path = join(stateRoot, `s${v.k}`, v.door);
          if (dacAllows(model, u.principal, path, 0o4)) leaks.push(`${u.id} → ${path}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  test('control: the model reds on the pre-LEAD-1b shape — one uid for every site, no PID namespace', async () => {
    const { model } = await situation();
    const shared = model.units.map(unit => ({ ...unit, principal: (model.units[0] as (typeof model.units)[number]).principal }));
    const sharedModel = { ...model, units: shared };
    const u = shared.find(unit => unit.k === 1 && unit.door === 'build') as (typeof shared)[number];
    // Same uid, no PID namespace: another site's live turn is in /proc, environment and all.
    expect(routes(sharedModel, u, { kind: 'environ', of: 's2-turn' })).toEqual(['/proc/<s2-turn>/environ']);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G12b — the daemon's OWN sandbox lets it serve every gate it opens
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G12b — under the rendered daemon unit (ProtectSystem=strict), every egress path the gate writes is writable', () => {
  /**
   * The daemon unit's mount view, read off the RENDERED body: `ProtectSystem=strict` makes the
   * whole tree read-only except `RuntimeDirectory=` (under /run) and each `ReadWritePaths=`
   * entry. A gate that binds its sockets outside that set fails as EROFS on a real host — every
   * proxy-door run refused — while every DAC-only test stays green.
   */
  function daemonMountWritable(body: string): (path: string) => boolean {
    expect(unitValues(body, 'ProtectSystem', 'Service')).toEqual(['strict']);
    const roots = [
      ...words(unitValues(body, 'ReadWritePaths', 'Service')).map(p => p.replace(/^-/, '')),
      ...words(unitValues(body, 'RuntimeDirectory', 'Service')).map(p => join('/run', p)),
    ];
    return path => roots.some(root => path === root || path.startsWith(`${root}/`));
  }

  async function situation(slugs: readonly string[]) {
    const gate = gateInstance('museo', slugs);
    const facts = { agentIdentities: gate.identities, systemdVersion: 255 };
    const daemon = unitRenderer.render(gate.layout, gate.manifest, facts).find(a => a.path === gate.layout.unitPath);
    if (!daemon) throw new Error('the daemon unit was not rendered');
    // The directory the daemon hands `openEgressGate` is `egressDirForSite(AGENT_SOCKET_DIR, k)`
    // (drivers/confinement.ts), AGENT_SOCKET_DIR read from the RENDERED env — the value the
    // running daemon actually has, not a second derivation of it.
    const { envAssignments } = await import('../src/provision/render/env');
    const socketDir = envAssignments(gate.layout, facts).AGENT_SOCKET_DIR as string;
    const egressDirForSite = await contractExport<(dir: string, k: number) => string>('drivers/agent_identity.ts', 'egressDirForSite');
    const { MCP_SOCKET, PROXY_SOCKET } = await import('../src/drivers/network_profile');
    return { gate, writable: daemonMountWritable(daemon.body), socketDir, egressDirForSite, sockets: [PROXY_SOCKET, MCP_SOCKET] };
  }

  test('every declared site: proxy.sock and mcp.sock (bound, chgrp-ed, chmod-ed, unlinked by the gate) are on a writable mount', async () => {
    for (const slugs of [['alpha'], ['alpha', 'beta', 'gamma']]) {
      const { gate, writable, socketDir, egressDirForSite, sockets } = await situation(slugs);
      const blocked: string[] = [];
      for (const [, k] of gate.identities) {
        for (const sock of sockets) {
          const path = join(egressDirForSite(socketDir, k), sock);
          if (!writable(path)) blocked.push(path);
        }
      }
      expect({ slugs, blocked }).toEqual({ slugs, blocked: [] });
    }
  });

  test('…and nothing wider: not the door sockets’ directory, not the agent state root, not /run itself', async () => {
    const { gate, writable, socketDir } = await situation(['alpha', 'beta']);
    const exposed = [
      join(socketDir, 'x'),
      await socketPath(gate, 1, 'turn'),
      layoutField(gate, 'agentStateRoot'),
      join(layoutField(gate, 'agentStateRoot'), 's1', 'turn'),
      '/run/x',
      dirname(socketDir),
    ].filter(writable);
    expect(exposed).toEqual([]);
  });

  test('the mount is not the permission: the egress base stays root 0755, so the daemon cannot rename or re-point any s<k>', async () => {
    const { gate, socketDir } = await situation(['alpha', 'beta']);
    const { renderAgentTmpfiles } = await import('./support/lead1b_contract');
    const tmpfiles = await renderAgentTmpfiles(gate);
    expect(tmpfiles?.body.split('\n')).toContain(`d ${join(socketDir, 'egress')} 0755 root root -`);
  });
});
