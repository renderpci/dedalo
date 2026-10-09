/**
 * An in-memory host for the provisioner gates: a virtual filesystem + accounts + units that
 * is BOTH the ProvisionIo apply writes through AND the source of the HostState plan reads,
 * so "a second plan after apply is empty" is proved by the same bytes, and "apply wrote
 * nothing" by counting calls. Never touches the real filesystem or spawns anything. Every
 * seeded directory and binary is root-owned 0755 (a trusted host); a gate edits an entry to
 * make it untrusted. Every account has its own primary group and no other (`accountGroups`,
 * what `id -g` / `id -G` would answer); a gate adds memberships to test group access.
 *
 * `FakeInitHost` (spec §9 FakeHost, `provision init`) extends it into the whole world init
 * acts on: InitIo (every door, on the same virtual tree), the closed InitExec set beside the
 * 24-command ProvisionExec, a Debian or an EL OS row, SELinux (mode, booleans, local fcontext
 * and port rules, port types, labels — `restorecon -n` is COMPUTED from the rules and labels),
 * mount rows (noexec, seclabel, context=), unit sandbox values (`systemctl show`), the kernel
 * release, fapolicyd, configtest results keyed by FILE CONTENT (a breaker string anywhere in
 * the tree fails it), reload outcomes (a web or FPM master that dies on reload), sibling
 * declarations (home and system), `failOn` per command, and a fake LockIo with scripted
 * holders on a fake clock. Shared by the init gates (P4 act, P1 run integration).
 */
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { ExecResult, InitExec, PairInvocation, ProvisionExec, RestoreconTarget, SemanageKind } from '../../src/provision/exec_contract';
import { SELINUX_BOOLEANS } from '../../src/provision/exec_contract';
import type { ProvisionIo } from '../../src/provision/apply';
import { TEMP_SUFFIX } from '../../src/provision/apply';
import type { AgentLayout, HostDeclaration } from '../../src/provision/layout';
import { canonicalDeclaration } from '../../src/provision/layout';
import type { AccountGroups } from '../../src/provision/access';
import type { DirFacts, LockFileSpec, LockIo, LockMode } from '../../src/provision/lock';
import type { HostState, PathFacts, PinExpectation, UnitFacts } from '../../src/provision/plan';
import { AGENT_TREE_WALK_CAP } from '../../src/provision/plan';
import { INIT_TEMP_SUFFIX, procPathAllowed } from '../../src/provision/init/host_io';
import type { InitIo, MountRow, OperatorFile, SelinuxMode } from '../../src/provision/init/types';

interface Entry {
  type: 'dir' | 'file' | 'symlink';
  uid: number;
  gid: number;
  mode: number;
  body: string;
  /** Device and inode, when a gate sets them (observeHost reports both; the pinned door's expectation carries them). */
  dev?: number;
  ino?: number;
  /** A symlink's resolved path (observeHost's realpath); absent = dangling. */
  target?: string;
  /** A symlink's stored (relative) target text. */
  link?: string;
  /** Binary bytes (writeBytesAtomic); `body` is their utf8 reading. */
  bytes?: Uint8Array;
}

export const FAKE_TOKEN = 'T'.repeat(43);

const OK: ExecResult = Object.freeze({ code: 0, stdout: '', stderr: '' });

function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** One local fcontext rule as the fake SELinux store holds it. */
export interface FakeFcontext {
  spec: string;
  ftype: 'a' | 'f' | 'd';
  type: string;
}

export class FakeHost implements ProvisionIo {
  readonly entries = new Map<string, Entry>();
  readonly calls: string[] = [];
  /** The pinned-parent expectation each door call carried (`<door> <path>` → pin). */
  readonly pins = new Map<string, PinExpectation>();
  readonly users = new Map<string, number>([
    ['root', 0],
    ['dedalo-pubhost', 990],
    ['dedalo-api-v1', 992],
    ['dedalo-api-v2', 991],
  ]);
  readonly groups = new Map<string, number>([
    ['root', 0],
    ['www-data', 33],
    ['dedalo-api-v2', 991],
    ['dedalo', 1000],
    ['dedalo-pubhost', 990],
    // The host-wide group every agent unit joins (spec S11); plan refuses a host without it.
    ['dedalo_pubhost', 989],
  ]);
  /** Database groups per account: agent → its own group, v1 → www-data (a pool user), v2 → the v2 group. */
  readonly accountGroups = new Map<string, AccountGroups>([
    ['dedalo-pubhost', { primary: 990, all: [990] }],
    ['dedalo-api-v1', { primary: 33, all: [33] }],
    ['dedalo-api-v2', { primary: 991, all: [991] }],
  ]);
  /** observeHost's walk cap over agent_dir; a gate lowers it. */
  agentTreeCap = AGENT_TREE_WALK_CAP;
  /** Directories readdir cannot list (observeHost's walk stops there: `could not be listed (EACCES)`). */
  readonly unlistable = new Set<string>();
  protected readonly agentDir: string;
  readonly units = new Map<string, UnitFacts>();
  /** Files carrying the append-only attribute (chown/chmod on them fail, like the kernel). */
  readonly appendOnlyPaths = new Set<string>();
  /** A call name (as pushed to `calls`) that answers exit 1. */
  failOn: string | null = null;
  /** Configtest (web and FPM) fails while any file in the tree contains one of these strings. */
  readonly configtestBreakers: string[] = [];
  /** `apachectl -t -D DUMP_INCLUDES` / `nginx -T` output. */
  webDump = '';
  /** `systemctl --version`'s number. */
  systemd = 252;
  // ── SELinux ──
  selinuxMode: SelinuxMode = 'absent';
  readonly booleans = new Map<string, boolean>(SELINUX_BOOLEANS.map(name => [name, name === 'httpd_graceful_shutdown']));
  readonly fcontext: FakeFcontext[] = [];
  readonly localPorts = new Map<number, string>();
  /** The policy's port types (`semanage port -l`). */
  readonly portTypes = new Map<number, string>([
    [80, 'http_port_t'],
    [443, 'http_port_t'],
    [3306, 'mysqld_port_t'],
    [8080, 'http_cache_port_t'],
  ]);
  /** path → SELinux type (`stat -c %C`). An unlabelled path is '?'. */
  readonly labels = new Map<string, string>();
  readonly exec: ProvisionExec;
  /**
   * The flock door (ProvisionIo.lockIo): `provision apply` takes the host provision lock on every
   * run (spec S12 2). Its directory facts fall back to this host's own tree, so a lock directory
   * apply created through mkdir/rename is the one the lock judges.
   */
  readonly lockIo: FakeLockIo;

