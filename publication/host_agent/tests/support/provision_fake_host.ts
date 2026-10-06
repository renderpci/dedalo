/**
 * An in-memory host for the provisioner gates: a virtual filesystem + accounts + units that
 * is BOTH the ProvisionIo apply writes through AND the source of the HostState plan reads,
 * so "a second plan after apply is empty" is proved by the same bytes, and "apply wrote
 * nothing" by counting calls. Never touches the real filesystem or spawns anything. Every
 * seeded directory and binary is root-owned 0755 (a trusted host); a gate edits an entry to
 * make it untrusted.
 */
import { dirname } from 'node:path';
import type { ExecResult, ProvisionExec } from '../../src/exec';
import type { ProvisionIo } from '../../src/provision/apply';
import { TEMP_SUFFIX } from '../../src/provision/apply';
import type { AgentLayout } from '../../src/provision/layout';
import type { HostState, PathFacts, UnitFacts } from '../../src/provision/plan';

interface Entry {
  type: 'dir' | 'file' | 'symlink';
  uid: number;
  gid: number;
  mode: number;
  body: string;
  /** A symlink's resolved path (observeHost's realpath); absent = dangling. */
  target?: string;
}

export const FAKE_TOKEN = 'T'.repeat(43);

export class FakeHost implements ProvisionIo {
  readonly entries = new Map<string, Entry>();
  readonly calls: string[] = [];
  readonly users = new Map<string, number>([
    ['root', 0],
    ['dedalo-pubhost', 990],
    ['dedalo-api-v2', 991],
  ]);
  readonly groups = new Map<string, number>([
    ['root', 0],
    ['www-data', 33],
    ['dedalo-api-v2', 991],
    ['dedalo', 1000],
  ]);
  readonly units = new Map<string, UnitFacts>();
  /** Files carrying the append-only attribute (chown/chmod on them fail, like the kernel). */
  readonly appendOnlyPaths = new Set<string>();
  /** A call name (as pushed to `calls`) that answers exit 1. */
  failOn: string | null = null;
  readonly exec: ProvisionExec;

  constructor(layout: AgentLayout) {
    for (const path of [
      dirname(layout.configBase),
      dirname(layout.state.root),
      dirname(layout.agentUnitPath),
      dirname(layout.sudoersPath),
      dirname(layout.polkitPath),
      dirname(layout.agentEntry),
      dirname(layout.web.configtestBin),
      dirname(layout.phpBin),
      dirname(layout.bunBin),
    ]) {
      this.seedDir(path);
    }
    for (const bin of [layout.web.configtestBin, layout.phpBin, layout.bunBin]) {
      this.entries.set(bin, { type: 'file', uid: 0, gid: 0, mode: 0o755, body: '' });
    }
    this.entries.set(layout.agentEntry, { type: 'file', uid: 0, gid: 0, mode: 0o644, body: '' });

    const command = (name: string): ExecResult => {
      this.calls.push(name);
      return this.failOn === name
        ? { code: 1, stdout: '', stderr: `${name}: simulated failure` }
        : { code: 0, stdout: '', stderr: '' };
    };
    const unit = (unitName: string): UnitFacts => this.units.get(unitName) ?? { enabled: false, active: false };
    this.exec = {
      userId: name => this.users.get(name) ?? null,
      groupId: name => this.groups.get(name) ?? null,
      unitState: unitName => unit(unitName),
      daemonReload: () => command('daemon-reload'),
      enableUnit: unitName => {
        const result = command(`enable ${unitName}`);
        if (result.code === 0) this.units.set(unitName, { ...unit(unitName), enabled: true });
        return result;
      },
      startUnit: unitName => {
        const result = command(`start ${unitName}`);
        if (result.code === 0) this.units.set(unitName, { ...unit(unitName), active: true });
        return result;
      },
      restartUnit: unitName => command(`restart ${unitName}`),
      reloadUnit: unitName => command(`reload ${unitName}`),
      webConfigtest: (_bin, server) => command(`configtest ${server}`),
      visudoCheck: file => command(`visudo ${file}`),
      visudoCheckPolicy: () => command('visudo -c'),
      appendOnly: file => command(`chattr ${file}`),
    };
  }

  seedDir(path: string): void {
    if (this.entries.has(path)) return;
    if (path !== '/') this.seedDir(dirname(path));
    this.entries.set(path, { type: 'dir', uid: 0, gid: 0, mode: 0o755, body: '' });
  }

  /** The number of io calls that change bytes or metadata. */
  get mutations(): number {
    return this.calls.filter(call => /^(mkdir|writeTemp|chown|chmod|rename|appendOnly) /.test(call)).length;
  }

  private parentIsDir(path: string): boolean {
    return this.entries.get(dirname(path))?.type === 'dir';
  }

  mkdir(path: string, mode: number): void {
    this.calls.push(`mkdir ${path}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    if (this.entries.has(path)) throw new Error(`EEXIST: ${path}`);
    this.entries.set(path, { type: 'dir', uid: 0, gid: 0, mode, body: '' });
  }

  writeTemp(path: string, body: string, mode: number): string {
    const temp = `${path}${TEMP_SUFFIX}`;
    this.calls.push(`writeTemp ${temp}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    this.entries.set(temp, { type: 'file', uid: 0, gid: 0, mode, body });
    return temp;
  }

  chown(path: string, uid: number, gid: number): void {
    this.calls.push(`chown ${path}`);
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    if (this.appendOnlyPaths.has(path)) throw new Error(`EPERM: ${path} is append-only`);
    entry.uid = uid;
    entry.gid = gid;
  }

  chmod(path: string, mode: number): void {
    this.calls.push(`chmod ${path}`);
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    if (this.appendOnlyPaths.has(path)) throw new Error(`EPERM: ${path} is append-only`);
    entry.mode = mode;
  }

  rename(from: string, to: string): void {
    this.calls.push(`rename ${to}`);
    const entry = this.entries.get(from);
    if (!entry) throw new Error(`ENOENT: ${from}`);
    this.entries.delete(from);
    this.entries.set(to, entry);
  }

  removeTemp(path: string): void {
    this.calls.push(`removeTemp ${path}`);
    this.entries.delete(path);
  }

  appendOnly(path: string): void {
    this.calls.push(`appendOnly ${path}`);
    if (this.entries.get(path)?.type !== 'file') throw new Error(`ENOENT: no file at ${path}`);
    if (this.failOn === `appendOnly ${path}`) throw new Error(`chattr +a ${path} exited 1: simulated failure`);
    this.appendOnlyPaths.add(path);
  }

  randomToken(_bytes: number): string {
    return FAKE_TOKEN;
  }

  /** The HostState observeHost would report for this virtual host (trust walk from '/'). */
  state(): HostState {
    const paths = new Map<string, PathFacts>();
    const contents = new Map<string, string | null>();
    for (const [path, entry] of this.entries) {
      paths.set(path, {
        type: entry.type,
        uid: entry.uid,
        gid: entry.gid,
        mode: entry.mode,
        ...(entry.target === undefined ? {} : { target: entry.target }),
      });
      if (entry.type === 'file') contents.set(path, entry.body);
    }
    return {
      trustRoot: '/',
      appendOnly: new Set(this.appendOnlyPaths),
      paths,
      contents,
      users: new Map(this.users),
      groups: new Map(this.groups),
      units: new Map(this.units),
    };
  }

  body(path: string): string | undefined {
    return this.entries.get(path)?.body;
  }
}