  constructor(layout: AgentLayout) {
    this.agentDir = layout.agentDir;
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
      // the packages' own directories: logrotate's, and the web server's log directory (layout.ts webLogBase)
      dirname(layout.logrotatePath),
      ...(layout.site === null ? [] : [dirname(layout.site.webLogsDir)]),
    ]) {
      this.seedDir(path);
    }
    for (const bin of [layout.web.configtestBin, layout.phpBin, layout.bunBin]) {
      this.entries.set(bin, { type: 'file', uid: 0, gid: 0, mode: 0o755, body: '' });
    }
    this.entries.set(layout.agentEntry, { type: 'file', uid: 0, gid: 0, mode: 0o644, body: '' });
    this.exec = this.buildExec();
    this.lockIo = new FakeLockIo(path => {
      const entry = this.entries.get(path);
      return entry === undefined ? null : { type: entry.type, uid: entry.uid, mode: entry.mode };
    });
  }

  /** ProvisionIo.sleepSync: the reload polls advance the lock door's fake clock, never the wall clock. */
  sleepSync(ms: number): void {
    this.lockIo.sleepSync(ms);
  }

  /** One recorded command: exit 1 when `failOn` names it, else 0. */
  protected command(name: string, stdout = ''): ExecResult {
    this.calls.push(name);
    return this.failOn === name ? { code: 1, stdout: '', stderr: `${name}: simulated failure` } : { code: 0, stdout, stderr: '' };
  }

  protected unit(unitName: string): UnitFacts {
    return this.units.get(unitName) ?? { enabled: false, active: false };
  }

  /** A configtest: the recorded command, failing on `failOn` or on a breaker in any file. */
  protected configtest(name: string): ExecResult {
    const result = this.command(name);
    if (result.code !== 0) return result;
    const broken = [...this.entries.values()].some(entry => entry.type === 'file' && this.configtestBreakers.some(b => entry.body.includes(b)));
    return broken ? { code: 1, stdout: '', stderr: `${name}: syntax error (a breaker is in the tree)` } : result;
  }

  protected buildExec(): ProvisionExec {
    return {
      userId: name => this.users.get(name) ?? null,
      groupId: name => this.groups.get(name) ?? null,
      userGroups: name => {
        const found = this.accountGroups.get(name);
        return found ? { primary: found.primary, all: [...found.all] } : null;
      },
      unitState: unitName => this.unit(unitName),
      daemonReload: () => this.command('daemon-reload'),
      enableUnit: unitName => {
        const result = this.command(`enable ${unitName}`);
        if (result.code === 0) this.units.set(unitName, { ...this.unit(unitName), enabled: true });
        return result;
      },
      startUnit: unitName => {
        const result = this.command(`start ${unitName}`);
        if (result.code === 0) this.units.set(unitName, { ...this.unit(unitName), active: true });
        return result;
      },
      restartUnit: unitName => this.command(`restart ${unitName}`),
      reloadUnit: unitName => this.command(`reload ${unitName}`),
      webConfigtest: (_bin, server) => this.configtest(`configtest ${server}`),
      visudoCheck: file => this.command(`visudo ${file}`),
      visudoCheckPolicy: () => this.command('visudo -c'),
      appendOnly: file => this.command(`chattr ${file}`),
      fpmConfigtest: bin => this.configtest(`fpm-configtest ${bin}`),
      apacheIncludes: bin => this.command(`apache-includes ${bin}`, this.webDump),
      nginxDump: bin => this.command(`nginx-dump ${bin}`, this.webDump),
      selinuxMode: () => {
        if (this.selinuxMode === 'absent') {
          this.calls.push('getenforce');
          return { code: 127, stdout: '', stderr: 'getenforce: not found' };
        }
        return this.command('getenforce', `${this.selinuxMode[0]?.toUpperCase()}${this.selinuxMode.slice(1)}\n`);
      },
      semanageLocal: (kind: SemanageKind) =>
        this.command(
          `semanage ${kind} -l -C`,
          kind === 'fcontext'
            ? this.fcontext.map(rule => `${rule.spec}    ${rule.ftype === 'a' ? 'all files' : rule.ftype === 'd' ? 'directory' : 'regular file'}    system_u:object_r:${rule.type}:s0\n`).join('')
            : [...this.localPorts].map(([port, type]) => `${type}    tcp    ${port}\n`).join(''),
        ),
      semanageImport: file => {
        const result = this.command(`semanage import ${file}`);
        if (result.code === 0) this.importRules(this.entries.get(file)?.body ?? '');
        return result;
      },
      restorecon: (targets, dryRun) => this.restorecon(targets, dryRun),
      getsebool: name => {
        const value = this.booleans.get(name);
        if (value === undefined) return { code: 1, stdout: '', stderr: `getsebool: ${name}: unknown boolean` };
        return this.command(`getsebool ${name}`, `${name} --> ${value ? 'on' : 'off'}\n`);
      },
      systemdVersion: () => this.command('systemctl --version', `systemd ${this.systemd} (${this.systemd})\n+PAM\n`),
      semanagePortList: () => {
        const byType = new Map<string, number[]>();
        for (const [port, type] of [...this.portTypes, ...this.localPorts]) byType.set(type, [...(byType.get(type) ?? []), port]);
        return this.command('semanage port -l', [...byType].map(([type, ports]) => `${type}    tcp    ${ports.join(', ')}\n`).join(''));
      },
      selinuxLabel: paths =>
        this.command(`stat %C ${paths.join(' ')}`, paths.map(path => `${this.labels.has(path) ? `system_u:object_r:${this.labels.get(path)}:s0` : '?'} ${path}\n`).join('')),
    };
  }

  /** Applies `semanage import` lines (the closed grammar of spec §5.9) to the fake store. */
  importRules(text: string): void {
    for (const line of text.split('\n')) {
      const f = /^fcontext -([ad]) -f ([adf]) -t ([a-z0-9_]+) '([^']+)'$/.exec(line);
      if (f) {
        const [, op, ftype, type, spec] = f as unknown as [string, 'a' | 'd', 'a' | 'f' | 'd', string, string];
        const index = this.fcontext.findIndex(rule => rule.spec === spec && rule.ftype === ftype);
        if (op === 'd') {
          if (index >= 0) this.fcontext.splice(index, 1);
        } else if (index < 0) this.fcontext.push({ spec, ftype, type });
        continue;
      }
      const p = /^port -([ad]) -t ([a-z0-9_]+) -p tcp (\d+)$/.exec(line);
      if (p) {
        if (p[1] === 'd') this.localPorts.delete(Number(p[3]));
        else this.localPorts.set(Number(p[3]), p[2] as string);
      }
    }
  }

  /** The type the local rules give `path` (the last matching rule wins), or null. */
  expectedLabel(path: string): string | null {
    let found: string | null = null;
    for (const rule of this.fcontext) if (new RegExp(`^${rule.spec}$`).test(path)) found = rule.type;
    return found;
  }

  private restorecon(targets: readonly RestoreconTarget[], dryRun: boolean): ExecResult {
    const result = this.command(`restorecon${dryRun ? ' -n' : ''} ${targets.map(t => `${t.recursive ? '-R ' : ''}${t.path}`).join(' ')}`);
    if (result.code !== 0) return result;
    const lines: string[] = [];
    for (const target of targets) {
      const paths = [...this.entries.keys()].filter(path => path === target.path || (target.recursive && path.startsWith(`${target.path}/`)));
      for (const path of paths.sort()) {
        const want = this.expectedLabel(path);
        const have = this.labels.get(path) ?? '?';
        if (want === null || want === have) continue;
        // restorecon prints an unlabelled file's context as a bare '?'.
        lines.push(`${dryRun ? 'Would relabel' : 'Relabeled'} ${path} from ${have === '?' ? '?' : `system_u:object_r:${have}:s0`} to system_u:object_r:${want}:s0`);
        if (!dryRun) this.labels.set(path, want);
      }
    }
    return { code: 0, stdout: lines.map(line => `${line}\n`).join(''), stderr: '' };
  }

  seedDir(path: string): void {
    if (this.entries.has(path)) return;
    if (path !== '/') this.seedDir(dirname(path));
    this.entries.set(path, { type: 'dir', uid: 0, gid: 0, mode: 0o755, body: '' });
  }

  /** A root-owned file (its parents seeded). */
  seedFile(path: string, body: string, mode = 0o644, uid = 0, gid = 0): void {
    this.seedDir(dirname(path));
    this.entries.set(path, { type: 'file', uid, gid, mode, body });
  }

  /** The number of io calls that change bytes or metadata. */
  get mutations(): number {
    return this.calls.filter(call =>
      /^(mkdir|writeTemp|chown|chmod|rename|appendOnly|writeBytesAtomic|writeTempNamed|removeInitTemp|removeTree|renameDir|appendSync|symlink) /.test(call),
    ).length;
  }

  protected parentIsDir(path: string): boolean {
    return this.entries.get(dirname(path))?.type === 'dir';
  }

  /** A new entry takes its directory's SELinux type, as the kernel labels a new inode (no type transition). */
  protected inheritLabel(path: string): void {
    const parent = this.labels.get(dirname(path));
    if (parent !== undefined && !this.labels.has(path)) this.labels.set(path, parent);
  }

  mkdir(path: string, mode: number, pin?: PinExpectation): void {
    if (pin !== undefined) this.pins.set(`mkdir ${path}`, pin);
    this.calls.push(`mkdir ${path}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    if (this.entries.has(path)) throw new Error(`EEXIST: ${path}`);
    this.entries.set(path, { type: 'dir', uid: 0, gid: 0, mode, body: '' });
    this.inheritLabel(path);
  }

  writeTemp(path: string, body: string, mode: number): string {
    const temp = `${path}${TEMP_SUFFIX}`;
    this.calls.push(`writeTemp ${temp}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    this.entries.set(temp, { type: 'file', uid: 0, gid: 0, mode, body });
    this.inheritLabel(temp);
    return temp;
  }

  chown(path: string, uid: number, gid: number, pin?: PinExpectation): void {
    if (pin !== undefined) this.pins.set(`chown ${path}`, pin);
    this.calls.push(`chown ${path}`);
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    if (entry.type === 'symlink') throw new Error(`ELOOP: ${path} is a symbolic link`);
    if (this.appendOnlyPaths.has(path)) throw new Error(`EPERM: ${path} is append-only`);
    entry.uid = uid;
    entry.gid = gid;
  }

  chmod(path: string, mode: number, pin?: PinExpectation): void {
    if (pin !== undefined) this.pins.set(`chmod ${path}`, pin);
    this.calls.push(`chmod ${path}`);
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    if (entry.type === 'symlink') throw new Error(`ELOOP: ${path} is a symbolic link`);
    if (this.appendOnlyPaths.has(path)) throw new Error(`EPERM: ${path} is append-only`);
    entry.mode = mode;
  }

  rename(from: string, to: string): void {
    this.calls.push(`rename ${to}`);
    const entry = this.entries.get(from);
    if (!entry) throw new Error(`ENOENT: ${from}`);
    this.entries.delete(from);
    this.entries.set(to, entry);
    // A rename keeps the inode, and so its label.
    const label = this.labels.get(from);
    this.labels.delete(from);
    if (label !== undefined) this.labels.set(to, label);
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
        ...(entry.dev === undefined ? {} : { dev: entry.dev }),
        ...(entry.ino === undefined ? {} : { ino: entry.ino }),
        ...(entry.target === undefined ? {} : { target: entry.target }),
      });
      if (entry.type === 'file') contents.set(path, entry.body);
    }
    // agent_dir's tree as observeHost walks it: agent_dir first, links not entered, capped,
    // stopped at an unlistable directory. tests/provision_host_io.test.ts holds this walk EQUAL
    // to apply.ts walkAgentTree on the same real tree, so the copy cannot drift.
    const tree: string[] = [];
    let incomplete: string | null = null;
    const pending = this.entries.get(this.agentDir)?.type === 'dir' ? [this.agentDir] : [];
    if (pending.length > 0) tree.push(this.agentDir);
    while (pending.length > 0 && incomplete === null) {
      const dir = pending.shift() as string;
      if (this.unlistable.has(dir)) {
        incomplete = `'${dir}' could not be listed (EACCES)`;
        break;
      }
      const children = [...this.entries.keys()].filter(path => path !== dir && dirname(path) === dir).sort();
      for (const child of children) {
        if (tree.length >= this.agentTreeCap) {
          incomplete = `it holds more than ${this.agentTreeCap} entries`;
          break;
        }
        tree.push(child);
        if (this.entries.get(child)?.type === 'dir') pending.push(child);
      }
    }
    return {
      trustRoot: '/',
      appendOnly: new Set(this.appendOnlyPaths),
      paths,
      contents,
      users: new Map(this.users),
      groups: new Map(this.groups),
      units: new Map(this.units),
      accountGroups: new Map(this.accountGroups),
      agentTree: { paths: tree, incomplete },
    };
  }

  body(path: string): string | undefined {
    return this.entries.get(path)?.body;
  }
}

/* ── provision init ───────────────────────────────────────────────────────────────── */

export type FakeOs = 'debian' | 'el';

export interface FakeInitOptions {
  readonly os?: FakeOs;
  readonly selinux?: SelinuxMode;
}

/** A scripted lock holder (another process): holds `mode` on `path` until the fake clock reaches `untilMs`. */
export interface ScriptedHolder {
  readonly path: string;
  readonly mode: LockMode;
  readonly pid: number;
  /** Released when now() ≥ untilMs; Infinity = never. */
  readonly untilMs: number;
}

/**
 * A fake LockIo on a fake clock (sleepSync advances it): lock files and directories live in
 * its own little tree, other processes are scripted holders, this process's own descriptors
 * conflict with each other like flock(2) descriptors do.
 */
export class FakeLockIo implements LockIo {
  clock = 1_760_000_000_000;
  readonly pid = 4242;
  readonly files = new Map<string, DirFacts & { gid: number }>();
  readonly holders: ScriptedHolder[] = [];
  readonly records = new Map<string, string>();
  readonly calls: string[] = [];
  private readonly fds = new Map<number, { path: string; held: LockMode | null }>();
  private nextFd = 10;

  /** `tree`: the host's own lstat, consulted for paths this door did not create itself. */
  constructor(private readonly tree: (path: string) => DirFacts | null = () => null) {}

  private live(): ScriptedHolder[] {
    return this.holders.filter(holder => this.clock < holder.untilMs);
  }

  openLockFile(path: string, spec: LockFileSpec): number {
    this.calls.push(`open ${path}`);
    const found = this.files.get(path);
    if (found === undefined) {
      if (!spec.create) throw new Error(`ENOENT: ${path}`);
      this.files.set(path, { type: 'file', uid: spec.uid, gid: spec.gid ?? 0, mode: spec.mode });
    } else if (found.type !== 'file') {
      throw new Error(`ELOOP: '${path}' is a ${found.type}`);
    }
    const fd = this.nextFd++;
    this.fds.set(fd, { path, held: null });
    return fd;
  }

  tryFlock(fd: number, mode: LockMode): boolean {
    const own = this.fds.get(fd);
    if (own === undefined) throw new Error(`EBADF: ${fd}`);
    const conflicts = (other: LockMode) => mode === 'ex' || other === 'ex';
    if (this.live().some(holder => holder.path === own.path && conflicts(holder.mode))) return false;
    for (const [otherFd, other] of this.fds) {
      if (otherFd !== fd && other.path === own.path && other.held !== null && conflicts(other.held)) return false;
    }
    own.held = mode;
    return true;
  }

  unlock(fd: number): void {
    this.calls.push(`unlock ${this.fds.get(fd)?.path ?? fd}`);
    this.fds.delete(fd);
  }

  readOwner(path: string): string | null {
    return this.records.get(path) ?? null;
  }

  writeOwner(path: string, record: string): void {
    this.records.set(path, record);
  }

  holderFromProcLocks(path: string): number[] | null {
    const pids = new Set(this.live().filter(holder => holder.path === path).map(holder => holder.pid));
    for (const own of this.fds.values()) if (own.path === path && own.held !== null) pids.add(this.pid);
    return [...pids].sort((a, b) => a - b);
  }

  /** A held lock of this process on `path` (what a test asserts after run). */
  heldBySelf(path: string): LockMode | null {
    for (const own of this.fds.values()) if (own.path === path && own.held !== null) return own.held;
    return null;
  }

  lstat(path: string): DirFacts | null {
    return this.files.get(path) ?? this.tree(path);
  }

  mkdir(path: string, mode: number, uid: number, gid: number): void {
    this.calls.push(`mkdir ${path}`);
    this.files.set(path, { type: 'dir', uid, gid, mode });
  }

  now(): number {
    return this.clock;
  }

  sleepSync(ms: number): void {
    this.clock += ms;
  }

  async sleep(ms: number): Promise<void> {
    this.clock += ms;
  }
}

/** A site declaration with the home layout (decision B) — the init gates' default world. */
export function siteHomeDeclaration(overrides: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    instance: 'test',
    listen: { kind: 'unix' },
    agent_user: 'test_agent',
    engine_group: 'dedalo',
    agent_dir: '/home/example.org/host_agent',
    web: { server: 'apache', unit: 'apache2' },
    site: { domain: 'example.org', fpm: { flavor: 'debian', version: '8.4' } },
    v1: { user: 'test_v1' },
    state_root: '/home/example.org/dedalo',
    media: { mode: 'shared', root: '/mnt/dedalo_media' },
    php_bin: '/usr/bin/php8.4',
    bun_bin: '/home/example.org/.bun/bin/bun',
    v2: {
      unit: 'dedalo-publication-api-v2-test',
      user: 'test_v2',
      group: 'test_v2',
      port: 3100,
      health_url: 'http://127.0.0.1:3100/health',
    },
    ...overrides,
  };
}

/** The same instance on the `system` layout (the alternative of decision B). */
export function siteSystemDeclaration(overrides: Partial<HostDeclaration> = {}): HostDeclaration {
  return siteHomeDeclaration({
    agent_dir: '/opt/dedalo_publication_host/host_agent',
    state_root: '/srv/dedalo_publication_host/test',
    bun_bin: '/opt/dedalo_publication_host/bun/bin/bun',
    ...overrides,
  });
}

export class FakeInitHost extends FakeHost implements InitIo {
  declare readonly exec: ProvisionExec & InitExec;
  readonly os: FakeOs;
  readonly layout: AgentLayout;
  arch = 'x86_64';
  kernelRelease = '6.1.0-25-amd64';
  fapolicydActive = false;
  polkit: number | null = 126;
  readonly mounts: MountRow[] = [
    { mountPoint: '/', fsType: 'ext4', readOnly: false, noexec: false, seclabel: false, context: null },
  ];
  /** `systemctl show <unit>` properties per bare unit name. */
  readonly unitProps = new Map<string, Record<string, string>>();
  readonly candidateUnits: string[] = [];
  readonly shells = new Map<string, string>();
  /** Debian: enabled Apache modules (a2enmod/a2dismod mutate it). */
  readonly apacheMods = new Set<string>(['ssl', 'proxy', 'proxy_http', 'headers']);
  /** `bun --version` per binary path (absent = the binary prints nothing and exits 1). */
  readonly bunVersions = new Map<string, string>();
  /** Units whose master dies on reload (systemctl reload exits 0, then the unit is inactive). */
  readonly reloadKills = new Set<string>();
  /** Units whose restart does not bring them up. */
  readonly restartFails = new Set<string>();
  /** Scripted outputs of the discovery commands, keyed by command name. */
  readonly outputs = new Map<string, ExecResult>();
  /** /proc files readProcFile may serve (the allowlist still applies). */
  readonly procFiles = new Map<string, string>();
  readonly pairCalls: PairInvocation[] = [];
  pairResult: ExecResult = OK;
  /** `--system` accounts get ids below 1000 (the fake hands them out from 900, like useradd -r). */
  private nextId = 900;

  constructor(layout: AgentLayout, options: FakeInitOptions = {}) {
    super(layout);
    this.layout = layout;
    this.os = options.os ?? 'debian';
    this.selinuxMode = options.selinux ?? (this.os === 'el' ? 'enforcing' : 'absent');
    if (this.os === 'debian') this.seedFile('/etc/debian_version', '13.1\n');
    else this.seedFile('/etc/redhat-release', 'Rocky Linux release 9.4 (Blue Onyx)\n');
    this.seedFile(this.os === 'debian' ? '/usr/sbin/nologin' : '/sbin/nologin', '', 0o755);
    this.seedDir('/home');
    for (const unit of [layout.web.unit]) this.units.set(unit, { enabled: true, active: true });
  }

  protected override buildExec(): ProvisionExec & InitExec {
    const base = super.buildExec();
    const scripted = (name: string): ExecResult => {
      this.calls.push(name);
      if (this.failOn === name) return { code: 1, stdout: '', stderr: `${name}: simulated failure` };
      return this.outputs.get(name) ?? OK;
    };
    const passwdLine = (name: string, uid: number) =>
      `${name}:x:${uid}:${this.accountGroups.get(name)?.primary ?? uid}::/nonexistent:${this.shells.get(name) ?? '/usr/sbin/nologin'}`;
    const groupLine = (name: string, gid: number) => `${name}:x:${gid}:`;
    const debianOnly = (what: string) => {
      if (this.entries.get('/etc/debian_version')?.type !== 'file') throw new Error(`exec: ${what} exists only on the Debian family`);
    };
    const created = (kind: 'group' | 'user', name: string): ExecResult => {
      const result = this.command(`${kind === 'group' ? 'groupadd' : 'useradd'} ${name}`);
      if (result.code !== 0) return result;
      if ((kind === 'group' ? this.groups : this.users).has(name)) return { code: 9, stdout: '', stderr: `${name} already exists` };
      return result;
    };
    return {
      ...base,
      restartUnit: unitName => {
        const result = this.command(`restart ${unitName}`);
        if (result.code === 0) this.units.set(unitName, { ...this.unit(unitName), active: !this.restartFails.has(unitName) });
        return result;
      },
      reloadUnit: unitName => {
        const result = this.command(`reload ${unitName}`);
        if (result.code === 0 && this.reloadKills.has(unitName)) this.units.set(unitName, { ...this.unit(unitName), active: false });
        return result;
      },
      unameMachine: () => this.command('uname -m', `${this.arch}\n`),
      passwdDb: () => this.command('getent passwd', [...this.users].map(([n, id]) => `${passwdLine(n, id)}\n`).join('')),
      groupDb: () => this.command('getent group', [...this.groups].map(([n, id]) => `${groupLine(n, id)}\n`).join('')),
      passwdLookup: name => {
        this.calls.push(`getent passwd ${name}`);
        const id = this.users.get(name);
        return id === undefined ? { code: 2, stdout: '', stderr: '' } : { code: 0, stdout: `${passwdLine(name, id)}\n`, stderr: '' };
      },
      groupLookup: name => {
        this.calls.push(`getent group ${name}`);
        const id = this.groups.get(name);
        return id === undefined ? { code: 2, stdout: '', stderr: '' } : { code: 0, stdout: `${groupLine(name, id)}\n`, stderr: '' };
      },
      unitShow: unitName => {
        if (unitName === 'fapolicyd') return this.command('systemctl show fapolicyd', `ActiveState=${this.fapolicydActive ? 'active' : 'inactive'}\n`);
        const props = this.unitProps.get(unitName) ?? { LoadState: 'not-found' };
        return this.command(`systemctl show ${unitName}`, Object.entries(props).map(([k, v]) => `${k}=${v}\n`).join(''));
      },
      listCandidateUnits: () => this.command('systemctl list-units', this.candidateUnits.map(unit => `${unit} loaded active running ${unit}\n`).join('')),
      polkitVersion: () => {
        if (this.polkit === null) {
          this.calls.push('pkaction --version');
          return { code: 127, stdout: '', stderr: '' };
        }
        return this.command('pkaction --version', `pkaction version ${this.polkit < 121 ? `0.${this.polkit}` : this.polkit}\n`);
      },
      apacheVhosts: bin => scripted(`apache -S ${bin}`),
      apacheModules: bin => {
        const result = scripted(`apache -M ${bin}`);
        if (result !== OK) return result;
        return { code: 0, stdout: `Loaded Modules:\n${[...this.apacheMods].map(m => ` ${m}_module (shared)\n`).join('')}`, stderr: '' };
      },
      fpmDump: bin => scripted(`fpm -tt ${bin}`),
      phpVersion: bin => scripted(`php version ${bin}`),
      groupAdd: name => {
        const result = created('group', name);
        if (result.code === 0) this.groups.set(name, this.nextId++);
        return result;
      },
      userAddOwnGroup: (name, shell) => {
        const result = created('user', name);
        if (result.code !== 0) return result;
        const id = this.nextId++;
        this.users.set(name, id);
        this.groups.set(name, id);
        this.accountGroups.set(name, { primary: id, all: [id] });
        this.shells.set(name, shell);
        return result;
      },
      userAddInGroup: (name, group, shell) => {
        const gid = this.groups.get(group);
        if (gid === undefined) return { code: 6, stdout: '', stderr: `useradd: group '${group}' does not exist` };
        const result = created('user', name);
        if (result.code !== 0) return result;
        this.users.set(name, this.nextId++);
        this.accountGroups.set(name, { primary: gid, all: [gid] });
        this.shells.set(name, shell);
        return result;
      },
      enableApacheModules: mods => {
        debianOnly('a2enmod');
        const result = this.command(`a2enmod ${mods.join(' ')}`);
        if (result.code === 0) for (const mod of mods) this.apacheMods.add(mod);
        return result;
      },
      disableApacheModules: mods => {
        debianOnly('a2dismod');
        const result = this.command(`a2dismod ${mods.join(' ')}`);
        if (result.code === 0) for (const mod of mods) this.apacheMods.delete(mod);
        return result;
      },
      unzipBun: (zip, asset, dest) => this.command(`unzip ${zip} ${asset} ${dest}`),
      bunVersion: bin => {
        this.calls.push(`bun --version ${bin}`);
        const version = this.entries.get(bin)?.type === 'file' ? this.bunVersions.get(bin) : undefined;
        return version === undefined ? { code: 1, stdout: '', stderr: 'no bun' } : { code: 0, stdout: `${version}\n`, stderr: '' };
      },
      pairAsEngine: invocation => {
        this.calls.push(`pair ${invocation.verb} ${invocation.name}${invocation.dryRun ? ' --dry-run' : ''}`);
        this.pairCalls.push(invocation);
        return this.pairResult;
      },
      setsebool: (name, value) => {
        if (name === 'httpd_graceful_shutdown') throw new Error('exec: httpd_graceful_shutdown is read, never written');
        const result = this.command(`setsebool -P ${name} ${value ? 'on' : 'off'}`);
        if (result.code === 0) this.booleans.set(name, value);
        return result;
      },
      webVersion: bin => scripted(`web -v ${bin}`),
    };
  }

  /* ── facts the act/observe passes read ── */

  lstat(path: string): PathFacts | null {
    const entry = this.entries.get(path);
    return entry === undefined ? null : { type: entry.type, uid: entry.uid, gid: entry.gid, mode: entry.mode };
  }

  realpath(path: string): string | null {
    const entry = this.entries.get(path);
    if (entry === undefined) return null;
    if (entry.type === 'symlink') return entry.target ?? null;
    return path;
  }

  /** Longest-prefix mount: the filesystem type holding `path`. */
  fsTypeOf(path: string): string | null {
    const rows = [...this.mounts].filter(m => path === m.mountPoint || path.startsWith(m.mountPoint === '/' ? '/' : `${m.mountPoint}/`));
    rows.sort((a, b) => b.mountPoint.length - a.mountPoint.length);
    return rows[0]?.fsType ?? null;
  }

  /** A sibling declaration in configBase (home or system layout). */
  addSibling(declaration: HostDeclaration): string {
    const path = join(this.layout.configBase, `${declaration.instance}.json`);
    this.seedFile(path, canonicalDeclaration(declaration));
    return path;
  }

  /** A symlink entry (its stored text and, when it resolves, its resolved path). */
  seedLink(path: string, link: string, target?: string): void {
    this.seedDir(dirname(path));
    this.entries.set(path, { type: 'symlink', uid: 0, gid: 0, mode: 0o777, body: '', link, ...(target ? { target } : {}) });
  }

  /* ── InitIo ── */

  private children(path: string): string[] {
    return [...this.entries.keys()].filter(p => p === path || p.startsWith(`${path}/`));
  }

  writeBytesAtomic(path: string, bytes: Uint8Array, mode: number, uid: number, gid: number, pin?: PinExpectation): void {
    if (pin !== undefined) this.pins.set(`writeBytesAtomic ${path}`, pin);
    this.calls.push(`writeBytesAtomic ${path}`);
    if (this.failOn === `writeBytesAtomic ${path}`) throw new Error(`EIO: simulated failure writing ${path}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    if (this.entries.get(path)?.type === 'dir') throw new Error(`EISDIR: ${path}`);
    const fresh = !this.entries.has(path);
    this.entries.set(path, { type: 'file', uid, gid, mode, body: Buffer.from(bytes).toString('utf8'), bytes: new Uint8Array(bytes) });
    if (fresh) this.inheritLabel(path);
  }

  writeTempNamed(dir: string, name: string, bytes: Uint8Array, mode: number): string {
    const path = join(dir, name);
    this.calls.push(`writeTempNamed ${path}`);
    if (name.includes('/')) throw new Error(`init io: refusing temp name '${name}'`);
    if (this.entries.get(dir)?.type !== 'dir') throw new Error(`ENOENT: ${dir}`);
    if (this.entries.has(path)) throw new Error(`EEXIST: ${path}`);
    this.entries.set(path, { type: 'file', uid: 0, gid: 0, mode, body: Buffer.from(bytes).toString('utf8'), bytes: new Uint8Array(bytes) });
    return path;
  }

  removeInitTemp(path: string): void {
    this.calls.push(`removeInitTemp ${path}`);
    if (!path.endsWith(INIT_TEMP_SUFFIX)) throw new Error(`init io: refusing to remove '${path}' — not an init temp file`);
    this.entries.delete(path);
  }

  removeTree(path: string, mustBeUnder: string): void {
    this.calls.push(`removeTree ${path}`);
    if (!path.startsWith(`${mustBeUnder}/`)) throw new Error(`init io: refusing to remove '${path}': it is not under '${mustBeUnder}'`);
    for (const child of this.children(path)) this.entries.delete(child);
  }

  renameDir(from: string, to: string): void {
    this.calls.push(`renameDir ${from} ${to}`);
    if (this.failOn === `renameDir ${from} ${to}`) throw new Error(`EIO: simulated rename failure`);
    if (this.entries.get(from)?.type !== 'dir') throw new Error(`init io: refusing to rename '${from}': not a real directory`);
    if (this.entries.has(to)) throw new Error(`init io: refusing to rename onto '${to}': it exists`);
    for (const child of this.children(from)) {
      const entry = this.entries.get(child) as Entry;
      this.entries.delete(child);
      this.entries.set(`${to}${child.slice(from.length)}`, entry);
    }
  }

  appendSync(path: string, text: string): void {
    this.calls.push(`appendSync ${path}`);
    if (!this.parentIsDir(path)) throw new Error(`ENOENT: no parent for ${path}`);
    const entry = this.entries.get(path);
    if (entry !== undefined && entry.type !== 'file') throw new Error(`ELOOP: ${path}`);
    if (entry === undefined) this.entries.set(path, { type: 'file', uid: 0, gid: 0, mode: 0o600, body: text });
    else entry.body += text;
  }

  readOperatorFile(path: string): OperatorFile {
    const entry = this.entries.get(path);
    if (entry?.type !== 'file') throw new Error(`init io: refusing '${path}': not a regular file`);
    const bytes = entry.bytes ?? new TextEncoder().encode(entry.body);
    return { bytes: new Uint8Array(bytes), uid: entry.uid, gid: entry.gid, mode: entry.mode, sha: sha256(bytes) };
  }

  readRootFile(path: string): string | null {
    const entry = this.entries.get(path);
    return entry?.type === 'file' ? entry.body : null;
  }

  readProcFile(path: string): string | null {
    if (!procPathAllowed(path)) throw new Error(`init io: refusing to read '${path}': not on the /proc allowlist`);
    if (path === '/proc/sys/kernel/osrelease') return `${this.kernelRelease}\n`;
    return this.procFiles.get(path) ?? null;
  }

  /* ── the tree doors (tree_copy.ts TreeReader/TreeWriter on the same virtual tree) ── */

  readonly treeReader = {
    lstat: (path: string) => this.lstat(path),
    readdir: (path: string) => {
      if (this.entries.get(path)?.type !== 'dir') throw new Error(`ENOTDIR: ${path}`);
      return [...this.entries.keys()].filter(p => p !== path && dirname(p) === path).map(p => p.slice(path.length + 1)).sort();
    },
    readlink: (path: string) => {
      const entry = this.entries.get(path);
      if (entry?.type !== 'symlink') throw new Error(`EINVAL: ${path}`);
      return entry.link ?? '';
    },
    realpath: (path: string) => this.realpath(path),
    readFile: (path: string) => {
      const entry = this.entries.get(path);
      if (entry?.type !== 'file') throw new Error(`not a regular file: ${path}`);
      return new Uint8Array(entry.bytes ?? new TextEncoder().encode(entry.body));
    },
  };

  get treeWriter() {
    return {
      io: this as InitIo,
      symlink: (target: string, path: string) => {
        this.calls.push(`symlink ${path}`);
        const resolved = join(dirname(path), target);
        this.entries.set(path, { type: 'symlink', uid: 0, gid: 0, mode: 0o777, body: '', link: target, ...(this.entries.has(resolved) ? { target: resolved } : {}) });
      },
    };
  }
}
